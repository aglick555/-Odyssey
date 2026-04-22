import type { OdysseyFlow, OdysseyNode } from "../types";

export const fmtMoney = (value: number) => `$${value.toFixed(1)}M`;
export const fmtDelta = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

export function alpha(hex: string, amount: number) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${amount})`;
}

export function getNodeAnchor(node: OdysseyNode, side: "left" | "right", offset = 0) {
  return {
    x: side === "left" ? node.x : node.x + node.width,
    y: node.y + node.height / 2 + offset,
  };
}

export function buildFlowAreaPath(flow: OdysseyFlow, from: OdysseyNode, to: OdysseyNode, widthPx: number, scenarioNudge = 0) {
  const start = getNodeAnchor(from, "right", flow.laneOffset ?? 0);
  const end = getNodeAnchor(to, "left", (flow.laneOffset ?? 0) * 0.44 + scenarioNudge);
  const dx = end.x - start.x;
  const bend = Math.max(80, Math.min(dx * 0.52, 220));
  const curve = flow.curvature ?? 0.28;
  const topOffset = widthPx / 2;
  const bottomOffset = widthPx / 2;

  const startTopY = start.y - topOffset;
  const startBottomY = start.y + bottomOffset;
  const endTopY = end.y - topOffset * (0.85 + curve * 0.2);
  const endBottomY = end.y + bottomOffset * (0.85 + curve * 0.2);

  return [
    `M ${start.x} ${startTopY}`,
    `C ${start.x + bend} ${startTopY - curve * 18}, ${end.x - bend} ${endTopY - curve * 26}, ${end.x} ${endTopY}`,
    `L ${end.x} ${endBottomY}`,
    `C ${end.x - bend} ${endBottomY + curve * 26}, ${start.x + bend} ${startBottomY + curve * 18}, ${start.x} ${startBottomY}`,
    "Z",
  ].join(" ");
}

export function buildCenterSpline(flow: OdysseyFlow, from: OdysseyNode, to: OdysseyNode, scenarioNudge = 0) {
  const start = getNodeAnchor(from, "right", flow.laneOffset ?? 0);
  const end = getNodeAnchor(to, "left", (flow.laneOffset ?? 0) * 0.44 + scenarioNudge);
  const dx = end.x - start.x;
  const bend = Math.max(80, Math.min(dx * 0.52, 220));
  const curve = flow.curvature ?? 0.28;

  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y - curve * 24}, ${end.x - bend} ${end.y - curve * 30}, ${end.x} ${end.y}`;
}

export function buildConfidenceBand(flow: OdysseyFlow, from: OdysseyNode, to: OdysseyNode, widthPx: number) {
  const uncertainty = Math.max(0.08, 1 - (flow.confidence ?? 0.75));
  return buildFlowAreaPath(flow, from, to, widthPx * (1.25 + uncertainty * 1.8));
}

export function buildStrandOffsets(flowWidth: number, strandCount: number) {
  if (strandCount <= 1) return [0];
  const span = Math.max(8, flowWidth * 0.56);
  const step = span / (strandCount - 1);
  return Array.from({ length: strandCount }, (_, index) => -span / 2 + index * step);
}

export function buildStrandPath(centerPath: string, offset: number) {
  return centerPath.replace(/([0-9.]+) ([0-9.]+)/g, (_, x, y) => `${x} ${(parseFloat(y) + offset).toFixed(2)}`);
}

export function widthScale(value: number) {
  return Math.max(3, Math.pow(value, 0.85) * 2.6);
}
