(function () {
  "use strict";

  var DATA_URL = "./data/invoices.json";

  function $(id) {
    return document.getElementById(id);
  }

  function formatDays(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1);
  }

  function formatMoney(amount) {
    if (amount == null || !Number.isFinite(amount)) return "—";
    return "$" + amount.toLocaleString("en-US");
  }

  function shortDate(value) {
    if (value == null || value === "") return "—";
    var match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : String(value);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderAverages(summary) {
    var cards = $("averages");
    cards.innerHTML = "";
    BillingCycle.STAGE_DEFS.forEach(function (def) {
      var avg = summary.averages[def.key];
      var target = summary.targets[def.key];
      var over = avg != null && avg > target;
      var card = document.createElement("article");
      card.className = "card" + (over ? " over" : "");
      card.innerHTML =
        '<span class="label">' +
        escapeHtml(def.label) +
        "</span>" +
        '<div class="value">' +
        formatDays(avg) +
        " d</div>" +
        '<div class="target">target ' +
        formatDays(target) +
        " d · n=" +
        summary.counts[def.key] +
        "</div>";
      cards.appendChild(card);
    });

    var overall = document.createElement("article");
    overall.className = "card";
    overall.innerHTML =
      '<span class="label">Overall quote → paid</span>' +
      '<div class="value">' +
      formatDays(summary.averages.quoteToPaid) +
      " d</div>" +
      '<div class="target">complete cycles n=' +
      summary.counts.quoteToPaid +
      "</div>";
    cards.appendChild(overall);
  }

  function renderBottleneck(summary) {
    var el = $("bottleneck");
    var bn = summary.bottleneck;
    if (!bn) {
      el.className = "bottleneck";
      el.innerHTML =
        "<h2>Bottleneck</h2><p>Not enough complete stage samples to name a bottleneck.</p>";
      return;
    }
    var over = bn.delta > 0;
    el.className = "bottleneck" + (over ? " over" : "");
    var vs =
      bn.delta === 0
        ? "matches the " + formatDays(bn.target) + "-day target."
        : over
          ? "is " +
            formatDays(bn.delta) +
            " days over the " +
            formatDays(bn.target) +
            "-day target."
          : "is " +
            formatDays(-bn.delta) +
            " days under the " +
            formatDays(bn.target) +
            "-day target (still the weakest stage vs target).";
    el.innerHTML =
      "<h2>Bottleneck: " +
      escapeHtml(bn.label) +
      "</h2><p>Average " +
      formatDays(bn.average) +
      " days " +
      vs +
      "</p>";
  }

  function renderTable(dataset, summary) {
    var body = $("invoice-body");
    body.innerHTML = "";
    dataset.invoices.forEach(function (inv, i) {
      var row = summary.invoices[i];
      var tr = document.createElement("tr");
      var cells = [
        escapeHtml(inv.id || "—"),
        escapeHtml(inv.client || "—"),
        formatMoney(inv.amount),
        shortDate(inv.quote),
        shortDate(inv.sent),
        shortDate(inv.approved),
        shortDate(inv.paid),
        formatDays(row.quoteToSent),
        formatDays(row.sentToApproved),
        formatDays(row.approvedToPaid),
        formatDays(row.quoteToPaid)
      ];
      tr.innerHTML = cells
        .map(function (html, idx) {
          var num = idx >= 2;
          var incomplete = html === "—" && idx >= 7;
          var cls = (num ? "num" : "") + (incomplete ? " incomplete" : "");
          return "<td" + (cls ? ' class="' + cls.trim() + '"' : "") + ">" + html + "</td>";
        })
        .join("");
      body.appendChild(tr);
    });
  }

  function showError(message) {
    var status = $("status");
    status.className = "status error";
    status.textContent = message;
  }

  function showStatus(message) {
    var status = $("status");
    status.className = "status";
    status.textContent = message;
  }

  function boot(dataset) {
    var invoices = Array.isArray(dataset) ? dataset : dataset.invoices || [];
    if (!invoices.length) {
      showError("No invoices found in data/invoices.json.");
      return;
    }
    var wrapped = Array.isArray(dataset) ? { invoices: invoices } : dataset;
    var summary = BillingCycle.summarize(wrapped);
    renderAverages(summary);
    renderBottleneck(summary);
    renderTable(wrapped, summary);
    showStatus(
      invoices.length +
        " invoices loaded. Incomplete stages show as — and are excluded from averages."
    );
  }

  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status + " loading " + DATA_URL);
      return res.json();
    })
    .then(boot)
    .catch(function (err) {
      showError(
        "Could not load invoice data. Serve the repo over HTTP (file:// blocks fetch). " +
          (err && err.message ? err.message : String(err))
      );
    });
})();
