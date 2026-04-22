import { useMemo } from "react";
import type { CapitalLot, FlowEdge } from "./flowData";
import { palette } from "./flowData";
import { buildDeterministicLayout, type RenderMode, type RoutedBundle, type RoutedEdge, type RoutedNode } from "./engine/layoutRouting";

type Props = {
  nodes: RoutedNode[] | any[];
  edges: FlowEdge[];
  lots: CapitalLot[];
  width?: number;
  height?: number;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  mode: RenderMode;
};

function rgba(hex: string, alpha: number) {
  if (hex.startsWith("rgba")) return hex;
  const clean = hex.replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => char + char).join("")
    : clean;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cubicPoint(p0: number, p1: number, p2: number, p3: number, t: number) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function sampleCompositeCurve(points: Array<{ x: number; y: number }>, curveStrength: number, samplesPerSegment = 10) {
  if (points.length < 2) return points;
  const sampled: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const a = points[i];
    const b = points[i + 1];
    const next = points[Math.min(points.length - 1, i + 2)];
    const dx = b.x - a.x;
    const c1 = {
      x: a.x + dx * curveStrength,
      y: a.y + (b.y - prev.y) * curveStrength * 0.5,
    };
    const c2 = {
      x: b.x - dx * curveStrength,
      y: b.y - (next.y - a.y) * curveStrength * 0.5,
    };
    const localSamples = i === points.length - 2 ? samplesPerSegment : samplesPerSegment - 1;
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
  const settleX = x1 + span * (0.28 + edge.joinStrength * 0.10);
  const releaseX = x2 - span * (0.28 + edge.splitStrength * 0.10);
  const splitX = x2 - span * (0.12 + edge.splitStrength * 0.18);
  const p0 = { x: x1, y: edge.fromCenterY };
  const p1 = { x: joinX, y: blend(edge.fromCenterY, edge.bundleLaneY + edge.bundleSlotOffset, 0.38) };
  const p2 = { x: settleX, y: edge.bundleLaneY + edge.bundleSlotOffset };
  const p3 = { x: releaseX, y: edge.bundleLaneY + edge.bundleSlotOffset };
  const p4 = { x: splitX, y: blend(edge.toCenterY, edge.bundleLaneY + edge.bundleSlotOffset, 0.38) };
  const p5 = { x: x2, y: edge.toCenterY };
  return sampleCompositeCurve([p0, p1, p2, p3, p4, p5], edge.pathCurve, 12);
}

function buildBundleEnvelopeCenterline(bundle: RoutedBundle) {
  const span = bundle.toX - bundle.fromX;
  const p0 = { x: bundle.fromX, y: bundle.centerY };
  const p1 = { x: bundle.entryX, y: bundle.centerY };
  const p2 = { x: bundle.fromX + span * 0.50, y: bundle.centerY };
  const p3 = { x: bundle.exitX, y: bundle.centerY };
  const p4 = { x: bundle.toX, y: bundle.centerY };
  return sampleCompositeCurve([p0, p1, p2, p3, p4], 0.34, 12);
}

function buildCenterlinePath(points: Array<{ x: number; y: number }>) {
  if (points.length < 4) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const c1x = a.x + dx * 0.42;
    const c2x = b.x - dx * 0.42;
    path += ` C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`;
  }
  return path;
}

function buildRibbonPath(points: Array<{ x: number; y: number }>, startThickness: number, endThickness: number, bulge = 0) {
  if (points.length < 2) return "";
  const top: Array<{ x: number; y: number }> = [];
  const bottom: Array<{ x: number; y: number }> = [];
  const count = points.length - 1;

  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length;
    const ny = dx / length;
    const t = i / count;
    const belly = Math.sin(Math.PI * t) * bulge;
    const thickness = startThickness + (endThickness - startThickness) * t + belly;
    top.push({ x: points[i].x + (nx * thickness) / 2, y: points[i].y + (ny * thickness) / 2 });
    bottom.push({ x: points[i].x - (nx * thickness) / 2, y: points[i].y - (ny * thickness) / 2 });
  }

  const topPath = top.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const bottomPath = bottom.reverse().map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `${topPath} ${bottomPath} Z`;
}

function NodeCard({ node, active, onEnter, onLeave }: { node: RoutedNode; active: boolean; onEnter: () => void; onLeave: () => void }) {
  const border = node.dark ? "rgba(255,255,255,0.14)" : rgba(node.color, 0.9);
  return (
    <foreignObject x={node.x} y={node.y} width={node.w} height={node.h} onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ overflow: "visible" }}>
      <div
        style={{
          height: "100%",
          width: "100%",
          borderRadius: 20,
          border: `1px solid ${border}`,
          background: node.dark ? "rgba(10,17,29,0.86)" : "linear-gradient(180deg, rgba(3,10,18,0.75), rgba(7,17,30,0.94))",
          boxShadow: `${active ? `0 0 0 1px ${rgba(node.color, 0.95)}, ` : ""}0 18px 42px rgba(0,0,0,0.38), inset 0 0 48px ${rgba(node.color, node.glow ? 0.18 : 0.08)}`,
          color: palette.text,
          padding: "16px 16px 14px 16px",
          fontFamily: "Inter, Arial, sans-serif",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
          backdropFilter: "blur(14px)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 16% 14%, ${rgba(node.color, 0.4)}, transparent 32%)`, opacity: 0.85 }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 0.4, textTransform: node.stage === "source" ? "uppercase" : "none", color: "#d7e3f4" }}>{node.label}</div>
            {node.detail && <div style={{ marginTop: 6, fontSize: 11, color: palette.muted }}>{node.detail}</div>}
          </div>
          <div>
            <div style={{ fontSize: node.h > 150 ? 24 : 16, fontWeight: 700 }}>${node.value.toFixed(1)}M</div>
            <div style={{ marginTop: 4, fontSize: 12, color: node.color }}>{node.pctText}</div>
          </div>
        </div>
      </div>
    </foreignObject>
  );
}

function ConstraintMarker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={10} fill="rgba(20,9,9,0.9)" stroke="rgba(240,74,74,0.92)" />
      <path d="M -4 4 L 0 -4 L 4 4 Z" fill="rgba(240,74,74,0.92)" />
    </g>
  );
}

function StageGuides({ nodes, height }: { nodes: RoutedNode[]; height: number }) {
  const labels = useMemo(() => {
    const byStage = new Map<string, RoutedNode[]>();
    nodes.forEach((node) => byStage.set(node.stage, [...(byStage.get(node.stage) || []), node]));
    return [...byStage.entries()].map(([stage, group]) => ({
      stage,
      x: Math.min(...group.map((node) => node.x + node.w / 2)),
    }));
  }, [nodes]);

  return (
    <g opacity={0.45}>
      {labels.map((entry) => (
        <g key={entry.stage}>
          <line x1={entry.x} x2={entry.x} y1={14} y2={height - 14} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 10" />
        </g>
      ))}
    </g>
  );
}

function renderBundle(bundle: RoutedBundle, mode: RenderMode, selected: boolean) {
  const points = buildBundleEnvelopeCenterline(bundle);
  const thickness = mode === "robust" ? bundle.robustThickness : mode === "delta" ? bundle.deltaThickness : bundle.actualThickness;
  const corridorBulge = Math.max(0, thickness * 0.08 * (bundle.uniqueFromCount + bundle.uniqueToCount > 2 ? 1 : 0.35));
  const bundlePath = buildRibbonPath(points, bundle.startThickness, bundle.endThickness, corridorBulge);
  const corridorPath = buildRibbonPath(points, Math.max(bundle.startThickness, thickness), Math.max(bundle.endThickness, thickness), corridorBulge * 1.2);
  const opacity = selected ? 1 : 0.22;
  return (
    <g key={`bundle-${bundle.key}`} opacity={opacity} pointerEvents="none">
      <path d={corridorPath} fill="rgba(120,180,255,0.045)" filter="url(#glow-lg)" />
      <path d={bundlePath} fill="rgba(92,138,200,0.08)" filter="url(#glow-sm)" />
      <path d={bundlePath} fill="rgba(255,255,255,0.03)" />
    </g>
  );
}

function renderEdge(edge: RoutedEdge, mode: RenderMode, hoveredId: string | null, highlightIds: Set<string>, lotMap: Map<string, CapitalLot>, setHoveredId: (id: string | null) => void) {
  const selected = !hoveredId || highlightIds.has(edge.id) || highlightIds.has(edge.from) || highlightIds.has(edge.to);
  const points = buildBundleCenterline(edge);
  const bandThickness = mode === "robust" ? edge.robustThickness : mode === "delta" ? edge.deltaThickness : edge.actualThickness;
  const shapedStart = bandThickness * (1 - 0.06 * edge.joinStrength);
  const shapedEnd = bandThickness * (1 - 0.06 * edge.splitStrength);
  const massBulge = bandThickness * 0.06 * ((edge.joinStrength + edge.splitStrength) / 2);
  const basePath = buildRibbonPath(points, shapedStart, shapedEnd, massBulge);
  const robustPath = buildRibbonPath(points, edge.robustThickness * (1 - 0.05 * edge.joinStrength), edge.robustThickness * (1 - 0.05 * edge.splitStrength), massBulge);
  const actualPath = buildRibbonPath(points, edge.actualThickness * (1 - 0.05 * edge.joinStrength), edge.actualThickness * (1 - 0.05 * edge.splitStrength), massBulge);
  const uncertaintyThickness = Math.max(edge.actualThickness, edge.robustThickness) * (1 + (1 - edge.confidence) * 0.9);
  const uncertaintyPath = buildRibbonPath(points, uncertaintyThickness * 0.92, uncertaintyThickness * 0.92, massBulge * 1.2);
  const deltaPath = buildCenterlinePath(points);
  const opacity = selected ? 0.95 : 0.16;
  const deltaPositive = (edge.scenarioDelta || 0) >= 0;

  return (
    <g key={edge.id} onMouseEnter={() => setHoveredId(edge.id)} onMouseLeave={() => setHoveredId(null)}>
      <path d={uncertaintyPath} fill={rgba(edge.color, 0.08 + (1 - edge.confidence) * 0.16)} />
      {mode !== "delta" && (
        <>
          <path d={mode === "robust" ? robustPath : actualPath} fill={rgba(edge.color, 0.16 * opacity)} filter="url(#glow-lg)" />
          <path d={basePath} fill={rgba(edge.color, 0.6 * opacity)} filter="url(#glow-sm)" />
          <path d={basePath} fill={rgba(edge.color, opacity)} />
        </>
      )}
      {mode !== "actual" && Math.abs(edge.scenarioDelta || 0) > 0.02 && (
        <path d={deltaPath} stroke={deltaPositive ? rgba("#7EE081", opacity) : rgba("#F04A4A", opacity)} strokeWidth={edge.deltaThickness} strokeDasharray="6 5" fill="none" />
      )}

      {selected && edge.lots.length > 0 && mode !== "delta" && edge.lots.map((lotId, idx) => {
        const lot = lotMap.get(lotId);
        if (!lot) return null;
        const strandOffset = ((idx + 1) / (edge.lots.length + 1) - 0.5) * Math.min(18, bandThickness * 0.35);
        const strandPoints = points.map((p) => ({ x: p.x, y: p.y + strandOffset }));
        const strandPath = buildCenterlinePath(strandPoints);
        return <path key={lotId} d={strandPath} stroke={rgba(lot.color, 0.95)} strokeWidth={1.4} fill="none" opacity={0.9} />;
      })}
      {edge.constraint && <ConstraintMarker x={points[Math.floor(points.length * 0.56)].x} y={points[Math.floor(points.length * 0.56)].y} />}
    </g>
  );
}

export default function CustomFlowEngine({ nodes, edges, lots, width = 1520, height = 760, hoveredId, setHoveredId, mode }: Props) {
  const { nodes: routedNodes, edges: routedEdges, bundles } = useMemo(
    () => buildDeterministicLayout(nodes as any, edges, mode, { width, height }),
    [nodes, edges, mode, width, height],
  );

  const lotMap = useMemo(() => new Map(lots.map((lot) => [lot.id, lot])), [lots]);
  const highlightIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const ids = new Set<string>([hoveredId]);
    edges.forEach((edge) => {
      if (edge.id === hoveredId || edge.from === hoveredId || edge.to === hoveredId || edge.lots.includes(hoveredId)) {
        ids.add(edge.id);
        ids.add(edge.from);
        ids.add(edge.to);
        edge.lots.forEach((lot) => ids.add(lot));
      }
    });
    return ids;
  }, [hoveredId, edges]);

  const activeBundles = useMemo(() => {
    if (!hoveredId) return new Set(bundles.map((bundle) => bundle.key));
    return new Set(
      bundles.filter((bundle) => bundle.memberEdgeIds.some((id) => highlightIds.has(id))).map((bundle) => bundle.key),
    );
  }, [bundles, hoveredId, highlightIds]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <filter id="glow-lg" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="18" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-sm" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={0} y={0} width={width} height={height} rx={28} fill="rgba(4,10,18,0.88)" stroke="rgba(255,255,255,0.09)" />
      <StageGuides nodes={routedNodes} height={height} />
      {bundles.map((bundle) => renderBundle(bundle, mode, activeBundles.has(bundle.key)))}
      {routedEdges.map((edge) => renderEdge(edge, mode, hoveredId, highlightIds, lotMap, setHoveredId))}
      {routedNodes.map((node) => (
        <NodeCard key={node.id} node={node} active={!hoveredId || highlightIds.has(node.id)} onEnter={() => setHoveredId(node.id)} onLeave={() => setHoveredId(null)} />
      ))}
    </svg>
  );
}
