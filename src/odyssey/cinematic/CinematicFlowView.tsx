import React, { useEffect, useMemo, useRef, useState } from "react";

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
  resultLabel: string;
};

const WIDTH = 1600;
const HEIGHT = 900;
const CORE_Y = 430;

const anchors = {
  sourceX: 145,
  allocationX: 430,
  activityX: 760,
  outcomeX: 1070,
  resultX: 1390,
};

const families: FlowFamily[] = [
  { id: "growth", label: "Growth Fund A", value: 24.1, pct: "27.6%", color: "#5ea2ff", sourceY: 285, allocationY: 245, outcomeY: 330, resultY: 265, resultLabel: "Ending NAV" },
  { id: "value", label: "Value Fund B", value: 21.8, pct: "24.9%", color: "#84e27a", sourceY: 355, allocationY: 355, outcomeY: 370, resultY: 345, resultLabel: "Ending NAV" },
  { id: "intl", label: "International C", value: 17.3, pct: "19.8%", color: "#ffb044", sourceY: 430, allocationY: 460, outcomeY: 480, resultY: 470, resultLabel: "Cash Returned" },
  { id: "bond", label: "Bond Fund D", value: 13.2, pct: "15.1%", color: "#ff5c66", sourceY: 505, allocationY: 565, outcomeY: 545, resultY: 590, resultLabel: "Distributions" },
  { id: "real", label: "Real Estate E", value: 11.0, pct: "12.6%", color: "#ad62ff", sourceY: 580, allocationY: 675, outcomeY: 625, resultY: 690, resultLabel: "Total Return" },
];

const qualitySettings: Record<Quality, { strands: number; glow: number; blur: number; dpr: number; cards: boolean }> = {
  safe: { strands: 5, glow: 0.7, blur: 8, dpr: 1, cards: true },
  balanced: { strands: 10, glow: 1, blur: 12, dpr: 1, cards: true },
  cinematic: { strands: 18, glow: 1.25, blur: 16, dpr: 1.15, cards: true },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function rgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const int = Number.parseInt(clean, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * b.x + 3 * mt * t * t * c.x + t * t * t * d.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * b.y + 3 * mt * t * t * c.y + t * t * t * d.y,
  };
}

function sampleSegment(a: Point, b: Point, c: Point, d: Point, steps: number) {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) points.push(cubic(a, b, c, d, i / steps));
  return points;
}

function buildFamilyPath(flow: FlowFamily) {
  const p0 = { x: anchors.sourceX, y: flow.sourceY };
  const p1 = { x: anchors.allocationX, y: flow.allocationY };
  const p2 = { x: anchors.activityX - 90, y: lerp(flow.allocationY, CORE_Y, 0.62) };
  const p3 = { x: anchors.activityX + 80, y: CORE_Y + (flow.outcomeY - CORE_Y) * 0.12 };
  const p4 = { x: anchors.outcomeX, y: flow.outcomeY };
  const p5 = { x: anchors.resultX, y: flow.resultY };

  const left = sampleSegment(p0, { x: 260, y: p0.y }, { x: 330, y: p1.y }, p1, 22);
  const enterCore = sampleSegment(p1, { x: 540, y: p1.y }, { x: 610, y: p2.y }, p2, 18).slice(1);
  const core = sampleSegment(p2, { x: 710, y: CORE_Y }, { x: 790, y: CORE_Y }, p3, 24).slice(1);
  const exit = sampleSegment(p3, { x: 890, y: p3.y }, { x: 960, y: p4.y }, p4, 18).slice(1);
  const result = sampleSegment(p4, { x: 1190, y: p4.y }, { x: 1260, y: p5.y }, p5, 22).slice(1);
  return [...left, ...enterCore, ...core, ...exit, ...result];
}

function normalAt(points: Point[], index: number) {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  return { x: -dy / len, y: dx / len };
}

function compressionAt(t: number) {
  const center = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 2.2);
  return 1 - center * 0.88;
}

function offsetPath(points: Point[], amount: number, seed: number, subtle = 1) {
  return points.map((p, i) => {
    const t = i / Math.max(1, points.length - 1);
    const n = normalAt(points, i);
    const wave = Math.sin(t * Math.PI * 2 + seed) * 2.2 * subtle + Math.sin(t * Math.PI * 5 + seed * 0.7) * 1.1 * subtle;
    const compressed = amount * compressionAt(t);
    return { x: p.x + n.x * (compressed + wave), y: p.y + n.y * (compressed + wave) };
  });
}

function strokePath(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number, alpha: number, blur = 0) {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = alpha;
  if (blur > 0) {
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
  }
  ctx.stroke();
  ctx.restore();
}

function glowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color === "white" ? `rgba(255,255,255,${alpha})` : rgba(color, alpha));
  gradient.addColorStop(0.45, color === "white" ? `rgba(255,255,255,${alpha * 0.25})` : rgba(color, alpha * 0.25));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#020713";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  glowCircle(ctx, 310, 230, 420, "#2d69ff", 0.13);
  glowCircle(ctx, 830, 410, 460, "#5fe7ff", 0.08);
  glowCircle(ctx, 1300, 300, 380, "#20d4c6", 0.11);
  glowCircle(ctx, 1050, 790, 420, "#7b3cff", 0.08);
  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 160, WIDTH / 2, HEIGHT / 2, 950);
  vignette.addColorStop(0, "rgba(255,255,255,0.02)");
  vignette.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawStageLabels(ctx: CanvasRenderingContext2D) {
  const stages = [
    ["1. Sources", "Capital enters", anchors.sourceX],
    ["2. Allocation", "Funds form", anchors.allocationX],
    ["3. Activity", "River compresses", anchors.activityX],
    ["4. Outcomes", "Capital exits", anchors.outcomeX],
    ["5. Results", "Performance lands", anchors.resultX],
  ] as const;
  ctx.save();
  ctx.font = "700 15px Inter, Arial";
  stages.forEach(([title, subtitle, x], i) => {
    const color = ["#8BEA80", "#5EA2FF", "#B66DFF", "#FFB044", "#4DE1D2"][i];
    ctx.fillStyle = color;
    ctx.fillText(title, x - 54, 110);
    ctx.font = "500 11px Inter, Arial";
    ctx.fillStyle = "rgba(176,190,214,0.72)";
    ctx.fillText(subtitle, x - 54, 128);
    ctx.font = "700 15px Inter, Arial";
  });
  ctx.restore();
}

function drawFlow(ctx: CanvasRenderingContext2D, mode: Mode, quality: Quality) {
  const q = qualitySettings[quality];
  const paths = families.map((family) => ({ family, points: buildFamilyPath(family) }));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Shared atmospheric body behind all families.
  paths.forEach(({ family, points }) => {
    const thickness = 18 + family.value * 1.25;
    strokePath(ctx, points, rgba(family.color, mode === "delta" ? 0.035 : 0.052), thickness * 2.2, 1, q.blur);
    strokePath(ctx, points, rgba(family.color, mode === "delta" ? 0.05 : 0.085), thickness * 1.15, 1, Math.max(4, q.blur * 0.55));
  });

  // Horizontal compression corridor, deliberately open and continuous.
  const coreGradient = ctx.createLinearGradient(anchors.activityX - 150, CORE_Y, anchors.activityX + 170, CORE_Y);
  coreGradient.addColorStop(0, "rgba(90,160,255,0.04)");
  coreGradient.addColorStop(0.45, "rgba(150,245,255,0.18)");
  coreGradient.addColorStop(1, "rgba(70,225,210,0.05)");
  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.roundRect(anchors.activityX - 170, CORE_Y - 58, 355, 116, 58);
  ctx.fill();
  glowCircle(ctx, anchors.activityX, CORE_Y, 170 * q.glow, "#8ff4ff", 0.07 * q.glow);
  glowCircle(ctx, anchors.activityX - 60, CORE_Y, 110 * q.glow, "white", 0.025 * q.glow);

  // Colored core and controlled micro-strands.
  paths.forEach(({ family, points }) => {
    const thickness = 11 + family.value * 0.62;
    strokePath(ctx, points, rgba(family.color, mode === "delta" ? 0.18 : 0.24), thickness * 0.55, 1, Math.max(2, q.blur * 0.35));
    strokePath(ctx, points, rgba("#ffffff", mode === "delta" ? 0.025 : 0.038), Math.max(2, thickness * 0.12), 1, 1);

    const strands = q.strands;
    for (let i = 0; i < strands; i += 1) {
      const ratio = strands <= 1 ? 0 : i / (strands - 1);
      const offset = (ratio - 0.5) * thickness * 1.3;
      const strand = offsetPath(points, offset, i * 1.73 + family.value, quality === "cinematic" ? 1 : 0.72);
      strokePath(ctx, strand, rgba(family.color, 0.17), 1.1, 1, i % 3 === 0 ? 1.5 : 0);
    }
  });

  ctx.restore();
}

function renderCanvas(canvas: HTMLCanvasElement, mode: Mode, quality: Quality) {
  const q = qualitySettings[quality];
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(ctx);
  drawStageLabels(ctx);
  drawFlow(ctx, mode, quality);
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: "12px 16px", borderRadius: 18, border: `1px solid ${rgba(color, 0.24)}`, background: "rgba(7,15,28,0.58)", boxShadow: `inset 0 0 30px ${rgba(color, 0.06)}`, minWidth: 132 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "#8ba2c0" }}>{label}</div>
      <div style={{ marginTop: 5, color, fontSize: 24, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function FlowCard({ flow, x, y }: { flow: FlowFamily; x: number; y: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 188, padding: "13px 15px", borderRadius: 18, border: `1px solid ${rgba(flow.color, 0.46)}`, background: "linear-gradient(180deg, rgba(7,15,28,0.78), rgba(4,10,18,0.62))", boxShadow: `0 0 32px ${rgba(flow.color, 0.12)}, inset 0 0 30px ${rgba(flow.color, 0.07)}`, backdropFilter: "blur(14px)", pointerEvents: "auto" }}>
      <div style={{ color: "#eef6ff", fontSize: 14, fontWeight: 750 }}>{flow.label}</div>
      <div style={{ color: "#9fb2ca", fontSize: 11, marginTop: 5 }}>Utilization {flow.id === "growth" ? "82" : flow.id === "value" ? "71" : flow.id === "intl" ? "65" : flow.id === "bond" ? "79" : "59"}%</div>
      <div style={{ color: "white", fontSize: 25, fontWeight: 850, marginTop: 2 }}>${flow.value.toFixed(1)}M</div>
      <div style={{ color: flow.color, fontSize: 12, fontWeight: 800 }}>{flow.pct}</div>
    </div>
  );
}

function ResultCard({ title, value, color, x, y }: { title: string; value: string; color: string; x: number; y: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 180, padding: "14px 16px", borderRadius: 18, border: `1px solid ${rgba(color, 0.42)}`, background: "rgba(7,15,28,0.65)", boxShadow: `0 0 34px ${rgba(color, 0.12)}, inset 0 0 30px ${rgba(color, 0.07)}`, backdropFilter: "blur(14px)" }}>
      <div style={{ color: "#dce9f8", fontSize: 13, fontWeight: 750 }}>{title}</div>
      <div style={{ color: "white", fontSize: 26, fontWeight: 850, marginTop: 6 }}>{value}</div>
      <div style={{ color, fontSize: 12, fontWeight: 800, marginTop: 2 }}>+5.4%</div>
    </div>
  );
}

export default function CinematicFlowView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode>("actual");
  const [quality, setQuality] = useState<Quality>("balanced");

  const allocationCards = useMemo(
    () => [
      { flow: families[0], x: 385, y: 232 },
      { flow: families[1], x: 385, y: 352 },
      { flow: families[2], x: 385, y: 472 },
      { flow: families[3], x: 385, y: 592 },
      { flow: families[4], x: 385, y: 708 },
    ],
    [],
  );

  useEffect(() => {
    if (canvasRef.current) renderCanvas(canvasRef.current, mode, quality);
  }, [mode, quality]);

  return (
    <div style={{ minHeight: "100vh", background: "#020713", color: "white", fontFamily: "Inter, Arial, sans-serif", padding: 28, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1660, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 42, lineHeight: 1, fontWeight: 900, letterSpacing: -1.4 }}>Capital Flow Odyssey</div>
              <div style={{ border: "1px solid rgba(126,224,129,0.28)", color: "#9cf6a4", background: "rgba(30,70,42,0.38)", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 850, letterSpacing: 0.8 }}>CINEMATIC</div>
            </div>
            <div style={{ marginTop: 9, color: "#9fb2ca", fontSize: 17 }}>A flow-first capital journey. Dashboard chrome removed so the river remains the product.</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {(["safe", "balanced", "cinematic"] as Quality[]).map((q) => (
              <button key={q} onClick={() => setQuality(q)} style={{ padding: "10px 14px", borderRadius: 999, border: `1px solid ${quality === q ? "rgba(220,245,255,0.42)" : "rgba(255,255,255,0.1)"}`, background: quality === q ? "rgba(22,42,60,0.88)" : "rgba(7,15,28,0.54)", color: quality === q ? "#eef6ff" : "#8da3bf", cursor: "pointer", textTransform: "capitalize", fontWeight: 800 }}>{q}</button>
            ))}
            {(["actual", "robust", "delta"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: "10px 14px", borderRadius: 999, border: `1px solid ${mode === m ? "rgba(126,224,129,0.38)" : "rgba(255,255,255,0.1)"}`, background: mode === m ? "rgba(30,70,42,0.48)" : "rgba(7,15,28,0.54)", color: mode === m ? "#eef6ff" : "#8da3bf", cursor: "pointer", textTransform: "capitalize", fontWeight: 800 }}>{m}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {families.map((family) => <Chip key={family.id} label={family.label} value={`$${family.value.toFixed(1)}M`} color={family.color} />)}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Chip label="Total Inflow" value="$87.4M" color="#84e27a" />
            <Chip label="Net Performance" value="+$4.7M" color="#4de1d2" />
            <Chip label="Confidence" value="73%" color="#5ea2ff" />
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 24, height: "calc(100vh - 210px)", minHeight: 720, maxHeight: 900, borderRadius: 32, overflow: "hidden", border: "1px solid rgba(255,255,255,0.11)", background: "rgba(2,8,20,0.86)", boxShadow: "0 34px 100px rgba(0,0,0,0.5)" }}>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

          <div style={{ position: "absolute", left: 76, top: 314, width: 192, height: 240, borderRadius: 26, border: `1px solid ${rgba("#84e27a", 0.48)}`, background: "linear-gradient(180deg, rgba(48,92,48,0.48), rgba(8,22,18,0.7))", boxShadow: `0 0 42px ${rgba("#84e27a", 0.16)}, inset 0 0 54px ${rgba("#84e27a", 0.12)}`, padding: 24, boxSizing: "border-box", backdropFilter: "blur(14px)" }}>
            <div style={{ color: "#f4fff4", fontSize: 16, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.4 }}>Total Contributions</div>
            <div style={{ color: "#9fb2ca", fontSize: 13, marginTop: 34 }}>5 capital lots</div>
            <div style={{ position: "absolute", left: 24, bottom: 34, color: "white", fontSize: 36, fontWeight: 900 }}>$87.4M</div>
            <div style={{ position: "absolute", left: 24, bottom: 16, color: "#84e27a", fontSize: 14, fontWeight: 850 }}>100%</div>
          </div>

          {allocationCards.map(({ flow, x, y }) => <FlowCard key={flow.id} flow={flow} x={x} y={y} />)}

          <div style={{ position: "absolute", left: 735, top: 372, transform: "translate(-50%, -50%)", padding: "8px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(7,15,28,0.64)", color: "#b9c9dc", fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>Activity Compression</div>
          <div style={{ position: "absolute", left: 965, top: 326, width: 170, padding: "15px 16px", borderRadius: 20, border: `1px solid ${rgba("#4de1d2", 0.44)}`, background: "rgba(7,28,30,0.62)", boxShadow: `0 0 42px ${rgba("#4de1d2", 0.14)}, inset 0 0 30px ${rgba("#4de1d2", 0.08)}`, backdropFilter: "blur(14px)" }}>
            <div style={{ color: "#dce9f8", fontWeight: 850 }}>Invested Value</div>
            <div style={{ color: "white", fontSize: 27, fontWeight: 900, marginTop: 8 }}>$67.2M</div>
            <div style={{ color: "#4de1d2", fontSize: 12, fontWeight: 850 }}>76.8%</div>
          </div>
          <div style={{ position: "absolute", left: 965, top: 558, width: 170, padding: "15px 16px", borderRadius: 20, border: `1px solid ${rgba("#ffb044", 0.44)}`, background: "rgba(32,22,7,0.62)", boxShadow: `0 0 42px ${rgba("#ffb044", 0.14)}, inset 0 0 30px ${rgba("#ffb044", 0.08)}`, backdropFilter: "blur(14px)" }}>
            <div style={{ color: "#dce9f8", fontWeight: 850 }}>Cash Returned</div>
            <div style={{ color: "white", fontSize: 27, fontWeight: 900, marginTop: 8 }}>$16.5M</div>
            <div style={{ color: "#ffb044", fontSize: 12, fontWeight: 850 }}>18.9%</div>
          </div>

          <ResultCard title="Ending NAV" value="$92.1M" color="#4de1d2" x={1305} y={248} />
          <ResultCard title="Distributions" value="$12.8M" color="#4de1d2" x={1305} y={520} />
          <ResultCard title="Total Return" value="$9.6M" color="#4de1d2" x={1305} y={648} />

          <div style={{ position: "absolute", left: 26, right: 26, bottom: 18, height: 42, borderRadius: 999, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(7,15,28,0.5)", color: "#9fb2ca", display: "flex", alignItems: "center", padding: "0 18px", fontSize: 13 }}>Hover cards or switch quality modes to inspect the luminous capital journey. The river remains continuous; details stay secondary.</div>
        </div>
      </div>
    </div>
  );
}
