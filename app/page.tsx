"use client";

import { useEffect, useState } from "react";
import FlightHunter from "@/components/FlightHunter";
import TourOptimizer from "@/components/TourOptimizer";
import VisaHelper from "@/components/VisaHelper";
import { IconChart, IconPassport, IconPlane } from "@/components/Icons";

const TABS = [
  { id: "flights", label: "Săn vé theo khoảng ngày", short: "Săn vé", icon: IconPlane },
  { id: "tour", label: "Tối ưu ngày khởi hành tour", short: "Tối ưu tour", icon: IconChart },
  { id: "visa", label: "Trợ lý hồ sơ Visa UK", short: "Visa UK", icon: IconPassport },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [tab, setTab] = useState<TabId>("flights");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "") as TabId;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const select = (id: TabId) => {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#flights" onClick={() => select("flights")}>
            <span className="brand-mark"><IconPlane size={20} /></span>
            <span>
              <div className="brand-title">Travel Ops Suite</div>
              <div className="brand-sub">Điều hành tour & vé máy bay</div>
            </span>
          </a>
          <nav className="tabs" role="tablist" aria-label="Công cụ">
            {TABS.map((t, i) => {
              const Icon = t.icon;
              return (
                <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => select(t.id)}>
                  <Icon size={16} />
                  <span className="num">0{i + 1}</span>
                  <span>{t.short}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main>
        {/* Giữ cả 3 tab trong DOM để không mất kết quả khi chuyển qua lại */}
        <div hidden={tab !== "flights"}><FlightHunter /></div>
        <div hidden={tab !== "tour"}><TourOptimizer /></div>
        <div hidden={tab !== "visa"}><VisaHelper /></div>
      </main>
      <footer className="footer">
        Dữ liệu chuyến bay lấy trực tiếp từ Google Flights tại thời điểm truy vấn – giá có thể thay đổi. Hồ sơ visa không được lưu trữ.
      </footer>
    </>
  );
}
