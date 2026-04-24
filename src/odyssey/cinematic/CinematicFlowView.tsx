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
const HEIGHT = 780;
const CORE_Y = 310;

const anchors = {
  sourceX: 145,
  allocationX: 430,
  activityX: 760,
  outcomeX: 1070,
  resultX: 1390,
};

const families: FlowFamily[] = [
  { id: "growth", label: "Growth Fund A", value: 24.1, pct: "27.6%", color: "#5ea2ff", sourceY: 170, allocationY: 165, outcomeY: 215, resultY: 190, resultLabel: "Ending NAV" },
  { id: "value", label: "Value Fund B", value: 21.8, pct: "24.9%", color: "#84e27a", sourceY: 245, allocationY: 255, outcomeY: 295, resultY: 285, resultLabel: "Ending NAV" },
  { id: "intl", label: "International C", value: 17.3, pct: "19.8%", color: "#ffb044", sourceY: 325, allocationY: 345, outcomeY: 380, resultY: 390, resultLabel: "Cash Returned" },
  { id: "bond", label: "Bond Fund D", value: 13.2, pct: "15.1%", color: "#ff5c66", sourceY: 405, allocationY: 455, outcomeY: 455, resultY: 495, resultLabel: "Distributions" },
  { id: "real", label: "Real Estate E", value: 11.0, pct: "12.6%", color: "#ad62ff", sourceY: 485, allocationY: 560, outcomeY: 540, resultY: 600, resultLabel: "Total Return" },
];

const qualitySettings: Record<Quality, { strands: number; glow: number; blur: number; dpr: number; cards: boolean }> = {
  safe: { strands: 4, glow: 0.65, blur: 6, dpr: 1, cards: true },
  balanced: { strands: 8, glow: 0.9, blur: 10, dpr: 1, cards: true },
  cinematic: { strands: 14, glow: 1.08, blur: 13, dpr: 1.1, cards: true },
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

function offsetPath(points: Point[], amount: number, seed: number, subtle: number, phase: number) {
  return points.map((p, i) => {
    const t = i / Math.max(1, points.length - 1);
    const n = normalAt(points, i);
    const wave =
      Math.sin(t * Math.PI * 2 + seed + phase) * 2.2 * subtle +
      Math.sin(t * Math.PI * 5 + seed * 0.7 + phase * 0.55) * 1.1 * subtle;
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
  glowCircle(ctx, 310, 210, 400, "#2d69ff", 0.13);
  glowCircle(ctx, 830, 360, 440, "#5fe7ff", 0.08);
  glowCircle(ctx, 1300, 260, 360, "#20d4c6", 0.11);
  glowCircle(ctx, 1050, 680, 400, "#7b3cff", 0.08);
  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 150, WIDTH / 2, HEIGHT / 2, 880);
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
  ctx.font = "700 14px Inter, Arial";
  stages.forEach(([title, subtitle, x], i) => {
    const color = ["#8BEA80", "#5EA2FF", "#B66DFF", "#FFB044", "#4DE1D2"][i];
    ctx.fillStyle = color;
    ctx.fillText(title, x - 54, 96);
    ctx.font = "500 10px Inter, Arial";
    ctx.fillStyle = "rgba(176,190,214,0.72)";
    ctx.fillText(subtitle, x - 54, 112);
    ctx.font = "700 14px Inter, Arial";
  });
  ctx.restore();
}

function drawFlow(ctx: CanvasRenderingContext2D, mode: Mode, quality: Quality, phase: number, highlightId: string | null) {
  const q = qualitySettings[quality];
  const paths = families.map((family) => ({ family, points: buildFamilyPath(family) }));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  paths.forEach(({ family, points }) => {
    const dim = highlightId && highlightId !== family.id ? 0.25 : 1;
    const thickness = 18 + family.value * 1.25;
    strokePath(ctx, points, rgba(family.color, (mode === "delta" ? 0.026 : 0.038) * dim), thickness * 1.72, 1, q.blur);
    strokePath(ctx, points, rgba(family.color, (mode === "delta" ? 0.04 : 0.07) * dim), thickness * 0.9, 1, Math.max(3, q.blur * 0.42));
  });

  const coreGradient = ctx.createLinearGradient(anchors.activityX - 150, CORE_Y, anchors.activityX + 170, CORE_Y);
  coreGradient.addColorStop(0, "rgba(90,160,255,0.035)");
  coreGradient.addColorStop(0.45, "rgba(150,245,255,0.10)");
  coreGradient.addColorStop(1, "rgba(70,225,210,0.045)");
  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.roundRect(anchors.activityX - 170, CORE_Y - 52, 355, 104, 52);
  ctx.fill();
  glowCircle(ctx, anchors.activityX, CORE_Y, 145 * q.glow, "#8ff4ff", 0.048 * q.glow);
  glowCircle(ctx, anchors.activityX - 60, CORE_Y, 90 * q.glow, "#8ff4ff", 0.012 * q.glow);

  paths.forEach(({ family, points }) => {
    const dim = highlightId && highlightId !== family.id ? 0.2 : 1;
    const boost = highlightId === family.id ? 1.35 : 1;
    const thickness = 11 + family.value * 0.62;
    strokePath(ctx, points, rgba(family.color, (mode === "delta" ? 0.16 : 0.22) * dim * boost), thickness * 0.48, 1, Math.max(1, q.blur * 0.28));
    strokePath(ctx, points, rgba("#ffffff", (mode === "delta" ? 0.018 : 0.03) * dim * boost), Math.max(1.5, thickness * 0.1), 1, 0.8);

    const strands = q.strands;
    for (let i = 0; i < strands; i += 1) {
      const ratio = strands <= 1 ? 0 : i / (strands - 1);
      const offset = (ratio - 0.5) * thickness * 1.1;
      const strand = offsetPath(points, offset, i * 1.73 + family.value, quality === "cinematic" ? 0.8 : 0.58, phase);
      strokePath(ctx, strand, rgba(family.color, 0.13 * dim * boost), 1, 1, i % 3 === 0 ? 1 : 0);
    }
  });

  ctx.restore();
}

function renderCanvas(canvas: HTMLCanvasElement, mode: Mode, quality: Quality, phase: number, highlightId: string | null) {
  const q = qualitySettings[quality];
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  const targetW = WIDTH * dpr;
  const targetH = HEIGHT * dpr;
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(ctx);
  drawStageLabels(ctx);
  drawFlow(ctx, mode, quality, phase, highlightId);
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: "9px 13px", borderRadius: 16, border: `1px solid ${rgba(color, 0.24)}`, background: "rgba(7,15,28,0.52)", boxShadow: `inset 0 0 24px ${rgba(color, 0.05)}`, minWidth: 118 }}>
      <div style={{ fontSize: 10, letterSpacing: 0.75, textTransform: "uppercase", color: "#8ba2c0" }}>{label}</div>
      <div style={{ marginTop: 4, color, fontSize: 21, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function FlowCard({ flow, x, y, active, dimmed, onHover }: { flow: FlowFamily; x: number; y: number; active: boolean; dimmed: boolean; onHover: (id: string | null) => void }) {
  const utilization = flow.id === "growth" ? "82" : flow.id === "value" ? "71" : flow.id === "intl" ? "65" : flow.id === "bond" ? "79" : "59";
  const borderAlpha = active ? 0.7 : dimmed ? 0.18 : 0.32;
  const bgAlpha = active ? 0.58 : dimmed ? 0.32 : 0.42;
  return (
    <div
      onMouseEnter={() => onHover(flow.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 150,
        padding: "9px 11px",
        borderRadius: 15,
        border: `1px solid ${rgba(flow.color, borderAlpha)}`,
        background: `rgba(7,15,28,${bgAlpha})`,
        boxShadow: `0 0 ${active ? 26 : 18}px ${rgba(flow.color, active ? 0.18 : 0.07)}, inset 0 0 18px ${rgba(flow.color, active ? 0.09 : 0.04)}`,
        backdropFilter: "blur(9px)",
        pointerEvents: "auto",
        opacity: dimmed ? 0.55 : 1,
        transition: "opacity 180ms ease, border-color 180ms ease, box-shadow 180ms ease, background 180ms ease",
        cursor: "default",
      }}
    >
      <div style={{ color: "#eef6ff", fontSize: 12, fontWeight: 750, lineHeight: 1.1 }}>{flow.label}</div>
      <div style={{ color: "#9fb2ca", fontSize: 9, marginTop: 4 }}>Utilization {utilization}%</div>
      <div style={{ color: "white", fontSize: 20, fontWeight: 850, marginTop: 1 }}>${flow.value.toFixed(1)}M</div>
      <div style={{ color: flow.color, fontSize: 10, fontWeight: 800 }}>{flow.pct}</div>
    </div>
  );
}

function ResultCard({ title, value, color, x, y }: { title: string; value: string; color: string; x: number; y: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 150, padding: "10px 12px", borderRadius: 15, border: `1px solid ${rgba(color, 0.32)}`, background: "rgba(7,15,28,0.42)", boxShadow: `0 0 18px ${rgba(color, 0.07)}, inset 0 0 18px ${rgba(color, 0.04)}`, backdropFilter: "blur(9px)" }}>
      <div style={{ color: "#dce9f8", fontSize: 11, fontWeight: 750 }}>{title}</div>
      <div style={{ color: "white", fontSize: 21, fontWeight: 850, marginTop: 4 }}>{value}</div>
      <div style={{ color, fontSize: 10, fontWeight: 800, marginTop: 1 }}>+5.4%</div>
    </div>
  );
}

export default function CinematicFlowView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<string | null>(null);
  const [mode, setMode] = useState<Mode>("actual");
  const [quality, setQuality] = useState<Quality>("balanced");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    highlightRef.current = highlightId;
  }, [highlightId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setScale({ x: el.offsetWidth / WIDTH, y: el.offsetHeight / HEIGHT });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((now - start) / 1000) * 0.6;
      renderCanvas(canvas, mode, quality, phase, highlightRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, quality]);

  const allocationCards = useMemo(
    () => [
      { flow: families[0], x: 300, y: 145 },
      { flow: families[1], x: 300, y: 245 },
      { flow: families[2], x: 300, y: 345 },
      { flow: families[3], x: 300, y: 445 },
      { flow: families[4], x: 300, y: 545 },
    ],
    [],
  );

  return (
    <div style={{ minHeight: "100vh", background: "#020713", color: "white", fontFamily: "Inter, Arial, sans-serif", padding: 20, boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ maxWidth: 1660, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 900, letterSpacing: -1.1 }}>Capital Flow Odyssey</div>
              <div style={{ border: "1px solid rgba(126,224,129,0.28)", color: "#9cf6a4", background: "rgba(30,70,42,0.38)", borderRadius: 999, padding: "6px 11px", fontSize: 11, fontWeight: 850, letterSpacing: 0.8 }}>CINEMATIC</div>
            </div>
            <div style={{ marginTop: 7, color: "#9fb2ca", fontSize: 14, lineHeight: 1.25, maxWidth: 720 }}>A flow-first capital journey. Hover a fund card to isolate its lane.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {(["safe", "balanced", "cinematic"] as Quality[]).map((q) => (
              <button key={q} onClick={() => setQuality(q)} style={{ padding: "8px 12px", borderRadius: 999, border: `1px solid ${quality === q ? "rgba(220,245,255,0.42)" : "rgba(255,255,255,0.1)"}`, background: quality === q ? "rgba(22,42,60,0.88)" : "rgba(7,15,28,0.54)", color: quality === q ? "#eef6ff" : "#8da3bf", cursor: "pointer", textTransform: "capitalize", fontWeight: 800, fontSize: 12 }}>{q}</button>
            ))}
            {(["actual", "robust", "delta"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: "8px 12px", borderRadius: 999, border: `1px solid ${mode === m ? "rgba(126,224,129,0.38)" : "rgba(255,255,255,0.1)"}`, background: mode === m ? "rgba(30,70,42,0.48)" : "rgba(7,15,28,0.54)", color: mode === m ? "#eef6ff" : "#8da3bf", cursor: "pointer", textTransform: "capitalize", fontWeight: 800, fontSize: 12 }}>{m}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {families.map((family) => <Chip key={family.id} label={family.label} value={`$${family.value.toFixed(1)}M`} color={family.color} />)}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Chip label="Total Inflow" value="$87.4M" color="#84e27a" />
            <Chip label="Net Performance" value="+$4.7M" color="#4de1d2" />
            <Chip label="Confidence" value="73%" color="#5ea2ff" />
          </div>
        </div>

        <div ref={containerRef} style={{ position: "relative", marginTop: 16, height: "calc(100vh - 250px)", minHeight: 560, maxHeight: 690, borderRadius: 30, overflow: "hidden", border: "1px solid rgba(255,255,255,0.11)", background: "rgba(2,8,20,0.86)", boxShadow: "0 30px 90px rgba(0,0,0,0.48)" }}>
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

          <div style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT, transformOrigin: "0 0", transform: `scale(${scale.x}, ${scale.y})`, pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 72, top: 255, width: 165, height: 165, borderRadius: 22, border: `1px solid ${rgba("#84e27a", 0.38)}`, background: "rgba(38,80,44,0.36)", boxShadow: `0 0 24px ${rgba("#84e27a", 0.10)}, inset 0 0 30px ${rgba("#84e27a", 0.075)}`, padding: 17, boxSizing: "border-box", backdropFilter: "blur(9px)", pointerEvents: "auto" }}>
              <div style={{ color: "#f4fff4", fontSize: 13, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1.05 }}>Total Contributions</div>
              <div style={{ position: "absolute", left: 17, bottom: 34, color: "white", fontSize: 30, fontWeight: 900 }}>$87.4M</div>
              <div style={{ position: "absolute", left: 17, bottom: 16, color: "#84e27a", fontSize: 13, fontWeight: 850 }}>100%</div>
            </div>

            {allocationCards.map(({ flow, x, y }) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                x={x}
                y={y}
                active={highlightId === flow.id}
                dimmed={!!highlightId && highlightId !== flow.id}
                onHover={setHighlightId}
              />
            ))}

            <div style={{ position: "absolute", left: 790, top: CORE_Y + 86, transform: "translate(-50%, -50%)", padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(7,15,28,0.42)", color: "#b9c9dc", fontSize: 10, fontWeight: 800, letterSpacing: 0.4, backdropFilter: "blur(8px)", pointerEvents: "none" }}>Activity Compression</div>

            <div style={{ position: "absolute", left: 1050, top: 235, width: 150, padding: "10px 12px", borderRadius: 15, border: `1px solid ${rgba("#4de1d2", 0.32)}`, background: "rgba(7,15,28,0.42)", boxShadow: `0 0 18px ${rgba("#4de1d2", 0.07)}, inset 0 0 18px ${rgba("#4de1d2", 0.04)}`, backdropFilter: "blur(9px)", pointerEvents: "auto" }}>
              <div style={{ color: "#dce9f8", fontSize: 11, fontWeight: 750 }}>Invested Value</div>
              <div style={{ color: "white", fontSize: 21, fontWeight: 850, marginTop: 4 }}>$67.2M</div>
              <div style={{ color: "#4de1d2", fontSize: 10, fontWeight: 800, marginTop: 1 }}>76.8%</div>
            </div>
            <div style={{ position: "absolute", left: 1050, top: 460, width: 150, padding: "10px 12px", borderRadius: 15, border: `1px solid ${rgba("#ffb044", 0.32)}`, background: "rgba(7,15,28,0.42)", boxShadow: `0 0 18px ${rgba("#ffb044", 0.07)}, inset 0 0 18px ${rgba("#ffb044", 0.04)}`, backdropFilter: "blur(9px)", pointerEvents: "auto" }}>
              <div style={{ color: "#dce9f8", fontSize: 11, fontWeight: 750 }}>Cash Returned</div>
              <div style={{ color: "white", fontSize: 21, fontWeight: 850, marginTop: 4 }}>$16.5M</div>
              <div style={{ color: "#ffb044", fontSize: 10, fontWeight: 800, marginTop: 1 }}>18.9%</div>
            </div>

            <ResultCard title="Ending NAV" value="$92.1M" color="#4de1d2" x={1305} y={200} />
            <ResultCard title="Distributions" value="$12.8M" color="#4de1d2" x={1305} y={465} />
            <ResultCard title="Total Return" value="$9.6M" color="#4de1d2" x={1305} y={570} />
          </div>
        </div>
      </div>
    </div>
  );
}
