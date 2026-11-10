"use client";

import { useMemo, useRef, useState } from "react";
import { WEEKDAYS_VI, fmtDate, fmtDuration, type DatePair } from "@/lib/dates";
import { MAX_QUERIES, downloadCsv, formatMoney, queryPair, runPool } from "@/lib/client";
import { analyze, buildSample, planSamples, recommend, type Sample, type TimePrefs } from "@/lib/tourStats";
import { PriceHeatmap, WeekdayPriceChart } from "./PriceCharts";
import { IconAlert, IconChart, IconDownload, IconRetry, IconSparkle, IconStop, IconSwap } from "./Icons";

const CURRENCIES = ["EUR", "CZK", "VND", "USD"];
const DURATION_PRESETS = [3, 4, 5, 6, 7, 8, 10];
const k = (p: DatePair) => `${p.depart}_${p.duration}`;

export default function TourOptimizer() {
  const [from, setFrom] = useState("PRG");
  const [to, setTo] = useState("BCN");
  const [start, setStart] = useState("2027-06-01");
  const [end, setEnd] = useState("2027-08-31");
  const [durations, setDurations] = useState<number[]>([5]);
  const [currency, setCurrency] = useState("EUR");
  const [prefs, setPrefs] = useState<TimePrefs>({ nonstopOnly: true, avoidLate: true, earliest: 6, latest: 21 });
  const [concurrency, setConcurrency] = useState(4);

  const [samples, setSamples] = useState<Record<string, Sample>>({});
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [stopped, setStopped] = useState<string | null>(null);
  const [run, setRun] = useState<{ currency: string; from: string; to: string; start: string; durations: number[]; prefs: TimePrefs } | null>(null);
  const [activeDur, setActiveDur] = useState(5);
  const abortRef = useRef<AbortController | null>(null);

  const plan = useMemo(() => planSamples(start, end, durations, MAX_QUERIES), [start, end, durations]);
  const iataOk = /^[A-Za-z]{3}$/.test(from) && /^[A-Za-z]{3}$/.test(to);

  async function execute(list: DatePair[], ctx = run) {
    if (!ctx || !list.length) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setStopped(null);
    let rl = 0;
    let stop = false;
    await runPool(
      list,
      concurrency,
      (pair) =>
        queryPair(
          { from: ctx.from, to: ctx.to, depart: pair.depart, ret: pair.ret, stops: ctx.prefs.nonstopOnly ? "nonstop" : "max1", airlineCodes: [], currency: ctx.currency, withReturn: false },
          ac.signal,
        ),
      (res, pair) => {
        let s: Sample;
        if (!res.ok) {
          rl = res.code === "RATE_LIMITED" ? rl + 1 : 0;
          if (rl >= 3 && !stop) {
            stop = true;
            setStopped("Google đang tạm chặn (captcha). Đã tự dừng — đợi 5–15 phút rồi bấm “Thử lại các ngày lỗi”. Thống kê hiện tại vẫn dùng được với số mẫu đã có.");
          }
          s = { pair, wd: new Date(pair.depart + "T00:00:00Z").getUTCDay(), status: "error", error: res.message, url: res.url, hasNonstop: false, nonstopAirlines: [], convenient: false };
        } else {
          rl = 0;
          s = buildSample(pair, res.outbound, res.url, ctx.prefs);
        }
        setSamples((prev) => ({ ...prev, [k(pair)]: s }));
      },
      { signal: ac.signal, shouldStop: () => stop },
    );
    setRunning(false);
  }

  function startScan() {
    const ctx = { currency, from: from.toUpperCase(), to: to.toUpperCase(), start, durations: [...durations].sort((a, b) => a - b), prefs };
    setRun(ctx);
    setActiveDur(ctx.durations[0]);
    setSamples({});
    setTotal(plan.pairs.length);
    execute(plan.pairs, ctx);
  }

  function retryErrors() {
    const errs = Object.values(samples).filter((s) => s.status === "error").map((s) => s.pair);
    setSamples((prev) => {
      const n = { ...prev };
      errs.forEach((p) => delete n[k(p)]);
      return n;
    });
    execute(errs);
  }

  const list = Object.values(samples);
  const errors = list.filter((s) => s.status === "error");
  const cur = run?.currency ?? currency;
  const fmt = (n: number) => formatMoney(n, cur);
  const { days, overallAvg } = useMemo(() => analyze(list, activeDur), [samples, activeDur]); // eslint-disable-line react-hooks/exhaustive-deps
  const reco = useMemo(() => recommend(days, fmt), [days, cur]); // eslint-disable-line react-hooks/exhaustive-deps
  const durSamples = list.filter((s) => s.pair.duration === activeDur);
  const pricedCount = durSamples.filter((s) => s.rep).length;
  const overallMin = pricedCount ? Math.min(...durSamples.filter((s) => s.rep).map((s) => s.rep!.price)) : 0;
  const nonstopShare = durSamples.filter((s) => s.status !== "error").length
    ? durSamples.filter((s) => s.hasNonstop).length / durSamples.filter((s) => s.status !== "error").length
    : 0;

  function exportCsv() {
    const header = ["Thời lượng (ngày)", "Thứ khởi hành", "Ngày đi", "Ngày về", "Trạng thái", "Giá đại diện", "Tiền tệ", "Hãng", "Cất cánh", "Hạ cánh", "Điểm dừng", "Có bay thẳng", "Hãng bay thẳng", "Giờ thuận tiện", "Link"];
    const rows = [...list].sort((a, b) => a.pair.duration - b.pair.duration || a.pair.depart.localeCompare(b.pair.depart)).map((s) => [
      s.pair.duration, WEEKDAYS_VI[s.wd], fmtDate(s.pair.depart), fmtDate(s.pair.ret), s.status === "ok" ? "OK" : s.status === "empty" ? "Không có chuyến" : `Lỗi: ${s.error}`,
      s.rep?.price ?? "", cur, s.rep?.airlines.join(" / ") ?? "", s.rep?.depTime ?? "", s.rep?.arrTime ?? "", s.rep?.stops ?? "",
      s.hasNonstop ? "Có" : "Không", s.nonstopAirlines.join(" / "), s.rep ? (s.convenient ? "Có" : "Không") : "", s.url,
    ]);
    const summary = [[], ["TỔNG KẾT", `${activeDur} ngày`], ["Thứ", "Giá TB", "Giá thấp nhất", "Giá cao nhất", "% bay thẳng", "Độ biến động", "Điểm /10"],
      ...days.map((d) => [d.label, Math.round(d.avg), d.min, d.max, `${Math.round(d.nonstopRate * 100)}%`, `${Math.round(d.cv * 100)}%`, d.score])];
    downloadCsv(`toi-uu-tour-${run?.from}-${run?.to}.csv`, [header, ...rows, ...summary]);
  }

  const done = list.length;

  return (
    <section>
      <div className="page-head">
        <h1>Tối ưu hoá ngày khởi hành bán tour</h1>
        <p>Quét mẫu giá vé của tất cả các thứ trong tuần xuyên suốt mùa tour với cùng thời lượng, rồi phân tích thống kê để chọn ngày khởi hành cố định tốt nhất cho chương trình.</p>
      </div>

      <div className="card">
        <div className="grid grid-4">
          <div className="route span-2">
            <div className="field">
              <label htmlFor="to-from">Điểm A (đi)</label>
              <input id="to-from" className="input iata" maxLength={3} value={from} onChange={(e) => setFrom(e.target.value.replace(/[^a-z]/gi, ""))} />
            </div>
            <button className="swap" type="button" title="Đổi chiều" onClick={() => { setFrom(to); setTo(from); }}><IconSwap /></button>
            <div className="field">
              <label htmlFor="to-to">Điểm B (đến)</label>
              <input id="to-to" className="input iata" maxLength={3} value={to} onChange={(e) => setTo(e.target.value.replace(/[^a-z]/gi, ""))} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="to-start">Mùa tour – từ</label>
            <input id="to-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="to-end">Mùa tour – đến</label>
            <input id="to-end" type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>

          <div className="field span-2">
            <span className="label">Thời lượng tour (ngày)</span>
            <div className="chips">
              {DURATION_PRESETS.map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={durations.includes(d)}
                  onClick={() => setDurations((x) => (x.includes(d) ? (x.length > 1 ? x.filter((y) => y !== d) : x) : [...x, d]))}>
                  {d} ngày
                </button>
              ))}
            </div>
            <span className="hint">Chọn nhiều thời lượng sẽ chia đều ngân sách {MAX_QUERIES} truy vấn.</span>
          </div>
          <div className="field">
            <span className="label">Yêu cầu chuyến bay</span>
            <div className="seg">
              <button type="button" aria-pressed={prefs.nonstopOnly} onClick={() => setPrefs({ ...prefs, nonstopOnly: true })}>Chỉ bay thẳng</button>
              <button type="button" aria-pressed={!prefs.nonstopOnly} onClick={() => setPrefs({ ...prefs, nonstopOnly: false })}>Ưu tiên bay thẳng</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="to-cur">Tiền tệ</label>
            <select id="to-cur" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="field span-2">
            <label className="check"><input type="checkbox" checked={prefs.avoidLate} onChange={(e) => setPrefs({ ...prefs, avoidLate: e.target.checked })} /> Tránh giờ bay bất tiện (quá sớm / đêm muộn)</label>
            {prefs.avoidLate && (
              <div className="check" style={{ flexWrap: "wrap" }}>
                Giờ cất cánh chiều đi từ
                <select className="select" style={{ width: 80, padding: "6px 8px" }} value={prefs.earliest} onChange={(e) => setPrefs({ ...prefs, earliest: Number(e.target.value) })}>
                  {Array.from({ length: 13 }, (_, i) => i).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
                đến
                <select className="select" style={{ width: 80, padding: "6px 8px" }} value={prefs.latest} onChange={(e) => setPrefs({ ...prefs, latest: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => i + 12).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:59</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="actions">
          {!running ? (
            <button className="btn btn-primary" disabled={!plan.pairs.length || !iataOk} onClick={startScan}><IconChart /> Quét & phân tích</button>
          ) : (
            <button className="btn btn-danger" onClick={() => abortRef.current?.abort()}><IconStop /> Dừng</button>
          )}
          <label className="check">
            Luồng song song
            <select className="select" style={{ width: 70, padding: "6px 8px" }} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <span className="estimate">
            Sẽ quét <b>{plan.pairs.length}</b> ngày khởi hành (7 thứ × {durations.length} thời lượng)
            {plan.stride > 1 ? <> — mùa dài nên lấy mẫu <b>mỗi {plan.stride} tuần</b> (đủ {plan.full} nếu quét hết).</> : " — quét toàn bộ mùa."}
          </span>
        </div>

        {total > 0 && (
          <div className="progress-wrap" aria-live="polite">
            <div className="progress">
              <span className="ok" style={{ width: `${((done - errors.length) / total) * 100}%` }} />
              <span className="err" style={{ width: `${(errors.length / total) * 100}%` }} />
            </div>
            <div className="progress-meta">
              <span>{running && <span className="spinner" style={{ marginRight: 6, verticalAlign: -3 }} />}Đã quét <b>{done}</b>/{total} mẫu</span>
              {errors.length > 0 && (
                <button className="btn btn-sm" disabled={running} onClick={retryErrors}><IconRetry size={14} /> Thử lại các ngày lỗi ({errors.length})</button>
              )}
            </div>
          </div>
        )}
        {stopped && <div className="notice bad" style={{ marginTop: 12 }}><IconAlert /> {stopped}</div>}
      </div>

      {run && list.length > 0 && (
        <>
          {run.durations.length > 1 && (
            <div className="tabs-inline" style={{ marginTop: 16 }}>
              {run.durations.map((d) => (
                <button key={d} className="chip" aria-pressed={activeDur === d} onClick={() => setActiveDur(d)}>Tour {d} ngày</button>
              ))}
            </div>
          )}

          <div className="kpis" style={{ marginTop: run.durations.length > 1 ? 0 : 16 }}>
            <div className="kpi"><div className="k">Mẫu có giá</div><div className="v">{pricedCount}</div><div className="s">/ {durSamples.length} ngày đã quét</div></div>
            <div className="kpi"><div className="k">Giá TB toàn mùa</div><div className="v">{overallAvg ? fmt(overallAvg) : "—"}</div><div className="s">trung bình theo thứ</div></div>
            <div className="kpi"><div className="k">Giá đáy toàn mùa</div><div className="v">{overallMin ? fmt(overallMin) : "—"}</div><div className="s">khứ hồi {run.from} ⇄ {run.to}</div></div>
            <div className="kpi"><div className="k">Có bay thẳng</div><div className="v">{Math.round(nonstopShare * 100)}%</div><div className="s">số ngày khảo sát</div></div>
          </div>

          {reco.best && (
            <div className="reco-grid">
              <div className="reco good">
                <div className="eyebrow"><IconSparkle size={14} /> Khuyến nghị</div>
                <h3>Nên khởi hành vào {reco.best.label}</h3>
                <ul>{reco.bestReasons.map((r) => <li key={r}>{r}</li>)}</ul>
                {reco.runnerUp && <p className="small muted" style={{ marginBottom: 0 }}>Phương án dự phòng: <b>{reco.runnerUp.label}</b> ({reco.runnerUp.score.toFixed(1)}/10, giá TB {fmt(reco.runnerUp.avg)}).</p>}
              </div>
              {reco.worst && (
                <div className="reco bad">
                  <div className="eyebrow"><IconAlert size={14} /> Cảnh báo</div>
                  <h3>Nên tránh khởi hành vào {reco.worst.label}</h3>
                  <ul>{reco.worstReasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Bảng tổng kết 7 ngày trong tuần · tour {activeDur} ngày</h2>
              <button className="btn btn-sm" onClick={exportCsv}><IconDownload size={16} /> Xuất CSV</button>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Thứ khởi hành</th>
                    <th className="num">Giá TB</th>
                    <th className="num">Giá thấp nhất</th>
                    <th className="num">So với TB chung</th>
                    <th className="num">Độ ổn định</th>
                    <th className="num">% Bay thẳng</th>
                    <th>Hãng bay thường xuyên</th>
                    <th>Điểm /10</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.wd} className={d.wd === reco.best?.wd ? "best" : d.wd === reco.worst?.wd ? "worst" : ""}>
                      <td>
                        <div className="strong">{d.label}</div>
                        <div className="small muted">về {WEEKDAYS_VI[d.returnWd]} · {d.nPriced}/{d.samples.length} mẫu</div>
                      </td>
                      <td className="num price">{d.nPriced ? fmt(d.avg) : "—"}</td>
                      <td className="num">
                        {d.nPriced ? fmt(d.min) : "—"}
                        {d.minSample && <div className="small muted">{fmtDate(d.minSample.pair.depart)}</div>}
                      </td>
                      <td className="num">
                        {d.nPriced ? <span className={`badge ${d.diffPct <= -0.03 ? "good" : d.diffPct >= 0.03 ? "bad" : "neutral"}`}>{d.diffPct > 0 ? "+" : ""}{Math.round(d.diffPct * 100)}%</span> : "—"}
                      </td>
                      <td className="num">
                        {d.nPriced > 1 ? (
                          <span title={`Hệ số biến thiên ${Math.round(d.cv * 100)}%${d.spikes.length ? ` · ${d.spikes.length} tuần đột biến` : ""}`}>
                            <span className={`badge ${d.cv < 0.12 ? "good" : d.cv < 0.25 ? "warn" : "bad"}`}>{d.cv < 0.12 ? "Ổn định" : d.cv < 0.25 ? "Trung bình" : "Biến động"} ±{Math.round(d.cv * 100)}%</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="num">{d.nQueried ? `${Math.round(d.nonstopRate * 100)}%` : "—"}</td>
                      <td className="small">{d.topAirlines.map((a) => `${a.name} (${a.count})`).join(", ") || <span className="muted">—</span>}</td>
                      <td>
                        <span className="score">
                          <b>{d.nPriced ? d.score.toFixed(1) : "—"}</b>
                          <span className="score-bar"><span style={{ width: `${d.score * 10}%` }} /></span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Điểm = 45% mặt bằng giá + 20% độ ổn định + 25% tỉ lệ bay thẳng + 10% giờ bay thuận tiện, nhân hệ số sẵn có chuyến bay.
              Giá đại diện mỗi ngày = chuyến rẻ nhất thoả yêu cầu{run.prefs.avoidLate ? ` (ưu tiên cất cánh ${String(run.prefs.earliest).padStart(2, "0")}:00–${run.prefs.latest}:59)` : ""}; chuyến thẳng được ưu tiên nếu không đắt hơn 15%.
            </p>
          </div>

          <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 760px), 1fr))" }}>
            <div className="card" style={{ marginTop: 0 }}>
              <h2>So sánh mặt bằng giá theo thứ</h2>
              <WeekdayPriceChart days={days} fmt={fmt} bestWd={reco.best?.wd} worstWd={reco.worst?.wd} />
            </div>
            <div className="card" style={{ marginTop: 0 }}>
              <h2>Bản đồ nhiệt giá theo tuần</h2>
              <PriceHeatmap samples={durSamples} start={run.start} fmt={fmt} />
              {!pricedCount && <div className="empty">Chưa có dữ liệu giá.</div>}
            </div>
          </div>

          {pricedCount > 0 && (
            <details className="card" style={{ marginTop: 16 }}>
              <summary className="strong" style={{ cursor: "pointer" }}>Xem chi tiết {durSamples.length} mẫu đã quét</summary>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="data">
                  <thead><tr><th>Ngày đi → về</th><th>Chuyến đại diện</th><th className="num">Giá KH</th><th>Ghi chú</th></tr></thead>
                  <tbody>
                    {[...durSamples].sort((a, b) => a.pair.depart.localeCompare(b.pair.depart)).map((s) => (
                      <tr key={k(s.pair)}>
                        <td className="nowrap">{WEEKDAYS_VI[s.wd]} {fmtDate(s.pair.depart)} → {fmtDate(s.pair.ret)}</td>
                        <td>{s.rep ? <>{s.rep.airlines.join(", ")} · <span className="times">{s.rep.depTime}→{s.rep.arrTime}</span> · {fmtDuration(s.rep.durationMin)} · {s.rep.stops === 0 ? "bay thẳng" : `${s.rep.stops} dừng`}</> : <span className="muted">{s.status === "error" ? s.error : "Không có chuyến phù hợp"}</span>}</td>
                        <td className="num strong">{s.rep ? <a href={s.url} target="_blank" rel="noopener noreferrer">{fmt(s.rep.price)}</a> : "—"}</td>
                        <td className="small">{s.rep && !s.convenient && <span className="badge warn">Giờ bất tiện</span>} {s.hasNonstop && <span className="badge good">Có bay thẳng</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
