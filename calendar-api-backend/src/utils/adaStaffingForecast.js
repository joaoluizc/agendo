// services/forecastChatStaffing.js
// ESM module
import AdaChat from "../models/AdaChatModel.js";

/**
 * ---------- Utilities ----------
 */
function toUTCDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(dt.toISOString()); // normalized to UTC
}

function floorToSlot(date, slotMinutes) {
  const d = toUTCDate(date);
  const minutes = d.getUTCMinutes();
  const floored = minutes - (minutes % slotMinutes);
  const out = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      floored,
      0,
      0
    )
  );
  return out;
}

function weekdayUTC(date) {
  // 0 = Monday? In JS, getUTCDay(): 0=Sunday...6=Saturday
  // We'll convert to 0=Monday..6=Sunday to match common ops,
  // but you can switch to 0=Sunday if you prefer.
  const js = toUTCDate(date).getUTCDay(); // 0..6 (0=Sun)
  return (js + 6) % 7; // 0=Mon, 6=Sun
}

function slotIndexUTC(date, slotMinutes) {
  const d = toUTCDate(date);
  return Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / slotMinutes);
}

function median(arr) {
  const a = arr
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((x, y) => x - y);
  if (!a.length) return NaN;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function mean(arr) {
  const a = arr.filter((v) => Number.isFinite(v));
  if (!a.length) return NaN;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

/**
 * ---------- Staffing models ----------
 * Halfin-Whitt (square-root safety) and optional Erlang C ASA target.
 */

function halfinWhittStaffing({
  arrivalsPerSlot,
  slotMinutes,
  ahtMinutes,
  concurrency = 1.8,
  zSafety = 1.0,
}) {
  const conc = Math.max(1e-9, Number(concurrency) || 1.8);
  const aht = Math.max(1e-9, Number(ahtMinutes) || 20.0);
  const lamPerMin = (Number(arrivalsPerSlot) || 0) / slotMinutes; // arrivals/min
  const offered = lamPerMin * (aht / conc); // "Erlangs" as agent-minutes per minute
  if (offered <= 0) return 0;
  const n = offered + zSafety * Math.sqrt(offered);
  return Math.ceil(n);
}

function erlangCRequiredAgents({
  arrivalsPerSlot,
  slotMinutes,
  ahtMinutes,
  targetAsaSeconds = 200,
  concurrency = 1.0,
  maxAgents = 200,
}) {
  const arrSlot = Number(arrivalsPerSlot) || 0;
  if (arrSlot <= 0) return 0;
  const lam = arrSlot / slotMinutes; // per minute
  const serviceRatePerAgent =
    1.0 /
    Math.max(
      1e-9,
      (Number(ahtMinutes) || 8.0) / Math.max(1.0, Number(concurrency) || 1.0)
    ); // per minute

  const a = lam / serviceRatePerAgent; // offered load in Erlangs
  const startN = Math.max(1, Math.ceil(a));

  const erlangC = (n, load) => {
    // Use stable recursive sum for p0
    let invSum = 0;
    for (let k = 0; k < n; k++) {
      invSum += Math.pow(load, k) / factorial(k);
    }
    const tail = Math.pow(load, n) / (factorial(n) * (1 - load / n));
    const p0 = 1 / (invSum + tail);
    const pc = tail * p0; // wait probability
    return pc;
  };

  const factorial = (n) => {
    // small n typical here; otherwise memoize
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  };

  for (let n = startN; n <= maxAgents; n++) {
    if (a / n >= 1.0) continue; // unstable
    const pc = erlangC(n, a);
    const denom = n * serviceRatePerAgent - lam;
    const asaMinutes = denom > 0 ? pc / denom : Number.POSITIVE_INFINITY;
    const asaSeconds = asaMinutes * 60;
    if (asaSeconds <= targetAsaSeconds) return n;
  }
  return maxAgents;
}

/**
 * ---------- Extractors ----------
 * You can tailor these to how Ada stores metrics inside `data`.
 * Defaults: start = date_created, AHT = 20 min, concurrency = 1.8
 */
function defaultExtractors() {
  return {
    getStartUTC: (doc) => toUTCDate(doc.date_created),
    getAhtMinutes: (doc) => {
      // Example: if doc.data.metrics?.aht_minutes exists, use it; else default 20
      const aht = doc?.data?.metrics?.aht_minutes;
      return Number.isFinite(aht) ? aht : 20.0;
    },
    getConcurrency: (doc) => {
      // Example: if doc.data.metrics?.avg_concurrency exists, use it; else default 1.8
      const c = doc?.data?.metrics?.avg_concurrency;
      return Number.isFinite(c) && c > 0 ? c : 1.8;
    },
  };
}

/**
 * ---------- Aggregation ----------
 * Build slot-level arrivals with AHT/concurrency samples for seasonal baseline.
 */
function aggregateArrivals(docs, { slotMinutes }, extractors) {
  const buckets = new Map(); // key: slotStartISO -> { weekday, slotOfDay, arrivals, ahts[], concs[] }

  for (const doc of docs) {
    const start = extractors.getStartUTC(doc);
    if (!start || isNaN(start.valueOf())) continue;

    const slotStart = floorToSlot(start, slotMinutes);
    const key = slotStart.toISOString();
    const w = weekdayUTC(slotStart);
    const s = slotIndexUTC(slotStart, slotMinutes);
    const aht = extractors.getAhtMinutes(doc);
    const con = extractors.getConcurrency(doc);

    if (!buckets.has(key)) {
      buckets.set(key, {
        slotStart,
        weekday: w,
        slotOfDay: s,
        arrivals: 0,
        ahts: [],
        concs: [],
      });
    }
    const b = buckets.get(key);
    b.arrivals += 1;
    if (Number.isFinite(aht)) b.ahts.push(aht);
    if (Number.isFinite(con)) b.concs.push(con);
  }

  // Flatten buckets to an array
  return Array.from(buckets.values()).map((b) => ({
    slotStart: b.slotStart,
    weekday: b.weekday,
    slotOfDay: b.slotOfDay,
    arrivals: b.arrivals,
    ahtMinutes: median(b.ahts),
    concurrency: median(b.concs),
  }));
}

/**
 * Build (weekday, slotOfDay) seasonal baseline with smoothing.
 */
function seasonalBaseline(arrivalsBySlot, { smoothingWeight = 0.2 }) {
  // global stats for fallbacks
  const globalArrivalsMean = mean(arrivalsBySlot.map((r) => r.arrivals)) || 0.1;
  const globalAhtMedian =
    median(arrivalsBySlot.map((r) => r.ahtMinutes)) || 8.0;
  const globalConcMedian =
    median(arrivalsBySlot.map((r) => r.concurrency)) || 1.0;

  // group by (weekday, slotOfDay)
  const key = (w, s) => `${w}.${s}`;
  const groups = new Map();

  for (const r of arrivalsBySlot) {
    const k = key(r.weekday, r.slotOfDay);
    if (!groups.has(k))
      groups.set(k, {
        weekday: r.weekday,
        slotOfDay: r.slotOfDay,
        arrivals: [],
        ahts: [],
        concs: [],
      });
    const g = groups.get(k);
    g.arrivals.push(r.arrivals);
    if (Number.isFinite(r.ahtMinutes)) g.ahts.push(r.ahtMinutes);
    if (Number.isFinite(r.concurrency)) g.concs.push(r.concurrency);
  }

  // compute baseline with smoothing toward global mean
  const baseline = new Map(); // key -> { expectedArrivals, ahtEst, concEst }
  for (const [k, g] of groups.entries()) {
    const rawMeanArr = mean(g.arrivals) || 0;
    const expectedArrivals =
      (1 - smoothingWeight) * rawMeanArr + smoothingWeight * globalArrivalsMean;
    const ahtEst = Number.isFinite(median(g.ahts))
      ? median(g.ahts)
      : globalAhtMedian;
    const concEst = Number.isFinite(median(g.concs))
      ? median(g.concs)
      : globalConcMedian;
    baseline.set(k, {
      weekday: g.weekday,
      slotOfDay: g.slotOfDay,
      expectedArrivals,
      ahtEst,
      concEst,
    });
  }

  return {
    get: (weekday, slotOfDay) => {
      const b = baseline.get(key(weekday, slotOfDay));
      if (b) return b;
      return {
        weekday,
        slotOfDay,
        expectedArrivals: globalArrivalsMean,
        ahtEst: globalAhtMedian,
        concEst: globalConcMedian,
      };
    },
  };
}

/**
 * Build future slots calendar for horizon
 */
function buildForecastCalendar({ forecastStartUTC, horizonDays, slotMinutes }) {
  const out = [];
  const totalSlotsPerDay = Math.floor((24 * 60) / slotMinutes);
  const startDayUTC = new Date(
    Date.UTC(
      forecastStartUTC.getUTCFullYear(),
      forecastStartUTC.getUTCMonth(),
      forecastStartUTC.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  for (let d = 0; d < horizonDays; d++) {
    const day0 = new Date(startDayUTC.getTime() + d * 24 * 60 * 60 * 1000);
    for (let s = 0; s < totalSlotsPerDay; s++) {
      const slotStart = new Date(day0.getTime() + s * slotMinutes * 60 * 1000);
      out.push({
        slotStart,
        weekday: weekdayUTC(slotStart),
        slotOfDay: s,
      });
    }
  }
  return out;
}

/**
 * ---------- Main entry ----------
 * Returns JSON array of slot-level forecast (no CSV).
 */
export async function forecastChatStaffing({
  historyDays = 42, // look-back window for seasonal averages
  forecastStartISO, // e.g., "2025-09-15T00:00:00Z"
  horizonDays = 7,
  slotMinutes = 15,
  method = "halfin", // "halfin" | "erlang"
  zSafety = 1.0,
  targetAsaSeconds = 200.0,

  // extractor overrides if your `data` shape is different:
  extractors = defaultExtractors(),
} = {}) {
  if (!forecastStartISO) {
    throw new Error("forecastStartISO is required (ISO string).");
  }

  const forecastStartUTC = toUTCDate(forecastStartISO);

  // 1) Ingest historical chats
  const historyStart = new Date(
    forecastStartUTC.getTime() - historyDays * 24 * 60 * 60 * 1000
  );
  // Pull only the fields we need; if you know where AHT/concurrency live in data, you can project
  const docs = await AdaChat.find(
    { date_created: { $gte: historyStart, $lt: forecastStartUTC } },
    { _id: 1, date_created: 1, data: 1 } // lean projection
  ).lean();

  // 2) Aggregate arrivals into slots
  const arrivalsBySlot = aggregateArrivals(docs, { slotMinutes }, extractors);

  // 3) Seasonal baseline (weekday x slot-of-day)
  const baseline = seasonalBaseline(arrivalsBySlot, { smoothingWeight: 0.2 });

  // 4) Build forecast calendar
  const cal = buildForecastCalendar({
    forecastStartUTC,
    horizonDays,
    slotMinutes,
  });

  // 5) Convert arrivals to staffing per slot
  const result = cal.map(({ slotStart, weekday, slotOfDay }) => {
    const b = baseline.get(weekday, slotOfDay);
    const expectedArrivals = b.expectedArrivals || 0;
    const aht = Number.isFinite(b.ahtEst) ? b.ahtEst : 8.0;
    const conc = Number.isFinite(b.concEst) && b.concEst > 0 ? b.concEst : 1.0;

    const requiredAgents =
      method === "erlang"
        ? erlangCRequiredAgents({
            arrivalsPerSlot: expectedArrivals,
            slotMinutes,
            ahtMinutes: aht,
            targetAsaSeconds,
            concurrency: conc,
          })
        : halfinWhittStaffing({
            arrivalsPerSlot: expectedArrivals,
            slotMinutes,
            ahtMinutes: aht,
            concurrency: conc,
            zSafety,
          });

    return {
      slotStart: slotStart.toISOString(),
      weekday,
      slotOfDay,
      expectedArrivals: Number(expectedArrivals.toFixed(3)),
      ahtMinutes: Number(aht.toFixed(3)),
      concurrency: Number(conc.toFixed(3)),
      requiredAgents,
    };
  });

  return result;
}

/**
 * ---------- Example usage ----------
 * const forecast = await forecastChatStaffing({
 *   historyDays: 56,
 *   forecastStartISO: "2025-09-15T00:00:00Z",
 *   horizonDays: 7,
 *   slotMinutes: 15,
 *   method: "halfin",
 *   zSafety: 1.0,
 *   // Optional: custom extractors if your Ada payload differs
 *   extractors: {
 *     getStartUTC: doc => new Date(doc.data?.conversation?.started_at ?? doc.date_created),
 *     getAhtMinutes: doc => doc.data?.metrics?.aht_minutes ?? 8.0,
 *     getConcurrency: doc => doc.data?.metrics?.avg_concurrency ?? 1.1
 *   }
 * });
 * // -> [{ slotStart, weekday, slotOfDay, expectedArrivals, ahtMinutes, concurrency, requiredAgents }, ...]
 */
