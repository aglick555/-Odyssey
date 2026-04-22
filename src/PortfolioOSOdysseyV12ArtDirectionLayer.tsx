import React, { useMemo, useState } from "react";

const COLORS = {
  source: "#7EE081",
  growth: "#4A90FF",
  value: "#21C58E",
  intl: "#F5A623",
  bond: "#F04A4A",
  realEstate: "#8B5CF6",
  activity: "#7388A6",
  invested: "#18D8D2",
  cash: "#D8A532",
  outflow: "#9D5CFF",
  result: "#35D2D2",
};

type NodeType = "source" | "allocation" | "activity" | "outcome" | "result";

type NodeModel = {
  id: string;
  type: NodeType;
  label: string;
  value: string;
  pct: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dark?: boolean;
};

const nodes: NodeModel[] = [
  { id: "source", type: "source", label: "Total Contributions", value: "$87.4M", pct: "100%", color: COLORS.source, x: 20, y: 70, w: 150, h: 460 },
  { id: "growth", type: "allocation", label: "Growth Fund A", value: "$24.1M", pct: "27.6%", color: COLORS.growth, x: 390, y: 70, w: 190, h: 92 },
  { id: "value", type: "allocation", label: "Value Fund B", value: "$21.8M", pct: "24.9%", color: COLORS.value, x: 390, y: 185, w: 190, h: 92 },
  { id: "intl", type: "allocation", label: "International C", value: "$17.3M", pct: "19.8%", color: COLORS.intl, x: 390, y: 300, w: 190, h: 92 },
  { id: "bond", type: "allocation", label: "Bond Fund D", value: "$13.2M", pct: "15.1%", color: COLORS.bond, x: 390, y: 415, w: 190, h: 92 },
  { id: "re", type: "allocation", label: "Real Estate E", value: "$11.0M", pct: "12.6%", color: COLORS.realEstate, x: 390, y: 530, w: 190, h: 92 },
  { id: "rebal", type: "activity", label: "Rebalancing", value: "$28.7M", pct: "32.9%", color: COLORS.activity, x: 700, y: 70, w: 170, h: 92, dark: true },
  { id: "div", type: "activity", label: "Dividends", value: "$19.3M", pct: "22.1%", color: COLORS.activity, x: 700, y: 185, w: 170, h: 92, dark: true },
  { id: "interest", type: "activity", label: "Interest", value: "$15.8M", pct: "18.1%", color: COLORS.activity, x: 700, y: 300, w: 170, h: 92, dark: true },
  { id: "fees", type: "activity", label: "Fees", value: "$8.6M", pct: "9.9%", color: COLORS.activity, x: 700, y: 415, w: 170, h: 92, dark: true },
  { id: "other", type: "activity", label: "Other", value: "$14.7M", pct: "16.9%", color: COLORS.activity, x: 700, y: 530, w: 170, h: 92, dark: true },
  { id: "invested", type: "outcome", label: "Invested Value", value: "$67.2M", pct: "76.8%", color: COLORS.invested, x: 1040, y: 90, w: 170, h: 250 },
  { id: "cash", type: "outcome", label: "Cash Returned", value: "$16.5M", pct: "18.9%", color: COLORS.cash, x: 1040, y: 420, w: 170, h: 100 },
  { id: "outflow", type: "outcome", label: "Net Outflows", value: "$3.7M", pct: "4.2%", color: COLORS.outflow, x: 1040, y: 555, w: 170, h: 82 },
  { id: "nav", type: "result", label: "Ending NAV", value: "$92.1M", pct: "+5.4%", color: COLORS.result, x: 1340, y: 80, w: 150, h: 260 },
  { id: "ret", type: "result", label: "Total Return", value: "$9.6M", pct: "11.6%", color: COLORS.result, x: 1340, y: 425, w: 150, h: 92, dark: true },
  { id: "dist", type: "result", label: "Distributions", value: "$12.8M", pct: "14.6%", color: COLORS.result, x: 1340, y: 545, w: 150, h: 92, dark: true },
];

function River({ d, color, opacity = 0.35 }: { d: string; color: string; opacity?: number }) {
  return (
    <>
      <path d={d} fill={color} opacity={opacity * 0.35} filter="url(#blurBig)" />
      <path d={d} fill={color} opacity={opacity * 0.7} filter="url(#blurMid)" />
      <path d={d} fill={color} opacity={opacity} />
    </>
  );
}

function NodeCard({ n }: { n: NodeModel }) {
  return (
    <div
      style={{
        position: "absolute",
        left: n.x,
        top: n.y,
        width: n.w,
        height: n.h,
        borderRadius: 18,
        border: `1px solid ${n.dark ? "rgba(255,255,255,0.16)" : n.color}`,
        background: n.dark ? "rgba(17,24,39,0.78)" : "rgba(2,8,16,0.55)",
        boxShadow: `0 0 24px ${n.color}33, inset 0 0 40px ${n.color}18`,
        color: "white",
        padding: 18,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 18% 12%, ${n.color}66, transparent 42%)`,
          opacity: 0.45,
        }}
      />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{n.label}</div>
        <div>
          <div style={{ fontSize: n.h > 180 ? 24 : 18, fontWeight: 700 }}>{n.value}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#c4d0e0" }}>{n.pct}</div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioOSOdysseyV12ArtDirectionLayer() {
  const rivers = useMemo(
    () => [
      { color: COLORS.growth, d: "M 170 145 C 270 120, 320 120, 390 120 L 390 180 C 320 185, 270 185, 170 172 Z" },
      { color: COLORS.value, d: "M 170 245 C 270 228, 320 228, 390 232 L 390 290 C 320 294, 270 292, 170 272 Z" },
      { color: COLORS.intl, d: "M 170 345 C 270 345, 320 348, 390 350 L 390 402 C 320 402, 270 394, 170 380 Z" },
      { color: COLORS.bond, d: "M 170 445 C 270 460, 320 470, 390 468 L 390 516 C 320 514, 270 498, 170 480 Z" },
      { color: COLORS.realEstate, d: "M 170 540 C 270 564, 320 578, 390 580 L 390 620 C 320 616, 270 600, 170 575 Z" },
      { color: COLORS.invested, d: "M 870 145 C 940 145, 980 170, 1040 175 L 1040 315 C 980 310, 940 272, 870 248 Z" },
      { color: COLORS.cash, d: "M 870 340 C 940 360, 980 410, 1040 450 L 1040 500 C 980 470, 940 420, 870 382 Z" },
      { color: COLORS.result, d: "M 1210 190 C 1270 190, 1300 190, 1340 190 L 1340 315 C 1300 310, 1270 308, 1210 300 Z" },
    ],
    []
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "white",
        background:
          "radial-gradient(circle at 20% 10%, rgba(74,144,255,0.14), transparent 25%), radial-gradient(circle at 72% 66%, rgba(157,92,255,0.14), transparent 25%), radial-gradient(circle at 58% 36%, rgba(24,216,210,0.12), transparent 30%), linear-gradient(180deg, rgba(3,12,24,0.95), rgba(2,8,16,0.998))",
        padding: 24,
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div style={{ position: "relative", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 26, padding: 24, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>Capital Flow Odyssey ✨</div>
            <div style={{ marginTop: 6, fontSize: 18, color: "#b4c2d7" }}>From Contributions to Redemptions</div>
          </div>
          <div style={{ color: "#9cb0cb", fontSize: 14 }}>Hover any node or flow to explore details</div>
        </div>

        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 18 }}>
          {[
            ["1. Sources", "Where capital comes from", COLORS.source],
            ["2. Allocation", "Where it's invested", COLORS.growth],
            ["3. Activity", "How it flows", "#D05CFF"],
            ["4. Outcomes", "Where it goes", "#FFAA24"],
            ["5. Results", "Performance impact", COLORS.result],
          ].map(([a, b, c]) => (
            <div key={a as string}>
              <div style={{ color: c as string, fontSize: 16, fontWeight: 700 }}>{a as string}</div>
              <div style={{ marginTop: 4, color: "#96a7c2", fontSize: 13 }}>{b as string}</div>
            </div>
          ))}
        </div>

        <div style={{ position: "relative", marginTop: 24, height: 650 }}>
          <svg viewBox="0 0 1520 650" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              <filter id="blurBig" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28" /></filter>
              <filter id="blurMid" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="15" /></filter>
            </defs>
            {rivers.map((r, i) => <River key={i} d={r.d} color={r.color} />)}
          </svg>

          {nodes.map((n) => <NodeCard key={n.id} n={n} />)}
        </div>

        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(5,1fr)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 22, overflow: "hidden", background: "linear-gradient(180deg, rgba(5,16,28,0.92), rgba(3,11,20,0.98))" }}>
          {[
            ["Total Contributions", "$87.4M", COLORS.source],
            ["Total Redemptions", "$29.3M", COLORS.cash],
            ["Net Cash Flow", "$58.1M", COLORS.growth],
            ["Time Period", "YTD 2024", "#C75CFF"],
            ["Net Performance", "+$4.7M  +5.4%", COLORS.result],
          ].map(([l, v, c], i) => (
            <div key={l as string} style={{ padding: "18px 16px", borderLeft: i ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
              <div style={{ fontSize: 13, color: "#b4c2d7" }}>{l as string}</div>
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, color: c as string }}>{v as string}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
