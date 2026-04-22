import React, { useMemo } from "react";
import { alpha, buildCenterSpline, buildConfidenceBand, buildFlowAreaPath, buildStrandOffsets, buildStrandPath, widthScale } from "../engine/flowMath";
import type { OdysseyFlow, OdysseyNode } from "../types";

function defsForFlows(flows: OdysseyFlow[]) {
  return flows.map((flow) => ({
    id: flow.id,
    gradientId: `grad-${flow.id}`,
    color: flow.color,
  }));
}

export function RiverRenderer({ flows, nodesById, width, height }: { flows: OdysseyFlow[]; nodesById: Map<string, OdysseyNode>; width: number; height: number }) {
  const gradients = useMemo(() => defsForFlows(flows), [flows]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <filter id="odyssey-blur-24"><feGaussianBlur stdDeviation="12" /></filter>
        <filter id="odyssey-blur-12"><feGaussianBlur stdDeviation="6" /></filter>
        {gradients.map((gradient) => (
          <linearGradient key={gradient.id} id={gradient.gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={alpha(gradient.color, 0.08)} />
            <stop offset="22%" stopColor={alpha(gradient.color, 0.88)} />
            <stop offset="78%" stopColor={alpha(gradient.color, 0.72)} />
            <stop offset="100%" stopColor={alpha(gradient.color, 0.16)} />
          </linearGradient>
        ))}
      </defs>

      {flows.map((flow) => {
        const from = nodesById.get(flow.from);
        const to = nodesById.get(flow.to);
        if (!from || !to) return null;

        const actualWidth = widthScale(flow.value);
        const scenarioWidth = widthScale(flow.scenarioValue ?? flow.value);
        const centerSpline = buildCenterSpline(flow, from, to, 0);
        const actualArea = buildFlowAreaPath(flow, from, to, actualWidth, 0);
        const scenarioArea = buildFlowAreaPath(flow, from, to, scenarioWidth, -8);
        const confidenceBand = buildConfidenceBand(flow, from, to, actualWidth);
        const strandCount = Math.min(6, Math.max(3, Math.round(flow.value / 5)));
        const strandOffsets = buildStrandOffsets(actualWidth, strandCount);
        const scenarioOffsets = buildStrandOffsets(scenarioWidth, strandCount);
        const gradientId = `grad-${flow.id}`;

        return (
          <g key={flow.id}>
            {!flow.residual && (
              <>
                <path d={confidenceBand} fill={alpha(flow.color, 0.12)} filter="url(#odyssey-blur-24)" />
                <path d={confidenceBand} fill={alpha(flow.color, 0.06)} />
              </>
            )}

            <path d={scenarioArea} fill={alpha(flow.color, flow.residual ? 0.06 : 0.14)} stroke={flow.dashed ? alpha(flow.color, 0.7) : "none"} strokeDasharray={flow.dashed ? "4 4" : undefined} />
            <path d={actualArea} fill={`url(#${gradientId})`} filter="url(#odyssey-blur-12)" opacity={flow.residual ? 0.5 : 0.68} />
            <path d={actualArea} fill={alpha(flow.color, flow.residual ? 0.14 : 0.28)} />

            {!flow.residual &&
              strandOffsets.map((offset, index) => (
                <path
                  key={`a-${index}`}
                  d={buildStrandPath(centerSpline, offset)}
                  fill="none"
                  stroke={alpha(flow.color, 0.88 - index * 0.08)}
                  strokeWidth={1.25 + (flow.velocity ?? 1) * 0.25}
                  strokeLinecap="round"
                  strokeDasharray={index % 3 === 0 ? "1 9" : undefined}
                  opacity={0.78}
                />
              ))}

            {!flow.residual &&
              scenarioOffsets.map((offset, index) => (
                <path
                  key={`s-${index}`}
                  d={buildStrandPath(buildCenterSpline(flow, from, to, -8), offset)}
                  fill="none"
                  stroke={alpha("#ffffff", 0.16 - index * 0.01)}
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  strokeDasharray="6 8"
                  opacity={0.4}
                />
              ))}

            <path
              d={centerSpline}
              fill="none"
              stroke={alpha("#ffffff", 0.18)}
              strokeWidth={0.6}
              strokeDasharray={flow.residual ? "5 6" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
