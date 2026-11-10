import { WEEKDAYS_VI, WEEK_ORDER, addDays, fmtDate, minutesOf, parseISO, weekday, type DatePair } from "./dates";
import type { FlightOption } from "./types";

export interface Sample {
  pair: DatePair;
  wd: number;
  status: "ok" | "empty" | "error";
  error?: string;
  url: string;
  rep?: FlightOption; // chuyến đại diện (rẻ nhất thoả yêu cầu)
  hasNonstop: boolean;
  nonstopAirlines: string[];
  convenient: boolean;
}

export interface TimePrefs {
  nonstopOnly: boolean;
  avoidLate: boolean;
  earliest: number; // giờ cất cánh sớm nhất chấp nhận (0-23)
  latest: number; // giờ cất cánh muộn nhất chấp nhận (0-23)
}

/**
 * Lấy mẫu toàn bộ các ngày (T2 → CN) trong mùa, cho mỗi thời lượng tour.
 * Nếu vượt quá ngân sách truy vấn, lấy mẫu cách tuần (mỗi k tuần) để mọi thứ trong tuần
 * vẫn có số mẫu như nhau.
 */
export function planSamples(start: string, end: string, durations: number[], budget: number) {
  const days: string[] = [];
  if (start && end && start <= end) for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const full = days.length * durations.length;
  const stride = Math.max(1, Math.ceil(full / budget));
  const t0 = parseISO(start || "2000-01-01").getTime();
  const pairs: DatePair[] = [];
  for (const d of days) {
    const weekIdx = Math.floor((parseISO(d).getTime() - t0) / (7 * 86400000));
    if (weekIdx % stride !== 0) continue;
    for (const dur of durations) pairs.push({ depart: d, ret: addDays(d, dur - 1), duration: dur });
  }
  return { pairs: pairs.slice(0, budget), full, stride };
}

export function isConvenient(f: FlightOption, p: TimePrefs): boolean {
  const dep = minutesOf(f.depTime);
  const arr = minutesOf(f.arrTime);
  if (dep < p.earliest * 60 || dep > p.latest * 60 + 59) return false;
  if (f.arrDayOffset > 0 && arr > 60) return false; // hạ cánh sau 1h sáng hôm sau
  return true;
}

export function buildSample(pair: DatePair, outbound: FlightOption[], url: string, prefs: TimePrefs): Sample {
  const allowed = outbound.filter((f) => (prefs.nonstopOnly ? f.stops === 0 : f.stops <= 1));
  const nonstop = outbound.filter((f) => f.stops === 0);
  let rep: FlightOption | undefined;
  if (prefs.avoidLate) rep = allowed.find((f) => isConvenient(f, prefs));
  // Ưu tiên bay thẳng: nếu chuyến thẳng rẻ nhất không đắt hơn 15% so với chuyến rẻ nhất thì chọn chuyến thẳng
  if (!rep) {
    const cheapest = allowed[0];
    const ns = allowed.find((f) => f.stops === 0 && (!prefs.avoidLate || isConvenient(f, prefs))) ?? allowed.find((f) => f.stops === 0);
    rep = ns && cheapest && ns.price <= cheapest.price * 1.15 ? ns : cheapest;
  }
  return {
    pair,
    wd: weekday(pair.depart),
    status: rep ? "ok" : "empty",
    url,
    rep,
    hasNonstop: nonstop.length > 0,
    nonstopAirlines: [...new Set(nonstop.flatMap((f) => f.airlines))],
    convenient: rep ? isConvenient(rep, prefs) : false,
  };
}

export interface DayStats {
  wd: number;
  label: string;
  samples: Sample[];
  nQueried: number; // không tính lỗi
  nPriced: number;
  avg: number;
  min: number;
  max: number;
  median: number;
  cv: number; // hệ số biến thiên
  minSample?: Sample;
  spikes: Sample[];
  nonstopRate: number;
  convenientRate: number;
  topAirlines: { name: string; share: number; count: number }[];
  diffPct: number; // so với trung bình chung
  score: number;
  returnWd: number;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const clamp = (x: number, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, x));

export function analyze(samples: Sample[], duration: number): { days: DayStats[]; overallAvg: number } {
  const base = WEEK_ORDER.map((wd) => {
    const s = samples.filter((x) => x.wd === wd && x.pair.duration === duration);
    const queried = s.filter((x) => x.status !== "error");
    const priced = queried.filter((x) => x.rep);
    const prices = priced.map((x) => x.rep!.price).sort((a, b) => a - b);
    const avg = mean(prices);
    const median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2) : 0;
    const sd = Math.sqrt(mean(prices.map((p) => (p - avg) ** 2)));
    const air = new Map<string, number>();
    for (const x of queried) {
      const names = x.nonstopAirlines.length ? x.nonstopAirlines : x.rep?.airlines ?? [];
      for (const n of new Set(names)) air.set(n, (air.get(n) ?? 0) + 1);
    }
    return {
      wd,
      label: WEEKDAYS_VI[wd],
      samples: s,
      nQueried: queried.length,
      nPriced: priced.length,
      avg,
      min: prices[0] ?? 0,
      max: prices[prices.length - 1] ?? 0,
      median,
      cv: avg ? sd / avg : 0,
      minSample: priced.find((x) => x.rep!.price === prices[0]),
      spikes: priced.filter((x) => median && x.rep!.price > median * 1.25).sort((a, b) => b.rep!.price - a.rep!.price),
      nonstopRate: queried.length ? queried.filter((x) => x.hasNonstop).length / queried.length : 0,
      convenientRate: priced.length ? priced.filter((x) => x.convenient).length / priced.length : 0,
      topAirlines: [...air.entries()]
        .map(([name, count]) => ({ name, count, share: queried.length ? count / queried.length : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      diffPct: 0,
      score: 0,
      returnWd: (wd + duration - 1) % 7,
    } satisfies DayStats;
  });

  const priced = base.filter((d) => d.nPriced > 0);
  const overallAvg = mean(priced.map((d) => d.avg));
  for (const d of base) {
    if (!d.nPriced) continue;
    d.diffPct = overallAvg ? (d.avg - overallAvg) / overallAvg : 0;
    const priceScore = clamp(5 - d.diffPct * 25); // ±20% so với TB → 0 / 10 điểm
    const stability = clamp(10 * (1 - d.cv / 0.35));
    const nonstop = 10 * d.nonstopRate;
    const conv = 10 * d.convenientRate;
    const availability = d.nQueried ? d.nPriced / d.nQueried : 0;
    d.score = Math.round((0.45 * priceScore + 0.2 * stability + 0.25 * nonstop + 0.1 * conv) * (0.5 + 0.5 * availability) * 10) / 10;
  }
  return { days: base, overallAvg };
}

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

export interface Recommendation {
  best?: DayStats;
  runnerUp?: DayStats;
  worst?: DayStats;
  bestReasons: string[];
  worstReasons: string[];
}

export function recommend(days: DayStats[], fmt: (n: number) => string): Recommendation {
  const ranked = days.filter((d) => d.nPriced > 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) return { bestReasons: [], worstReasons: [] };
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;
  const minCv = Math.min(...ranked.map((d) => d.cv));

  const bestReasons: string[] = [];
  if (best.diffPct < -0.005) bestReasons.push(`Giá vé trung bình rẻ hơn ${pct(best.diffPct)} so với mặt bằng chung các thứ (${fmt(best.avg)}).`);
  else bestReasons.push(`Giá trung bình ${fmt(best.avg)} – sát mặt bằng chung, nhưng vượt trội ở các tiêu chí khác.`);
  if (best.cv === minCv) bestReasons.push(`Lịch giá ổn định nhất trong tuần (biến động chỉ ±${pct(best.cv)}).`);
  else bestReasons.push(`Mức biến động giá ±${pct(best.cv)} giữa các tuần.`);
  if (best.nonstopRate > 0) bestReasons.push(`Có chuyến bay thẳng ở ${Math.round(best.nonstopRate * best.nQueried)}/${best.nQueried} tuần khảo sát (${pct(best.nonstopRate)}).`);
  const steady = best.topAirlines.find((a) => a.share >= 0.6);
  if (steady) bestReasons.push(`Hãng ${steady.name} bay cố định (xuất hiện ${steady.count}/${best.nQueried} tuần) – thuận lợi để giữ chỗ đoàn.`);
  if (best.minSample) bestReasons.push(`Giá đáy ghi nhận: ${fmt(best.min)} (khởi hành ${fmtDate(best.minSample.pair.depart)}).`);
  bestReasons.push(`Lịch tour: khởi hành ${best.label} → về ${WEEKDAYS_VI[best.returnWd]}.`);

  const worstReasons: string[] = [];
  if (worst) {
    if ([5, 6, 0].includes(worst.wd)) worstReasons.push("Rơi vào dịp cuối tuần – nhu cầu đi lại cao, hãng bay thường đẩy giá.");
    if (worst.diffPct > 0.005) worstReasons.push(`Giá vé trung bình cao hơn ${pct(worst.diffPct)} so với mặt bằng chung (${fmt(worst.avg)}).`);
    if (worst.nonstopRate < 0.6) worstReasons.push(`Ít chuyến bay thẳng: chỉ ${pct(worst.nonstopRate)} số tuần có bay thẳng.`);
    if (worst.spikes.length) {
      const list = worst.spikes.slice(0, 3).map((s) => `${fmtDate(s.pair.depart).slice(0, 5)} (${fmt(s.rep!.price)})`).join(", ");
      worstReasons.push(`Giá đột biến vào tuần cao điểm: ${list}.`);
    } else if (worst.cv > 0.2) worstReasons.push(`Giá dao động mạnh giữa các tuần (±${pct(worst.cv)}).`);
    if (worst.convenientRate < 0.6) worstReasons.push(`Giờ bay kém thuận tiện: ${pct(1 - worst.convenientRate)} chuyến đại diện cất cánh quá sớm/khuya.`);
    if (worst.nPriced < worst.nQueried) worstReasons.push(`${worst.nQueried - worst.nPriced}/${worst.nQueried} tuần không tìm được chuyến thoả yêu cầu.`);
    if (!worstReasons.length) worstReasons.push(`Điểm tổng hợp thấp nhất tuần (${worst.score.toFixed(1)}/10).`);
  }
  return { best, runnerUp: ranked[1] !== worst ? ranked[1] : undefined, worst, bestReasons, worstReasons };
}
