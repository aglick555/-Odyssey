import React, { useEffect, useMemo, useRef, useState } from "react";

type QualityName = "safe" | "balanced" | "cinematic";
type Point = { x: number; y: number };
type Flow = { id: string; label: string; color: string; y: number; value: number };

type Quality = {
  dpr: number;
  bodyOnly: boolean;
  strands: number;
  glowPoints: number;
  blur: number;
  renderScale: number;
  maxMs: number;
};

const QUALITY: Record<QualityName, Quality> = {
  safe: { dpr: 1, bodyOnly: true, strands: 0, glowPoints: 8, blur: 0, renderScale: 0.75, maxMs: 700 },
  balanced: { dpr: 1, bodyOnly: false, strands: 6, glowPoints: 18, blur: 10, renderScale: 0.9, maxMs: 1400 },
  cinematic: { dpr: 1.15, bodyOnly: false, strands: 18, glowPoints: 36, blur: 18, renderScale: 1, maxMs: 2400 },
};

const FLOWS: Flow[] = [
  { id: "growth", label: "Growth", color: "#58a6ff", y: -118, value: 24.1 },
  { id: "value", label: "Value", color: "#7ee081", y: -58, value: 21.8 },
  { id: "credit", label: "Credit", color: "#4de1d2", y: 0, value: 18.9 },
  { id: "intl", label: "International", color: "#ffb14a", y: 58, value: 14.7 },
  { id: "real", label: "Real Assets", color: "#a76dff", y: 118, value: 7.9 },
];

function rgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function pointOnFlow(flow: Flow, width: number, height: number, t: number): Point {
  const x = lerp(160, width - 190, t);
  const center = height * 0.52;
  const compression = Math.pow(Math.sin(Math.PI * t), 2.35);
  const bend = Math.sin(Math.PI * t) * flow.y * -0.18;
  return { x, y: center + flow.y * (1 - compression * 0.88) + bend };
}

function drawPath(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number, alpha: number, blur = 0) {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (blur > 0) {
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
  }
  ctx.stroke();
  ctx.restore();
}

function makeFlowPoints(flow: Flow, width: number, height: number, offset = 0) {
  const points: Point[] = [];
  for (let i = 0; i <= 72; i++) {
    const t = i / 72;
    const p = pointOnFlow(flow, width, height, t);
    const compression = Math.pow(Math.sin(Math.PI * t), 2.25);
    points.push({ x: p.x, y: p.y + offset * (1 - compression * 0.94) + Math.sin(t * 8 + flow.value) * 0.8 });
  }
  return points;
}

async function renderScene(
  ctx: CanvasRenderingContext2D,
  quality: Quality,
  onProgress: (pct: number) => void,
  shouldCancel: () => boolean,
) {
  const width = ctx.canvas.width / (quality.dpr * quality.renderScale);
  const height = ctx.canvas.height / (quality.dpr * quality.renderScale);
  const started = performance.now();

  ctx.setTransform(quality.dpr * quality.renderScale, 0, 0, quality.dpr * quality.renderScale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#020814";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  const bg = ctx.createRadialGradient(width * 0.5, height * 0.52, 0, width * 0.5, height * 0.52, 420);
  bg.addColorStop(0, "rgba(130,220,255,0.14)");
  bg.addColorStop(0.48, "rgba(70,120,255,0.055)");
  bg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  for (let flowIndex = 0; flowIndex < FLOWS.length; flowIndex++) {
    if (shouldCancel()) return;
    if (performance.now() - started > quality.maxMs) return;

    const flow = FLOWS[flowIndex];
    const base = makeFlowPoints(flow, width, height);
    const body = Math.max(30, flow.value * 2.2);

    drawPath(ctx, base, rgba(flow.color, 0.05), body * 2.5, 1, quality.blur);
    drawPath(ctx, base, rgba(flow.color, 0.12), body * 1.1, 1, Math.max(0, quality.blur * 0.45));
    drawPath(ctx, base, rgba(flow.color, 0.22), body * 0.28, 1, Math.max(0, quality.blur * 0.25));

    for (let g = 0; g < quality.glowPoints; g++) {
      if (shouldCancel()) return;
      const t = 0.2 + (g / Math.max(1, quality.glowPoints - 1)) * 0.62;
      const p = pointOnFlow(flow, width, height, t);
      const r = Math.max(18, body * (0.28 + Math.sin(Math.PI * t) * 0.52));
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, rgba(flow.color, 0.045));
      grad.addColorStop(1, rgba(flow.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!quality.bodyOnly) {
      for (let s = 0; s < quality.strands; s++) {
        if (shouldCancel()) return;
        const spread = body * 0.42;
        const offset = ((s + 0.5) / quality.strands - 0.5) * spread;
        const pts = makeFlowPoints(flow, width, height, offset);
        drawPath(ctx, pts, rgba(flow.color, 0.16), 1.15, 1, s % 3 === 0 ? 2 : 0);
      }
    }

    onProgress(Math.round(((flowIndex + 1) / FLOWS.length) * 100));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  ctx.globalCompositeOperation = "source-over";
}

function NodeCard({ title, value, color, style }: { title: string; value: string; color: string; style: React.CSSProperties }) {
  return (
    <div style={{ position: "absolute", padding: "14px 16px", borderRadius: 16, color: "#eef6ff", background: "rgba(7,15,28,0.68)", border: `1px solid ${rgba(color, 0.32)}`, boxShadow: `0 0 34px ${rgba(color, 0.14)}, inset 0 0 28px ${rgba(color, 0.08)}`, backdropFilter: "blur(14px)", ...style }}>
      <div style={{ fontSize: 12, color: "#8da3bf", textTransform: "uppercase", letterSpacing: 0.7 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

export default function SafeOdysseyShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cancelRef = useRef(false);
  const [qualityName, setQualityName] = useState<QualityName>(import.meta.env.DEV ? "safe" : "balanced");
  const [status, setStatus] = useState("Ready");
  const [progress, setProgress] = useState(0);
  const quality = QUALITY[qualityName];

  const canvasSize = useMemo(() => ({ width: 1500, height: 760 }), []);

  async function startRender() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelRef.current = false;
    setProgress(0);
    setStatus(`Rendering ${qualityName}`);
    const dpr = Math.min(window.devicePixelRatio || 1, quality.dpr);
    canvas.width = canvasSize.width * dpr * quality.renderScale;
    canvas.height = canvasSize.height * dpr * quality.renderScale;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await renderScene(ctx, { ...quality, dpr }, setProgress, () => cancelRef.current);
    setStatus(cancelRef.current ? "Cancelled" : "Ready");
  }

  function cancelRender() {
    cancelRef.current = true;
    setStatus("Cancelling...");
  }

  useEffect(() => {
    if (qualityName === "safe") void startRender();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 45%, rgba(60,120,255,0.08), transparent 38%), #020814", color: "white", fontFamily: "Inter, Arial, sans-serif", padding: 22 }}>
      <div style={{ maxWidth: 1560, margin: "0 auto", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 850, letterSpacing: -0.7 }}>Capital Flow Odyssey</div>
            <div style={{ marginTop: 5, color: "#8da3bf" }}>Safe-by-default cinematic flow renderer. Full quality is opt-in and cancellable.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {(["safe", "balanced", "cinematic"] as QualityName[]).map((q) => (
              <button key={q} onClick={() => setQualityName(q)} style={{ border: `1px solid ${q === qualityName ? "rgba(220,245,255,0.42)" : "rgba(255,255,255,0.1)"}`, borderRadius: 999, background: q === qualityName ? "rgba(20,34,52,0.95)" : "rgba(7,15,28,0.68)", color: q === qualityName ? "#eef6ff" : "#8da3bf", padding: "9px 12px", cursor: "pointer", textTransform: "capitalize" }}>{q}</button>
            ))}
            <button onClick={startRender} style={{ border: "1px solid rgba(126,224,129,0.38)", borderRadius: 999, background: "rgba(20,52,34,0.9)", color: "#9cf6a4", padding: "9px 14px", cursor: "pointer", fontWeight: 800 }}>Render Flow</button>
            <button onClick={cancelRender} style={{ border: "1px solid rgba(255,120,120,0.34)", borderRadius: 999, background: "rgba(52,20,20,0.85)", color: "#ffb3b3", padding: "9px 14px", cursor: "pointer", fontWeight: 800 }}>Cancel</button>
          </div>
        </div>

        <div style={{ position: "relative", height: canvasSize.height, borderRadius: 28, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,8,20,0.92)", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: canvasSize.width, height: canvasSize.height }} />
          <NodeCard title="Total Contributions" value="$87.4M" color="#7ee081" style={{ left: 46, top: 82, width: 178 }} />
          <NodeCard title="Allocation" value="$58.1M" color="#58a6ff" style={{ left: 310, top: 118, width: 148 }} />
          <NodeCard title="Activity Core" value="Live" color="#4de1d2" style={{ left: "47%", top: 78, width: 138 }} />
          <NodeCard title="Outcomes" value="$29.3M" color="#ffb14a" style={{ right: 270, top: 124, width: 146 }} />
          <NodeCard title="Net Result" value="+$4.7M" color="#4de1d2" style={{ right: 46, top: 86, width: 150 }} />
          <div style={{ position: "absolute", left: 22, bottom: 18, padding: "8px 12px", borderRadius: 999, background: "rgba(7,15,28,0.72)", border: "1px solid rgba(255,255,255,0.09)", color: "#8da3bf", fontSize: 12 }}>{status} {progress > 0 ? `${progress}%` : ""}{qualityName === "cinematic" ? " — high quality, opt-in" : ""}</div>
        </div>
      </div>
    </div>
  );
}
