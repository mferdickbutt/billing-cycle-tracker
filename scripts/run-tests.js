#!/usr/bin/env node
"use strict";

var fs = require("fs");
var path = require("path");
var cycle = require("../js/cycle.js");

var passed = 0;
var failed = 0;

function inspect(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  return JSON.stringify(value);
}

function pass(name) {
  passed += 1;
  console.log("PASS: " + name);
}

function fail(name, actual, expected) {
  failed += 1;
  console.log("FAIL: " + name);
  console.log("  expected: " + inspect(expected));
  console.log("  actual:   " + inspect(actual));
}

function assertEqual(actual, expected, name) {
  var ok =
    actual === expected ||
    (typeof actual === "number" &&
      typeof expected === "number" &&
      Number.isFinite(actual) &&
      Number.isFinite(expected) &&
      Math.abs(actual - expected) < 1e-9);
  if (ok) pass(name);
  else fail(name, actual, expected);
}

function assertNull(actual, name) {
  assertEqual(actual, null, name);
}

// --- daysBetween: calendar days ---
assertEqual(cycle.daysBetween("2026-01-01", "2026-01-03"), 2, "calendar days: Jan 1 to Jan 3 is 2");
assertEqual(cycle.daysBetween("2026-01-01", "2026-01-01"), 0, "same calendar day is 0");
assertEqual(cycle.daysBetween("2026-01-31", "2026-02-01"), 1, "month boundary is 1 day");
assertEqual(
  cycle.daysBetween("2026-01-02T23:00:00Z", "2026-01-03T01:00:00Z"),
  1,
  "datetimes use YYYY-MM-DD prefix, not elapsed hours"
);
assertEqual(
  cycle.daysBetween("2026-01-16T09:00:00Z", "2026-01-16T16:30:00Z"),
  0,
  "same-day datetimes are 0 calendar days"
);
assertNull(cycle.daysBetween(null, "2026-01-01"), "missing start date is null");
assertNull(cycle.daysBetween("2026-01-01", null), "missing end date is null");
assertNull(cycle.daysBetween("", "2026-01-01"), "empty start string is null");
assertNull(cycle.daysBetween("not-a-date", "2026-01-03"), "invalid start is null, not NaN");
assertEqual(cycle.daysBetween("2026-01-05", "2026-01-02"), -3, "reversed dates yield signed days");

// --- stageDays: known fixture ---
var complete = {
  id: "FIX-1",
  quote: "2026-01-02",
  sent: "2026-01-03",
  approved: "2026-01-07",
  paid: "2026-01-21"
};
var completeDays = cycle.stageDays(complete);
assertEqual(completeDays.quoteToSent, 1, "FIX-1 quote→sent is 1");
assertEqual(completeDays.sentToApproved, 4, "FIX-1 sent→approved is 4");
assertEqual(completeDays.approvedToPaid, 14, "FIX-1 approved→paid is 14");
assertEqual(completeDays.quoteToPaid, 19, "FIX-1 overall quote→paid is 19");

// --- incomplete stages ---
var unpaid = {
  id: "FIX-UNPAID",
  quote: "2026-03-19",
  sent: "2026-03-21",
  approved: "2026-03-26",
  paid: null
};
var unpaidDays = cycle.stageDays(unpaid);
assertEqual(unpaidDays.quoteToSent, 2, "unpaid invoice still counts quote→sent");
assertEqual(unpaidDays.sentToApproved, 5, "unpaid invoice still counts sent→approved");
assertNull(unpaidDays.approvedToPaid, "missing paid → approved→paid is null");
assertNull(unpaidDays.quoteToPaid, "missing paid → overall cycle is null");

var quoteOnly = {
  id: "FIX-QUOTE",
  quote: "2026-03-24",
  sent: null,
  approved: null,
  paid: null
};
var quoteOnlyDays = cycle.stageDays(quoteOnly);
assertNull(quoteOnlyDays.quoteToSent, "quote-only → quote→sent is null");
assertNull(quoteOnlyDays.sentToApproved, "quote-only → sent→approved is null");
assertNull(quoteOnlyDays.approvedToPaid, "quote-only → approved→paid is null");
assertNull(quoteOnlyDays.quoteToPaid, "quote-only → overall is null");

// --- averages skip nulls; totals ---
var mixed = [
  complete,
  unpaid,
  quoteOnly,
  {
    id: "FIX-2",
    quote: "2026-01-10",
    sent: "2026-01-12",
    approved: "2026-01-17",
    paid: "2026-01-31"
  }
];
var summary = cycle.summarize(mixed);
assertEqual(summary.counts.quoteToSent, 3, "quote→sent count excludes quote-only");
assertEqual(summary.counts.sentToApproved, 3, "sent→approved count excludes missing sent/approved");
assertEqual(summary.counts.approvedToPaid, 2, "approved→paid count only complete paid stages");
assertEqual(summary.counts.quoteToPaid, 2, "overall count only fully paid invoices");
assertEqual(summary.totals.quoteToSent, 1 + 2 + 2, "quote→sent total is 5");
assertEqual(summary.averages.quoteToSent, 5 / 3, "quote→sent average is 5/3");
assertEqual(summary.averages.approvedToPaid, (14 + 14) / 2, "approved→paid average ignores unpaid");
assertEqual(summary.averages.quoteToPaid, (19 + 21) / 2, "overall average uses complete cycles only");

// --- bottleneck vs target ---
var bottleneckOver = cycle.summarize(
  [
    {
      id: "B1",
      quote: "2026-01-01",
      sent: "2026-01-02",
      approved: "2026-01-04",
      paid: "2026-01-30"
    },
    {
      id: "B2",
      quote: "2026-02-01",
      sent: "2026-02-02",
      approved: "2026-02-04",
      paid: "2026-03-01"
    }
  ],
  { quoteToSent: 2, sentToApproved: 5, approvedToPaid: 14 }
);
assertEqual(
  bottleneckOver.bottleneck.stage,
  "approvedToPaid",
  "bottleneck is approved→paid when it misses target worst"
);
assertEqual(bottleneckOver.averages.quoteToSent, 1, "B-fixture quote→sent average is 1");
assertEqual(bottleneckOver.averages.sentToApproved, 2, "B-fixture sent→approved average is 2");
assertEqual(bottleneckOver.averages.approvedToPaid, 25.5, "B-fixture approved→paid average is 25.5");

var allUnder = cycle.summarize(
  [
    {
      id: "U1",
      quote: "2026-01-01",
      sent: "2026-01-02",
      approved: "2026-01-04",
      paid: "2026-01-10"
    }
  ],
  { quoteToSent: 2, sentToApproved: 5, approvedToPaid: 14 }
);
assertEqual(
  allUnder.bottleneck.stage,
  "quoteToSent",
  "when all stages beat target, bottleneck is least-under (quote→sent: -1 vs -3 vs -8)"
);

var customTargets = cycle.findBottleneck(
  { quoteToSent: 3, sentToApproved: 6, approvedToPaid: 10 },
  { quoteToSent: 2, sentToApproved: 5, approvedToPaid: 14 }
);
assertEqual(customTargets.stage, "quoteToSent", "tie on +1 delta breaks in pipeline order");

var empty = cycle.summarize([]);
assertNull(empty.averages.quoteToSent, "empty set average is null");
assertNull(empty.bottleneck, "empty set bottleneck is null");

// --- sample data file ---
var dataPath = path.join(__dirname, "..", "data", "invoices.json");
var dataset = JSON.parse(fs.readFileSync(dataPath, "utf8"));
assertEqual(dataset.invoices.length >= 20, true, "sample file has at least 20 invoices");
assertEqual(dataset.invoices.length, 24, "sample file has 24 invoices");

var sample = cycle.summarize(dataset);
assertEqual(sample.counts.quoteToPaid, 21, "sample has 21 complete quote→paid cycles");
assertEqual(sample.counts.quoteToSent, 23, "sample quote→sent excludes the quote-only invoice");
assertEqual(
  sample.bottleneck.stage,
  "approvedToPaid",
  "sample bottleneck is approved→paid vs 14-day target"
);

var inv1 = cycle.stageDays(dataset.invoices[0]);
assertEqual(inv1.quoteToSent, 1, "INV-2026-001 quote→sent is 1");
assertEqual(inv1.sentToApproved, 4, "INV-2026-001 sent→approved is 4");
assertEqual(inv1.approvedToPaid, 14, "INV-2026-001 approved→paid is 14");

var inv5 = cycle.stageDays(dataset.invoices[4]);
assertEqual(inv5.quoteToSent, 0, "INV-2026-005 same-day send is 0");
assertEqual(inv5.sentToApproved, 2, "INV-2026-005 sent→approved is 2");
assertEqual(inv5.approvedToPaid, 6, "INV-2026-005 approved→paid is 6");

var inv24 = cycle.stageDays(dataset.invoices[23]);
assertNull(inv24.quoteToSent, "INV-2026-024 incomplete sent is null");

console.log("Summary: " + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
