"use client";

import { useMemo, useRef, useState } from "react";
import { WEEKDAYS_SHORT, WEEKDAYS_VI, WEEK_ORDER, fmtDate, fmtDuration, generatePairs, weekday, type DatePair } from "@/lib/dates";
import {
  MAX_QUERIES, downloadCsv, formatMoney, matchesAirlineNames, queryPair, runPool, splitAirlineInput, stopsLabel,
} from "@/lib/client";
import type { FlightOption } from "@/lib/types";
import { IconAlert, IconDownload, IconExternal, IconRetry, IconSearch, IconStop, IconSwap } from "./Icons";

type Status = "ok" | "empty" | "error";
interface PairResult {
  pair: DatePair;
  status: Status;
  best?: FlightOption;
  inbound?: FlightOption;
  matches: number;
  url: string;
  error?: string;
  code?: string;
}

const key = (p: DatePair) => `${p.depart}_${p.ret}`;
const CURRENCIES = ["EUR", "CZK", "VND", "USD"];

function FlightCell({ f }: { f: FlightOption }) {
  return (
    <div>
      <div className="strong">{f.airlines.join(", ") || "—"}</div>
      <div className="times">
        {f.depTime} → {f.arrTime}
        {f.arrDayOffset > 0 && <sup>+{f.arrDayOffset}</sup>}
      </div>
      <div className="small muted">
        {fmtDuration(f.durationMin)} · {stopsLabel(f.stops)}
        {f.layovers.length > 0 && <> · <span title={f.layovers.join("\n")}>qua {f.layovers.map((l) => l.split(" @ ")[1]?.split(" in ")[0]).join(", ")}</span></>}
      </div>
      {f.note && <div className="small" style={{ color: "var(--warn)" }}>{f.note}</div>}
    </div>
  );
}

export default function FlightHunter() {
  const [from, setFrom] = useState("PRG");
  const [to, setTo] = useState("PMI");
  const [start, setStart] = useState("2027-06-01");
  const [end, setEnd] = useState("2027-08-30");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [totalDays, setTotalDays] = useState(5);
  const [stops, setStops] = useState<"nonstop" | "max1">("nonstop");
  const [airlineInput, setAirlineInput] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [concurrency, setConcurrency] = useState(4);
  const [withReturn, setWithReturn] = useState(true);

  const [results, setResults] = useState<Record<string, PairResult>>({});
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [stoppedReason, setStoppedReason] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"price" | "date">("price");
  const [ctx, setCtx] = useState<{ currency: string; from: string; to: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const allPairs = useMemo(() => generatePairs(start, end, weekdays, [totalDays]), [start, end, weekdays, totalDays]);
  const pairs = allPairs.slice(0, MAX_QUERIES);
  const iataOk = /^[A-Za-z]{3}$/.test(from) && /^[A-Za-z]{3}$/.test(to);

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  async function run(list: DatePair[]) {
    if (!list.length) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setStoppedReason(null);
    const runCtx = { currency, from: from.toUpperCase(), to: to.toUpperCase() };
    setCtx(runCtx);
    const { codes, names } = splitAirlineInput(airlineInput);
    const cap = Number(maxPrice) || Infinity;
    const maxStops = stops === "nonstop" ? 0 : 1;
    let consecutiveRL = 0;
    let stopFlag = false;

    await runPool(
      list,
      concurrency,
      (pair) =>
        queryPair(
          { from: runCtx.from, to: runCtx.to, depart: pair.depart, ret: pair.ret, stops, airlineCodes: codes, currency, withReturn },
          ac.signal,
        ),
      (res, pair) => {
        let r: PairResult;
        if (!res.ok) {
          consecutiveRL = res.code === "RATE_LIMITED" ? consecutiveRL + 1 : 0;
          if (consecutiveRL >= 3 && !stopFlag) {
            stopFlag = true;
            setStoppedReason("Google đang tạm chặn (captcha) sau nhiều truy vấn liên tiếp. Đã tự dừng để tránh bị khoá lâu hơn — đợi 5–15 phút rồi bấm “Thử lại các cặp lỗi”.");
          }
          r = { pair, status: "error", matches: 0, url: res.url, error: res.message, code: res.code };
        } else {
          consecutiveRL = 0;
          const ok = res.outbound.filter((f) => f.stops <= maxStops && matchesAirlineNames(f, names) && f.price <= cap);
          const best = ok[0];
          let inbound: FlightOption | undefined;
          if (best && res.inbound?.length) {
            const inOk = res.inbound.filter((f) => f.stops <= maxStops && matchesAirlineNames(f, names));
            inbound = inOk.find((f) => f.airlines.some((a) => best.airlines.includes(a))) ?? inOk[0];
          }
          r = { pair, status: best ? "ok" : "empty", best, inbound, matches: ok.length, url: res.url };
        }
        setResults((prev) => ({ ...prev, [key(pair)]: r }));
      },
      { signal: ac.signal, shouldStop: () => stopFlag },
    );
    setRunning(false);
  }

  function startSearch() {
    setResults({});
    setTotal(pairs.length);
    run(pairs);
  }

  function retry(list: DatePair[]) {
    setResults((prev) => {
      const next = { ...prev };
      for (const p of list) delete next[key(p)];
      return next;
    });
    run(list);
  }

  const all = Object.values(results);
  const ok = all.filter((r) => r.status === "ok");
  const empty = all.filter((r) => r.status === "empty");
  const errors = all.filter((r) => r.status === "error");
  const done = all.length;
  const rows = [...ok].sort((a, b) =>
    sortBy === "price" ? a.best!.price - b.best!.price : a.pair.depart.localeCompare(b.pair.depart),
  );
  const cur = ctx?.currency ?? currency;
  const cheapest = ok.length ? Math.min(...ok.map((r) => r.best!.price)) : 0;

  function exportCsv() {
    const header = ["Ngày đi", "Thứ đi", "Ngày về", "Thứ về", "Hãng chiều đi", "Cất cánh", "Hạ cánh", "Thời gian bay", "Điểm dừng",
      "Hãng chiều về (tham khảo)", "Về - cất cánh", "Về - hạ cánh", "Tổng giá khứ hồi", "Tiền tệ", "Link Google Flights"];
    const body = [...ok].sort((a, b) => a.best!.price - b.best!.price).map((r) => [
      fmtDate(r.pair.depart), WEEKDAYS_VI[weekday(r.pair.depart)], fmtDate(r.pair.ret), WEEKDAYS_VI[weekday(r.pair.ret)],
      r.best!.airlines.join(" / "), r.best!.depTime, r.best!.arrTime + (r.best!.arrDayOffset ? ` (+${r.best!.arrDayOffset})` : ""),
      fmtDuration(r.best!.durationMin), r.best!.stops,
      r.inbound?.airlines.join(" / ") ?? "", r.inbound?.depTime ?? "", r.inbound?.arrTime ?? "",
      r.best!.price, cur, r.url,
    ]);
    downloadCsv(`ve-${ctx?.from}-${ctx?.to}-${start}_${end}.csv`, [header, ...body]);
  }

  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <section>
      <div className="page-head">
        <h1>Săn vé máy bay theo khoảng ngày</h1>
        <p>Quét Google Flights cho mọi cặp ngày đi – về trong khoảng thời gian bạn chọn. Kết quả đổ dần vào bảng, sắp xếp theo giá khứ hồi rẻ nhất.</p>
      </div>

      <div className="card">
        <div className="grid grid-4">
          <div className="route span-2">
            <div className="field">
              <label htmlFor="fh-from">Sân bay đi</label>
              <input id="fh-from" className="input iata" maxLength={3} value={from} onChange={(e) => setFrom(e.target.value.replace(/[^a-z]/gi, ""))} placeholder="PRG" />
            </div>
            <button className="swap" type="button" title="Đổi chiều" onClick={() => { setFrom(to); setTo(from); }}><IconSwap /></button>
            <div className="field">
              <label htmlFor="fh-to">Sân bay đến</label>
              <input id="fh-to" className="input iata" maxLength={3} value={to} onChange={(e) => setTo(e.target.value.replace(/[^a-z]/gi, ""))} placeholder="PMI" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="fh-start">Từ ngày</label>
            <input id="fh-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="fh-end">Đến ngày</label>
            <input id="fh-end" type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>

          <div className="field span-2">
            <span className="label">Thứ khởi hành</span>
            <div className="chips">
              {WEEK_ORDER.map((d) => (
                <button key={d} type="button" className={`chip ${d === 0 || d === 6 ? "weekend" : ""}`} aria-pressed={weekdays.includes(d)} onClick={() => toggleDay(d)}>
                  {WEEKDAYS_VI[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="fh-days">Tổng số ngày chuyến đi</label>
            <input id="fh-days" type="number" min={1} max={60} className="input" value={totalDays} onChange={(e) => setTotalDays(Math.max(1, Number(e.target.value) || 1))} />
            <span className="hint">Tính cả ngày đi & về. {weekdays.length === 1 ? `Đi ${WEEKDAYS_VI[weekdays[0]]} → về ${WEEKDAYS_VI[(weekdays[0] + totalDays - 1) % 7]}` : ""}</span>
          </div>
          <div className="field">
            <span className="label">Số điểm dừng</span>
            <div className="seg">
              <button type="button" aria-pressed={stops === "nonstop"} onClick={() => setStops("nonstop")}>Bay thẳng</button>
              <button type="button" aria-pressed={stops === "max1"} onClick={() => setStops("max1")}>Tối đa 1 điểm dừng</button>
            </div>
          </div>

          <div className="field span-2">
            <label htmlFor="fh-airline">Hãng bay mong muốn (tuỳ chọn)</label>
            <input id="fh-airline" className="input" value={airlineInput} onChange={(e) => setAirlineInput(e.target.value)} placeholder="VD: OK, FR hoặc Smartwings, Ryanair" />
            <span className="hint">Mã IATA 2 ký tự được lọc ngay trên Google; tên hãng được lọc sau khi lấy kết quả.</span>
          </div>
          <div className="field">
            <label htmlFor="fh-max">Giá trần khứ hồi (tuỳ chọn)</label>
            <input id="fh-max" type="number" min={0} className="input" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Không giới hạn" />
          </div>
          <div className="field">
            <label htmlFor="fh-cur">Tiền tệ</label>
            <select id="fh-cur" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="actions">
          {!running ? (
            <button className="btn btn-primary" disabled={!pairs.length || !iataOk} onClick={startSearch}>
              <IconSearch /> Bắt đầu quét {pairs.length ? `${pairs.length} cặp ngày` : ""}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => abortRef.current?.abort()}><IconStop /> Dừng</button>
          )}
          <label className="check"><input type="checkbox" checked={withReturn} onChange={(e) => setWithReturn(e.target.checked)} /> Lấy giờ bay chiều về tham khảo</label>
          <label className="check">
            Luồng song song
            <select className="select" style={{ width: 70, padding: "6px 8px" }} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <span className={`estimate ${allPairs.length > MAX_QUERIES ? "over" : ""}`}>
            {allPairs.length > MAX_QUERIES
              ? <>Có <b>{allPairs.length}</b> cặp ngày — chỉ quét <b>{MAX_QUERIES}</b> cặp đầu tiên để tránh bị chặn.</>
              : <>Sẽ quét <b>{pairs.length}</b> cặp ngày{withReturn ? ` (~${pairs.length * 2} truy vấn)` : ""}.</>}
          </span>
        </div>

        {total > 0 && (
          <div className="progress-wrap" aria-live="polite">
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
              <span className="ok" style={{ width: `${pct(ok.length + empty.length)}%` }} />
              <span className="err" style={{ width: `${pct(errors.length)}%` }} />
            </div>
            <div className="progress-meta">
              <span>{running && <span className="spinner" style={{ marginRight: 6, verticalAlign: -3 }} />}Đã xử lý <b>{done}</b>/{total}</span>
              <span>
                <span className="badge good">{ok.length} có giá</span>{" "}
                <span className="badge neutral">{empty.length} không phù hợp</span>{" "}
                <span className="badge bad">{errors.length} lỗi</span>
              </span>
            </div>
          </div>
        )}
        {stoppedReason && <div className="notice bad" style={{ marginTop: 12 }}><IconAlert /> {stoppedReason}</div>}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="left">
            <h2 style={{ margin: 0 }}>Kết quả {ctx && <span className="muted small">· {ctx.from} ⇄ {ctx.to}</span>}</h2>
            {cheapest > 0 && <span className="badge info">Rẻ nhất: {formatMoney(cheapest, cur)}</span>}
          </div>
          <div className="right">
            <div className="seg">
              <button aria-pressed={sortBy === "price"} onClick={() => setSortBy("price")}>Theo giá</button>
              <button aria-pressed={sortBy === "date"} onClick={() => setSortBy("date")}>Theo ngày</button>
            </div>
            <button className="btn btn-sm" disabled={!ok.length} onClick={exportCsv}><IconDownload size={16} /> Xuất file CSV</button>
          </div>
        </div>

        {rows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ngày đi – Ngày về</th>
                  <th>Chiều đi</th>
                  <th>Chiều về (tham khảo)</th>
                  <th className="num">Tổng giá khứ hồi</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={key(r.pair)}>
                    <td><span className={`rank ${sortBy === "price" && i < 3 ? "top" : ""}`}>{i + 1}</span></td>
                    <td className="nowrap">
                      <div className="strong">{WEEKDAYS_SHORT[weekday(r.pair.depart)]} {fmtDate(r.pair.depart)}</div>
                      <div className="muted">→ {WEEKDAYS_SHORT[weekday(r.pair.ret)]} {fmtDate(r.pair.ret)}</div>
                      <div className="small muted">{r.pair.duration} ngày · {r.matches} lựa chọn</div>
                    </td>
                    <td><FlightCell f={r.best!} /></td>
                    <td>{r.inbound ? <FlightCell f={r.inbound} /> : <span className="muted small">{withReturn ? "Không có dữ liệu" : "Không lấy"}</span>}</td>
                    <td className="num">
                      <div className="price">{formatMoney(r.best!.price, cur)}</div>
                      {r.best!.price === cheapest && <span className="badge good">Giá tốt nhất</span>}
                    </td>
                    <td className="nowrap">
                      <a className="btn btn-sm" href={r.url} target="_blank" rel="noopener noreferrer"><IconExternal size={15} /> Mở trên Google Flights</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <IconSearch size={36} />
            <div>{running ? "Đang lấy dữ liệu… kết quả sẽ hiện dần tại đây." : "Chưa có kết quả. Thiết lập bộ lọc và bấm “Bắt đầu quét”."}</div>
          </div>
        )}

        {empty.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary className="muted small" style={{ cursor: "pointer" }}>{empty.length} cặp ngày không có chuyến phù hợp bộ lọc</summary>
            <div className="chips" style={{ marginTop: 8 }}>
              {empty.sort((a, b) => a.pair.depart.localeCompare(b.pair.depart)).map((r) => (
                <a key={key(r.pair)} className="chip" href={r.url} target="_blank" rel="noopener noreferrer">
                  {fmtDate(r.pair.depart)} → {fmtDate(r.pair.ret)}
                </a>
              ))}
            </div>
          </details>
        )}

        {errors.length > 0 && (
          <div className="errors">
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <h3><IconAlert size={16} /> {errors.length} cặp ngày bị lỗi</h3>
              <button className="btn btn-sm" disabled={running} onClick={() => retry(errors.map((e) => e.pair))}><IconRetry size={15} /> Thử lại các cặp lỗi</button>
            </div>
            <ul>
              {errors.map((r) => (
                <li key={key(r.pair)}>
                  <span><b>{fmtDate(r.pair.depart)} → {fmtDate(r.pair.ret)}</b> <span className="muted">— {r.error}</span></span>
                  <button className="btn btn-sm btn-ghost" disabled={running} onClick={() => retry([r.pair])}><IconRetry size={14} /> Thử lại</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
