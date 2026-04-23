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
  if (hex.startsWith("rgb(")) return hex.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
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
      x: node.x + 4,
      y: node.y + 72,
      w: 120,
      h: 330,
      kind: "hero",
    };
  }

  if (node.stage === "allocation") {
    return {
      x: node.x + 4,
      y: node.y + (node.orderIndex % 2 === 0 ? -4 : 4),
      w: 192,
      h: 76,
      kind: "card",
    };
  }

  if (node.stage === "activity") {
    return {
      x: node.x + 4,
      y: node.y + (node.orderIndex % 2 === 0 ? -2 : 2),
      w: 160,
      h: 72,
      kind: "card",
    };
  }

  if (node.id === "invested") {
    return {
      x: node.x,
      y: node.y - 18,
      w: 164,
      h: 210,
      kind: "card",
    };
  }

  if (node.id === "cash") {
    return {
      x: node.x,
      y: node.y,
      w: 164,
      h: 76,
      kind: "card",
    };
  }

  if (node.id === "outflow") {
    return {
      x: node.x,
      y: node.y,
      w: 164,
      h: 74,
      kind: "card",
    };
  }

  return {
    x: node.x,
    y: node.y + 4,
    w: 168,
    h: 100,
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
    const haloWidth = clamp(entry.thickness * 1.15, 18, 118);
    const bodyWidth = clamp(entry.thickness * 0.82, 12, 84);
    drawPolyline(ctx, entry.points, rgba("#ffffff", 0.055), haloWidth, { blur: 54, alpha: opacity });
    drawPolyline(ctx, entry.points, rgba(entry.color, 0.13), bodyWidth, { blur: 34, alpha: opacity });
    drawMassOffsets(ctx, entry.points, entry.color, clamp(entry.thickness * 0.72, 10, 70), opacity, 22);
    drawPolyline(ctx, entry.points, rgba(entry.color, 0.24), clamp(entry.thickness * 0.18, 4, 18), { blur: 7, alpha: opacity });
    paintGlowTrail(ctx, entry.points, entry.color, clamp(entry.thickness * 0.28, 8, 38), 0.048 * opacity, 0.14, 0.88, 3);
    paintGlowCircle(ctx, entry.focusPoint.x, entry.focusPoint.y, clamp(entry.thickness * 0.72, 22, 90), entry.color, 0.12 * opacity);
  });

  preparedEdges.forEach((entry) => {
    const selected = !hoveredId || highlightIds.has(entry.edge.id) || highlightIds.has(entry.edge.from) || highlightIds.has(entry.edge.to);
    const opacity = hoveredId ? (selected ? 1 : 0.06) : 1;
    const color = entry.color;

    drawPolyline(ctx, entry.points, rgba("#ffffff", 0.045), clamp(entry.thickness * 0.82, 4, 58), { blur: 30, alpha: opacity });
    drawPolyline(ctx, entry.points, rgba(color, 0.15), clamp(entry.thickness * 0.55, 3, 42), { blur: 18, alpha: opacity });
    drawPolyline(ctx, entry.points, rgba(color, 0.38), clamp(entry.thickness * 0.12, 2.2, 14), { blur: 7, alpha: opacity });
    drawMassOffsets(ctx, entry.points, color, clamp(entry.thickness * 0.42, 4, 32), opacity * 0.9, 12);
    paintGlowTrail(ctx, entry.points, color, clamp(entry.thickness * 0.12, 4, 18), (selected ? 0.04 : 0.006) * opacity, 0.08, 0.96, 5);
    paintGlowTrail(ctx, entry.points, "#ffffff", clamp(entry.thickness * 0.06, 2, 9), (selected ? 0.024 : 0.004) * opacity, 0.22, 0.76, 6);

    entry.strandOffsets.forEach((offset, index) => {
      const strandPoints = buildStrandPoints(entry.points, offset, time, entry.seed + index * 0.71);
      const offsetRatio = Math.abs(offset) / Math.max(1, entry.spread);
      const strandAlpha = (selected ? 0.18 : 0.022) * (1 - offsetRatio * 0.46);
      const strandWidth = 1.05 + (index % 4 === 0 ? 0.38 : 0);
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
          borderRadius: hero ? 10 : 8,
          border: `1px solid ${rgba(node.color, hero ? 0.58 : 0.42)}`,
          background: hero
            ? `linear-gradient(180deg, ${rgba(node.color, 0.18)}, rgba(7,18,18,0.78))`
            : `linear-gradient(180deg, ${rgba(node.color, 0.16)}, rgba(5,13,24,0.8))`,
          boxShadow: `${active ? `0 0 0 1px ${rgba(node.color, 0.16)}, ` : ""}inset 0 0 42px ${rgba(node.color, hero ? 0.18 : 0.08)}, 0 0 32px ${rgba(node.color, hero ? 0.22 : 0.1)}, 0 14px 36px rgba(0,0,0,0.34)`,
          backdropFilter: "blur(18px)",
          color: palette.text,
          boxSizing: "border-box",
          padding: hero ? "18px 14px" : "12px 14px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          opacity: active ? 1 : 0.26,
        }}
      >
        <div>
          <div style={{ fontSize: hero ? 14 : 12, fontWeight: 700, lineHeight: 1.15, letterSpacing: hero ? 0.2 : 0.1 }}>
            {lines.map((line, index) => (
              <div key={`${node.id}-${index}`}>{line}</div>
            ))}
          </div>
          {node.detail ? <div style={{ marginTop: hero ? 14 : 8, color: "#9eb2ca", fontSize: hero ? 12 : 10 }}>{node.detail}</div> : null}
        </div>
        <div>
          <div style={{ fontSize: hero ? 23 : 17, fontWeight: 700 }}>${node.value.toFixed(1)}M</div>
          <div style={{ marginTop: 4, color: rgba(node.color, 0.98), fontSize: hero ? 14 : 11, fontWeight: 700 }}>{node.pctText}</div>
        </div>
      </div>
    </foreignObject>
  );
}

function svgPath(points: Point[]) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function SvgFlowConnections({
  preparedBundles,
  preparedEdges,
  hoveredId,
  highlightIds,
  activeBundles,
}: {
  preparedBundles: PreparedBundle[];
  preparedEdges: PreparedEdge[];
  hoveredId: string | null;
  highlightIds: Set<string>;
  activeBundles: Set<string>;
}) {
  return (
    <>
      <defs>
        <filter id="flow-soft-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="flow-core-glow" x="-18%" y="-18%" width="136%" height="136%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g style={{ mixBlendMode: "screen", pointerEvents: "none" }}>
        {preparedBundles.map((entry) => {
          const active = activeBundles.has(entry.bundle.key);
          const opacity = hoveredId ? (active ? 1 : 0.18) : 1;
          const d = svgPath(entry.points);
          return (
            <g key={`bundle-${entry.bundle.key}`} opacity={opacity}>
              <path d={d} fill="none" stroke={entry.color} strokeOpacity={0.22} strokeWidth={clamp(entry.thickness * 0.72, 12, 80)} strokeLinecap="round" strokeLinejoin="round" filter="url(#flow-soft-glow)" />
              <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.09} strokeWidth={clamp(entry.thickness * 0.22, 5, 26)} strokeLinecap="round" strokeLinejoin="round" filter="url(#flow-core-glow)" />
            </g>
          );
        })}

        {preparedEdges.map((entry) => {
          const selected = !hoveredId || highlightIds.has(entry.edge.id) || highlightIds.has(entry.edge.from) || highlightIds.has(entry.edge.to);
          const opacity = hoveredId ? (selected ? 1 : 0.08) : 1;
          const d = svgPath(entry.points);
          return (
            <g key={`edge-${entry.edge.id}`} opacity={opacity}>
              <path d={d} fill="none" stroke={entry.color} strokeOpacity={0.24} strokeWidth={clamp(entry.thickness * 0.26, 4, 34)} strokeLinecap="round" strokeLinejoin="round" filter="url(#flow-soft-glow)" />
              <path d={d} fill="none" stroke={entry.color} strokeOpacity={0.62} strokeWidth={clamp(entry.thickness * 0.085, 2.2, 12)} strokeLinecap="round" strokeLinejoin="round" filter="url(#flow-core-glow)" />
              <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.2} strokeWidth={clamp(entry.thickness * 0.028, 1, 4)} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </g>
    </>
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
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", transform: "scale(1.08)", transformOrigin: "50% 48%" }}
    />
  );
}

function Panel({
  title,
  kicker,
  children,
  accent = palette.blue,
  style,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
  accent?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        border: "1px solid rgba(109,148,178,0.34)",
        borderRadius: 8,
        background: "linear-gradient(180deg, rgba(7,18,30,0.92), rgba(3,10,18,0.9))",
        boxShadow: `inset 0 0 28px ${rgba(accent, 0.035)}`,
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ padding: "10px 12px 7px", borderBottom: "1px solid rgba(124,159,184,0.16)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ color: rgba(accent, 0.96), fontSize: 12, letterSpacing: 0.9, textTransform: "uppercase", fontWeight: 700 }}>{title}</div>
        {kicker ? <div style={{ color: "#7f91a6", fontSize: 10 }}>{kicker}</div> : null}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  );
}

function TopBar({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  const tabs = ["Flow Monitor", "Scenario Studio", "Path Explorer", "Constraint Inspector", "Attribution Engine", "Reports"];
  return (
    <header style={{ height: 52, display: "grid", gridTemplateColumns: "390px 1fr 430px", alignItems: "center", gap: 12 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1, letterSpacing: -0.6 }}>Capital Flow Odyssey</h1>
          <span style={{ border: "1px solid rgba(70,173,255,0.5)", borderRadius: 6, padding: "4px 10px", color: "#9ed8ff", background: "rgba(13,39,60,0.62)", fontSize: 15 }}>v17</span>
        </div>
        <div style={{ marginTop: 4, color: "#a5b4c7", fontSize: 13 }}>From Contributions to Redemptions - The True Journey of Capital</div>
      </div>

      <nav style={{ display: "grid", gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, border: "1px solid rgba(107,141,170,0.32)", borderRadius: 6, overflow: "hidden", minWidth: 0 }}>
        {tabs.map((tab, index) => (
          <div
            key={tab}
            style={{
              padding: "12px 10px",
              color: index === 0 ? "#cfeeff" : "#7d8998",
              background: index === 0 ? "linear-gradient(180deg, rgba(11,43,72,0.78), rgba(4,16,28,0.86))" : "rgba(4,12,22,0.76)",
              borderRight: index === tabs.length - 1 ? "none" : "1px solid rgba(107,141,170,0.18)",
              boxShadow: index === 0 ? "inset 0 -2px 0 #41b7ff, 0 0 24px rgba(48,165,255,0.28)" : "none",
              fontSize: 12,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {tab}
          </div>
        ))}
      </nav>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        <div style={{ border: "1px solid rgba(107,141,170,0.28)", borderRadius: 4, padding: "9px 18px", color: "#8998aa", background: "rgba(4,12,20,0.72)", fontSize: 12 }}>
          Jan 1 - May 31, 2025
        </div>
        <div style={{ display: "flex", gap: 6, border: "1px solid rgba(107,141,170,0.24)", borderRadius: 6, padding: 4 }}>
          {(["actual", "robust", "delta"] as Mode[]).map((entry) => (
            <button
              key={entry}
              onClick={() => setMode(entry)}
              style={{
                border: "none",
                borderRadius: 4,
                padding: "7px 9px",
                color: mode === entry ? "#ecfbff" : "#7f91a6",
                background: mode === entry ? "rgba(38,126,178,0.34)" : "transparent",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Sparkline({ color = palette.teal, height = 42 }: { color?: string; height?: number }) {
  const points = "0,32 22,24 44,18 66,21 88,15 110,25 132,22 154,12 176,7";
  return (
    <svg viewBox="0 0 176 42" height={height} width="100%" preserveAspectRatio="none" style={{ display: "block" }}>
      <path d="M0 39 L0 32 L22 24 L44 18 L66 21 L88 15 L110 25 L132 22 L154 12 L176 7 L176 39 Z" fill={rgba(color, 0.16)} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#ffffff" strokeOpacity={0.32} strokeWidth="0.8" />
    </svg>
  );
}

function CohortSidebar() {
  const total = capitalLots.reduce((sum, lot) => sum + lot.amount, 0);
  return (
    <aside style={{ display: "grid", gap: 10 }}>
      <Panel title="Capital Cohorts" kicker="by vintage" accent={palette.blue}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {["Vintage", "Source"].map((label, index) => (
            <div key={label} style={{ flex: 1, padding: "7px 8px", border: "1px solid rgba(95,128,154,0.35)", borderRadius: 5, background: index === 0 ? "rgba(24,69,105,0.42)" : "rgba(5,15,25,0.55)", color: index === 0 ? "#d9f2ff" : "#7e8ea0", fontSize: 11, textAlign: "center" }}>{label}</div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 9 }}>
          {capitalLots.map((lot, index) => (
            <div key={lot.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, paddingBottom: 8, borderBottom: index === capitalLots.length - 1 ? "none" : "1px solid rgba(126,153,177,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: lot.color, fontSize: 14, fontWeight: 700 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: lot.color, boxShadow: `0 0 12px ${lot.color}` }} />
                {lot.label}
              </div>
              <div style={{ color: "#7e8ea0", fontSize: 11 }}>Age {index === 0 ? "0-150d" : index === 1 ? "151-365d" : index === 2 ? "1-2y" : index === 3 ? "2-3y" : "3y+"}</div>
              <div style={{ color: "#dce8f8", fontSize: 14 }}>${lot.amount.toFixed(1)}M</div>
              <div style={{ color: "#a9b5c4", fontSize: 12 }}>{((lot.amount / total) * 100).toFixed(1)}%</div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", color: "#a8b6c7", fontSize: 13, paddingTop: 2 }}>
            <span>Total</span>
            <span>${total.toFixed(1)}M&nbsp;&nbsp;100%</span>
          </div>
        </div>
      </Panel>

      <Panel title="Flow Velocity" kicker="system" accent={palette.green}>
        <div style={{ fontSize: 28, color: palette.green, letterSpacing: -0.6 }}>1.42x <span style={{ fontSize: 12, color: "#7e8ea0" }}>vs Baseline 1.00x</span></div>
        <Sparkline color={palette.teal} />
        <div style={{ display: "flex", justifyContent: "space-between", color: "#7e8ea0", fontSize: 11 }}><span>Slow</span><span>Fast</span></div>
      </Panel>

      <Panel title="Capacity Utilization" kicker="avg" accent={palette.green}>
        <div style={{ fontSize: 28, color: "#a6e95d" }}>68% <span style={{ color: palette.green, fontSize: 13 }}>Healthy</span></div>
        <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", margin: "10px 0 14px", overflow: "hidden" }}>
          <div style={{ width: "68%", height: "100%", background: "linear-gradient(90deg, #76df76, #e5b743)", boxShadow: "0 0 14px rgba(161,231,92,0.46)" }} />
        </div>
        {["High (>90%)", "Medium (60-90%)", "Low (<60%)"].map((label, index) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", color: "#9aabba", fontSize: 12, marginTop: 6 }}>
            <span>{label}</span><span>{[2, 4, 3][index]}</span>
          </div>
        ))}
      </Panel>

      <Panel title="Active Constraints" accent={palette.red}>
        {["Capacity", "Liquidity Windows", "Market Impact", "Operational"].map((label, index) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", color: "#aeb8c5", fontSize: 12, marginBottom: 7 }}>
            <span>{label}</span><span>{[3, 2, 1, 0][index]}</span>
          </div>
        ))}
      </Panel>

      <Panel title="Quick Filters" accent={palette.blue}>
        {["All Funds", "All Strategies", "All Asset Classes"].map((label) => (
          <div key={label} style={{ border: "1px solid rgba(109,148,178,0.24)", borderRadius: 5, padding: "8px 10px", color: "#98aabc", background: "rgba(5,14,23,0.66)", marginBottom: 8, fontSize: 12 }}>{label}</div>
        ))}
        <button style={{ width: "100%", padding: "9px", border: "1px solid rgba(87,134,164,0.4)", borderRadius: 5, background: "rgba(8,24,36,0.8)", color: "#a9c9df", fontSize: 12 }}>Trace Filters</button>
      </Panel>
    </aside>
  );
}

function StageStepper() {
  const stages = [
    ["1", "Sources", "Where capital comes from", palette.green],
    ["2", "Allocation", "Where it is invested", palette.blue],
    ["3", "Activity", "How it flows over time", palette.purple],
    ["4", "Outcomes", "Where it goes", palette.amber],
    ["5", "Results", "Performance impact", palette.teal],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, alignItems: "center", minHeight: 50 }}>
      {stages.map(([number, label, detail, color]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, color }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${rgba(color, 0.72)}`, display: "grid", placeItems: "center", boxShadow: `0 0 20px ${rgba(color, 0.22)}`, fontWeight: 800 }}>{number}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{label}</div>
            <div style={{ fontSize: 10, color: "#8a9aab" }}>{detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelinePanel() {
  const markers = ["Base Date", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"];
  const events = ["E", "R", "B", "D", "TF", "D", "I", "F", "D", "D", "R", "P", "Y"];
  return (
    <Panel title="Timeline" kicker="Capital Journey" accent={palette.blue} style={{ padding: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 170px", gap: 14, alignItems: "center" }}>
        <div style={{ color: "#7e91a4", fontSize: 11, display: "grid", gap: 5 }}>
          {["Events", "Constraints", "States", "Capacity"].map((label) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, border: `1px solid ${palette.green}`, display: "inline-block" }} />{label}</label>
          ))}
        </div>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${markers.length}, 1fr)`, color: "#9baabc", fontSize: 11, marginBottom: 8 }}>
            {markers.map((marker) => <span key={marker}>{marker}</span>)}
          </div>
          <div style={{ height: 1, background: "linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,183,72,0.8), rgba(255,255,255,0.2))", position: "relative", marginBottom: 16 }}>
            {events.map((event, index) => (
              <span key={`${event}-${index}`} style={{ position: "absolute", left: `${(index / (events.length - 1)) * 100}%`, top: -8, width: 18, height: 18, marginLeft: -9, borderRadius: 999, border: "1px solid currentColor", color: [palette.green, palette.blue, palette.red, palette.purple, palette.amber][index % 5], background: "#05101b", textAlign: "center", fontSize: 10, lineHeight: "18px" }}>{event}</span>
            ))}
          </div>
          <div style={{ height: 16, border: "1px solid rgba(122,148,171,0.18)", borderRadius: 4, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", fontSize: 10, color: "#9bb0c2" }}>
            {["Normal", "Rebalancing Window", "High Utilization", "Market Volatility", "Normal"].map((label, index) => (
              <div key={label} style={{ textAlign: "center", background: ["rgba(72,184,82,0.16)", "rgba(49,132,196,0.16)", "rgba(230,161,43,0.18)", "rgba(208,60,76,0.14)", "rgba(72,184,82,0.14)"][index] }}>{label}</div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#84a4bb", fontSize: 10, marginBottom: 6 }}><span>Capacity Heatmap</span><span>100%</span></div>
          <div style={{ height: 10, background: "linear-gradient(90deg, #2bbbd2, #c4d44f, #d47a25)", borderRadius: 999 }} />
        </div>
      </div>
    </Panel>
  );
}

function MetricStrip({ summary }: { summary: { inflow: number; uplift: number; avgConfidence: number; constrained: number } }) {
  const metrics = [
    ["Total Contributions", `$${summary.inflow.toFixed(1)}M`, "100%", palette.green],
    ["Total Redemptions", "$29.3M", "33.6%", palette.amber],
    ["Net Cash Flow", "$58.1M", "66.4%", palette.blue],
    ["Realized P&L", "$9.6M", "11.6% of Invested", palette.purple],
    ["Time Period", "YTD 2025", "Jan 1 - May 31, 2025", palette.purple],
    ["Net Performance", `+$${(summary.uplift * 0.29).toFixed(1)}M`, "+5.4% (IRR)", palette.teal],
    ["System Reconciliation", "Balanced", "In = Out + Residual", palette.green],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${metrics.length}, 1fr)`, border: "1px solid rgba(109,148,178,0.3)", borderRadius: 8, background: "rgba(4,13,22,0.88)", overflow: "hidden" }}>
      {metrics.map(([label, value, sub, color], index) => (
        <div key={label} style={{ padding: "11px 14px", borderRight: index === metrics.length - 1 ? "none" : "1px solid rgba(109,148,178,0.22)", minWidth: 0 }}>
          <div style={{ color: "#8ea0b2", fontSize: 11 }}>{label}</div>
          <div style={{ color, fontSize: 24, marginTop: 2, letterSpacing: -0.6 }}>{value}</div>
          <div style={{ color: "#8ea0b2", fontSize: 11 }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

function RightSidebar({ summary }: { summary: { inflow: number; uplift: number; avgConfidence: number; constrained: number } }) {
  const pathRows = [
    ["From Growth Fund A", "30.2%", "$27.8M", "+1.9M", palette.blue],
    ["From Value Fund B", "25.1%", "$23.1M", "-0.8M", palette.green],
    ["From Intl C", "19.3%", "$17.8M", "+0.4M", palette.amber],
    ["From Bond Fund D", "14.7%", "$13.5M", "-0.6M", palette.red],
    ["From Real Estate E", "7.2%", "$6.6M", "+0.4M", palette.purple],
  ];
  return (
    <aside style={{ display: "grid", gap: 10 }}>
      <Panel title="Path Contribution" kicker="to Ending NAV" accent={palette.blue}>
        <div style={{ display: "grid", gap: 9 }}>
          {pathRows.map(([label, pct, amount, delta, color]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", fontSize: 12 }}>
              <span style={{ color }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: color, marginRight: 8 }} />{label}</span>
              <span style={{ color: "#d5e2ef" }}>{amount}</span>
              <span style={{ color: String(delta).startsWith("-") ? palette.red : palette.green }}>{delta}</span>
              <span style={{ color, fontWeight: 800 }}>{pct}</span>
              <div style={{ gridColumn: "2 / 4", height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ width: pct, height: "100%", background: color }} />
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", color: "#dce8f8", borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}><span>100%</span><span>$92.1M</span><span style={{ color: palette.green }}>+1.1M</span></div>
        </div>
      </Panel>

      <Panel title="Residual & Leakage" accent={palette.teal}>
        <div style={{ color: "#dfe8f4", fontSize: 18 }}>$1.2M <span style={{ fontSize: 13, color: "#8fa0b2" }}>(1.1%)</span></div>
        {["Fees & Friction", "Rounding", "Timing Mismatch", "Idle Cash"].map((label, index) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, color: "#9caebe", fontSize: 12, marginTop: 8 }}>
            <span>{label}</span><span>{["$0.6M", "$0.2M", "$0.3M", "$0.1M"][index]}</span><span style={{ color: index === 2 ? palette.green : "#7f91a6" }}>{["-0.1M", "0.0M", "-0.1M", "0.0M"][index]}</span>
          </div>
        ))}
      </Panel>

      <Panel title="Scenario Simulator" kicker="Edit" accent={palette.green}>
        {["Growth Fund A", "Value Fund B", "Real Estate E"].map((label, index) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", color: "#aebecd", fontSize: 12, marginBottom: 9 }}>
            <span>{label}</span><span style={{ color: "#dff7b4" }}>+{[10, 15, 15][index]}%</span><span style={{ color: palette.green }}>+${[2.4, 3.2, 1.1][index]}M</span>
          </div>
        ))}
        <button style={{ width: "100%", padding: "10px", borderRadius: 5, border: "1px solid rgba(52,150,240,0.55)", background: "rgba(17,77,126,0.6)", color: "#dff4ff" }}>Run Scenario</button>
        <div style={{ marginTop: 12, color: "#93a7ba", fontSize: 12 }}>Compare Scenarios (3)</div>
      </Panel>

      <Panel title="How To Read v17" accent={palette.slate}>
        {["Strands = capital lots", "Thickness = value", "Brightness = age / new is bright", "Speed cues = velocity", "Triangles = constraints", "Circles = events", "Dashed = scenario"].map((line) => (
          <div key={line} style={{ color: "#9eabb9", fontSize: 12, marginBottom: 8 }}>{line}</div>
        ))}
      </Panel>
    </aside>
  );
}

function BottomAnalytics() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 0.7fr", gap: 10 }}>
      <Panel title="Top Path" kicker="Contribution -> Ending NAV" accent={palette.green}>
        <Sparkline color={palette.green} height={68} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, color: "#c9d7e5", fontSize: 11 }}>
          {["2025 YTD", "Growth Fund A", "Rebalancing", "Invested Value", "Ending NAV"].map((label, index) => (
            <div key={label}><div style={{ color: [palette.green, palette.blue, palette.purple, palette.amber, palette.green][index] }}>{label}</div><div>${[8.3, 7.6, 7.4, 7.0, 6.5][index]}M</div></div>
          ))}
        </div>
      </Panel>
      <Panel title="Attribution Breakdown" kicker="Ending NAV" accent={palette.blue}>
        <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 14, alignItems: "center" }}>
          <div style={{ width: 92, height: 92, borderRadius: 999, background: `conic-gradient(${palette.green} 0 30%, ${palette.blue} 30% 55%, ${palette.amber} 55% 72%, ${palette.red} 72% 79%, ${palette.purple} 79% 100%)`, display: "grid", placeItems: "center" }}>
            <div style={{ width: 58, height: 58, borderRadius: 999, background: "#07111b", display: "grid", placeItems: "center", color: "#dce8f8", fontSize: 12 }}>$92.1M</div>
          </div>
          <div style={{ display: "grid", gap: 5 }}>
            {["From Growth Fund A", "From Value Fund B", "From International C", "From Bond Fund D", "From Real Estate E"].map((label, index) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, color: "#9dacbd", fontSize: 11 }}>
                <span>{label}</span><span>${[27.8, 23.1, 17.8, 13.5, 6.6][index]}M</span><span>{[30.2, 25.1, 19.3, 14.7, 7.2][index]}%</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Constraint Inspector" accent={palette.red}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 14 }}>
          <div style={{ color: "#aebecd", fontSize: 12 }}>
            <div style={{ color: palette.red, fontSize: 15, fontWeight: 700 }}>Rebalancing Capacity</div>
            <div style={{ marginTop: 4 }}>High Impact</div>
            <div style={{ marginTop: 12, display: "grid", gap: 5 }}>
              <span>Type: Capacity Constraint</span>
              <span>Impacted Flow: $18.7M</span>
              <span>Duration: 14 days</span>
              <span>Status: Resolved</span>
            </div>
          </div>
          <Sparkline color={palette.red} height={92} />
        </div>
      </Panel>
      <Panel title="Recent Events" kicker="View All" accent={palette.teal}>
        {["Distribution Paid", "Rebalancing Executed", "Distribution Paid", "Contribution Received", "Quarter End Reconciliation"].map((label, index) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 8, color: "#aebecd", fontSize: 11, marginBottom: 8 }}>
            <span>{["May 28", "May 15", "Apr 30", "Apr 20", "Mar 31"][index]}</span><span>{label}</span><span>{["$2.1M", "$4.3M", "$1.9M", "$3.2M", "OK"][index]}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function DataModelFooter() {
  const fields = ["lot_id", "source_id", "allocation_id", "activity_id", "outcome_id", "result_id", "timestamp_in", "timestamp_out", "amount_in", "amount_out", "age_days", "lineage_group", "split_ratio", "flow_velocity", "capacity_utilization", "constraint_id", "residual_flag", "attribution_weight", "event_id", "meta"];
  return (
    <footer style={{ border: "1px solid rgba(109,148,178,0.28)", borderRadius: 7, background: "rgba(4,13,21,0.9)", padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", overflow: "hidden" }}>
      <span style={{ color: "#5fbfff", fontSize: 11, whiteSpace: "nowrap" }}>v17 DATA MODEL</span>
      <span style={{ color: "#708093", fontSize: 10, whiteSpace: "nowrap" }}>Core Entities</span>
      <div style={{ display: "flex", gap: 7, overflow: "hidden" }}>
        {fields.map((field) => (
          <span key={field} style={{ color: "#7f91a5", border: "1px solid rgba(109,148,178,0.22)", borderRadius: 4, padding: "5px 10px", fontSize: 10, whiteSpace: "nowrap", background: "rgba(255,255,255,0.02)" }}>{field}</span>
        ))}
      </div>
    </footer>
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
        paddingX: 54,
        paddingY: 64,
        columnGap: 82,
        rowGap: 18,
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
        padding: 10,
        color: palette.text,
        fontFamily: "Avenir Next, Inter, Arial, sans-serif",
        background:
          "radial-gradient(circle at 12% 8%, rgba(42,145,255,0.16), transparent 22%), radial-gradient(circle at 84% 12%, rgba(42,210,190,0.12), transparent 24%), linear-gradient(180deg, #030811 0%, #020710 100%)",
        boxSizing: "border-box",
      }}
    >
      <TopBar mode={mode} setMode={setMode} />

      <div style={{ display: "grid", gridTemplateColumns: "230px minmax(840px, 1fr) 276px", gap: 10, alignItems: "start" }}>
        <CohortSidebar />

        <main style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <StageStepper />

          <section
            style={{
              position: "relative",
              height: 470,
              minHeight: 430,
              border: "1px solid rgba(109,148,178,0.26)",
              borderRadius: 10,
              background: "rgba(2,9,17,0.78)",
              boxShadow: "inset 0 0 90px rgba(32,121,166,0.08), 0 24px 80px rgba(0,0,0,0.38)",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: 10, left: 14, zIndex: 3, display: "flex", gap: 12, alignItems: "center", color: "#8da0b4", fontSize: 11 }}>
              <span>VIEW NAV</span>
              {["Velocity", "Show Events", "Show Constraints"].map((label) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {label}
                  <span style={{ width: 22, height: 11, borderRadius: 999, background: "rgba(142,243,160,0.7)", boxShadow: "0 0 12px rgba(142,243,160,0.45)" }} />
                </span>
              ))}
            </div>

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
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", transform: "scale(1.08)", transformOrigin: "50% 48%" }}
            >
              <SvgFlowConnections
                preparedBundles={preparedBundles}
                preparedEdges={preparedEdges}
                hoveredId={hoveredId}
                highlightIds={highlightIds}
                activeBundles={activeBundles}
              />

              {stageMarkers.map((marker) => (
                <g key={marker.stage} transform={`translate(${marker.x}, 62)`} opacity={0.86}>
                  <text x={0} y={0} textAnchor="middle" fill="#c7d8ec" fontSize={12} fontWeight={800} letterSpacing={0.35}>
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

            <div style={{ position: "absolute", right: 12, bottom: 10, zIndex: 4, display: "grid", gap: 8 }}>
              {[palette.blue, palette.amber, palette.red].map((color, index) => (
                <div key={color} style={{ width: 94, height: 22, border: `1px dashed ${rgba(color, 0.5)}`, background: `linear-gradient(90deg, transparent, ${rgba(color, 0.36)})`, boxShadow: `0 0 16px ${rgba(color, 0.18)}` }}>
                  <span style={{ color: "#8395a8", fontSize: 9, marginLeft: 7 }}>D{index + 1}</span>
                </div>
              ))}
            </div>
          </section>

          <TimelinePanel />
          <MetricStrip summary={summary} />
          <BottomAnalytics />
          <div style={{ color: "#8ca2bf", fontSize: 12, padding: "0 4px" }}>{hoveredText}</div>
        </main>

        <RightSidebar summary={summary} />
        <div style={{ gridColumn: "1 / -1" }}>
          <DataModelFooter />
        </div>
      </div>
    </div>
  );
}
