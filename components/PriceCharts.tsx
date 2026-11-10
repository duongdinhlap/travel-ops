"use client";

import { useState } from "react";
import type { DayStats, Sample } from "@/lib/tourStats";
import { WEEKDAYS_SHORT, WEEK_ORDER, addDays, fmtDate, parseISO } from "@/lib/dates";

/** Biểu đồ cột: giá TB theo thứ, kèm vạch min–max và chấm giá đáy. Một chuỗi dữ liệu → một màu. */
export function WeekdayPriceChart({ days, fmt, bestWd, worstWd }: { days: DayStats[]; fmt: (n: number) => string; bestWd?: number; worstWd?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 300, padL = 64, padR = 16, padT = 28, padB = 44;
  const priced = days.filter((d) => d.nPriced);
  const yMax = Math.max(1, ...priced.map((d) => d.max)) * 1.08;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const slot = innerW / days.length;
  const bw = Math.min(46, slot * 0.5);
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;
  const ticks = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);
  const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
  const h = hover !== null ? days[hover] : null;

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ giá vé trung bình theo thứ khởi hành">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{compact(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const has = d.nPriced > 0;
          const top = has ? y(d.avg) : y(0);
          const r = 4;
          const hgt = Math.max(0, y(0) - top);
          return (
            <g key={d.wd} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <rect x={cx - slot / 2} y={padT} width={slot} height={innerH} fill="transparent" />
              {has && (
                <>
                  {/* cột với góc bo 4px ở đầu dữ liệu, gắn đáy */}
                  <path
                    d={`M${cx - bw / 2},${y(0)} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${y(0)} Z`}
                    fill="var(--chart-1)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                  <line x1={cx} x2={cx} y1={y(d.max)} y2={y(d.min)} stroke="var(--ink-2)" strokeWidth={1.5} />
                  <line x1={cx - 7} x2={cx + 7} y1={y(d.max)} y2={y(d.max)} stroke="var(--ink-2)" strokeWidth={1.5} />
                  <circle cx={cx} cy={y(d.min)} r={4.5} fill="var(--chart-surface)" stroke="var(--ink)" strokeWidth={2} />
                  <text x={cx} y={y(d.max) - 8} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--ink)">{compact(d.avg)}</text>
                </>
              )}
              {!has && <text x={cx} y={y(0) - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">n/a</text>}
              <text x={cx} y={H - padB + 18} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={d.wd === 0 || d.wd === 6 ? "var(--accent)" : "var(--ink-2)"}>{WEEKDAYS_SHORT[d.wd]}</text>
              {d.wd === bestWd && <text x={cx} y={H - padB + 34} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--good)">★ Nên chọn</text>}
              {d.wd === worstWd && <text x={cx} y={H - padB + 34} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--bad)">✕ Nên tránh</text>}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />
      </svg>
      {h && h.nPriced > 0 && hover !== null && (
        <div className="chart-tooltip" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(h.max) / H) * 100}%` }}>
          <b>{h.label}</b> · {h.nPriced} mẫu<br />
          Giá TB: <b>{fmt(h.avg)}</b><br />
          Thấp nhất: {fmt(h.min)} · Cao nhất: {fmt(h.max)}<br />
          Bay thẳng: {Math.round(h.nonstopRate * 100)}% · Điểm: {h.score.toFixed(1)}/10
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: "var(--chart-1)" }} />Giá trung bình</span>
        <span><i style={{ background: "transparent", border: "2px solid var(--ink)", borderRadius: 999 }} />Giá thấp nhất</span>
        <span><i style={{ background: "transparent", borderTop: "2px solid var(--ink-2)", borderRadius: 0, height: 0, width: 14 }} />Khoảng thấp – cao nhất</span>
      </div>
    </div>
  );
}

// Thang màu tuần tự một sắc (xanh), nhạt = rẻ, đậm = đắt
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

/** Bản đồ nhiệt: hàng = tuần, cột = thứ khởi hành. Giúp nhìn ra tuần cao điểm. */
export function PriceHeatmap({ samples, start, fmt }: { samples: Sample[]; start: string; fmt: (n: number) => string }) {
  const priced = samples.filter((s) => s.rep);
  if (!priced.length) return null;
  const min = Math.min(...priced.map((s) => s.rep!.price));
  const max = Math.max(...priced.map((s) => s.rep!.price));
  const t0 = parseISO(start).getTime();
  const weekOf = (iso: string) => Math.floor((parseISO(iso).getTime() - t0) / (7 * 86400000));
  const weeks = [...new Set(samples.map((s) => weekOf(s.pair.depart)))].sort((a, b) => a - b);
  const map = new Map(samples.map((s) => [`${weekOf(s.pair.depart)}_${s.wd}`, s]));
  const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);

  return (
    <div>
      <div className="heat" style={{ gridTemplateColumns: `72px repeat(7, minmax(0, 1fr))` }}>
        <div />
        {WEEK_ORDER.map((wd) => <div key={wd} className="hdr">{WEEKDAYS_SHORT[wd]}</div>)}
        {weeks.map((w) => (
          <Row key={w} label={`Tuần ${fmtDate(addDays(start, w * 7)).slice(0, 5)}`}>
            {WEEK_ORDER.map((wd) => {
              const s = map.get(`${w}_${wd}`);
              if (!s) return <div key={wd} className="cell" style={{ background: "var(--surface-2)" }} />;
              if (!s.rep)
                return (
                  <div key={wd} className="cell muted" style={{ background: "var(--surface-2)" }} title={`${fmtDate(s.pair.depart)}: ${s.status === "error" ? "lỗi" : "không có chuyến"}`}>
                    {s.status === "error" ? "!" : "–"}
                  </div>
                );
              const t = max === min ? 0.5 : (s.rep.price - min) / (max - min);
              const idx = Math.round(t * (RAMP.length - 1));
              return (
                <a
                  key={wd}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cell"
                  style={{ background: RAMP[idx], color: idx > 6 ? "#fff" : "#1b2233", textDecoration: "none" }}
                  title={`${fmtDate(s.pair.depart)} → ${fmtDate(s.pair.ret)}: ${fmt(s.rep.price)} · ${s.rep.airlines.join(", ")} ${s.rep.depTime}${s.hasNonstop ? " · có bay thẳng" : ""}`}
                >
                  {compact(s.rep.price)}
                </a>
              );
            })}
          </Row>
        ))}
      </div>
      <div className="legend" style={{ alignItems: "center" }}>
        <span>Rẻ {fmt(min)}</span>
        <span style={{ display: "inline-flex", height: 10, width: 160, borderRadius: 4, overflow: "hidden" }}>
          {RAMP.map((c) => <span key={c} style={{ flex: 1, background: c }} />)}
        </span>
        <span>Đắt {fmt(max)}</span>
        <span className="muted">· Bấm ô để mở Google Flights</span>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="rowlbl">{label}</div>
      {children}
    </>
  );
}
