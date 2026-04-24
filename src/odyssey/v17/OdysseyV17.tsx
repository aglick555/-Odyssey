import React, { useEffect, useMemo, useRef, useState } from "react";
import CinematicFlowView from "../cinematic/CinematicFlowView";
import { odysseyDemo } from "../data/demoOdyssey";
import { FlowRenderer } from "./FlowWebGL";

// Map v17 family ids to demoOdyssey node ids where they differ.
const V17_TO_DEMO: Record<string, string> = {
  growth: "growth",
  value: "value",
  intl: "intl",
  bond: "bond",
  real: "realEstate",
};
function toDemoId(v17Id: string) { return V17_TO_DEMO[v17Id] ?? v17Id; }

type Mode = "actual" | "robust" | "delta";
type Quality = "safe" | "balanced" | "cinematic";
type Point = { x: number; y: number };
type FlowFamily = {
  id: string;
  label: string;
  value: number;
  pct: string;
  color: string;
  sourceY: number;
  allocationY: number;
  outcomeY: number;
  resultY: number;
  vintage: string;
  age: string;
  utilization: number;
  scenario: number;
};

function scenarioDeltaPct(value: number, scenario: number) {
  if (value === 0) return "0.0%";
  const d = ((scenario - value) / value) * 100;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}%`;
}

function scenarioDeltaAbs(value: number, scenario: number) {
  const d = scenario - value;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}M`;
}

type AttributionRow = { label: string; value: number; color: string };

function attributionRowsFor(tab: string): AttributionRow[] {
  if (tab === "By Activity") return [
    { label: "Rebalancing", value: 28.7, color: "#b66dff" },
    { label: "Dividends", value: 19.3, color: "#b66dff" },
    { label: "Interest", value: 15.8, color: "#b66dff" },
    { label: "Fees", value: 8.6, color: "#b66dff" },
    { label: "Other (Ops)", value: 14.7, color: "#b66dff" },
  ];
  if (tab === "By Outcome") return [
    { label: "Invested Value", value: 67.2, color: "#4de1d2" },
    { label: "Cash Returned", value: 16.5, color: "#ffb044" },
    { label: "Net Outflows", value: 3.7, color: "#ff5c66" },
  ];
  if (tab === "By Allocation") return [
    { label: "Equities (Growth+Value)", value: 45.9, color: "#5ea2ff" },
    { label: "International", value: 17.3, color: "#ffb044" },
    { label: "Fixed Income", value: 13.2, color: "#ff5c66" },
    { label: "Alternatives", value: 11.0, color: "#ad62ff" },
  ];
  // By Source (default)
  return [
    { label: "From Growth Fund A", value: 24.1, color: "#5ea2ff" },
    { label: "From Value Fund B", value: 21.8, color: "#84e27a" },
    { label: "From International C", value: 17.3, color: "#ffb044" },
    { label: "From Bond Fund D", value: 13.2, color: "#ff5c66" },
    { label: "From Real Estate E", value: 11.0, color: "#ad62ff" },
  ];
}

const WIDTH = 1600;
const HEIGHT = 680;
const CORE_Y = 310;

const anchors = {
  sourceX: 140,
  allocationX: 430,
  activityX: 760,
  outcomeX: 1070,
  resultX: 1390,
};

const families: FlowFamily[] = [
  { id: "growth", label: "Growth Fund A", value: 24.1, pct: "27.6%", color: "#5ea2ff", sourceY: 170, allocationY: 170, outcomeY: 215, resultY: 190, vintage: "2025 YTD", age: "Age 0–150d", utilization: 82, scenario: 26.5 },
  { id: "value", label: "Value Fund B", value: 21.8, pct: "24.9%", color: "#84e27a", sourceY: 245, allocationY: 260, outcomeY: 295, resultY: 285, vintage: "2024", age: "Age 151–365d", utilization: 71, scenario: 18.6 },
  { id: "intl", label: "International C", value: 17.3, pct: "19.8%", color: "#ffb044", sourceY: 325, allocationY: 350, outcomeY: 380, resultY: 390, vintage: "2023", age: "Age 1y–2y", utilization: 65, scenario: 17.3 },
  { id: "bond", label: "Bond Fund D", value: 13.2, pct: "15.1%", color: "#ff5c66", sourceY: 405, allocationY: 440, outcomeY: 455, resultY: 495, vintage: "2022", age: "Age 2y–3y", utilization: 78, scenario: 12.6 },
  { id: "real", label: "Real Estate E", value: 11.0, pct: "12.6%", color: "#ad62ff", sourceY: 485, allocationY: 530, outcomeY: 540, resultY: 600, vintage: "2021 & Prior", age: "Age 3y+", utilization: 59, scenario: 12.4 },
];

const qualitySettings: Record<Quality, { strands: number; glow: number; blur: number; dpr: number }> = {
  safe: { strands: 40, glow: 0.4, blur: 4, dpr: 1.25 },
  balanced: { strands: 120, glow: 0.5, blur: 6, dpr: 1.5 },
  cinematic: { strands: 220, glow: 0.65, blur: 10, dpr: 1.5 },
};

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function rgba(hex: string, alpha: number) {
  const c = hex.replace("#", "");
  const n = Number.parseInt(c, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * b.x + 3 * mt * t * t * c.x + t * t * t * d.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * b.y + 3 * mt * t * t * c.y + t * t * t * d.y,
  };
}
function sampleSegment(a: Point, b: Point, c: Point, d: Point, steps: number) {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i += 1) pts.push(cubic(a, b, c, d, i / steps));
  return pts;
}
function buildFamilyPath(flow: FlowFamily) {
  const p0 = { x: anchors.sourceX, y: flow.sourceY };
  const p1 = { x: anchors.allocationX, y: flow.allocationY };
  const p2 = { x: anchors.activityX - 90, y: lerp(flow.allocationY, CORE_Y, 0.62) };
  const p3 = { x: anchors.activityX + 80, y: CORE_Y + (flow.outcomeY - CORE_Y) * 0.12 };
  const p4 = { x: anchors.outcomeX, y: flow.outcomeY };
  const p5 = { x: anchors.resultX, y: flow.resultY };
  const left = sampleSegment(p0, { x: 260, y: p0.y }, { x: 330, y: p1.y }, p1, 22);
  const enter = sampleSegment(p1, { x: 540, y: p1.y }, { x: 610, y: p2.y }, p2, 18).slice(1);
  const core = sampleSegment(p2, { x: 710, y: CORE_Y }, { x: 790, y: CORE_Y }, p3, 24).slice(1);
  const exit = sampleSegment(p3, { x: 890, y: p3.y }, { x: 960, y: p4.y }, p4, 18).slice(1);
  const result = sampleSegment(p4, { x: 1190, y: p4.y }, { x: 1260, y: p5.y }, p5, 22).slice(1);
  return [...left, ...enter, ...core, ...exit, ...result];
}
function pointAt(path: Point[], t: number) {
  const idx = Math.round(clamp(t, 0, 1) * (path.length - 1));
  return path[idx];
}
function normalAt(pts: Point[], i: number) {
  const prev = pts[Math.max(0, i - 1)];
  const next = pts[Math.min(pts.length - 1, i + 1)];
  const dx = next.x - prev.x, dy = next.y - prev.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  return { x: -dy / len, y: dx / len };
}
function compressionAt(t: number) {
  const c = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 2.2);
  return 1 - c * 0.88;
}
function offsetPath(pts: Point[], amount: number, seed: number, subtle: number, phase: number) {
  // Per-strand frequency multiplier derived from seed so strands don't parallel.
  const freqA = 2 + ((seed * 13) % 3);
  const freqB = 5 + ((seed * 7) % 4);
  const freqC = 11 + ((seed * 3) % 5);
  return pts.map((p, i) => {
    const t = i / Math.max(1, pts.length - 1);
    const n = normalAt(pts, i);
    const wave =
      Math.sin(t * Math.PI * freqA + seed + phase) * 2.6 * subtle +
      Math.sin(t * Math.PI * freqB + seed * 0.7 + phase * 0.55) * 1.3 * subtle +
      Math.sin(t * Math.PI * freqC + seed * 1.3 + phase * 0.3) * 0.55 * subtle;
    const c = amount * compressionAt(t);
    return { x: p.x + n.x * (c + wave), y: p.y + n.y * (c + wave) };
  });
}
function strokePath(ctx: CanvasRenderingContext2D, pts: Point[], color: string, width: number, alpha: number, blur = 0) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = alpha;
  if (blur > 0) { ctx.shadowBlur = blur; ctx.shadowColor = color; }
  ctx.stroke();
  ctx.restore();
}
function glowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color === "white" ? `rgba(255,255,255,${alpha})` : rgba(color, alpha));
  g.addColorStop(0.45, color === "white" ? `rgba(255,255,255,${alpha * 0.25})` : rgba(color, alpha * 0.25));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Deterministic star positions — pinpoints in the black space, like the reference.
const STARS: { x: number; y: number; r: number; a: number }[] = (() => {
  let s = 1337;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const out: { x: number; y: number; r: number; a: number }[] = [];
  for (let i = 0; i < 320; i += 1) {
    out.push({ x: rand() * WIDTH, y: rand() * HEIGHT, r: 0.4 + rand() * 1.1, a: 0.18 + rand() * 0.5 });
  }
  return out;
})();

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#02070f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  glowCircle(ctx, 310, 180, 380, "#2d69ff", 0.11);
  glowCircle(ctx, 830, 320, 420, "#5fe7ff", 0.07);
  glowCircle(ctx, 1300, 220, 340, "#20d4c6", 0.10);
  glowCircle(ctx, 1050, 600, 380, "#7b3cff", 0.07);
  const v = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 140, WIDTH / 2, HEIGHT / 2, 800);
  v.addColorStop(0, "rgba(255,255,255,0.02)");
  v.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Pinpoint stars scattered across the black space.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#eaf4ff";
  for (let i = 0; i < STARS.length; i += 1) {
    const s = STARS[i];
    ctx.globalAlpha = s.a;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// 2D canvas only handles background + compression corridor now.
// Strands are drawn by the WebGL layer above.
function drawFlow(ctx: CanvasRenderingContext2D, _mode: Mode, quality: Quality, _phase: number, _highlightId: string | null) {
  const q = qualitySettings[quality];
  const cg = ctx.createLinearGradient(anchors.activityX - 150, CORE_Y, anchors.activityX + 170, CORE_Y);
  cg.addColorStop(0, "rgba(90,160,255,0.035)");
  cg.addColorStop(0.45, "rgba(150,245,255,0.10)");
  cg.addColorStop(1, "rgba(70,225,210,0.045)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.roundRect(anchors.activityX - 170, CORE_Y - 52, 355, 104, 52);
  ctx.fill();
  glowCircle(ctx, anchors.activityX, CORE_Y, 145 * q.glow, "#8ff4ff", 0.048 * q.glow);
  glowCircle(ctx, anchors.activityX - 60, CORE_Y, 90 * q.glow, "#8ff4ff", 0.012 * q.glow);
  ctx.restore();
}

function renderCanvas(canvas: HTMLCanvasElement, mode: Mode, quality: Quality, phase: number, highlightId: string | null) {
  const q = qualitySettings[quality];
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  const tW = WIDTH * dpr, tH = HEIGHT * dpr;
  if (canvas.width !== tW || canvas.height !== tH) {
    canvas.width = tW;
    canvas.height = tH;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(ctx);
  drawFlow(ctx, mode, quality, phase, highlightId);
}

// --- SVG Icons -----------------------------------------------------------

const Icon = {
  Users: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Target: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Activity: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Layers: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
  Chart: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Scale: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>,
  Gift: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>,
  Percent: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  Coins: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/></svg>,
  Ellipsis: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>,
  TrendUp: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Refresh: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  DollarSign: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  ArrowDown: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>,
  ArrowUpRight: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>,
  Calendar: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  BarChart: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  Check: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Leaf: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22s10-8 10-20c8 0 10 8 10 12-4 0-10 2-10 8"/><path d="M12 14c-3 2-6 6-6 8"/></svg>,
  Globe: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Shield: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="13 8 9 13 13 13 11 18"/></svg>,
  Building: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/></svg>,
  TrendUpBig: (c = "currentColor") => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Swap: (c = "currentColor") => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10l-4 4 4 4"/><path d="M3 14h18"/><path d="M17 20l4-4-4-4"/><path d="M21 16H3" transform="rotate(180 12 16)"/></svg>,
  Flask: (c = "currentColor") => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2v6L3 20a2 2 0 0 0 1.8 2.8h14.4A2 2 0 0 0 21 20l-6-12V2"/><line x1="7" y1="2" x2="17" y2="2"/></svg>,
  Compass: (c = "currentColor") => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>,
  AlertTriangle: (c = "currentColor") => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Crosshair: (c = "currentColor") => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>,
  FileText: (c = "currentColor") => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Download: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Link: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Help: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Settings: (c = "currentColor") => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

// --- UI Primitives -------------------------------------------------------

function Panel({ title, right, children, style }: { title: string; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "rgba(8,14,26,0.72)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 12px", ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.4, color: "#9fb2ca", textTransform: "uppercase", fontWeight: 800 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function Toggle({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2, border: "1px solid rgba(255,255,255,0.06)" }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{ padding: "3px 9px", borderRadius: 4, border: "none", background: value === o ? "rgba(94,162,255,0.18)" : "transparent", color: value === o ? "#eef6ff" : "#8da3bf", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>{o}</button>
      ))}
    </div>
  );
}

function Gauge({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min(1, value / max);
  return (
    <div style={{ position: "relative", height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, background: `linear-gradient(90deg, ${rgba(color, 0.5)}, ${color})`, boxShadow: `0 0 10px ${rgba(color, 0.5)}` }} />
    </div>
  );
}

function SmoothSpark({ points, color, width = 140, height = 28 }: { points: number[]; color: string; width?: number; height?: number }) {
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((v, i) => ({ x: (i / (points.length - 1)) * width, y: height - ((v - min) / range) * (height - 2) - 1 }));
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const p0 = coords[i - 1], p1 = coords[i];
    const c1x = p0.x + (p1.x - p0.x) / 2;
    d += ` C ${c1x} ${p0.y} ${c1x} ${p1.y} ${p1.x} ${p1.y}`;
  }
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.4"/>
          <stop offset="1" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function Donut({ segments, size = 110, inner = 70, centerLabel, centerSub }: { segments: { color: string; value: number }[]; size?: number; inner?: number; centerLabel: string; centerSub?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2, ir = inner / 2, cx = r, cy = r;
  let start = -Math.PI / 2;
  const paths = segments.map((seg) => {
    const ang = (seg.value / total) * Math.PI * 2;
    const end = start + ang;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const xi1 = cx + ir * Math.cos(end), yi1 = cy + ir * Math.sin(end);
    const xi2 = cx + ir * Math.cos(start), yi2 = cy + ir * Math.sin(start);
    const large = ang > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${ir} ${ir} 0 ${large} 0 ${xi2} ${yi2} Z`;
    start = end;
    return { d, color: seg.color };
  });
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} opacity={0.9} />)}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {centerSub && <div style={{ fontSize: 9, color: "#8ba2c0", letterSpacing: 0.6, textTransform: "uppercase" }}>{centerSub}</div>}
        <div style={{ fontSize: size > 90 ? 20 : 16, fontWeight: 900, color: "#eef6ff" }}>{centerLabel}</div>
      </div>
    </div>
  );
}

// --- Left Sidebar --------------------------------------------------------

function LeftSidebar() {
  const [cohortView, setCohortView] = useState("Vintage");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Panel title="Capital Cohorts" right={<span style={{ fontSize: 9, color: "#7890ad" }}>(by Vintage)</span>}>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 10, color: "#7890ad" }}>View as:</div>
          <Toggle options={["Vintage", "Source"]} value={cohortView} onChange={setCohortView} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {families.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <Dot color={f.color} size={9} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#eef6ff" }}>{f.vintage}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#eef6ff" }}>${f.value.toFixed(1)}M</div>
                  <div style={{ fontSize: 10, color: "#9fb2ca" }}>{f.pct}</div>
                  <div style={{ fontSize: 9, color: "#6a829f", marginLeft: "auto" }}>{f.age}</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: "#7890ad" }}>Total</span>
            <span style={{ color: "#eef6ff", fontWeight: 800 }}>$87.4M</span>
            <span style={{ color: "#7890ad" }}>100%</span>
          </div>
        </div>
      </Panel>

      <Panel title="Flow Velocity" right={<span style={{ fontSize: 9, color: "#7890ad" }}>(System)</span>}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#5fe7ff" }}>1.42x</div>
            <div style={{ fontSize: 9, color: "#7890ad" }}>vs. Baseline (1.00x)</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <SmoothSpark points={[0.95, 1.02, 1.15, 1.08, 1.18, 1.3, 1.25, 1.35, 1.42, 1.38, 1.42]} color="#5fe7ff" />
          </div>
        </div>
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6a829f" }}>
          <span>Slow</span><span>Fast</span>
        </div>
        <div style={{ marginTop: 3 }}>
          <Gauge value={71} color="#5fe7ff" />
        </div>
      </Panel>

      <Panel title="Capacity Utilization" right={<span style={{ fontSize: 9, color: "#7890ad" }}>(Avg)</span>}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#84e27a" }}>68%</div>
          <div style={{ fontSize: 10, color: "#84e27a", fontWeight: 700 }}>Healthy</div>
        </div>
        <div style={{ marginTop: 6 }}><Gauge value={68} color="#84e27a" /></div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
          {[
            { label: "High (>90%)", count: 2, color: "#ff5c66" },
            { label: "Medium (60–90%)", count: 4, color: "#ffb044" },
            { label: "Low (<60%)", count: 3, color: "#5ea2ff" },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Dot color={r.color} size={7} />
              <div style={{ color: "#9fb2ca" }}>{r.label}</div>
              <div style={{ marginLeft: "auto", color: "#eef6ff", fontWeight: 800 }}>{r.count}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Active Constraints" right={<span style={{ fontSize: 11, color: "#eef6ff", fontWeight: 900 }}>6</span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
          {[
            { label: "Capacity", n: 3 },
            { label: "Liquidity Windows", n: 2 },
            { label: "Market Impact", n: 1 },
            { label: "Operational", n: 0 },
          ].map((c) => (
            <div key={c.label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#9fb2ca" }}>{c.label}</span>
              <span style={{ color: "#eef6ff", fontWeight: 800 }}>{c.n}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// --- Right Sidebar -------------------------------------------------------

function RightSidebar() {
  const [pathView, setPathView] = useState("% of NAV");
  const paths = [
    { label: "From Growth Fund A", color: "#5ea2ff", pct: "30.2%", val: "$27.8M", delta: "+1.9M", up: true },
    { label: "From Value Fund B", color: "#84e27a", pct: "25.1%", val: "$23.1M", delta: "-0.8M", up: false },
    { label: "From Intl C", color: "#ffb044", pct: "19.3%", val: "$17.8M", delta: "+0.4M", up: true },
    { label: "From Bond Fund D", color: "#ff5c66", pct: "14.7%", val: "$13.5M", delta: "-0.6M", up: false },
    { label: "From Real Estate E", color: "#ad62ff", pct: "7.2%", val: "$6.6M", delta: "+0.4M", up: true },
    { label: "From Other", color: "#8da3bf", pct: "3.5%", val: "$3.3M", delta: "-0.2M", up: false },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Panel title="Path Contribution" right={<span style={{ fontSize: 9, color: "#7890ad" }}>(to Ending NAV)</span>}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#7890ad" }}>View:</div>
          <Toggle options={["% of NAV", "$ Impact"]} value={pathView} onChange={setPathView} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {paths.map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <Dot color={p.color} size={8} />
              <div style={{ color: "#9fb2ca", flex: 1 }}>{p.label}</div>
              <div style={{ color: p.color, fontWeight: 800 }}>{p.pct}</div>
              <div style={{ color: "#eef6ff", minWidth: 48, textAlign: "right" }}>{p.val}</div>
              <div style={{ color: p.up ? "#84e27a" : "#ff5c66", minWidth: 46, textAlign: "right", fontWeight: 700 }}>{p.up ? "▲" : "▼"} {p.delta}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: "#7890ad" }}>100%</span>
            <span style={{ color: "#eef6ff", fontWeight: 800 }}>$92.1M</span>
            <span style={{ color: "#84e27a", fontWeight: 700 }}>+1.1M</span>
          </div>
        </div>
      </Panel>

      <Panel title="Residual & Leakage">
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: "#7890ad" }}>Total Residual</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#ff8a44" }}>$1.2M</div>
          <div style={{ fontSize: 10, color: "#ff8a44" }}>(1.1%)</div>
          <div style={{ marginLeft: "auto", fontSize: 9, color: "#7890ad" }}>Scenario: $1.0M (0.9%)</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
          {[
            { label: "Fees & Friction", val: "$0.6M", pct: "(0.6%)", delta: "-0.1M", color: "#5fe7ff" },
            { label: "Rounding", val: "$0.2M", pct: "(0.2%)", delta: "0.0M", color: "#5ea2ff" },
            { label: "Timing Mismatch", val: "$0.3M", pct: "(0.3%)", delta: "-0.1M", color: "#ffb044" },
            { label: "Idle Cash", val: "$0.1M", pct: "(0.1%)", delta: "0.0M", color: "#ff5c66" },
          ].map((r) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Dot color={r.color} size={7} />
              <div style={{ color: "#9fb2ca", flex: 1 }}>{r.label}</div>
              <div style={{ color: "#eef6ff" }}>{r.val}</div>
              <div style={{ color: "#7890ad", minWidth: 42, textAlign: "right" }}>{r.pct}</div>
              <div style={{ color: "#9fb2ca", minWidth: 44, textAlign: "right" }}>{r.delta}</div>
            </div>
          ))}
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#84e27a" }}>
            <div style={{ color: "#84e27a" }}>{Icon.Check("#84e27a")}</div>
            All residuals traced
          </div>
        </div>
      </Panel>

      <Panel title="Scenario Simulator" right={<button style={{ background: "transparent", border: "none", color: "#5ea2ff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Edit</button>}>
        <div style={{ fontSize: 10, color: "#7890ad", marginBottom: 6 }}>Proposed Changes</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
          {[
            { label: "Growth Fund A", change: "+10%", impact: "$2.4M", color: "#84e27a" },
            { label: "Value Fund B", change: "-15%", impact: "$3.2M", color: "#ff5c66" },
            { label: "Real Estate E", change: "+15%", impact: "$1.4M", color: "#84e27a" },
            { label: "Fee Assumption", change: "", impact: "-10bps", color: "#5fe7ff" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ color: "#9fb2ca", flex: 1 }}>{s.label}</div>
              <div style={{ color: s.color, fontWeight: 800, minWidth: 44, textAlign: "right" }}>{s.change || "—"}</div>
              <div style={{ color: "#eef6ff", fontWeight: 800, minWidth: 54, textAlign: "right" }}>{s.impact}</div>
            </div>
          ))}
        </div>
        <button style={{ marginTop: 10, width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(94,162,255,0.4)", background: "rgba(94,162,255,0.14)", color: "#5ea2ff", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>Run Scenario</button>
        <button style={{ marginTop: 6, width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#9fb2ca", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {Icon.Swap("#9fb2ca")} Compare Scenarios (3)
        </button>
      </Panel>
    </div>
  );
}

// --- Center Flow ---------------------------------------------------------

function StageHeader({ icon, n, title, sub, color, x }: { icon: React.ReactNode; n: string; title: string; sub: string; color: string; x: number }) {
  return (
    <div style={{ position: "absolute", left: x - 80, top: 4, width: 180, display: "flex", alignItems: "flex-start", gap: 8 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${rgba(color, 0.4)}`, background: rgba(color, 0.12), display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <div style={{ fontSize: 10, color, fontWeight: 800 }}>{n}</div>
          <div style={{ fontSize: 13, color: "#eef6ff", fontWeight: 800 }}>{title}</div>
        </div>
        <div style={{ fontSize: 9, color: "#7890ad", marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

const FUND_ICON: Record<string, (c?: string) => React.ReactElement> = {
  growth: Icon.TrendUpBig,
  value: Icon.Leaf,
  intl: Icon.Globe,
  bond: Icon.Shield,
  real: Icon.Building,
};

function FundCard({ flow, x, y, active, dimmed, onHover, onSelect }: { flow: FlowFamily; x: number; y: number; active: boolean; dimmed: boolean; onHover: (id: string | null) => void; onSelect: (demoId: string) => void }) {
  const FundIcon = FUND_ICON[flow.id] ?? Icon.TrendUpBig;
  const glow = active ? 38 : 22;
  const glowAlpha = active ? 0.75 : 0.55;
  return (
    <div
      onMouseEnter={() => onHover(flow.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(toDemoId(flow.id))}
      style={{
        position: "absolute", left: x, top: y, width: 210,
        padding: "14px 16px", borderRadius: 16,
        border: `1.5px solid ${rgba(flow.color, active ? 0.95 : 0.75)}`,
        background: "linear-gradient(180deg, rgba(6,10,18,0.95), rgba(2,6,12,0.98))",
        boxShadow: `0 0 0 1px ${rgba(flow.color, 0.25)}, 0 0 ${glow}px ${rgba(flow.color, glowAlpha)}, inset 0 0 26px ${rgba(flow.color, active ? 0.18 : 0.12)}`,
        pointerEvents: "auto",
        opacity: dimmed ? 0.5 : 1,
        transition: "all 180ms ease",
        cursor: "pointer",
      }}
    >
      {/* Left-edge connection tab */}
      <div style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 10, height: 30, background: flow.color, borderRadius: 3, boxShadow: `0 0 14px ${rgba(flow.color, 0.9)}` }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: flow.color, filter: `drop-shadow(0 0 6px ${rgba(flow.color, 0.6)})` }}>
          {FundIcon(flow.color)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#eaf2ff", fontWeight: 600, letterSpacing: -0.1 }}>{flow.label}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#ffffff", letterSpacing: -1, marginTop: 1, lineHeight: 1.05, textShadow: `0 0 20px ${rgba(flow.color, 0.4)}` }}>${flow.value.toFixed(1)}M</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 600, marginTop: 6, marginLeft: 48 }}>{flow.pct}</div>
    </div>
  );
}

function ActivityRow({ icon, title, value, pct, velocity, color, onSelect, nodeId }: { icon: React.ReactNode; title: string; value: string; pct: string; velocity: string; color: string; onSelect?: (id: string) => void; nodeId?: string }) {
  return (
    <div onClick={nodeId && onSelect ? () => onSelect(nodeId) : undefined} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${rgba(color, 0.28)}`, background: "rgba(14,10,26,0.55)", cursor: nodeId && onSelect ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: rgba(color, 0.16), display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#eef6ff" }}>{title}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color: "white", marginTop: 2 }}>{value}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
        <span style={{ color, fontWeight: 800 }}>{pct}</span>
        <span style={{ color: "#7890ad" }}>Velocity: {velocity}</span>
      </div>
    </div>
  );
}

type RMarker = { x: number; y: number; family: FlowFamily; stage: string; date: string; amount: string };

function RCircle({ marker, active, onClick }: { marker: RMarker; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={`${marker.family.label} · ${marker.stage}`} style={{ position: "absolute", left: marker.x - 9, top: marker.y - 9, width: 18, height: 18, borderRadius: "50%", background: active ? "rgba(255,90,120,0.55)" : "rgba(255,90,120,0.22)", border: "1.5px solid #ff5c78", color: active ? "#fff" : "#ff5c78", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, boxShadow: active ? "0 0 16px rgba(255,90,120,0.8)" : "0 0 8px rgba(255,90,120,0.5)", cursor: "pointer", pointerEvents: "auto", padding: 0, transition: "all 120ms ease" }}>R</button>
  );
}

function CenterFlow({ onSelect }: { onSelect: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<string | null>(null);
  const [mode] = useState<Mode>("actual");
  const [quality] = useState<Quality>("balanced");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => { highlightRef.current = highlightId; }, [highlightId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const upd = () => setScale({ x: el.offsetWidth / WIDTH, y: el.offsetHeight / HEIGHT });
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const glCanvas = glCanvasRef.current;
    if (!canvas) return;

    // Precompute family paths once — they're static geometry.
    const familyPaths = families.map((f) => ({ id: f.id, color: f.color, value: f.value, points: buildFamilyPath(f) }));

    // Spin up the WebGL renderer if possible; fall back silently if not.
    let renderer: FlowRenderer | null = null;
    if (glCanvas) {
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        renderer = new FlowRenderer(glCanvas, WIDTH, HEIGHT, dpr);
      } catch (err) {
        console.warn("[v17] WebGL unavailable, 2D-only rendering:", err);
        renderer = null;
      }
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((now - start) / 1000) * 0.6;
      renderCanvas(canvas, mode, quality, phase, highlightRef.current);
      if (renderer) {
        renderer.buildGeometry(
          familyPaths,
          { strandsPerFamily: 18, bundleWidth: 48, glowWidth: 12, leadEvery: 3, sparklesPerStrand: 4 },
          phase,
        );
        renderer.render(highlightRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer?.dispose();
    };
  }, [mode, quality]);

  const cards = useMemo(() => [
    { flow: families[0], x: 315, y: 120 },
    { flow: families[1], x: 315, y: 225 },
    { flow: families[2], x: 315, y: 330 },
    { flow: families[3], x: 315, y: 435 },
    { flow: families[4], x: 315, y: 540 },
  ], []);

  const [selectedR, setSelectedR] = useState<number | null>(null);

  const rMarkers = useMemo<RMarker[]>(() => {
    const stages = [
      { t: 0.14, stage: "Source inflow", date: "Jan 12, 2025" },
      { t: 0.33, stage: "Allocation rebalance", date: "Feb 20, 2025" },
      { t: 0.68, stage: "Activity rebalance", date: "Apr 8, 2025" },
      { t: 0.88, stage: "Outcome reconciliation", date: "May 15, 2025" },
    ];
    const out: RMarker[] = [];
    families.forEach((f) => {
      const path = buildFamilyPath(f);
      stages.forEach(({ t, stage, date }) => {
        const p = pointAt(path, t);
        out.push({ x: p.x, y: p.y, family: f, stage, date, amount: `$${(f.value * (t < 0.5 ? 0.25 : t < 0.75 ? 0.15 : 0.1)).toFixed(1)}M` });
      });
    });
    return out;
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,14,0.88)" }}>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <canvas ref={glCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT, transformOrigin: "0 0", transform: `scale(${scale.x}, ${scale.y})`, pointerEvents: "none" }}>
        <StageHeader icon={Icon.Users("#84e27a")} n="1." title="Sources" sub="Where capital comes from" color="#84e27a" x={anchors.sourceX} />
        <StageHeader icon={Icon.Target("#5ea2ff")} n="2." title="Allocation" sub="Where it's invested" color="#5ea2ff" x={anchors.allocationX} />
        <StageHeader icon={Icon.Activity("#b66dff")} n="3." title="Activity" sub="How it flows over time" color="#b66dff" x={anchors.activityX} />
        <StageHeader icon={Icon.Layers("#ffb044")} n="4." title="Outcomes" sub="Where it goes" color="#ffb044" x={anchors.outcomeX} />
        <StageHeader icon={Icon.Chart("#4de1d2")} n="5." title="Results" sub="Performance impact" color="#4de1d2" x={anchors.resultX} />

        {/* Source totem */}
        <div onClick={() => onSelect("source")} style={{ position: "absolute", left: 55, top: 160, width: 175, height: 360, borderRadius: 12, border: "1px solid rgba(132,226,122,0.42)", background: "linear-gradient(180deg, rgba(36,74,42,0.46), rgba(8,20,14,0.62))", padding: 14, boxSizing: "border-box", pointerEvents: "auto", display: "flex", flexDirection: "column", boxShadow: "0 0 36px rgba(132,226,122,0.14), inset 0 0 40px rgba(132,226,122,0.08)", cursor: "pointer" }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(132,226,122,0.16)", border: "1px solid rgba(132,226,122,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#84e27a" }}>{Icon.Users("#84e27a")}</div>
          <div style={{ color: "#f4fff4", fontSize: 13, fontWeight: 800, marginTop: 10, lineHeight: 1.2 }}>Total<br/>Contributions</div>
          <div style={{ marginTop: "auto" }}>
            <div style={{ color: "white", fontSize: 28, fontWeight: 900, letterSpacing: -0.8 }}>$87.4M</div>
            <div style={{ color: "#84e27a", fontSize: 13, fontWeight: 800 }}>100%</div>
          </div>
        </div>

        {/* View toggles */}
        <div style={{ position: "absolute", left: 335, top: 108, display: "flex", gap: 10, fontSize: 10, alignItems: "center" }}>
          {[["VIEW View", true], ["Velocity", true], ["Show Events", false], ["Show Constraints", true]].map(([l, on], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 20, height: 10, background: on ? "rgba(132,226,122,0.3)" : "rgba(255,255,255,0.1)", borderRadius: 999, position: "relative" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "#84e27a" : "#7890ad", position: "absolute", top: 1, left: on ? 11 : 1, transition: "left 150ms" }} />
              </div>
              <span style={{ color: "#9fb2ca" }}>{l as string}</span>
            </div>
          ))}
        </div>

        {cards.map(({ flow, x, y }) => (
          <FundCard key={flow.id} flow={flow} x={x} y={y} active={highlightId === flow.id} dimmed={!!highlightId && highlightId !== flow.id} onHover={setHighlightId} onSelect={onSelect} />
        ))}

        {/* Window labels */}
        <div style={{ position: "absolute", left: 555, top: 106, fontSize: 10, textAlign: "center" }}>
          <div style={{ color: "#5ea2ff", fontWeight: 800 }}>Rebalancing Window</div>
          <div style={{ color: "#7890ad", fontSize: 9 }}>Feb 20 – Mar 5</div>
        </div>
        <div style={{ position: "absolute", left: 870, top: 106, fontSize: 10, textAlign: "center" }}>
          <div style={{ color: "#ffb044", fontWeight: 800 }}>Distribution Window</div>
          <div style={{ color: "#7890ad", fontSize: 9 }}>Apr 28 – May 5</div>
        </div>

        {/* ACTIVITY container (single bordered box with stacked rows) */}
        <div style={{ position: "absolute", left: 660, top: 138, width: 205, padding: "8px 9px 10px", borderRadius: 12, border: "1px solid rgba(182,109,255,0.42)", background: "rgba(20,12,36,0.56)", boxShadow: "0 0 24px rgba(182,109,255,0.12), inset 0 0 32px rgba(182,109,255,0.04)", pointerEvents: "auto" }}>
          <div style={{ fontSize: 11, color: "#b66dff", fontWeight: 900, letterSpacing: 1.2, textAlign: "center", marginBottom: 7 }}>ACTIVITY</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <ActivityRow icon={Icon.Scale("#b66dff")} title="Rebalancing" value="$28.7M" pct="32.9%" velocity="1.33x" color="#b66dff" onSelect={onSelect} nodeId="rebalancing" />
            <ActivityRow icon={Icon.Gift("#b66dff")} title="Dividends" value="$19.3M" pct="22.1%" velocity="0.85x" color="#b66dff" onSelect={onSelect} nodeId="dividends" />
            <ActivityRow icon={Icon.Percent("#b66dff")} title="Interest" value="$15.8M" pct="18.1%" velocity="1.02x" color="#b66dff" onSelect={onSelect} nodeId="interest" />
            <ActivityRow icon={Icon.Coins("#b66dff")} title="Fees" value="$8.6M" pct="9.9%" velocity="0.78x" color="#b66dff" onSelect={onSelect} nodeId="fees" />
            <ActivityRow icon={Icon.Ellipsis("#b66dff")} title="Other (Ops)" value="$14.7M" pct="16.9%" velocity="0.91x" color="#b66dff" onSelect={onSelect} nodeId="other" />
          </div>
        </div>

        {/* OUTCOMES container with donut + labels merged */}
        <div onClick={() => onSelect("invested")} style={{ position: "absolute", left: 910, top: 138, width: 175, padding: "8px 10px 10px", borderRadius: 12, border: "1px solid rgba(255,176,68,0.42)", background: "rgba(30,22,10,0.62)", boxShadow: "0 0 24px rgba(255,176,68,0.12)", textAlign: "center", pointerEvents: "auto", cursor: "pointer" }}>
          <div style={{ fontSize: 11, color: "#ffb044", fontWeight: 900, letterSpacing: 1.2, marginBottom: 6 }}>OUTCOMES</div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
            <Donut segments={[{ color: "#5ea2ff", value: 76.8 }, { color: "#ffb044", value: 18.9 }, { color: "#ff5c66", value: 4.3 }]} centerLabel="$67.2M" centerSub="Invested" size={104} inner={64} />
          </div>
          <div style={{ fontSize: 10, color: "#8ba2c0", textAlign: "left" }}>Invested Value</div>
          <div style={{ fontSize: 18, color: "white", fontWeight: 900, textAlign: "left" }}>$67.2M</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7890ad" }}>
            <span style={{ color: "#ffb044", fontWeight: 800 }}>76.8%</span>
            <span>Utilization: 88%</span>
          </div>
          <div style={{ fontSize: 9, color: "#7890ad", textAlign: "left", marginTop: 2 }}>Scenario: $69.8M (+3.9%)</div>
        </div>

        <div onClick={() => onSelect("cash")} style={{ position: "absolute", left: 910, top: 420, width: 175, padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,176,68,0.28)", background: "rgba(30,22,10,0.6)", pointerEvents: "auto", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: "rgba(255,176,68,0.18)", color: "#ffb044", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.Refresh("#ffb044")}</div>
            <div style={{ fontSize: 11, color: "#eef6ff", fontWeight: 800 }}>Cash Returned</div>
          </div>
          <div style={{ fontSize: 18, color: "white", fontWeight: 900, marginTop: 3, letterSpacing: -0.4 }}>$16.5M</div>
          <div style={{ fontSize: 10, color: "#ffb044", fontWeight: 800 }}>18.9%</div>
          <div style={{ fontSize: 9, color: "#7890ad", marginTop: 2 }}>Scenario: $18.1M (+9.7%)</div>
        </div>

        <div onClick={() => onSelect("outflows")} style={{ position: "absolute", left: 910, top: 508, width: 175, padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,90,120,0.28)", background: "rgba(30,10,14,0.6)", pointerEvents: "auto", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: "rgba(255,90,120,0.18)", color: "#ff5c66", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.ArrowDown("#ff5c66")}</div>
            <div style={{ fontSize: 11, color: "#eef6ff", fontWeight: 800 }}>Net Outflows</div>
          </div>
          <div style={{ fontSize: 18, color: "white", fontWeight: 900, marginTop: 3, letterSpacing: -0.4 }}>$3.7M</div>
          <div style={{ fontSize: 10, color: "#ff5c66", fontWeight: 800 }}>4.2%</div>
          <div style={{ fontSize: 9, color: "#7890ad", marginTop: 2 }}>Scenario: $3.1M (-16.2%)</div>
        </div>

        {/* RESULTS column (tightened spacing) */}
        <div onClick={() => onSelect("endingNav")} style={{ position: "absolute", left: 1145, top: 138, width: 200, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(77,225,210,0.42)", background: "rgba(10,28,28,0.64)", boxShadow: "0 0 24px rgba(77,225,210,0.12)", pointerEvents: "auto", cursor: "pointer" }}>
          <div style={{ fontSize: 11, color: "#4de1d2", fontWeight: 900, letterSpacing: 1.2, textAlign: "center", marginBottom: 6 }}>RESULTS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: "rgba(77,225,210,0.18)", color: "#4de1d2", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.TrendUp("#4de1d2")}</div>
            <div style={{ fontSize: 11, color: "#eef6ff", fontWeight: 800 }}>Ending NAV</div>
          </div>
          <div style={{ fontSize: 22, color: "white", fontWeight: 900, marginTop: 3, letterSpacing: -0.6 }}>$92.1M</div>
          <div style={{ fontSize: 11, color: "#84e27a", fontWeight: 800 }}>+5.4%</div>
          <div style={{ fontSize: 9, color: "#7890ad", marginTop: 2 }}>IRR: 11.6%</div>
          <div style={{ fontSize: 9, color: "#7890ad" }}>Scenario: $69.8M (+7.1%)</div>
        </div>

        <div onClick={() => onSelect("totalReturn")} style={{ position: "absolute", left: 1145, top: 300, width: 200, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(77,225,210,0.28)", background: "rgba(10,28,28,0.6)", pointerEvents: "auto", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: "rgba(77,225,210,0.18)", color: "#4de1d2", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.TrendUp("#4de1d2")}</div>
            <div style={{ fontSize: 11, color: "#eef6ff", fontWeight: 800 }}>Total Return</div>
          </div>
          <div style={{ fontSize: 22, color: "white", fontWeight: 900, marginTop: 3, letterSpacing: -0.6 }}>$9.6M</div>
          <div style={{ fontSize: 11, color: "#84e27a", fontWeight: 800 }}>11.6%</div>
          <div style={{ fontSize: 9, color: "#7890ad", marginTop: 2 }}>IRR: 11.6%</div>
          <div style={{ fontSize: 9, color: "#7890ad" }}>Scenario: $10.8M (+12.5%)</div>
        </div>

        <div onClick={() => onSelect("distributions")} style={{ position: "absolute", left: 1145, top: 430, width: 200, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(77,225,210,0.28)", background: "rgba(10,28,28,0.6)", pointerEvents: "auto", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: "rgba(77,225,210,0.18)", color: "#4de1d2", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.DollarSign("#4de1d2")}</div>
            <div style={{ fontSize: 11, color: "#eef6ff", fontWeight: 800 }}>Distributions</div>
          </div>
          <div style={{ fontSize: 22, color: "white", fontWeight: 900, marginTop: 3, letterSpacing: -0.6 }}>$12.8M</div>
          <div style={{ fontSize: 11, color: "#84e27a", fontWeight: 800 }}>14.6%</div>
          <div style={{ fontSize: 9, color: "#7890ad", marginTop: 2 }}>Yield: 4.8%</div>
          <div style={{ fontSize: 9, color: "#7890ad" }}>Scenario: $14.0M (+9.4%)</div>
        </div>

        {/* R markers — placed on actual flow paths */}
        {rMarkers.map((m, i) => <RCircle key={i} marker={m} active={selectedR === i} onClick={() => setSelectedR((s) => (s === i ? null : i))} />)}
        {selectedR !== null && (() => {
          const m = rMarkers[selectedR];
          const left = clamp(m.x - 110, 10, WIDTH - 240);
          const top = m.y + 18;
          return (
            <div style={{ position: "absolute", left, top, width: 220, padding: "8px 10px", borderRadius: 6, border: `1px solid ${rgba(m.family.color, 0.5)}`, background: "rgba(10,18,32,0.95)", boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 20px ${rgba(m.family.color, 0.15)}`, zIndex: 20, pointerEvents: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <Dot color={m.family.color} size={8} />
                <div style={{ fontSize: 11, fontWeight: 800, color: "#eef6ff", flex: 1 }}>{m.family.label}</div>
                <button onClick={() => setSelectedR(null)} style={{ background: "transparent", border: "none", color: "#7890ad", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
              </div>
              <div style={{ fontSize: 10, color: m.family.color, fontWeight: 700 }}>{m.stage}</div>
              <div style={{ fontSize: 9, color: "#7890ad", marginTop: 2 }}>{m.date} · {m.amount}</div>
            </div>
          );
        })()}

        {/* Scenario delta flags */}
        <div style={{ position: "absolute", right: 6, top: 146, fontSize: 10, color: "#84e27a", fontWeight: 800, background: "rgba(8,32,20,0.85)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(132,226,122,0.3)" }}>+1.2M</div>
        <div style={{ position: "absolute", right: 6, top: 292, fontSize: 10, color: "#ff5c66", fontWeight: 800, background: "rgba(32,8,12,0.85)", padding: "2px 5px", borderRadius: 4, border: "1px solid rgba(255,90,120,0.3)", display: "flex", alignItems: "center", gap: 4 }}>{Icon.AlertTriangle("#ff5c66")}</div>
      </div>
    </div>
  );
}

// --- Node Drawer ---------------------------------------------------------

function NodeDrawer({ nodeId, onClose, onNavigate }: { nodeId: string; onClose: () => void; onNavigate: (id: string) => void }) {
  const node = odysseyDemo.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const feeders = odysseyDemo.flows.filter((f) => f.to === nodeId);
  const downstream = odysseyDemo.flows.filter((f) => f.from === nodeId);
  const feederTotal = feeders.reduce((s, f) => s + f.value, 0);
  const downstreamTotal = downstream.reduce((s, f) => s + f.value, 0);
  const scenarioTotal = feeders.reduce((s, f) => s + (f.scenarioValue ?? f.value), 0);
  const scenarioDownstream = downstream.reduce((s, f) => s + (f.scenarioValue ?? f.value), 0);
  const labelOf = (id: string) => odysseyDemo.nodes.find((n) => n.id === id)?.label ?? id;
  const colorOf = (id: string) => odysseyDemo.nodes.find((n) => n.id === id)?.color ?? "#9fb2ca";
  const stageOf = (id: string) => odysseyDemo.nodes.find((n) => n.id === id)?.stage ?? "";
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(2,8,16,0.55)", backdropFilter: "blur(3px)", zIndex: 100 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 440, background: "#060c18", borderLeft: `2px solid ${rgba(node.color, 0.4)}`, boxShadow: "-20px 0 60px rgba(0,0,0,0.6)", zIndex: 101, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: `linear-gradient(180deg, ${rgba(node.color, 0.14)}, transparent)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Dot color={node.color} size={10} />
            <div style={{ fontSize: 10, letterSpacing: 1, color: "#7890ad", textTransform: "uppercase", fontWeight: 800, flex: 1 }}>{node.stage} · {node.id}</div>
            <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#9fb2ca", cursor: "pointer", fontSize: 14, width: 28, height: 28, borderRadius: 4 }}>×</button>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#eef6ff", marginTop: 8, letterSpacing: -0.4 }}>{node.label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: node.color, letterSpacing: -0.6 }}>${node.value.toFixed(1)}M</div>
            {node.pctLabel && <div style={{ fontSize: 13, fontWeight: 800, color: "#9fb2ca" }}>{node.pctLabel}</div>}
            {typeof node.deltaPct === "number" && (
              <div style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: node.deltaPct > 0 ? "#84e27a" : "#ff5c66" }}>
                Scenario {node.deltaPct > 0 ? "+" : ""}{node.deltaPct.toFixed(1)}%
              </div>
            )}
          </div>
          {node.meta && <div style={{ fontSize: 11, color: "#7890ad", marginTop: 4 }}>{node.meta}</div>}
        </div>

        {feeders.length > 0 && (
          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#7890ad", textTransform: "uppercase", fontWeight: 800 }}>↓ Feeder flows ({feeders.length})</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#eef6ff" }}>${feederTotal.toFixed(1)}M</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {feeders.sort((a, b) => b.value - a.value).map((f) => {
                const pct = (f.value / feederTotal) * 100;
                const scen = f.scenarioValue ?? f.value;
                const delta = scen - f.value;
                return (
                  <button key={f.id} onClick={() => onNavigate(f.from)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: `1px solid ${rgba(f.color, 0.25)}`, background: `linear-gradient(90deg, ${rgba(f.color, 0.08)}, rgba(7,15,28,0.4))`, cursor: "pointer", textAlign: "left" }}>
                    <Dot color={f.color} size={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#eef6ff" }}>{labelOf(f.from)}</div>
                      <div style={{ fontSize: 9, color: "#7890ad" }}>{stageOf(f.from)} · conf {f.confidence?.toFixed(2) ?? "—"} · vel {f.velocity?.toFixed(2) ?? "—"}x{f.residual ? " · residual" : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#eef6ff" }}>${f.value.toFixed(1)}M</div>
                      <div style={{ fontSize: 9, color: f.color, fontWeight: 700 }}>{pct.toFixed(1)}% {delta !== 0 && <span style={{ color: delta > 0 ? "#84e27a" : "#ff5c66", marginLeft: 4 }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span>}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {Math.abs(feederTotal - node.value) > 0.1 && (
              <div style={{ marginTop: 6, fontSize: 10, color: "#7890ad", fontStyle: "italic" }}>Sum differs from node value by ${(node.value - feederTotal).toFixed(1)}M (residual / reconciliation)</div>
            )}
          </div>
        )}

        {downstream.length > 0 && (
          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#7890ad", textTransform: "uppercase", fontWeight: 800 }}>↑ Downstream flows ({downstream.length})</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#eef6ff" }}>${downstreamTotal.toFixed(1)}M</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {downstream.sort((a, b) => b.value - a.value).map((f) => {
                const pct = (f.value / downstreamTotal) * 100;
                const scen = f.scenarioValue ?? f.value;
                const delta = scen - f.value;
                return (
                  <button key={f.id} onClick={() => onNavigate(f.to)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: `1px solid ${rgba(f.color, 0.25)}`, background: `linear-gradient(90deg, rgba(7,15,28,0.4), ${rgba(f.color, 0.08)})`, cursor: "pointer", textAlign: "left" }}>
                    <Dot color={f.color} size={8} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#eef6ff" }}>{labelOf(f.to)}</div>
                      <div style={{ fontSize: 9, color: "#7890ad" }}>{stageOf(f.to)} · conf {f.confidence?.toFixed(2) ?? "—"} · vel {f.velocity?.toFixed(2) ?? "—"}x{f.residual ? " · residual" : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#eef6ff" }}>${f.value.toFixed(1)}M</div>
                      <div style={{ fontSize: 9, color: f.color, fontWeight: 700 }}>{pct.toFixed(1)}% {delta !== 0 && <span style={{ color: delta > 0 ? "#84e27a" : "#ff5c66", marginLeft: 4 }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span>}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {(feeders.length > 0 || downstream.length > 0) && (
          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, letterSpacing: 1.2, color: "#7890ad", textTransform: "uppercase", fontWeight: 800, marginBottom: 8 }}>Scenario comparison</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {feeders.length > 0 && (
                <div style={{ padding: 10, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, color: "#7890ad" }}>Feeders scenario</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#eef6ff" }}>${scenarioTotal.toFixed(1)}M</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: scenarioTotal >= feederTotal ? "#84e27a" : "#ff5c66" }}>{scenarioTotal >= feederTotal ? "+" : ""}{(scenarioTotal - feederTotal).toFixed(1)}M</div>
                </div>
              )}
              {downstream.length > 0 && (
                <div style={{ padding: 10, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, color: "#7890ad" }}>Downstream scenario</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#eef6ff" }}>${scenarioDownstream.toFixed(1)}M</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: scenarioDownstream >= downstreamTotal ? "#84e27a" : "#ff5c66" }}>{scenarioDownstream >= downstreamTotal ? "+" : ""}{(scenarioDownstream - downstreamTotal).toFixed(1)}M</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 9, color: "#7890ad" }}>Click a flow above to navigate to that node. Drag-to-rearrange and annotations coming in a later workstream.</div>
        </div>
      </div>
    </>
  );
}

// --- Timeline ------------------------------------------------------------

type TimelineCategory = "events" | "constraints" | "states" | "capacity";
type TimelineEvent = {
  x: number;
  label: string;
  color: string;
  category: TimelineCategory;
  title: string;
  date: string;
  amount?: string;
  detail: string;
};

const TIMELINE_EVENTS: TimelineEvent[] = [
  { x: 40, label: "E", color: "#9fb2ca", category: "events", title: "Baseline Established", date: "Jan 1, 2025", detail: "Opening NAV captured at $87.4M" },
  { x: 220, label: "R", color: "#ff5c66", category: "constraints", title: "Rebalancing Capacity Hit", date: "Feb 20, 2025", amount: "$18.7M", detail: "Capacity constraint capped 21.4% of flow for 14 days" },
  { x: 265, label: "B", color: "#5ea2ff", category: "events", title: "Bond Allocation Trade", date: "Mar 2, 2025", amount: "$4.3M", detail: "Bond fund reweighted +7% vs baseline" },
  { x: 325, label: "D", color: "#ffb044", category: "states", title: "Distribution Paid", date: "Mar 15, 2025", amount: "$2.1M", detail: "Quarterly distribution to LPs" },
  { x: 395, label: "T", color: "#b66dff", category: "states", title: "Transfer Block Cleared", date: "Apr 5, 2025", detail: "Operational lockup released" },
  { x: 455, label: "D", color: "#ffb044", category: "states", title: "Distribution Paid", date: "Apr 15, 2025", amount: "$1.9M", detail: "Intra-quarter distribution" },
  { x: 515, label: "F", color: "#5ea2ff", category: "events", title: "Fee Accrual", date: "Apr 22, 2025", amount: "$0.6M", detail: "Management fees booked" },
  { x: 595, label: "D", color: "#ffb044", category: "states", title: "Distribution Paid", date: "May 1, 2025", amount: "$2.1M", detail: "Distribution window open" },
  { x: 670, label: "B", color: "#5ea2ff", category: "events", title: "Equity Trade", date: "May 10, 2025", amount: "$3.2M", detail: "Growth fund top-up" },
  { x: 745, label: "P", color: "#84e27a", category: "capacity", title: "Peak Utilization", date: "May 14, 2025", detail: "Capacity hit 96% for 2 days" },
  { x: 820, label: "D", color: "#ffb044", category: "states", title: "Distribution Paid", date: "May 22, 2025", amount: "$1.4M", detail: "Late-quarter distribution" },
  { x: 915, label: "C", color: "#4de1d2", category: "capacity", title: "Capacity Restored", date: "May 28, 2025", detail: "Utilization normalized to 68%" },
  { x: 995, label: "P", color: "#84e27a", category: "capacity", title: "Period Close", date: "May 31, 2025", detail: "YTD reconciliation complete" },
];

function Timeline() {
  const [filters, setFilters] = useState<Record<TimelineCategory, boolean>>({ events: true, constraints: true, states: true, capacity: true });
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const visible = TIMELINE_EVENTS.filter((e) => filters[e.category]);
  const toggle = (k: TimelineCategory) => setFilters((f) => ({ ...f, [k]: !f[k] }));
  return (
    <Panel title="Timeline" right={<span style={{ fontSize: 9, color: "#7890ad" }}>(Capital Journey)</span>} style={{ marginTop: 8 }}>
      <div style={{ position: "relative", height: 132 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 110, fontSize: 10, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ color: "#7890ad", fontWeight: 700, letterSpacing: 0.6 }}>SHOW</div>
          {([["Events", "#5ea2ff", "events"], ["Constraints", "#ff5c66", "constraints"], ["States", "#b66dff", "states"], ["Capacity", "#84e27a", "capacity"]] as const).map(([l, c, k]) => (
            <button key={l} onClick={() => toggle(k)} style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: filters[k] ? rgba(c, 0.4) : "transparent", border: `1px solid ${filters[k] ? c : "rgba(255,255,255,0.15)"}` }} />
              <div style={{ color: filters[k] ? "#eef6ff" : "#6a829f" }}>{l}</div>
            </button>
          ))}
        </div>
        <div style={{ position: "absolute", left: 120, top: 0, right: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", fontSize: 10, color: "#7890ad", marginBottom: 6 }}>
            {["Base Date\nJan 1, 2025", "Q1 2025\nJan – Mar", "Q2 2025\nApr – Jun", "Q3 2025\nJul – Sep", "Q4 2025\nOct – Dec"].map((q, i) => (
              <div key={i} style={{ borderLeft: i > 0 ? "1px dashed rgba(255,255,255,0.08)" : "none", padding: "0 6px", whiteSpace: "pre-line", color: i === 2 ? "#eef6ff" : "#7890ad", fontWeight: i === 2 ? 800 : 500 }}>{q}</div>
            ))}
          </div>
          <div style={{ position: "relative", height: 28, borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {visible.map((e, i) => (
              <button key={i} onClick={() => setSelected((s) => (s === e ? null : e))} title={`${e.title} · ${e.date}`} style={{ position: "absolute", left: e.x, top: 4, width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${e.color}`, background: selected === e ? rgba(e.color, 0.55) : rgba(e.color, 0.2), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: selected === e ? "#fff" : e.color, cursor: "pointer", padding: 0, boxShadow: selected === e ? `0 0 10px ${rgba(e.color, 0.6)}` : "none", transition: "all 120ms ease" }}>{e.label}</button>
            ))}
            {selected && (
              <div style={{ position: "absolute", left: Math.min(selected.x - 60, 700), top: 32, width: 240, padding: "8px 10px", borderRadius: 6, border: `1px solid ${rgba(selected.color, 0.5)}`, background: "rgba(10,18,32,0.95)", boxShadow: `0 4px 20px rgba(0,0,0,0.6), 0 0 20px ${rgba(selected.color, 0.15)}`, zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: rgba(selected.color, 0.3), color: selected.color, border: `1px solid ${selected.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900 }}>{selected.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#eef6ff", flex: 1 }}>{selected.title}</div>
                  <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", color: "#7890ad", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                </div>
                <div style={{ fontSize: 9, color: "#7890ad", marginBottom: 4 }}>{selected.date}{selected.amount ? ` · ${selected.amount}` : ""}</div>
                <div style={{ fontSize: 10, color: "#9fb2ca", lineHeight: 1.4 }}>{selected.detail}</div>
              </div>
            )}
          </div>
          <div style={{ position: "relative", marginTop: 12 }}>
            <div style={{ fontSize: 9, color: "#7890ad", position: "absolute", left: 0, top: -12, fontWeight: 700, letterSpacing: 0.5 }}>SYSTEM STATE</div>
            <div style={{ height: 14, borderRadius: 3, background: "linear-gradient(90deg, #84e27a 0%, #5ea2ff 20%, #ffb044 40%, #b66dff 60%, #ff5c66 80%, #84e27a 100%)", opacity: filters.states ? 0.82 : 0.2, transition: "opacity 150ms" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginTop: 4, color: "#7890ad" }}>
              <span>Normal</span><span>Rebalancing Window</span><span>High Utilization</span><span>Distribution Window</span><span>Market Volatility</span><span>Normal</span>
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", right: 0, top: 0, fontSize: 9, color: "#7890ad", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, opacity: filters.capacity ? 1 : 0.35, transition: "opacity 150ms" }}>
          <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>CAPACITY HEATMAP (Avg)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span>0%</span>
            <div style={{ height: 6, width: 160, borderRadius: 999, background: "linear-gradient(90deg, #06253a, #5fe7ff, #ffb044, #ff5c66)" }} />
            <span>100%</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// --- Summary Row ---------------------------------------------------------

function SummaryRow() {
  const items = [
    { icon: Icon.Users, label: "Total Contributions", value: "$87.4M", sub: "100%", color: "#84e27a" },
    { icon: Icon.Refresh, label: "Total Redemptions", value: "$29.3M", sub: "33.6%", color: "#ffb044" },
    { icon: Icon.ArrowUpRight, label: "Net Cash Flow", value: "$58.1M", sub: "66.4%", color: "#5ea2ff" },
    { icon: Icon.TrendUp, label: "Realized P&L", value: "$9.6M", sub: "11.6% of Invested", color: "#b66dff" },
    { icon: Icon.Calendar, label: "Time Period", value: "YTD 2025", sub: "Jan 1 – May 31, 2025", color: "#5fe7ff" },
    { icon: Icon.BarChart, label: "Net Performance", value: "+$4.7M", sub: "+5.4% (IRR)", color: "#4de1d2" },
    { icon: Icon.Check, label: "System Reconciliation", value: "Balanced", sub: "In = Out + Residual", color: "#84e27a" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      {items.map((it) => (
        <div key={it.label} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,14,26,0.72)" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: rgba(it.color, 0.14), border: `1px solid ${rgba(it.color, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center", color: it.color }}>{it.icon(it.color)}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, color: "#7890ad", letterSpacing: 0.6, textTransform: "uppercase" }}>{it.label}</div>
            <div style={{ fontSize: 16, color: it.color, fontWeight: 900, letterSpacing: -0.3 }}>{it.value}</div>
            <div style={{ fontSize: 9, color: "#9fb2ca" }}>{it.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Bottom Panels -------------------------------------------------------

function BottomPanels() {
  const [attrTab, setAttrTab] = useState("By Source");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 340px 340px 270px 240px 240px", gap: 8, marginTop: 8 }}>
      <Panel title="Quick Filters">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["All Funds", "All Strategies", "All Asset Classes"].map((f) => (
            <div key={f} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#9fb2ca", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              {f} <span style={{ color: "#7890ad" }}>▾</span>
            </div>
          ))}
          <button style={{ marginTop: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(94,162,255,0.3)", background: "rgba(94,162,255,0.12)", color: "#5ea2ff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Trace Filters</button>
        </div>
      </Panel>

      <Panel title="Top Path" right={<span style={{ fontSize: 9, color: "#7890ad" }}>(Contribution → Ending NAV)</span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
          <div style={{ color: "#84e27a", fontWeight: 800, fontSize: 10 }}>2025 YTD</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", color: "#9fb2ca", fontSize: 9 }}>
            {["Growth Fund A", "Rebalancing", "Invested Value", "Ending NAV", "Yield"].map((s, i) => (
              <div key={i} style={{ color: "#eef6ff", textAlign: "center" }}>{s}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
            {[{ p: "33.1%", v: "$8.3M" }, { p: "30.3M", v: "$7.6M" }, { p: "29.5M", v: "$7.4M" }, { p: "27.0M", v: "$7.0M" }, { p: "$6.5M", v: "$5.5M" }].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ color: "#84e27a", fontWeight: 800, fontSize: 12 }}>{s.p}</div>
                <div style={{ color: "#7890ad", fontSize: 9 }}>{s.v}</div>
              </div>
            ))}
          </div>
          <svg width="100%" height={36} viewBox="0 0 300 36" preserveAspectRatio="none">
            <defs>
              <linearGradient id="grd1" x1="0" x2="1"><stop offset="0" stopColor="#84e27a"/><stop offset="1" stopColor="#4de1d2"/></linearGradient>
            </defs>
            <path d="M 5 26 Q 60 4 120 22 T 230 14 T 295 24" stroke="url(#grd1)" strokeWidth={2.5} fill="none" />
          </svg>
          <a href="#" style={{ fontSize: 10, color: "#5ea2ff", textAlign: "center" }}>View Full Path Details</a>
        </div>
      </Panel>

      <Panel title="Attribution Breakdown" right={<span style={{ fontSize: 9, color: "#7890ad" }}>(to Ending NAV)</span>}>
        <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
          {["By Source", "By Allocation", "By Activity", "By Outcome"].map((t) => (
            <button key={t} onClick={() => setAttrTab(t)} style={{ padding: "3px 7px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: attrTab === t ? "rgba(94,162,255,0.18)" : "transparent", color: attrTab === t ? "#5ea2ff" : "#9fb2ca", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>{t}</button>
          ))}
        </div>
        {(() => {
          const rows = attributionRowsFor(attrTab);
          const total = rows.reduce((s, r) => s + r.value, 0);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Donut segments={rows.map((r) => ({ color: r.color, value: r.value }))} centerLabel={`$${total.toFixed(1)}M`} centerSub={attrTab.replace("By ", "")} size={96} inner={58} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, flex: 1 }}>
                {rows.map((r) => (
                  <div key={r.label} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <Dot color={r.color} size={6} />
                    <div style={{ color: "#9fb2ca", flex: 1, fontSize: 9 }}>{r.label}</div>
                    <div style={{ color: "#eef6ff", fontSize: 9 }}>${r.value.toFixed(1)}M</div>
                    <div style={{ color: "#7890ad", fontSize: 9 }}>{((r.value / total) * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Panel>

      <Panel title="Constraint Inspector">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div style={{ color: "#ff5c66" }}>{Icon.AlertTriangle("#ff5c66")}</div>
          <div style={{ fontSize: 11, color: "#eef6ff", fontWeight: 800 }}>Rebalancing Capacity</div>
        </div>
        <div style={{ fontSize: 10, color: "#ff5c66", fontWeight: 800, marginBottom: 6 }}>High Impact</div>
        <div style={{ fontSize: 10, color: "#9fb2ca", lineHeight: 1.55 }}>
          Type: <span style={{ color: "#eef6ff" }}>Capacity Constraint</span><br/>
          Impacted Flow: <span style={{ color: "#eef6ff" }}>$18.7M (21.4%)</span><br/>
          Occasion: <span style={{ color: "#eef6ff" }}>Feb 20 – Mar 5, 2025</span><br/>
          Duration: <span style={{ color: "#eef6ff" }}>14 days</span><br/>
          Peak Utilization: <span style={{ color: "#eef6ff" }}>96%</span><br/>
          Status: <span style={{ color: "#84e27a" }}>Resolved</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: "#7890ad", marginBottom: 2 }}>Utilization Over Time</div>
          <svg width="100%" height={44} viewBox="0 0 260 44" preserveAspectRatio="none">
            <path d="M 0 40 Q 40 38 70 30 Q 100 18 130 8 Q 160 4 190 12 Q 220 22 260 38" stroke="#ff5c66" strokeWidth={1.6} fill="rgba(255,90,120,0.12)" />
            <line x1={0} x2={260} y1={22} y2={22} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 2" />
          </svg>
        </div>
      </Panel>

      <Panel title="Recent Events" right={<a href="#" style={{ fontSize: 9, color: "#5ea2ff" }}>View All</a>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10 }}>
          {[
            { d: "May 28", l: "Distribution Paid", v: "$2.1M" },
            { d: "May 15", l: "Rebalancing Executed", v: "$4.3M" },
            { d: "Apr 30", l: "Distribution Paid", v: "$1.9M" },
            { d: "Apr 20", l: "Contribution Received", v: "$3.2M" },
            { d: "Mar 31", l: "Quarter End Reconciliation", v: "" },
          ].map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <div style={{ color: "#7890ad", minWidth: 40 }}>{e.d}</div>
              <div style={{ color: "#9fb2ca", flex: 1 }}>{e.l}</div>
              <div style={{ color: "#eef6ff", fontWeight: 700 }}>{e.v}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="How to read v17">
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "#9fb2ca" }}>
          {[
            ["Strands", "capital lots (identity)"],
            ["Thickness", "value"],
            ["Brightness", "age (new is bright)"],
            ["Speed cues", "velocity"],
            ["Triangles", "constraints"],
            ["Circles", "events"],
            ["Dashed", "scenario"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4de1d2", marginTop: 4 }} />
              <div><span style={{ color: "#eef6ff", fontWeight: 700 }}>{k}</span> = {v}</div>
            </div>
          ))}
          <div style={{ color: "#7890ad", fontSize: 9, marginTop: 4 }}>Click any element to explore</div>
        </div>
      </Panel>
    </div>
  );
}

// --- Data Model Strip ----------------------------------------------------

function DataModelStrip() {
  const entities = ["lot_id", "source_id", "allocation_id", "activity_id", "outcome_id", "result_id", "timestamp_in", "timestamp_out", "amount_in", "amount_out", "age_days", "lineage_group", "split_ratio", "flow_velocity", "capacity_utilization", "constraint_id", "residual_flag", "attribution_weight", "event_id", "meta"];
  return (
    <div style={{ marginTop: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 10 }}>
      <span style={{ color: "#7890ad", fontWeight: 700, letterSpacing: 1.2 }}>v17 DATA MODEL</span>
      <span style={{ color: "#7890ad" }}>(Core Entities)</span>
      {entities.map((e) => (
        <span key={e} style={{ padding: "3px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", color: "#9fb2ca", fontFamily: "'SF Mono', Menlo, monospace", fontSize: 10 }}>{e}</span>
      ))}
    </div>
  );
}

// --- Top Bar -------------------------------------------------------------

const TABS = [
  { n: "Flow Monitor", i: Icon.Activity },
  { n: "Scenario Studio", i: Icon.Flask },
  { n: "Path Explorer", i: Icon.Compass },
  { n: "Constraint Inspector", i: Icon.AlertTriangle },
  { n: "Attribution Engine", i: Icon.Crosshair },
  { n: "Reports", i: Icon.FileText },
] as const;

function TopBar({ tab, onTab, onCinematic }: { tab: string; onTab: (t: string) => void; onCinematic: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.8, color: "#eef6ff" }}>Capital Flow Odyssey</div>
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2, border: "1px solid rgba(255,255,255,0.06)", marginLeft: 4 }}>
          <button style={{ padding: "3px 9px", borderRadius: 4, border: "none", background: "rgba(94,162,255,0.18)", color: "#5ea2ff", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>v17</button>
          <button onClick={onCinematic} style={{ padding: "3px 9px", borderRadius: 4, border: "none", background: "transparent", color: "#8da3bf", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Cinematic</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {TABS.map((t) => {
          const active = tab === t.n;
          return (
            <button key={t.n} onClick={() => onTab(t.n)} style={{ padding: "7px 12px", display: "flex", alignItems: "center", gap: 6, borderRadius: 6, border: "none", background: active ? "rgba(94,162,255,0.14)" : "transparent", color: active ? "#5ea2ff" : "#9fb2ca", fontSize: 11, fontWeight: 700, cursor: "pointer", borderBottom: active ? "2px solid #5ea2ff" : "2px solid transparent" }}>
              {t.i(active ? "#5ea2ff" : "#9fb2ca")} {t.n}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(8,14,26,0.6)", fontSize: 11, color: "#eef6ff" }}>Jan 1 – May 31, 2025</div>
        {[Icon.Download, Icon.Link, Icon.Help, Icon.Settings].map((I, i) => (
          <button key={i} style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,14,26,0.6)", color: "#9fb2ca", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{I("#9fb2ca")}</button>
        ))}
      </div>
    </div>
  );
}

// --- Tab Views -----------------------------------------------------------

function FlowMonitorView({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "245px 1fr 290px", gap: 8 }}>
        <LeftSidebar />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <CenterFlow onSelect={onSelect} />
          <Timeline />
        </div>
        <RightSidebar />
      </div>
      <SummaryRow />
      <BottomPanels />
    </>
  );
}

function ScenarioStudioView() {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const bump = (id: string, d: number) => setOverrides((o) => ({ ...o, [id]: clamp((o[id] ?? 0) + d, -25, 25) }));
  const applied = families.map((f) => {
    const pct = overrides[f.id] ?? 0;
    const scen = f.value * (1 + pct / 100);
    return { ...f, scenario: scen, overridePct: pct };
  });
  const totalActual = families.reduce((s, f) => s + f.value, 0);
  const totalScenario = applied.reduce((s, f) => s + f.scenario, 0);
  return (
    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 360px", gap: 8 }}>
      <Panel title="Scenario Studio" right={<button onClick={() => setOverrides({})} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#9fb2ca", fontSize: 10, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}>Reset</button>}>
        <div style={{ fontSize: 11, color: "#9fb2ca", marginBottom: 10 }}>Adjust each allocation in ±25% increments. The right panel shows live impact on aggregate NAV.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {applied.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${rgba(f.color, 0.28)}`, borderRadius: 8, background: `linear-gradient(180deg, ${rgba(f.color, 0.06)}, rgba(7,15,28,0.4))` }}>
              <Dot color={f.color} size={10} />
              <div style={{ minWidth: 140 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#eef6ff" }}>{f.label}</div>
                <div style={{ fontSize: 10, color: "#7890ad" }}>Base ${f.value.toFixed(1)}M</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => bump(f.id, -5)} style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid rgba(255,90,120,0.4)", background: "rgba(255,90,120,0.08)", color: "#ff5c66", fontWeight: 900, cursor: "pointer" }}>-5%</button>
                <button onClick={() => bump(f.id, -1)} style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#9fb2ca", fontWeight: 900, cursor: "pointer" }}>-1</button>
                <div style={{ minWidth: 52, textAlign: "center", fontSize: 14, fontWeight: 900, color: f.overridePct > 0 ? "#84e27a" : f.overridePct < 0 ? "#ff5c66" : "#eef6ff" }}>{f.overridePct > 0 ? "+" : ""}{f.overridePct}%</div>
                <button onClick={() => bump(f.id, 1)} style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#9fb2ca", fontWeight: 900, cursor: "pointer" }}>+1</button>
                <button onClick={() => bump(f.id, 5)} style={{ width: 26, height: 26, borderRadius: 4, border: "1px solid rgba(132,226,122,0.4)", background: "rgba(132,226,122,0.08)", color: "#84e27a", fontWeight: 900, cursor: "pointer" }}>+5%</button>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right", minWidth: 110 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: "white" }}>${f.scenario.toFixed(1)}M</div>
                <div style={{ fontSize: 10, color: f.overridePct > 0 ? "#84e27a" : f.overridePct < 0 ? "#ff5c66" : "#7890ad", fontWeight: 800 }}>{scenarioDeltaAbs(f.value, f.scenario)} · {scenarioDeltaPct(f.value, f.scenario)}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Panel title="Scenario Impact">
          <div style={{ fontSize: 10, color: "#7890ad" }}>Base NAV</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#eef6ff" }}>${totalActual.toFixed(1)}M</div>
          <div style={{ marginTop: 10, fontSize: 10, color: "#7890ad" }}>Scenario NAV</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: totalScenario > totalActual ? "#84e27a" : totalScenario < totalActual ? "#ff5c66" : "#eef6ff" }}>${totalScenario.toFixed(1)}M</div>
          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, color: totalScenario > totalActual ? "#84e27a" : totalScenario < totalActual ? "#ff5c66" : "#7890ad" }}>
            {scenarioDeltaAbs(totalActual, totalScenario)} · {scenarioDeltaPct(totalActual, totalScenario)}
          </div>
          <button style={{ marginTop: 16, width: "100%", padding: "10px", borderRadius: 6, border: "1px solid rgba(94,162,255,0.4)", background: "rgba(94,162,255,0.14)", color: "#5ea2ff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Save Scenario</button>
        </Panel>
        <Panel title="Stored Scenarios">
          <div style={{ fontSize: 10, color: "#7890ad" }}>No saved scenarios yet. Use Save above.</div>
        </Panel>
      </div>
    </div>
  );
}

function PathExplorerView() {
  const [fromId, setFromId] = useState<string>("growth");
  const paths = [
    { from: "growth", stages: ["Growth Fund A", "Rebalancing", "Invested Value", "Ending NAV"], values: ["$24.1M", "$13.0M", "$9.8M", "$27.8M"], pct: "30.2%", color: "#5ea2ff" },
    { from: "value", stages: ["Value Fund B", "Dividends", "Cash Returned", "Distributions"], values: ["$21.8M", "$8.1M", "$5.4M", "$4.1M"], pct: "25.1%", color: "#84e27a" },
    { from: "intl", stages: ["International C", "Interest", "Invested Value", "Ending NAV"], values: ["$17.3M", "$6.1M", "$5.0M", "$17.8M"], pct: "19.3%", color: "#ffb044" },
    { from: "bond", stages: ["Bond Fund D", "Fees", "Net Outflows", "Distributions"], values: ["$13.2M", "$2.8M", "$1.2M", "$2.4M"], pct: "14.7%", color: "#ff5c66" },
    { from: "real", stages: ["Real Estate E", "Rebalancing", "Invested Value", "Ending NAV"], values: ["$11.0M", "$4.0M", "$3.1M", "$6.6M"], pct: "7.2%", color: "#ad62ff" },
  ];
  return (
    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "240px 1fr", gap: 8 }}>
      <Panel title="Source Filter">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => setFromId("")} style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${fromId === "" ? "rgba(94,162,255,0.5)" : "rgba(255,255,255,0.08)"}`, background: fromId === "" ? "rgba(94,162,255,0.14)" : "transparent", color: fromId === "" ? "#5ea2ff" : "#9fb2ca", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>All sources</button>
          {families.map((f) => (
            <button key={f.id} onClick={() => setFromId(f.id)} style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${fromId === f.id ? rgba(f.color, 0.5) : "rgba(255,255,255,0.08)"}`, background: fromId === f.id ? rgba(f.color, 0.14) : "transparent", color: fromId === f.id ? f.color : "#9fb2ca", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
              <Dot color={f.color} size={8} />{f.label}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Capital Paths" right={<span style={{ fontSize: 9, color: "#7890ad" }}>Source → Result</span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {paths.filter((p) => !fromId || p.from === fromId).map((p, i) => (
            <div key={i} style={{ padding: 12, borderRadius: 8, border: `1px solid ${rgba(p.color, 0.22)}`, background: "rgba(8,14,26,0.5)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Dot color={p.color} size={8} />
                <div style={{ fontSize: 12, fontWeight: 800, color: "#eef6ff" }}>Path {i + 1}</div>
                <div style={{ marginLeft: "auto", color: p.color, fontWeight: 800, fontSize: 13 }}>{p.pct}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${p.stages.length}, 1fr)`, gap: 6, alignItems: "center" }}>
                {p.stages.map((s, j) => (
                  <React.Fragment key={j}>
                    <div style={{ padding: "6px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ fontSize: 10, color: "#9fb2ca" }}>{s}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#eef6ff" }}>{p.values[j]}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ConstraintInspectorView() {
  const [selected, setSelected] = useState(0);
  const list = [
    { name: "Rebalancing Capacity", type: "Capacity", impact: "High", pct: "21.4%", resolved: true, color: "#ff5c66" },
    { name: "Q2 Liquidity Window", type: "Liquidity", impact: "Medium", pct: "12.8%", resolved: true, color: "#ffb044" },
    { name: "Market Impact Throttle", type: "Market", impact: "Medium", pct: "8.2%", resolved: true, color: "#ffb044" },
    { name: "Operational Lockup", type: "Operational", impact: "Low", pct: "2.1%", resolved: false, color: "#5ea2ff" },
    { name: "Fund A Concentration Cap", type: "Capacity", impact: "Medium", pct: "14.0%", resolved: true, color: "#ffb044" },
    { name: "Jurisdictional Freeze", type: "Operational", impact: "Low", pct: "1.1%", resolved: true, color: "#5ea2ff" },
  ];
  const c = list[selected];
  return (
    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "300px 1fr", gap: 8 }}>
      <Panel title="Constraints" right={<span style={{ fontSize: 10, color: "#eef6ff", fontWeight: 900 }}>{list.length}</span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((c, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${selected === i ? rgba(c.color, 0.5) : "rgba(255,255,255,0.08)"}`, background: selected === i ? rgba(c.color, 0.12) : "transparent", color: "#eef6ff", fontSize: 12, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
              <Dot color={c.color} size={8} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 9, color: "#7890ad" }}>{c.type} · {c.impact} Impact</div>
              </div>
              <div style={{ fontSize: 10, color: c.resolved ? "#84e27a" : "#ffb044", fontWeight: 800 }}>{c.resolved ? "✓" : "●"}</div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={c.name} right={<span style={{ fontSize: 10, color: c.color, fontWeight: 800 }}>{c.impact} Impact</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          <div><div style={{ fontSize: 9, color: "#7890ad" }}>TYPE</div><div style={{ fontSize: 14, fontWeight: 800, color: "#eef6ff" }}>{c.type}</div></div>
          <div><div style={{ fontSize: 9, color: "#7890ad" }}>IMPACTED FLOW</div><div style={{ fontSize: 14, fontWeight: 800, color: "#eef6ff" }}>{c.pct}</div></div>
          <div><div style={{ fontSize: 9, color: "#7890ad" }}>STATUS</div><div style={{ fontSize: 14, fontWeight: 800, color: c.resolved ? "#84e27a" : "#ffb044" }}>{c.resolved ? "Resolved" : "Active"}</div></div>
          <div><div style={{ fontSize: 9, color: "#7890ad" }}>DURATION</div><div style={{ fontSize: 14, fontWeight: 800, color: "#eef6ff" }}>14 days</div></div>
        </div>
        <div style={{ fontSize: 10, color: "#7890ad", marginBottom: 6 }}>Utilization over time</div>
        <svg width="100%" height={120} viewBox="0 0 600 120" preserveAspectRatio="none">
          <path d="M 0 110 Q 80 108 140 85 Q 200 52 260 22 Q 320 10 380 30 Q 440 60 500 95 Q 560 110 600 108" stroke={c.color} strokeWidth={2} fill={rgba(c.color, 0.12)} />
          <line x1={0} x2={600} y1={60} y2={60} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <text x={6} y={56} fill="#7890ad" fontSize={9}>Peak 96%</text>
        </svg>
        <div style={{ marginTop: 12, fontSize: 11, color: "#9fb2ca", lineHeight: 1.6 }}>
          This constraint capped <b style={{ color: "#eef6ff" }}>{c.pct}</b> of flow through the {c.type.toLowerCase()} stage between Feb 20 and Mar 5, 2025. Current status: <span style={{ color: c.resolved ? "#84e27a" : "#ffb044" }}>{c.resolved ? "Resolved" : "Active"}</span>.
        </div>
      </Panel>
    </div>
  );
}

function AttributionEngineView() {
  const [pivot, setPivot] = useState("source");
  const bySource = families.map((f) => ({ color: f.color, value: f.value, label: f.label }));
  const byActivity = [
    { label: "Rebalancing", value: 28.7, color: "#b66dff" },
    { label: "Dividends", value: 19.3, color: "#b66dff" },
    { label: "Interest", value: 15.8, color: "#b66dff" },
    { label: "Fees", value: 8.6, color: "#b66dff" },
    { label: "Other (Ops)", value: 14.7, color: "#b66dff" },
  ];
  const byOutcome = [
    { label: "Invested Value", value: 67.2, color: "#4de1d2" },
    { label: "Cash Returned", value: 16.5, color: "#ffb044" },
    { label: "Net Outflows", value: 3.7, color: "#ff5c66" },
  ];
  const pivotData = pivot === "activity" ? byActivity : pivot === "outcome" ? byOutcome : bySource;
  const total = pivotData.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 380px", gap: 8 }}>
      <Panel title="Attribution Engine" right={
        <div style={{ display: "flex", gap: 4 }}>
          {["source", "activity", "outcome"].map((p) => (
            <button key={p} onClick={() => setPivot(p)} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: pivot === p ? "rgba(94,162,255,0.18)" : "transparent", color: pivot === p ? "#5ea2ff" : "#9fb2ca", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>By {p}</button>
          ))}
        </div>
      }>
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: 20 }}>
          <Donut segments={pivotData} centerLabel={`$${total.toFixed(1)}M`} centerSub={`By ${pivot}`} size={220} inner={130} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {pivotData.map((d) => (
              <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <Dot color={d.color} size={10} />
                <div style={{ color: "#eef6ff", flex: 1 }}>{d.label}</div>
                <div style={{ color: "#eef6ff", fontWeight: 800, minWidth: 70, textAlign: "right" }}>${d.value.toFixed(1)}M</div>
                <div style={{ color: "#7890ad", minWidth: 50, textAlign: "right" }}>{((d.value / total) * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Flow Trace" right={<span style={{ fontSize: 9, color: "#7890ad" }}>Top contributors</span>}>
        <div style={{ fontSize: 11, color: "#9fb2ca", marginBottom: 10 }}>Click a segment (left) to drill into upstream contributors.</div>
        {pivotData.slice().sort((a, b) => b.value - a.value).map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 4, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: rgba(d.color, 0.22), color: d.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>{i + 1}</div>
            <div style={{ flex: 1, fontSize: 11, color: "#eef6ff" }}>{d.label}</div>
            <div style={{ color: d.color, fontSize: 11, fontWeight: 800 }}>${d.value.toFixed(1)}M</div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function ReportsView() {
  const reports = [
    { title: "Q1 2025 Capital Flow Summary", date: "Apr 01, 2025", size: "2.4 MB", type: "PDF" },
    { title: "YTD Performance Attribution", date: "May 31, 2025", size: "1.8 MB", type: "PDF" },
    { title: "Scenario Analysis — Growth +10%", date: "May 28, 2025", size: "0.9 MB", type: "XLSX" },
    { title: "Residual & Leakage Deep Dive", date: "May 15, 2025", size: "3.2 MB", type: "PDF" },
    { title: "Constraint Incident Log", date: "May 01, 2025", size: "0.6 MB", type: "CSV" },
  ];
  return (
    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 300px", gap: 8 }}>
      <Panel title="Generated Reports" right={<button style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(94,162,255,0.4)", background: "rgba(94,162,255,0.14)", color: "#5ea2ff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Generate New</button>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reports.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", cursor: "pointer" }}>
              <div style={{ width: 32, height: 32, borderRadius: 4, background: "rgba(94,162,255,0.1)", color: "#5ea2ff", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.FileText("#5ea2ff")}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#eef6ff" }}>{r.title}</div>
                <div style={{ fontSize: 10, color: "#7890ad" }}>{r.date} · {r.size}</div>
              </div>
              <div style={{ fontSize: 10, color: "#7890ad", padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)" }}>{r.type}</div>
              <div style={{ color: "#5ea2ff" }}>{Icon.Download("#5ea2ff")}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Quick Export">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Current view → PNG", "Current view → PDF", "Dataset → JSON", "Dataset → CSV", "Scenario compare → XLSX"].map((a) => (
            <button key={a} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#9fb2ca", fontSize: 11, cursor: "pointer", textAlign: "left" }}>{a}</button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function SubBar() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 6 }}>
      <div style={{ fontSize: 10, color: "#7890ad" }}>Mode:</div>
      <div style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,14,26,0.6)", fontSize: 11, color: "#eef6ff" }}>Compare (Actual vs Scenario) ▾</div>
      <button style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,14,26,0.6)", color: "#9fb2ca", fontSize: 11, cursor: "pointer" }}>Edit Layout</button>
    </div>
  );
}

// --- Root ----------------------------------------------------------------

function CinematicShell({ onV17 }: { onV17: () => void }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: 38, left: 280, zIndex: 10, display: "inline-flex", background: "rgba(10,18,32,0.78)", borderRadius: 6, padding: 2, border: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={onV17} style={{ padding: "3px 9px", borderRadius: 4, border: "none", background: "transparent", color: "#8da3bf", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>v17</button>
        <button style={{ padding: "3px 9px", borderRadius: 4, border: "none", background: "rgba(132,226,122,0.18)", color: "#84e27a", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>Cinematic</button>
      </div>
      <CinematicFlowView />
    </div>
  );
}

function readUrlState(): { view: string; tab: string } {
  if (typeof window === "undefined") return { view: "v17", tab: "Flow Monitor" };
  const p = new URLSearchParams(window.location.search);
  const tabParam = p.get("tab") || "Flow Monitor";
  const validTab = TABS.some((t) => t.n === tabParam) ? tabParam : "Flow Monitor";
  return { view: p.get("view") === "cinematic" ? "cinematic" : "v17", tab: validTab };
}

function writeUrlState(view: string, tab: string) {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  if (view === "cinematic") p.set("view", "cinematic"); else p.delete("view");
  if (tab !== "Flow Monitor") p.set("tab", tab); else p.delete("tab");
  const q = p.toString();
  window.history.replaceState(null, "", q ? `?${q}` : window.location.pathname);
}

export default function OdysseyV17() {
  const initial = readUrlState();
  const [view, setView] = useState<string>(initial.view);
  const [tab, setTab] = useState<string>(initial.tab);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => { writeUrlState(view, tab); }, [view, tab]);

  if (view === "cinematic") return <CinematicShell onV17={() => setView("v17")} />;

  return (
    <div style={{ minHeight: "100vh", background: "#020713", color: "white", fontFamily: "Inter, Arial, sans-serif", padding: 14, boxSizing: "border-box" }}>
      <div style={{ margin: "0 auto" }}>
        <TopBar tab={tab} onTab={setTab} onCinematic={() => setView("cinematic")} />
        <SubBar />
        {tab === "Flow Monitor" && <FlowMonitorView onSelect={setSelectedNode} />}
        {tab === "Scenario Studio" && <ScenarioStudioView />}
        {tab === "Path Explorer" && <PathExplorerView />}
        {tab === "Constraint Inspector" && <ConstraintInspectorView />}
        {tab === "Attribution Engine" && <AttributionEngineView />}
        {tab === "Reports" && <ReportsView />}
        <DataModelStrip />
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", color: "#6a829f", fontSize: 10, padding: "0 4px" }}>
          <span>All values in USD</span>
          <span>Percentages may not sum to 100% due to rounding</span>
        </div>
      </div>
      {selectedNode && <NodeDrawer nodeId={selectedNode} onClose={() => setSelectedNode(null)} onNavigate={setSelectedNode} />}
    </div>
  );
}
