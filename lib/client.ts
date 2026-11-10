"use client";

import type { FlightOption, FlightsApiResponse } from "./types";
import type { StopsFilter } from "./tfs";

export const MAX_QUERIES = 120;

export interface QueryInput {
  from: string;
  to: string;
  depart: string;
  ret: string;
  stops: StopsFilter;
  airlineCodes: string[];
  currency: string;
  withReturn: boolean;
}

export async function queryPair(q: QueryInput, signal?: AbortSignal): Promise<FlightsApiResponse> {
  const params = new URLSearchParams({
    from: q.from,
    to: q.to,
    depart: q.depart,
    ret: q.ret,
    stops: q.stops,
    curr: q.currency,
    airlines: q.airlineCodes.join(","),
    withReturn: q.withReturn ? "1" : "0",
  });
  try {
    const res = await fetch(`/api/flights?${params}`, { signal, cache: "no-store" });
    const data = (await res.json()) as FlightsApiResponse;
    return data;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { ok: false, code: "NETWORK", message: "Mất kết nối tới máy chủ.", url: "", outbound: [] };
  }
}

/**
 * Hàng đợi song song (worker pool). Mỗi worker lấy việc kế tiếp cho tới khi hết,
 * có độ trễ ngẫu nhiên giữa các truy vấn để giảm nguy cơ bị Google chặn.
 * `shouldStop` cho phép dừng sớm (VD: bị rate-limit liên tiếp).
 */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onDone: (result: R, item: T, index: number) => void,
  opts: { signal?: AbortSignal; shouldStop?: () => boolean; jitterMs?: [number, number] } = {},
): Promise<void> {
  let next = 0;
  const [jMin, jMax] = opts.jitterMs ?? [250, 900];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const loop = async (wid: number) => {
    await sleep(wid * 350); // khởi động lệch nhau
    while (true) {
      if (opts.signal?.aborted || opts.shouldStop?.()) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        const r = await worker(items[i], i);
        onDone(r, items[i], i);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        throw e;
      }
      await sleep(jMin + Math.random() * (jMax - jMin));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, (_, w) => loop(w)));
}

/** Tách ô "Hãng bay" người dùng nhập: mã IATA 2 ký tự → đưa vào tfs; tên → lọc theo tên phía client. */
export function splitAirlineInput(s: string): { codes: string[]; names: string[] } {
  const parts = s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  const codes = parts.filter((p) => /^[A-Za-z0-9]{2}$/.test(p)).map((p) => p.toUpperCase());
  const names = parts.filter((p) => !/^[A-Za-z0-9]{2}$/.test(p)).map((p) => p.toLowerCase());
  return { codes, names };
}

export function matchesAirlineNames(f: FlightOption, names: string[]): boolean {
  if (!names.length) return true;
  return f.airlines.some((a) => names.some((n) => a.toLowerCase().includes(n)));
}

export function formatMoney(v: number, currency: string): string {
  try {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${Math.round(v).toLocaleString("vi-VN")} ${currency}`;
  }
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM để Excel đọc đúng UTF-8 tiếng Việt
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stopsLabel(n: number): string {
  return n === 0 ? "Bay thẳng" : `${n} điểm dừng`;
}
