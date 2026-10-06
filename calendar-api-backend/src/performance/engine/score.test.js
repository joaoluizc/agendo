// Synthetic agents only — this repository is public. Expected values are worked out by
// hand in the comments so a formula change shows up as a failing number, not a silently
// re-derived one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePeriod } from "./score.js";
import { round1, gradeFor } from "./grades.js";
import { describe as stats } from "./stats.js";
import { METHODOLOGY_V1 } from "../seeds/methodologyV1.js";

const config = METHODOLOGY_V1.config;
const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ≈ ${expected}`);

const ch = (count, csat = null, surveys = 0) => ({ count, csat, surveys });
const hrs = (chats, tickets = 0) => ({ chats: chats * 60, tickets: tickets * 60 });

function fixture() {
  const agents = [
    { clerkId: "a", region: "US", role: "regular" },
    { clerkId: "b", region: "BR", role: "regular" },
    { clerkId: "c", region: "US", role: "regular" },
    { clerkId: "split", region: "BR", role: "billingSplit" },
    { clerkId: "lead", region: "IL", role: "teamLead" },
    { clerkId: "p", region: "APAC", role: "regular" },
    { clerkId: "q", region: "APAC", role: "regular" },
    { clerkId: "r", region: "APAC", role: "regular" },
    { clerkId: "x", region: "IL", role: "excluded" },
  ];
  const facts = {
    a: { chats: ch(300, 0.95, 100), tickets: ch(100, 0.85, 20) },
    b: { chats: ch(200, 0.9, 50), tickets: ch(50, 0.9, 10) },
    c: { chats: ch(100, 0.8, 4), tickets: ch(150) },
    split: { chats: ch(150, 0.9, 30), tickets: ch(500) },
    lead: { chats: ch(50, 1, 20), tickets: ch(10) },
    p: { chats: ch(60, 0.95, 40), tickets: ch(30) },
    q: { chats: ch(120, 0.9, 40) },
    r: { tickets: ch(90, 0.9, 10) },
    x: { chats: ch(10, 1, 5) },
  };
  const minutes = {
    a: hrs(100, 100),
    b: hrs(100, 100),
    c: hrs(100, 100),
    split: hrs(100, 100),
    lead: hrs(10, 5),
    p: hrs(60, 30),
    q: hrs(60),
    x: hrs(5),
  };
  return scorePeriod({ agents, facts, minutes, config });
}

const row = (result, id) => result.rows.find((r) => r.clerkId === id);

test("benchmarks are the cohort mean of regular agents' rates, per cohort", () => {
  const { benchmarks } = fixture();
  // core regulars: chats 3, 2, 1 /h → 2; tickets 1, 0.5, 1.5 /h → 1. Billing split and the
  // team lead are not in the mean.
  close(benchmarks.core.channels.chats.value, 2);
  close(benchmarks.core.channels.tickets.value, 1);
  assert.equal(benchmarks.core.channels.chats.n, 3);
  close(benchmarks.core.channels.chats.sd, Math.sqrt(2 / 3), 1e-9);
  // APAC on its own: chats 1, 2 /h → 1.5 (r has no hours, so no rate).
  close(benchmarks.apac.channels.chats.value, 1.5);
  assert.equal(benchmarks.apac.channels.chats.n, 2);
  // volume reference: mean interactions of regulars with any — core (400+250+250)/3.
  close(benchmarks.core.interactions.mean, 300);
  close(benchmarks.apac.interactions.mean, (90 + 120 + 90) / 3);
});

test("regular agent: capped channel indexes blended by interaction share, plus quality", () => {
  const a = row(fixture(), "a");
  // chats 3/2 = 1.5× → 100; tickets 1/1 → 66.67; shares 300/400, 100/400
  close(a.productivity.channels.chats.index, 100);
  close(a.productivity.channels.tickets.index, 66.6667);
  close(a.productivity.value, 91.6667);
  // weighted CSAT (0.95×100 + 0.85×20) / 120 = 0.9333 → (0.9333−0.7)/0.3 = 77.78
  close(a.quality.weightedCsat, 0.93333);
  close(a.quality.value, 77.7778);
  // 0.6×91.67 + 0.4×77.78 = 86.11
  close(a.aps, 86.1111);
  assert.equal(a.grade, "A");
});

test("index is capped at 1.5× the benchmark", () => {
  const lead = row(fixture(), "lead");
  // chats 5/h vs 2 → 2.5×, capped → 100
  close(lead.productivity.channels.chats.index, 100);
});

test("no surveys at all: quality unscored, so no APS", () => {
  const result = scorePeriod({
    agents: [{ clerkId: "a", region: "US", role: "regular" }],
    facts: { a: { chats: ch(20) } },
    minutes: { a: hrs(10) },
    config,
  });
  assert.equal(row(result, "a").quality.value, null);
  assert.equal(row(result, "a").aps, null);
  assert.ok(row(result, "a").flags.includes("noSurveys"));
});

test("fewer than 5 surveys: quality ×0.8", () => {
  const c = row(fixture(), "c");
  // CSAT 0.8 on 4 surveys → 33.33 × 0.8 = 26.67
  assert.equal(c.quality.penalized, true);
  close(c.quality.value, 26.6667);
  // prod: chats 0.5× → 33.33 (share 0.4), tickets 1.5× → 100 (share 0.6) → 73.33
  close(c.productivity.value, 73.3333);
  close(c.aps, 54.6667);
  assert.equal(c.grade, "D");
  assert.ok(c.flags.includes("lowSample"));
});

test("billing split: chats only, still ranked on the leaderboard", () => {
  const split = row(fixture(), "split");
  assert.deepEqual(Object.keys(split.productivity.channels), ["chats"]);
  // chats 1.5/h vs 2 → 0.75× → 50; quality 0.9 → 66.67; 0.6×50 + 0.4×66.67 = 56.67
  close(split.productivity.value, 50);
  close(split.aps, 56.6667);
  assert.equal(split.board, "leaderboard");
});

test("team lead: volume against the cohort's regulars plus quality; productivity only as reference", () => {
  const lead = row(fixture(), "lead");
  // 60 interactions / 300 → 20; quality 100; 0.3×20 + 0.7×100 = 76
  close(lead.volume.value, 20);
  close(lead.aps, 76);
  assert.equal(lead.grade, "B");
  assert.equal(lead.productivity.inAps, false);
  assert.equal(lead.board, "leadsBilling");
  assert.equal(lead.ranks.cohort, null);
});

test("APAC is its own cohort and scores chats only", () => {
  const result = fixture();
  const p = row(result, "p");
  assert.equal(p.cohort, "apac");
  assert.deepEqual(Object.keys(p.productivity.channels), ["chats"]);
  // 1/h vs APAC's 1.5 → 0.667× → 44.44, tickets ignored
  close(p.productivity.value, 44.4444);
  assert.equal(row(result, "q").ranks.cohort, 1);
  assert.equal(p.ranks.cohort, 3);
});

test("interactions but no hours: volume proxy, flagged", () => {
  const r = row(fixture(), "r");
  assert.equal(r.productivity.mode, "volumeProxy");
  // 90 / 100 → 0.9, over the 1.5 cap → 60
  close(r.productivity.value, 60);
  assert.ok(r.flags.includes("volumeProxy"));
});

test("excluded agents are shown but not graded", () => {
  const x = row(fixture(), "x");
  assert.equal(x.graded, false);
  assert.equal(x.aps, null);
  assert.equal(x.grade, null);
});

test("ranks: competition ranking per cohort and per region on the leaderboard", () => {
  const result = fixture();
  // core leaderboard: a 86.1, b 62.7, split 56.7, c 54.7
  assert.deepEqual(
    ["a", "b", "split", "c"].map((id) => row(result, id).ranks.cohort),
    [1, 2, 3, 4],
  );
  assert.equal(row(result, "c").ranks.region, 2); // US: a, c
  assert.equal(row(result, "split").ranks.region, 2); // BR: b, split
});

test("z-scores only once a cohort has at least minN agents", () => {
  const agents = ["a", "b", "c", "d", "e"].map((clerkId) => ({ clerkId, region: "US", role: "regular" }));
  const rates = { a: 1, b: 2, c: 3, d: 4, e: 10 };
  const facts = Object.fromEntries(agents.map(({ clerkId }) => [clerkId, { chats: ch(rates[clerkId] * 10, 0.9, 10) }]));
  const minutes = Object.fromEntries(agents.map(({ clerkId }) => [clerkId, hrs(10)]));
  const result = scorePeriod({ agents, facts, minutes, config });
  const s = stats([1, 2, 3, 4, 10]);
  close(row(result, "e").z.chats, (10 - s.mean) / s.sd, 1e-9);
  assert.ok(row(result, "e").flags.includes("outlier:chats") === (Math.abs((10 - s.mean) / s.sd) >= 2));

  const small = scorePeriod({ agents: agents.slice(0, 3), facts, minutes, config });
  assert.equal(row(small, "a").z.chats, null);
});

test("hours are floored before rates, as the quarterly sheet did", () => {
  const result = scorePeriod({
    agents: [{ clerkId: "a", region: "US", role: "regular" }],
    facts: { a: { chats: ch(20, 0.9, 10) } },
    minutes: { a: { chats: 10 * 60 + 59 } },
    config,
  });
  assert.equal(row(result, "a").inputs.channels.chats.hours, 10);
  close(row(result, "a").inputs.channels.chats.rate, 2);
});

test("grades read the score as displayed (one decimal)", () => {
  assert.equal(gradeFor(round1(79.96), config.grades), "A");
  assert.equal(gradeFor(round1(79.94), config.grades), "B");
  assert.equal(gradeFor(round1(12), config.grades), "D");
});

test("reproduces the CRO's arithmetic with his fixed Q1 benchmarks", () => {
  // His sheet: chat prod normalized to 2.61/h, tickets to 0.87/h, everyone in one pool.
  const croConfig = {
    ...config,
    productivity: {
      ...config.productivity,
      benchmark: { stat: "fixed", fixed: { chats: 2.61, tickets: 0.87 }, roles: ["regular"] },
    },
  };
  const result = scorePeriod({
    agents: [{ clerkId: "a", region: "US", role: "regular" }],
    facts: { a: { chats: ch(553, 0.971, 273), tickets: ch(188) } },
    minutes: { a: hrs(163, 214) },
    config: croConfig,
  });
  const a = row(result, "a");
  // 553/163 = 3.3926/h → 1.2999× → 86.657; 188/214 = 0.8785/h → 1.0098× → 67.318
  close(a.productivity.channels.chats.index, 86.657);
  close(a.productivity.channels.tickets.index, 67.318);
  // shares 553/741, 188/741 → 81.751; quality (0.971−0.7)/0.3 → 90.333
  close(a.productivity.value, 81.751);
  close(a.quality.value, 90.333);
  close(a.aps, 85.184);
  assert.equal(a.grade, "A");
});
