import { parse, type HTMLElement } from "node-html-parser";
import type { FlightOption, FlightsApiResponse } from "./types";
import { buildFlightsUrl, type StopsFilter } from "./tfs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
// Cookie đồng ý (consent) để Google không chuyển hướng sang consent.google.com ở khu vực EU
const CONSENT_COOKIE = "SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg; CONSENT=YES+";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const SP = "[\\s\\u00a0\\u202f]"; // Google chèn narrow no-break space trước AM/PM
const TIME = `(\\d{1,2}:\\d{2})${SP}?([AP]M)`;

const reStops = /(Nonstop|(\d+) stops?) flight with (.+?)\.\s*Leaves/i;
const reLeg = new RegExp(
  `Leaves (.+?) at ${TIME} on \\w+, (\\w+) (\\d{1,2}) and arrives at (.+?) at ${TIME} on \\w+, (\\w+) (\\d{1,2})`,
  "i",
);
const rePrice = /^From ([\d.,]+)/i;
const reDuration = /Total duration (?:(\d+) hr)?\s*(?:(\d+) min)?/i;
const reLayover = /Layover \(\d+ of \d+\) is a (.+?) layover at (.+?)\.(?=\s|$)/gi;

function to24h(hm: string, ap: string): string {
  let [h, m] = hm.split(":").map(Number);
  if (ap.toUpperCase() === "PM" && h !== 12) h += 12;
  if (ap.toUpperCase() === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dayOfYear(month: string, day: string): number {
  const mi = MONTHS.indexOf(month.toLowerCase());
  return mi < 0 ? 0 : Date.UTC(2001, mi, Number(day)) / 86400000;
}

function splitAirlines(s: string): string[] {
  return s
    .replace(/\.?\s*Operated by .*$/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .split(/,\s*and\s+|,\s*|\s+and\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Phân tích chuỗi aria-label của một thẻ chuyến bay. Trả về null nếu không đúng mẫu. */
export function parseAriaLabel(label: string): FlightOption | null {
  const p = label.match(rePrice);
  const l = label.match(reLeg);
  if (!p || !l) return null;
  const s = label.match(reStops);
  const d = label.match(reDuration);
  const price = Number(p[1].replace(/[.,]/g, ""));
  if (!Number.isFinite(price) || price <= 0) return null;

  let offset = Math.round(dayOfYear(l[9], l[10]) - dayOfYear(l[4], l[5]));
  if (offset < 0) offset += 365; // qua năm mới

  const layovers: string[] = [];
  for (const m of label.matchAll(reLayover)) layovers.push(`${m[1]} @ ${m[2]}`);

  const note = /does not include overhead bin/i.test(label) ? "Chưa gồm hành lý xách tay lớn" : undefined;

  return {
    price,
    airlines: s ? splitAirlines(s[3]) : [],
    stops: s ? (s[1].toLowerCase() === "nonstop" ? 0 : Number(s[2])) : layovers.length,
    depTime: to24h(l[2], l[3]),
    arrTime: to24h(l[7], l[8]),
    arrDayOffset: offset,
    durationMin: d ? Number(d[1] ?? 0) * 60 + Number(d[2] ?? 0) : 0,
    layovers,
    fromAirport: l[1].trim(),
    toAirport: l[6].trim(),
    note,
  };
}

/**
 * Dự phòng: bộ chọn class (kiểu thư viện fast-flights) khi aria-label không có.
 * Class của Google có thể thay đổi – vì vậy đây chỉ là phương án thứ hai.
 */
function parseByClasses(root: HTMLElement): FlightOption[] {
  const out: FlightOption[] = [];
  for (const li of root.querySelectorAll("ul.Rk10dc li")) {
    const times = li.querySelectorAll("span.mv1WYe div").map((n) => n.text.trim());
    const priceTxt = li.querySelector(".YMlIz.FpEdX")?.text ?? "";
    const price = Number(priceTxt.replace(/[^\d]/g, ""));
    if (times.length < 2 || !price) continue;
    const tm = (t: string) => {
      const m = t.match(new RegExp(TIME, "i"));
      return m ? to24h(m[1], m[2]) : t;
    };
    const stopsTxt = li.querySelector(".BbR8Ec .ogfYpf")?.text.trim() ?? "";
    const durTxt = li.querySelector("div.Ak5kof div")?.text ?? "";
    const dm = durTxt.match(/(?:(\d+) hr)?\s*(?:(\d+) min)?/);
    out.push({
      price,
      airlines: splitAirlines(li.querySelector("div.sSHqwe.tPgKwe.ogfYpf span")?.text.trim() ?? ""),
      depTime: tm(times[0]),
      arrTime: tm(times[1]),
      arrDayOffset: li.querySelector("span.bOzv6") ? 1 : 0,
      durationMin: dm ? Number(dm[1] ?? 0) * 60 + Number(dm[2] ?? 0) : 0,
      stops: /nonstop/i.test(stopsTxt) ? 0 : Number(stopsTxt.split(" ")[0]) || 0,
      layovers: [],
      fromAirport: "",
      toAirport: "",
    });
  }
  return out;
}

export function parseFlightsHtml(html: string): FlightOption[] {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const seen = new Set<string>();
  const out: FlightOption[] = [];
  for (const el of root.querySelectorAll("[aria-label]")) {
    const label = el.getAttribute("aria-label") ?? "";
    if (!label.startsWith("From ")) continue;
    const f = parseAriaLabel(label);
    if (!f) continue;
    const key = `${f.price}|${f.depTime}|${f.arrTime}|${f.airlines.join(",")}|${f.stops}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  const result = out.length ? out : parseByClasses(root);
  return result.sort((a, b) => a.price - b.price);
}

export interface SearchParams {
  from: string;
  to: string;
  depart: string;
  ret?: string;
  stops: StopsFilter;
  airlines: string[];
  currency: string;
}

type FetchResult = { ok: true; flights: FlightOption[] } | { ok: false; code: NonNullable<FlightsApiResponse["code"]>; message: string };

export async function fetchFlights(url: string, signal?: AbortSignal): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: CONSENT_COOKIE,
      },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, code: "NETWORK", message: `Không kết nối được Google Flights: ${(e as Error).message}` };
  }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") ?? "";
    if (loc.includes("/sorry/")) {
      return { ok: false, code: "RATE_LIMITED", message: "Google tạm thời chặn do truy vấn quá nhanh (captcha). Đợi vài phút rồi thử lại." };
    }
    if (loc.includes("consent.")) {
      return { ok: false, code: "CONSENT", message: "Google yêu cầu trang đồng ý cookie – chưa vượt qua được." };
    }
    return { ok: false, code: "HTTP_ERROR", message: `Google chuyển hướng bất thường (${res.status}).` };
  }
  if (res.status === 429) {
    return { ok: false, code: "RATE_LIMITED", message: "Google trả về 429 (quá nhiều truy vấn). Đợi vài phút rồi thử lại." };
  }
  if (!res.ok) return { ok: false, code: "HTTP_ERROR", message: `Google Flights trả về HTTP ${res.status}.` };
  const html = await res.text();
  return { ok: true, flights: parseFlightsHtml(html) };
}

export async function searchPair(p: SearchParams, withReturn: boolean, signal?: AbortSignal): Promise<FlightsApiResponse> {
  const legs = [{ date: p.depart, from: p.from, to: p.to }];
  if (p.ret) legs.push({ date: p.ret, from: p.to, to: p.from });
  const common = { stops: p.stops, airlines: p.airlines, currency: p.currency };
  const fetchUrl = buildFlightsUrl({ ...common, legs, hl: "en" });
  const userUrl = buildFlightsUrl({ ...common, legs, hl: "vi" });

  const out = await fetchFlights(fetchUrl, signal);
  if (!out.ok) return { ok: false, code: out.code, message: out.message, url: userUrl, outbound: [] };

  let inbound: FlightOption[] | undefined;
  if (withReturn && p.ret) {
    const retUrl = buildFlightsUrl({ ...common, legs: [{ date: p.ret, from: p.to, to: p.from }], hl: "en" });
    const r = await fetchFlights(retUrl, signal);
    inbound = r.ok ? r.flights : [];
  }

  if (!out.flights.length) {
    return { ok: true, code: "PARSE_EMPTY", message: "Không tìm thấy chuyến bay phù hợp cho cặp ngày này.", url: userUrl, outbound: [], inbound };
  }
  return { ok: true, url: userUrl, outbound: out.flights, inbound };
}
