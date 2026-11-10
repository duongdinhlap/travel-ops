/**
 * Bộ sinh tham số `tfs` của Google Flights (protobuf tự mã hoá, không phụ thuộc thư viện).
 *
 * Cấu trúc message (đã kiểm chứng bằng cách giải mã URL thật của Google Flights):
 *
 *   message Airport    { string code = 2; }
 *   message FlightData {
 *     string date        = 2;   // YYYY-MM-DD
 *     int32  max_stops   = 5;   // 0 = bay thẳng, 1 = tối đa 1 điểm dừng, 2 = tối đa 2 (bỏ trống = bất kỳ)
 *     repeated string airlines = 6; // mã IATA hãng (VD: "OK", "FR") hoặc liên minh ("STAR_ALLIANCE")
 *     Airport from = 13;
 *     Airport to   = 14;
 *   }
 *   message Info {
 *     repeated FlightData legs = 3;
 *     repeated Passenger passengers = 8;   // 1 = ADULT
 *     Seat seat = 9;                       // 1 = ECONOMY
 *     Trip trip = 19;                      // 1 = ROUND_TRIP, 2 = ONE_WAY
 *   }
 *
 * Chỉ dùng Uint8Array + btoa nên chạy được trên cả Node, Edge runtime và trình duyệt.
 */

export type StopsFilter = "nonstop" | "max1" | "any";

export interface Leg {
  date: string; // YYYY-MM-DD
  from: string; // IATA
  to: string; // IATA
}

export interface TfsOptions {
  legs: Leg[];
  stops?: StopsFilter;
  airlines?: string[]; // mã IATA 2 ký tự
  adults?: number;
  seat?: 1 | 2 | 3 | 4;
}

const enc = new TextEncoder();

function varint(n: number): number[] {
  const out: number[] = [];
  let v = n >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

const tag = (field: number, wire: number) => varint((field << 3) | wire);

function lenDelimited(field: number, bytes: number[]): number[] {
  return [...tag(field, 2), ...varint(bytes.length), ...bytes];
}

const str = (field: number, s: string) => lenDelimited(field, Array.from(enc.encode(s)));
const int = (field: number, n: number) => [...tag(field, 0), ...varint(n)];

function stopsValue(s?: StopsFilter): number | null {
  if (s === "nonstop") return 0;
  if (s === "max1") return 1;
  return null;
}

function encodeLeg(leg: Leg, stops: number | null, airlines: string[]): number[] {
  const body: number[] = [...str(2, leg.date)];
  if (stops !== null) body.push(...int(5, stops));
  for (const a of airlines) body.push(...str(6, a));
  body.push(...lenDelimited(13, str(2, leg.from.toUpperCase())));
  body.push(...lenDelimited(14, str(2, leg.to.toUpperCase())));
  return lenDelimited(3, body);
}

function toBase64Url(bytes: number[]): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildTfs(opts: TfsOptions): string {
  const stops = stopsValue(opts.stops);
  const airlines = (opts.airlines ?? []).map((a) => a.trim().toUpperCase()).filter((a) => /^[A-Z0-9]{2}$/.test(a));
  const bytes: number[] = [];
  for (const leg of opts.legs) bytes.push(...encodeLeg(leg, stops, airlines));
  for (let i = 0; i < Math.max(1, opts.adults ?? 1); i++) bytes.push(...int(8, 1));
  bytes.push(...int(9, opts.seat ?? 1));
  bytes.push(...int(19, opts.legs.length === 2 ? 1 : 2));
  return toBase64Url(bytes);
}

export function buildFlightsUrl(opts: TfsOptions & { currency?: string; hl?: string }): string {
  const params = new URLSearchParams({
    tfs: buildTfs(opts),
    hl: opts.hl ?? "en",
    curr: opts.currency ?? "EUR",
  });
  return `https://www.google.com/travel/flights?${params.toString()}`;
}
