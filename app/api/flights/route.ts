import { NextRequest, NextResponse } from "next/server";
import { searchPair } from "@/lib/gflights";
import type { StopsFilter } from "@/lib/tfs";
import type { FlightsApiResponse } from "@/lib/types";

// Không dùng headless browser → chạy được trên serverless (Node) lẫn Edge runtime.
// Đổi thành "edge" nếu muốn triển khai lên Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCIES = new Set(["EUR", "CZK", "VND", "USD", "GBP"]);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const from = (q.get("from") ?? "").toUpperCase();
  const to = (q.get("to") ?? "").toUpperCase();
  const depart = q.get("depart") ?? "";
  const ret = q.get("ret") ?? undefined;
  const stopsRaw = q.get("stops") ?? "any";
  const stops: StopsFilter = stopsRaw === "nonstop" || stopsRaw === "max1" ? stopsRaw : "any";
  const currency = (q.get("curr") ?? "EUR").toUpperCase();
  const airlines = (q.get("airlines") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const withReturn = q.get("withReturn") === "1";

  if (!IATA.test(from) || !IATA.test(to) || !DATE.test(depart) || (ret && !DATE.test(ret)) || !CURRENCIES.has(currency)) {
    const body: FlightsApiResponse = { ok: false, code: "BAD_REQUEST", message: "Tham số không hợp lệ.", url: "", outbound: [] };
    return NextResponse.json(body, { status: 400 });
  }

  const result = await searchPair({ from, to, depart, ret, stops, airlines, currency }, withReturn, req.signal);
  const status = result.ok ? 200 : result.code === "RATE_LIMITED" ? 429 : 502;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
