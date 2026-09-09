/**
 * Billing cycle math: quote → sent → approved → paid.
 *
 * Day counting: calendar days in UTC, taken from the YYYY-MM-DD prefix of
 * each timestamp (or the UTC calendar date if the value is a Date). Time of
 * day is ignored. Same calendar date → 0 days. Missing/invalid → null.
 *
 * Works in the browser (global `BillingCycle`) and in Node (`module.exports`).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BillingCycle = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  var DEFAULT_TARGETS = {
    quoteToSent: 2,
    sentToApproved: 5,
    approvedToPaid: 14
  };

  var STAGE_DEFS = [
    {
      key: "quoteToSent",
      from: "quote",
      to: "sent",
      label: "Quote → Sent"
    },
    {
      key: "sentToApproved",
      from: "sent",
      to: "approved",
      label: "Sent → Approved"
    },
    {
      key: "approvedToPaid",
      from: "approved",
      to: "paid",
      label: "Approved → Paid"
    }
  ];

  function isMissing(value) {
    return value == null || value === "";
  }

  /**
   * UTC calendar date as milliseconds at midnight, or null.
   * Date-only and ISO datetime strings use the leading YYYY-MM-DD.
   */
  function toUtcMidnightMs(value) {
    if (isMissing(value)) return null;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate()
      );
    }

    var text = String(value).trim();
    var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      var y = Number(match[1]);
      var m = Number(match[2]);
      var d = Number(match[3]);
      if (m < 1 || m > 12 || d < 1 || d > 31) return null;
      return Date.UTC(y, m - 1, d);
    }

    var parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate()
    );
  }

  /**
   * Calendar-day difference (end − start). Returns null, never NaN/Infinity.
   */
  function daysBetween(start, end) {
    var a = toUtcMidnightMs(start);
    var b = toUtcMidnightMs(end);
    if (a == null || b == null) return null;
    var days = (b - a) / MS_PER_DAY;
    if (!Number.isFinite(days)) return null;
    return days;
  }

  function stageDays(invoice) {
    var row = invoice || {};
    var quoteToSent = daysBetween(row.quote, row.sent);
    var sentToApproved = daysBetween(row.sent, row.approved);
    var approvedToPaid = daysBetween(row.approved, row.paid);
    var quoteToPaid = daysBetween(row.quote, row.paid);
    return {
      id: row.id == null ? null : row.id,
      quoteToSent: quoteToSent,
      sentToApproved: sentToApproved,
      approvedToPaid: approvedToPaid,
      quoteToPaid: quoteToPaid
    };
  }

  function mergeTargets(extra) {
    var out = {
      quoteToSent: DEFAULT_TARGETS.quoteToSent,
      sentToApproved: DEFAULT_TARGETS.sentToApproved,
      approvedToPaid: DEFAULT_TARGETS.approvedToPaid
    };
    if (extra && typeof extra === "object") {
      if (extra.quoteToSent != null) out.quoteToSent = extra.quoteToSent;
      if (extra.sentToApproved != null) out.sentToApproved = extra.sentToApproved;
      if (extra.approvedToPaid != null) out.approvedToPaid = extra.approvedToPaid;
    }
    return out;
  }

  function unpackDataset(input, targetsOverride) {
    var invoices;
    var fileTargets = null;
    if (Array.isArray(input)) {
      invoices = input;
    } else if (input && typeof input === "object") {
      invoices = Array.isArray(input.invoices) ? input.invoices : [];
      fileTargets = input.targets || null;
    } else {
      invoices = [];
    }
    return {
      invoices: invoices,
      targets: mergeTargets(Object.assign({}, fileTargets || {}, targetsOverride || {}))
    };
  }

  function mean(sum, count) {
    if (count === 0) return null;
    var avg = sum / count;
    if (!Number.isFinite(avg)) return null;
    return avg;
  }

  /**
   * Stage with the largest (average − target). Stages with no samples skipped.
   * Ties break in pipeline order: quote→sent, sent→approved, approved→paid.
   */
  function findBottleneck(averages, targets) {
    var worst = null;
    var i;
    for (i = 0; i < STAGE_DEFS.length; i++) {
      var def = STAGE_DEFS[i];
      var avg = averages[def.key];
      if (avg == null) continue;
      var target = targets[def.key];
      var delta = avg - target;
      if (!Number.isFinite(delta)) continue;
      if (worst == null || delta > worst.delta) {
        worst = {
          stage: def.key,
          label: def.label,
          average: avg,
          target: target,
          delta: delta
        };
      }
    }
    return worst;
  }

  function summarize(input, targetsOverride) {
    var unpacked = unpackDataset(input, targetsOverride);
    var invoices = unpacked.invoices;
    var targets = unpacked.targets;

    var totals = {
      quoteToSent: 0,
      sentToApproved: 0,
      approvedToPaid: 0,
      quoteToPaid: 0
    };
    var counts = {
      quoteToSent: 0,
      sentToApproved: 0,
      approvedToPaid: 0,
      quoteToPaid: 0
    };

    var rows = [];
    var i;
    for (i = 0; i < invoices.length; i++) {
      var computed = stageDays(invoices[i]);
      rows.push(computed);
      var keys = ["quoteToSent", "sentToApproved", "approvedToPaid", "quoteToPaid"];
      var k;
      for (k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (computed[key] != null && Number.isFinite(computed[key])) {
          totals[key] += computed[key];
          counts[key] += 1;
        }
      }
    }

    var averages = {
      quoteToSent: mean(totals.quoteToSent, counts.quoteToSent),
      sentToApproved: mean(totals.sentToApproved, counts.sentToApproved),
      approvedToPaid: mean(totals.approvedToPaid, counts.approvedToPaid),
      quoteToPaid: mean(totals.quoteToPaid, counts.quoteToPaid)
    };

    return {
      invoices: rows,
      totals: totals,
      counts: counts,
      averages: averages,
      targets: targets,
      bottleneck: findBottleneck(averages, targets)
    };
  }

  return {
    DEFAULT_TARGETS: DEFAULT_TARGETS,
    STAGE_DEFS: STAGE_DEFS,
    daysBetween: daysBetween,
    stageDays: stageDays,
    findBottleneck: findBottleneck,
    summarize: summarize
  };
});
