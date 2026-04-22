import React from "react";
import { alpha, fmtDelta, fmtMoney } from "../engine/flowMath";
import type { OdysseyNode } from "../types";

export function NodeCard({ node }: { node: OdysseyNode }) {
  const deltaColor = (node.deltaPct ?? 0) >= 0 ? "#8EF39F" : "#FF7B7B";

  return (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        borderRadius: 22,
        border: `1px solid ${node.dark ? "rgba(255,255,255,0.14)" : alpha(node.color, 0.85)}`,
        background: node.dark ? "rgba(12,19,34,0.88)" : "rgba(5,12,24,0.52)",
        boxShadow: `0 0 0 1px ${alpha(node.color, 0.12)} inset, 0 0 24px ${alpha(node.color, 0.22)}, inset 0 0 80px ${alpha(node.color, 0.08)}`,
        overflow: "hidden",
        backdropFilter: "blur(18px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 14% 14%, ${alpha(node.color, 0.34)} 0%, transparent 34%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", padding: 18 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F3F8FF" }}>{node.label}</div>
          {node.meta ? <div style={{ marginTop: 6, fontSize: 11, color: "#8EA1BE" }}>{node.meta}</div> : null}
        </div>
        <div>
          <div style={{ fontSize: node.height > 180 ? 22 : 17, fontWeight: 700, letterSpacing: -0.4 }}>{fmtMoney(node.value)}</div>
          <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#A8BAD4" }}>{node.pctLabel}</div>
            {typeof node.deltaPct === "number" ? <div style={{ fontSize: 12, color: deltaColor, fontWeight: 700 }}>{fmtDelta(node.deltaPct)}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
