"use client";

import { useState } from "react";
import { VISA_SECTIONS } from "@/lib/visaQuestions";
import { IconAlert, IconCheck, IconCopy, IconShield, IconSparkle } from "./Icons";

type Status = "provided" | "missing" | "check";
interface Answer { id: string; status: Status; answer: string; note: string }
interface Result { answers: Answer[]; alerts: string[]; follow_up_message: string }

const MISSING = "NOT PROVIDED — ask the client";

const SAMPLE = `Chị ơi em gửi thông tin nhé
Hộ chiếu: NGUYEN THI MAI, sinh 12/03/1988 tại Nam Định, Việt Nam. Giới tính Nữ
Số HC: C1234567, cấp 15/04/2022 tại ĐSQ VN tại Praha, hết hạn 15/04/2032
Thẻ cư trú trvalý pobyt, číslo průkazu: AB1234567, platnost do 20.05.2031
Địa chỉ: Vinohradská 123, 130 00 Praha 3, sống ở đây 6 năm, nhà thuê
email maink@example.com, sđt 777 123 456
Em đã kết hôn, chồng em là TRAN VAN HUNG sinh 1985, chồng không đi cùng
Em làm chủ tiệm nail Mai Nails s.r.o. ở Praha từ 2019, thu nhập khoảng 60 nghìn korun/tháng
Dự định bay sang London 10/07/2027 về 17/07/2027, đi du lịch, ở khách sạn Premier Inn London City
Chi phí tự trả. Năm 2023 đi Pháp, 2024 đi Ý du lịch.`;

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };
  return { copied, copy };
}

export default function VisaHelper() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const { copied, copy } = useCopy();

  async function analyzeText() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/visa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Có lỗi xảy ra.");
      setResult(data as Result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const byId = new Map(result?.answers.map((a) => [a.id, a]) ?? []);
  const missingCount = result?.answers.filter((a) => a.status === "missing").length ?? 0;
  const checkCount = result?.answers.filter((a) => a.status === "check").length ?? 0;
  const providedCount = result?.answers.filter((a) => a.status === "provided").length ?? 0;

  const allText = () =>
    VISA_SECTIONS.map((s, i) =>
      `${i + 1}. ${s.title.toUpperCase()}\n` +
      s.questions.map((q) => {
        const a = byId.get(q.id);
        return `${q.q}: ${a && a.status !== "missing" ? a.answer : MISSING}`;
      }).join("\n"),
    ).join("\n\n");

  function clearAll() {
    setText("");
    setResult(null);
    setError(null);
  }

  return (
    <section>
      <div className="page-head">
        <h1>Trợ lý bóc tách hồ sơ Visa UK</h1>
        <p>Dán toàn bộ nội dung khách gửi (Việt / Czech / Anh lẫn lộn). AI sắp xếp thành câu trả lời tiếng Anh chuẩn theo đúng thứ tự form UK Standard Visitor trên gov.uk — không bịa thông tin, mục thiếu được đánh dấu để hỏi lại khách.</p>
      </div>

      <div className="visa-layout">
        <div className="card visa-input">
          <h2>Nội dung hồ sơ khách gửi</h2>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Dán vào đây: thông tin hộ chiếu, thẻ cư trú, tin nhắn trả lời, công việc, thu nhập, ngày đi – về, lịch trình…"}
            spellCheck={false}
          />
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={loading || text.trim().length < 20} onClick={analyzeText}>
                {loading ? <><span className="spinner" /> Đang phân tích…</> : <><IconSparkle /> Phân tích hồ sơ</>}
              </button>
              <button className="btn btn-ghost" disabled={loading} onClick={clearAll}>Xoá</button>
            </div>
            <button className="btn btn-sm btn-ghost" disabled={loading} onClick={() => setText(SAMPLE)}>Dán mẫu thử</button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>{text.length.toLocaleString("vi-VN")} ký tự</div>
          <div className="notice" style={{ marginTop: 14 }}>
            <IconShield size={18} />
            <span>Không lưu trữ: nội dung chỉ được gửi tới AI để xử lý và hiển thị trên trình duyệt này, không ghi vào cơ sở dữ liệu. Câu hỏi an ninh / tiền án được bỏ qua — tư vấn viên tự xử lý trực tiếp với khách.</span>
          </div>
          {error && <div className="notice bad" style={{ marginTop: 12 }}><IconAlert size={18} /> {error}</div>}
        </div>

        <div>
          {!result && (
            <div className="card empty">
              {loading ? (
                <><span className="spinner" style={{ width: 28, height: 28 }} /><p>AI đang đọc hồ sơ và đối chiếu với form gov.uk… (thường mất 20–60 giây)</p></>
              ) : (
                <><IconSparkle size={36} /><p>Kết quả sẽ hiển thị theo 6 nhóm mục của form gov.uk, mỗi ô có nút Copy riêng.</p></>
              )}
            </div>
          )}

          {result && (
            <>
              <div className="card">
                <div className="toolbar" style={{ marginBottom: 0 }}>
                  <div className="stat-row">
                    <span className="badge good"><IconCheck size={13} /> {providedCount} đã có</span>
                    {checkCount > 0 && <span className="badge info">{checkCount} cần kiểm tra</span>}
                    <span className="badge warn"><IconAlert size={13} /> {missingCount} mục còn thiếu</span>
                  </div>
                  <div className="stat-row">
                    <label className="check small"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Chỉ hiện mục thiếu / cần kiểm tra</label>
                    <button className="btn btn-sm btn-primary" onClick={() => copy("__all", allText())}>
                      {copied === "__all" ? <><IconCheck size={15} /> Đã copy</> : <><IconCopy size={15} /> Copy tất cả</>}
                    </button>
                  </div>
                </div>
                {result.alerts.length > 0 && (
                  <div className="notice warn" style={{ marginTop: 14 }}>
                    <IconAlert size={18} />
                    <div><b>Lưu ý cho tư vấn viên</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{result.alerts.map((a) => <li key={a}>{a}</li>)}</ul></div>
                  </div>
                )}
              </div>

              <div className="card">
                {VISA_SECTIONS.map((s, i) => {
                  const qs = s.questions.filter((q) => !onlyMissing || byId.get(q.id)?.status !== "provided");
                  const miss = s.questions.filter((q) => byId.get(q.id)?.status === "missing").length;
                  if (!qs.length) return null;
                  return (
                    <div key={s.id}>
                      <div className="section-title">
                        <span className="n">{i + 1}</span>
                        <div>
                          <h3>{s.titleVi}</h3>
                          <div className="small muted">{s.title}</div>
                        </div>
                        <span className="meta">{miss > 0 ? <span className="badge warn">Thiếu {miss}</span> : <span className="badge good">Đủ</span>}</span>
                      </div>
                      <div className="qa-list">
                        {qs.map((q) => {
                          const a = byId.get(q.id);
                          const status = a?.status ?? "missing";
                          const value = status === "missing" ? MISSING : a!.answer;
                          return (
                            <div key={q.id} className={`qa ${status === "missing" ? "missing" : status === "check" ? "check" : ""}`}>
                              <div className="q">{q.q} <small>· {q.vi}</small></div>
                              <div className="side">
                                {status === "missing" ? (
                                  <span className="badge warn"><IconAlert size={12} /> Thiếu</span>
                                ) : (
                                  <button className="btn btn-sm" onClick={() => copy(q.id, a!.answer)} title="Copy câu trả lời">
                                    {copied === q.id ? <><IconCheck size={14} /> Đã copy</> : <><IconCopy size={14} /> Copy</>}
                                  </button>
                                )}
                                {status === "check" && <span className="badge info">Kiểm tra lại</span>}
                              </div>
                              <div className="a">{value}</div>
                              {a?.note && <div className="note">💬 {a.note}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {result.follow_up_message && (
                <div className="card">
                  <div className="toolbar">
                    <h2 style={{ margin: 0 }}>Tin nhắn hỏi lại khách (tiếng Việt)</h2>
                    <button className="btn btn-sm" onClick={() => copy("__msg", result.follow_up_message)}>
                      {copied === "__msg" ? <><IconCheck size={15} /> Đã copy</> : <><IconCopy size={15} /> Copy tin nhắn</>}
                    </button>
                  </div>
                  <div className="followup">{result.follow_up_message}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
