import React, { useEffect, useMemo, useRef, useState } from "react";
import { edges as flowEdges, lots as capitalLots, nodes as flowNodes, palette, type CapitalLot, type FlowEdge } from "./odyssey/flowData";
import { buildDeterministicLayout, type RenderMode, type RoutedBundle, type RoutedEdge, type RoutedNode } from "./odyssey/engine/layoutRouting";

const FLOW_WIDTH = 1600;
const FLOW_HEIGHT = 920;

const STAGE_TITLES: Record<string, string> = {
  source: "Sources",
  allocation: "Allocation",
  activity: "Activity",
  outcome: "Outcomes",
  result: "Results",
};

const STAGE_SUBTITLES: Record<string, string> = {
  source: "Capital enters",
  allocation: "Funds form",
  activity: "Compression",
  outcome: "Capital exits",
  result: "Performance lands",
};

type Mode = RenderMode;

type Point = { x: number; y: number };

type DisplayFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "hero" | "card" | "chip";
};

type PreparedBundle = {
  bundle: RoutedBundle;
  points: Point[];
  thickness: number;
  color: string;
  focusPoint: Point;
};

type PreparedEdge = {
  edge: RoutedEdge;
  points: Point[];
  color: string;
  thickness: number;
  spread: number;
  seed: number;
  markerPoint: Point;
  strandOffsets: number[];
};

function rgba(hex: string, alpha: number) {
  if (hex.startsWith("rgba")) return hex;
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const int = Number.parseInt(value, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function averageColors(colors: string[]) {
  if (colors.length === 0) return "#7ec4ff";
  const total = colors.reduce(
    (acc, color) => {
      const rgb = hexToRgb(color);
      return {
        r: acc.r + rgb.r,
        g: acc.g + rgb.g,
        b: acc.b + rgb.b,
      };
    },
    { r: 0, g: 0, b: 0 },
  );
  const r = Math.round(total.r / colors.length);
  const g = Math.round(total.g / colors.length);
  const b = Math.round(total.b / colors.length);
  return `rgb(${r}, ${g}, ${b})`;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cubicPoint(p0: number, p1: number, p2: number, p3: number, t: number) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function sampleCompositeCurve(points: Point[], curveStrength: number, samplesPerSegment = 10) {
  if (points.length < 2) return points;
  const sampled: Point[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const prev = points[Math.max(0, index - 1)];
    const a = points[index];
    const b = points[index + 1];
    const next = points[Math.min(points.length - 1, index + 2)];
    const dx = b.x - a.x;
    const c1 = {
      x: a.x + dx * curveStrength,
      y: a.y + (b.y - prev.y) * curveStrength * 0.5,
    };
    const c2 = {
      x: b.x - dx * curveStrength,
      y: b.y - (next.y - a.y) * curveStrength * 0.5,
    };
    const localSamples = index === points.length - 2 ? samplesPerSegment : samplesPerSegment - 1;
    for (let step = 0; step <= localSamples; step += 1) {
      const t = step / samplesPerSegment;
      sampled.push({
        x: cubicPoint(a.x, c1.x, c2.x, b.x, t),
        y: cubicPoint(a.y, c1.y, c2.y, b.y, t),
      });
    }
  }
  return sampled;
}

function blend(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function buildBundleCenterline(edge: RoutedEdge) {
  const x1 = edge.fromNode.x + edge.fromNode.w;
  const x2 = edge.toNode.x;
  const span = x2 - x1;
  const joinX = x1 + span * (0.12 + edge.joinStrength * 0.18);
  const settleX = x1 + span * (0.28 + edge.joinStrength * 0.1);
  const releaseX = x2 - span * (0.28 + edge.splitStrength * 0.1);
  const splitX = x2 - span * (0.12 + edge.splitStrength * 0.18);
  const p0 = { x: x1, y: edge.fromCenterY };
  const p1 = { x: joinX, y: blend(edge.fromCenterY, edge.bundleLaneY + edge.bundleSlotOffset, 0.38) };
  const p2 = { x: settleX, y: edge.bundleLaneY + edge.bundleSlotOffset };
  const p3 = { x: releaseX, y: edge.bundleLaneY + edge.bundleSlotOffset };
  const p4 = { x: splitX, y: blend(edge.toCenterY, edge.bundleLaneY + edge.bundleSlotOffset, 0.38) };
  const p5 = { x: x2, y: edge.toCenterY };
  return sampleCompositeCurve([p0, p1, p2, p3, p4, p5], edge.pathCurve, 14);
}

function buildBundleEnvelopeCenterline(bundle: RoutedBundle) {
  const span = bundle.toX - bundle.fromX;
  const p0 = { x: bundle.fromX, y: bundle.centerY };
  const p1 = { x: bundle.entryX, y: bundle.centerY };
  const p2 = { x: bundle.fromX + span * 0.5, y: bundle.centerY };
  const p3 = { x: bundle.exitX, y: bundle.centerY };
  const p4 = { x: bundle.toX, y: bundle.centerY };
  return sampleCompositeCurve([p0, p1, p2, p3, p4], 0.34, 14);
}

function offsetCurvePoints(points: Point[], resolver: (t: number, nx: number, ny: number) => number) {
  return points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const t = points.length <= 1 ? 0 : index / (points.length - 1);
    const amount = resolver(t, nx, ny);
    return { x: point.x + nx * amount, y: point.y + ny * amount };
  });
}

function buildStrandPoints(points: Point[], baseOffset: number, time: number, seed: number) {
  return offsetCurvePoints(points, (t) => {
    const compression = Math.pow(Math.sin(Math.PI * t), 2.2);
    const waveA = Math.sin(seed + t * 10.8 + time * 0.92) * (2.2 + Math.abs(baseOffset) * 0.032);
    const waveB = Math.cos(seed * 0.69 + t * 16.2 - time * 1.04) * (1.05 + Math.abs(baseOffset) * 0.018);
    const contractedOffset = baseOffset * (1 - compression * 0.92);
    return contractedOffset + (waveA + waveB) * (0.12 + (1 - compression) * 0.44);
  });
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  strokeStyle: string,
  lineWidth: number,
  options: {
    blur?: number;
    dash?: number[];
    alpha?: number;
  } = {},
) {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.shadowBlur = options.blur ?? 0;
  ctx.shadowColor = strokeStyle;
  ctx.setLineDash(options.dash ?? []);
  ctx.stroke();
  ctx.restore();
}

function paintGlowCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.45, rgba(color, alpha * 0.32));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintGlowTrail(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  radius: number,
  alpha: number,
  from = 0,
  to = 1,
  stride = 4,
) {
  if (points.length === 0) return;
  const start = Math.floor((points.length - 1) * from);
  const end = Math.floor((points.length - 1) * to);
  for (let index = start; index <= end; index += stride) {
    const localT = (index - start) / Math.max(1, end - start);
    const pulse = 0.72 + Math.sin(localT * Math.PI) * 0.52;
    paintGlowCircle(ctx, points[index].x, points[index].y, radius * pulse, color, alpha * pulse);
  }
}

function drawMassOffsets(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  thickness: number,
  opacity: number,
  blur: number,
) {
  const offsets = [-0.92, -0.66, -0.42, -0.18, 0.18, 0.42, 0.66, 0.92];
  offsets.forEach((ratio, index) => {
    const bodyPoints = offsetCurvePoints(points, (t) => {
      const compression = Math.pow(Math.sin(Math.PI * t), 2.3);
      const softened = ratio * thickness * 0.32 * (1 - compression * 0.9);
      const drift = Math.sin(index * 1.7 + t * 8.6) * thickness * 0.01;
      return softened + drift;
    });
    drawPolyline(
      ctx,
      bodyPoints,
      rgba(color, 0.028 + Math.max(0, 0.022 - Math.abs(ratio) * 0.012)),
      thickness * (0.58 - Math.abs(ratio) * 0.18),
      { blur, alpha: opacity },
    );
  });
}

function fillBackground(ctx: CanvasRenderingContext2D, time: number) {
  ctx.fillStyle = "#020814";
  ctx.fillRect(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
  paintGlowCircle(ctx, FLOW_WIDTH * 0.14, FLOW_HEIGHT * 0.18, 360, "#2f6bff", 0.18);
  paintGlowCircle(ctx, FLOW_WIDTH * 0.86, FLOW_HEIGHT * 0.22, 300, "#2ad2d4", 0.1);
  paintGlowCircle(ctx, FLOW_WIDTH * 0.78, FLOW_HEIGHT * 0.82, 320, "#7f43ff", 0.12);
  paintGlowCircle(ctx, FLOW_WIDTH * 0.52, FLOW_HEIGHT * 0.5, 260 + Math.sin(time * 0.35) * 22, "#6fe6ff", 0.08);
  paintGlowCircle(ctx, FLOW_WIDTH * 0.46, FLOW_HEIGHT * 0.49, 220, "#7ec4ff", 0.06);
  paintGlowCircle(ctx, FLOW_WIDTH * 0.59, FLOW_HEIGHT * 0.47, 250, "#53d2d2", 0.05);
  ctx.save();
  const vignette = ctx.createLinearGradient(0, 0, 0, FLOW_HEIGHT);
  vignette.addColorStop(0, "rgba(0,0,0,0.02)");
  vignette.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
  ctx.restore();
}

function flowColor(edge: FlowEdge, mode: Mode) {
  if (mode !== "delta") return edge.color;
  return (edge.scenarioDelta || 0) >= 0 ? "#8EF3A0" : "#FF8F8F";
}

function displayFrame(node: RoutedNode): DisplayFrame {
  if (node.stage === "source") {
    return {
      x: node.x + 8,
      y: node.y + 152,
      w: 226,
      h: 292,
      kind: "hero",
    };
  }

  if (node.stage === "allocation") {
    return {
      x: node.x + 56 + (node.orderIndex % 2 === 0 ? -6 : 16),
      y: node.y + (node.orderIndex % 2 === 0 ? -8 : 10),
      w: 178,
      h: 88,
      kind: "card",
    };
  }

  if (node.stage === "activity") {
    return {
      x: node.x + 92,
      y: node.y + 38,
      w: 104,
      h: 24,
      kind: "chip",
    };
  }

  if (node.id === "invested") {
    return {
      x: node.x - 8,
      y: node.y + 18,
      w: 180,
      h: 80,
      kind: "card",
    };
  }

  if (node.id === "cash") {
    return {
      x: node.x + 6,
      y: node.y - 6,
      w: 172,
      h: 72,
      kind: "card",
    };
  }

  if (node.id === "outflow") {
    return {
      x: node.x - 12,
      y: node.y + 10,
      w: 168,
      h: 70,
      kind: "card",
    };
  }

  return {
    x: node.x - 8,
    y: node.y + 18,
    w: 176,
    h: 72,
    kind: "card",
  };
}

function labelLines(label: string) {
  const words = label.split(" ");
  if (words.length <= 2 || label.length <= 16) return [label];
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function pointToSegmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = a.x + dx * t;
  const py = a.y + dy * t;
  return Math.hypot(point.x - px, point.y - py);
}

function renderFlowField(
  ctx: CanvasRenderingContext2D,
  preparedBundles: PreparedBundle[],
  preparedEdges: PreparedEdge[],
  hoveredId: string | null,
  highlightIds: Set<string>,
  activeBundles: Set<string>,
  mode: Mode,
  time: number,
) {
  fillBackground(ctx, time);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  preparedBundles.forEach((entry) => {
    const active = activeBundles.has(entry.bundle.key);
    const opacity = hoveredId ? (active ? 1 : 0.15) : 1;
    drawPolyline(ctx, entry.points, rgba("#ffffff", 0.03), entry.thickness * 2.85, { blur: 52, alpha: opacity });
    drawPolyline(ctx, entry.points, rgba(entry.color, 0.055), entry.thickness * 2.1, { blur: 34, alpha: opacity });
    drawMassOffsets(ctx, entry.points, entry.color, entry.thickness * 1.08, opacity, 22);
    paintGlowTrail(ctx, entry.points, entry.color, entry.thickness * 0.34, 0.026 * opacity, 0.18, 0.84, 3);
    paintGlowCircle(ctx, entry.focusPoint.x, entry.focusPoint.y, entry.thickness * 1.38, entry.color, 0.075 * opacity);
  });

  preparedEdges.forEach((entry) => {
    const selected = !hoveredId || highlightIds.has(entry.edge.id) || highlightIds.has(entry.edge.from) || highlightIds.has(entry.edge.to);
    const opacity = hoveredId ? (selected ? 1 : 0.06) : 1;
    const color = entry.color;

    drawPolyline(ctx, entry.points, rgba("#ffffff", 0.022), entry.thickness * 1.95, { blur: 28, alpha: opacity });
    drawPolyline(ctx, entry.points, rgba(color, 0.055), entry.thickness * 1.34, { blur: 18, alpha: opacity });
    drawPolyline(ctx, entry.points, rgba(color, 0.15), Math.max(3.2, entry.thickness * 0.22), { blur: 7, alpha: opacity });
    drawMassOffsets(ctx, entry.points, color, entry.thickness * 0.92, opacity * 0.9, 14);
    paintGlowTrail(ctx, entry.points, color, entry.thickness * 0.18, (selected ? 0.02 : 0.004) * opacity, 0.08, 0.96, 5);
    paintGlowTrail(ctx, entry.points, "#ffffff", entry.thickness * 0.09, (selected ? 0.014 : 0.003) * opacity, 0.22, 0.76, 6);

    entry.strandOffsets.forEach((offset, index) => {
      const strandPoints = buildStrandPoints(entry.points, offset, time, entry.seed + index * 0.71);
      const offsetRatio = Math.abs(offset) / Math.max(1, entry.spread);
      const strandAlpha = (selected ? 0.12 : 0.018) * (1 - offsetRatio * 0.48);
      const strandWidth = 0.9 + (index % 4 === 0 ? 0.32 : 0);
      drawPolyline(ctx, strandPoints, rgba(color, strandAlpha), strandWidth, {
        blur: index % 3 === 0 ? 3.8 : 1.8,
        alpha: opacity,
      });
    });

    if (mode !== "actual") {
      drawPolyline(ctx, entry.points, rgba((entry.edge.scenarioDelta || 0) >= 0 ? "#C1FFD2" : "#FFC0C0", 0.5), Math.max(1.8, entry.edge.deltaThickness * 0.14), {
        dash: [5, 9],
        blur: 0,
        alpha: opacity,
      });
    }

    if (entry.edge.constraint) {
      paintGlowCircle(ctx, entry.markerPoint.x, entry.markerPoint.y, 12, "#ff6e6e", selected ? 0.2 : 0.05);
    }
  });

  ctx.restore();
}

function LotPill({ lot }: { lot: CapitalLot }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(7,15,28,0.52)",
        boxShadow: `inset 0 0 26px ${rgba(lot.color, 0.08)}`,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: lot.color, boxShadow: `0 0 12px ${lot.color}` }} />
      <span style={{ fontSize: 12, color: "#dce8f8" }}>{lot.label}</span>
      <span style={{ fontSize: 12, color: rgba(lot.color, 0.96) }}>${lot.amount.toFixed(1)}M</span>
    </div>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        minWidth: 132,
        padding: "10px 12px",
        borderRadius: 16,
        border: `1px solid ${rgba(color, 0.18)}`,
        background: "rgba(7,15,28,0.56)",
        boxShadow: `inset 0 0 28px ${rgba(color, 0.06)}`,
      }}
    >
      <div style={{ fontSize: 10, color: "#8096b2", textTransform: "uppercase", letterSpacing: 0.9 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 21, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ModeButton({ current, value, onSelect }: { current: Mode; value: Mode; onSelect: (value: Mode) => void }) {
  const active = current === value;
  return (
    <button
      onClick={() => onSelect(value)}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? rgba("#dff5ff", 0.28) : "rgba(255,255,255,0.08)"}`,
        background: active ? "rgba(15,28,39,0.9)" : "rgba(7,15,28,0.54)",
        color: active ? "#eef6ff" : "#8da3bf",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.2,
        cursor: "pointer",
      }}
    >
      {value}
    </button>
  );
}

function OverlayNodeCard({
  node,
  frame,
  active,
  onEnter,
  onLeave,
}: {
  node: RoutedNode;
  frame: DisplayFrame;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  if (frame.kind === "chip") {
    return (
      <g transform={`translate(${frame.x}, ${frame.y})`} opacity={active ? 0.84 : 0.26} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <rect width={frame.w} height={frame.h} rx={12} fill="rgba(8,18,32,0.54)" stroke="rgba(255,255,255,0.08)" />
        <text x={frame.w / 2} y={16} textAnchor="middle" fill="#9cb2cc" fontSize={10.5} fontWeight={600}>
          {node.label}
        </text>
      </g>
    );
  }

  const hero = frame.kind === "hero";
  const lines = labelLines(node.label);
  return (
    <foreignObject
      x={frame.x}
      y={frame.y}
      width={frame.w}
      height={frame.h}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ overflow: "visible" }}
    >
      <div
        style={{
          height: "100%",
          width: "100%",
          borderRadius: hero ? 28 : 24,
          border: `1px solid ${rgba(node.color, hero ? 0.36 : 0.2)}`,
          background: hero ? "rgba(10,18,24,0.54)" : "rgba(8,16,28,0.42)",
          boxShadow: `${active ? `0 0 0 1px ${rgba(node.color, 0.08)}, ` : ""}inset 0 0 56px ${rgba(node.color, hero ? 0.14 : 0.06)}, 0 22px 60px rgba(0,0,0,0.22)`,
          backdropFilter: "blur(24px)",
          color: palette.text,
          boxSizing: "border-box",
          padding: hero ? "22px 20px" : "14px 16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          opacity: active ? 1 : 0.26,
        }}
      >
        <div>
          <div style={{ fontSize: hero ? 15 : 12, fontWeight: 700, lineHeight: 1.15, letterSpacing: hero ? 0.2 : 0.1 }}>
            {lines.map((line, index) => (
              <div key={`${node.id}-${index}`}>{line}</div>
            ))}
          </div>
          {node.detail ? <div style={{ marginTop: hero ? 14 : 8, color: "#8ba2bf", fontSize: hero ? 14 : 11 }}>{node.detail}</div> : null}
        </div>
        <div>
          <div style={{ fontSize: hero ? 23 : 15, fontWeight: 800 }}>${node.value.toFixed(1)}M</div>
          <div style={{ marginTop: 4, color: rgba(node.color, 0.98), fontSize: hero ? 16 : 11, fontWeight: 700 }}>{node.pctText}</div>
        </div>
      </div>
    </foreignObject>
  );
}

function FlowFieldCanvas({
  preparedBundles,
  preparedEdges,
  hoveredId,
  highlightIds,
  activeBundles,
  mode,
  onHover,
  onLeave,
}: {
  preparedBundles: PreparedBundle[];
  preparedEdges: PreparedEdge[];
  hoveredId: string | null;
  highlightIds: Set<string>;
  activeBundles: Set<string>;
  mode: Mode;
  onHover: (value: string | null) => void;
  onLeave: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(FLOW_WIDTH * dpr);
    canvas.height = Math.round(FLOW_HEIGHT * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let animationFrame = 0;
    const render = (timestamp: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, FLOW_WIDTH, FLOW_HEIGHT);
      renderFlowField(ctx, preparedBundles, preparedEdges, hoveredId, highlightIds, activeBundles, mode, timestamp * 0.001);
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeBundles, highlightIds, hoveredId, mode, preparedBundles, preparedEdges]);

  return (
    <canvas
      ref={canvasRef}
      width={FLOW_WIDTH}
      height={FLOW_HEIGHT}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const point = {
          x: ((event.clientX - rect.left) / rect.width) * FLOW_WIDTH,
          y: ((event.clientY - rect.top) / rect.height) * FLOW_HEIGHT,
        };
        let bestMatch: { id: string; distance: number } | null = null;
        preparedEdges.forEach((entry) => {
          const threshold = Math.max(10, entry.thickness * 0.44);
          for (let index = 0; index < entry.points.length - 1; index += 1) {
            const distance = pointToSegmentDistance(point, entry.points[index], entry.points[index + 1]);
            if (distance <= threshold && (!bestMatch || distance < bestMatch.distance)) {
              bestMatch = { id: entry.edge.id, distance };
            }
          }
        });
        onHover(bestMatch?.id ?? null);
      }}
      onMouseLeave={onLeave}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
    />
  );
}

export default function PortfolioOSOdysseyFlowField() {
  const [mode, setMode] = useState<Mode>("actual");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { nodes: routedNodes, edges: routedEdges, bundles } = useMemo(
    () =>
      buildDeterministicLayout(flowNodes, flowEdges, mode, {
        width: FLOW_WIDTH,
        height: FLOW_HEIGHT,
        paddingX: 80,
        paddingY: 96,
        columnGap: 118,
        rowGap: 28,
      }),
    [mode],
  );

  const stageMarkers = useMemo(() => {
    const grouped = new Map<string, RoutedNode[]>();
    routedNodes.forEach((node) => grouped.set(node.stage, [...(grouped.get(node.stage) || []), node]));
    return [...grouped.entries()].map(([stage, group]) => ({
      stage,
      x: group.reduce((sum, node) => sum + node.x + node.w / 2, 0) / group.length,
    }));
  }, [routedNodes]);

  const highlightIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const ids = new Set<string>([hoveredId]);
    flowEdges.forEach((edge) => {
      if (edge.id === hoveredId || edge.from === hoveredId || edge.to === hoveredId || edge.lots.includes(hoveredId)) {
        ids.add(edge.id);
        ids.add(edge.from);
        ids.add(edge.to);
        edge.lots.forEach((lot) => ids.add(lot));
      }
    });
    return ids;
  }, [hoveredId]);

  const preparedBundles = useMemo<PreparedBundle[]>(() => {
    return bundles.map((bundle) => {
      const thickness = mode === "robust" ? bundle.robustThickness : mode === "delta" ? bundle.deltaThickness : bundle.actualThickness;
      const memberColors = routedEdges.filter((edge) => bundle.memberEdgeIds.includes(edge.id)).map((edge) => flowColor(edge, mode));
      const points = buildBundleEnvelopeCenterline(bundle);
      return {
        bundle,
        points,
        thickness,
        color: averageColors(memberColors),
        focusPoint: points[Math.floor(points.length * 0.5)],
      };
    });
  }, [bundles, mode, routedEdges]);

  const preparedEdges = useMemo<PreparedEdge[]>(() => {
    return routedEdges.map((edge) => {
      const thickness = mode === "robust" ? edge.robustThickness : mode === "delta" ? edge.deltaThickness : edge.actualThickness;
      const spread = Math.max(18, thickness * 0.84);
      const strandCount = clamp(Math.round(edge.value * 0.88), 16, 42);
      const strandOffsets = Array.from({ length: strandCount }, (_, index) => {
        const ratio = strandCount === 1 ? 0.5 : index / (strandCount - 1);
        return (ratio - 0.5) * spread;
      });
      const points = buildBundleCenterline(edge);
      return {
        edge,
        points,
        color: flowColor(edge, mode),
        thickness,
        spread,
        seed: hashString(edge.id) * 0.0017,
        markerPoint: points[Math.floor(points.length * 0.58)],
        strandOffsets,
      };
    });
  }, [mode, routedEdges]);

  const activeBundles = useMemo(() => {
    if (!hoveredId) return new Set(bundles.map((bundle) => bundle.key));
    return new Set(bundles.filter((bundle) => bundle.memberEdgeIds.some((id) => highlightIds.has(id))).map((bundle) => bundle.key));
  }, [bundles, highlightIds, hoveredId]);

  const summary = useMemo(() => {
    const uplift = flowEdges.reduce((sum, edge) => sum + (edge.scenarioDelta || 0), 0);
    const avgConfidence = flowEdges.reduce((sum, edge) => sum + edge.confidence, 0) / flowEdges.length;
    const constrained = flowEdges.filter((edge) => edge.constraint).length;
    return {
      inflow: flowNodes.find((node) => node.id === "source")?.value ?? 0,
      uplift,
      avgConfidence,
      constrained,
    };
  }, []);

  const hoveredText = useMemo(() => {
    if (!hoveredId) return "Hover a card or flow body to isolate one lineage.";
    const node = routedNodes.find((entry) => entry.id === hoveredId);
    if (node) return `${node.label} is active.`;
    const edge = flowEdges.find((entry) => entry.id === hoveredId);
    if (!edge) return hoveredId;
    const from = routedNodes.find((entry) => entry.id === edge.from)?.label ?? edge.from;
    const to = routedNodes.find((entry) => entry.id === edge.to)?.label ?? edge.to;
    return `${from} to ${to}.`;
  }, [hoveredId, routedNodes]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 22,
        color: palette.text,
        fontFamily: "Avenir Next, Inter, Arial, sans-serif",
        background:
          "radial-gradient(circle at 8% 12%, rgba(66,112,255,0.14), transparent 24%), radial-gradient(circle at 86% 14%, rgba(53,210,210,0.09), transparent 24%), radial-gradient(circle at 76% 84%, rgba(157,92,255,0.16), transparent 28%), linear-gradient(180deg, #020814 0%, #02060f 100%)",
      }}
    >
      <div style={{ maxWidth: 1580, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1, letterSpacing: -1.3 }}>Capital Flow Odyssey</h1>
              <div
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(151,239,176,0.16)",
                  background: "rgba(10,24,20,0.42)",
                  color: "#b6f0c0",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.7,
                  textTransform: "uppercase",
                }}
              >
                flow field
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.45, color: "#8ea5c2" }}>
              A cinematic flow-first render: shared mass, luminous compression, quiet floating cards, and almost no dashboard chrome.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ModeButton current={mode} value="actual" onSelect={setMode} />
            <ModeButton current={mode} value="robust" onSelect={setMode} />
            <ModeButton current={mode} value="delta" onSelect={setMode} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {capitalLots.map((lot) => (
              <LotPill key={lot.id} lot={lot} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SummaryPill label="Total inflow" value={`$${summary.inflow.toFixed(1)}M`} color={palette.green} />
            <SummaryPill label="Scenario uplift" value={`${summary.uplift >= 0 ? "+" : ""}$${summary.uplift.toFixed(1)}M`} color={palette.teal} />
            <SummaryPill label="Confidence" value={`${Math.round(summary.avgConfidence * 100)}%`} color={palette.blue} />
            <SummaryPill label="Constraints" value={`${summary.constrained}`} color={palette.red} />
          </div>
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: 34,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(3,8,17,0.74)",
            boxShadow: "0 30px 100px rgba(0,0,0,0.44)",
            overflow: "hidden",
            aspectRatio: `${FLOW_WIDTH} / ${FLOW_HEIGHT}`,
          }}
        >
          <FlowFieldCanvas
            preparedBundles={preparedBundles}
            preparedEdges={preparedEdges}
            hoveredId={hoveredId}
            highlightIds={highlightIds}
            activeBundles={activeBundles}
            mode={mode}
            onHover={setHoveredId}
            onLeave={() => setHoveredId(null)}
          />

          <svg
            viewBox={`0 0 ${FLOW_WIDTH} ${FLOW_HEIGHT}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
          >
            {stageMarkers.map((marker) => (
              <g key={marker.stage} transform={`translate(${marker.x}, 72)`} opacity={0.76}>
                <text x={0} y={0} textAnchor="middle" fill="#c7d8ec" fontSize={11.5} fontWeight={700} letterSpacing={0.35}>
                  {STAGE_TITLES[marker.stage]}
                </text>
                <text x={0} y={17} textAnchor="middle" fill="#6d84a2" fontSize={10}>
                  {STAGE_SUBTITLES[marker.stage]}
                </text>
              </g>
            ))}

            {routedNodes.map((node) => {
              const frame = displayFrame(node);
              return (
                <OverlayNodeCard
                  key={node.id}
                  node={node}
                  frame={frame}
                  active={!hoveredId || highlightIds.has(node.id)}
                  onEnter={() => setHoveredId(node.id)}
                  onLeave={() => setHoveredId(null)}
                />
              );
            })}
          </svg>
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(7,15,28,0.52)",
            color: "#8ca2bf",
            fontSize: 14,
          }}
        >
          {hoveredText}
        </div>
      </div>
    </div>
  );
}
