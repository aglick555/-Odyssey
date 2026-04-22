import React, { useMemo } from "react";
import { odysseyDemo } from "../data/demoOdyssey";
import { alpha } from "../engine/flowMath";
import { NodeCard } from "./NodeCard";
import { RiverRenderer } from "./RiverRenderer";

const PANEL = "rgba(6, 14, 27, 0.86)";
const PANEL_BORDER = "rgba(255,255,255,0.1)";

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${PANEL_BORDER}`, background: PANEL, borderRadius: 18, padding: 16, boxShadow: "0 18px 48px rgba(0,0,0,0.28)" }}>
      <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#81A0C2", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function MetricBar({ label, value, accent, sublabel }: { label: string; value: string; accent: string; sublabel?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: `1px solid ${alpha(accent, 0.22)}`, borderRadius: 16, padding: "14px 16px", background: alpha(accent, 0.06), boxShadow: `inset 0 0 40px ${alpha(accent, 0.06)}` }}>
      <div style={{ fontSize: 12, color: "#8FA4C2" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: accent }}>{value}</div>
      {sublabel ? <div style={{ marginTop: 4, fontSize: 12, color: "#B6C7DB" }}>{sublabel}</div> : null}
    </div>
  );
}

function StageHeader({ title, subtitle, color }: { title: string; subtitle: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 13, color, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#8CA4C6" }}>{subtitle}</div>
    </div>
  );
}

export default function OdysseyCustomEngine() {
  const data = odysseyDemo;
  const nodesById = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 20,
        color: "white",
        fontFamily: "Inter, Arial, sans-serif",
        background:
          "radial-gradient(circle at 12% 12%, rgba(95, 169, 255, 0.12), transparent 24%), radial-gradient(circle at 78% 18%, rgba(84, 236, 230, 0.08), transparent 26%), radial-gradient(circle at 72% 72%, rgba(181, 123, 255, 0.12), transparent 30%), linear-gradient(180deg, #020816 0%, #030A15 100%)",
      }}
    >
      <div style={{ maxWidth: 1740, margin: "0 auto", border: `1px solid ${PANEL_BORDER}`, background: "rgba(3,9,19,0.86)", borderRadius: 28, padding: 22, boxShadow: "0 28px 80px rgba(0,0,0,0.45)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: 26, letterSpacing: -0.6 }}>{data.title}</h1>
              <div style={{ border: `1px solid ${PANEL_BORDER}`, borderRadius: 999, padding: "4px 10px", fontSize: 11, color: "#9BB1CC" }}>custom engine v1</div>
            </div>
            <div style={{ marginTop: 6, color: "#9AB0CB", fontSize: 15 }}>{data.subtitle}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {[
              "Multi-strand flows",
              "Scenario overlay",
              "Confidence bands",
              "Residual channels",
              "Product UI shell",
            ].map((pill) => (
              <div key={pill} style={{ border: `1px solid ${PANEL_BORDER}`, background: "rgba(255,255,255,0.03)", borderRadius: 999, padding: "8px 12px", fontSize: 12, color: "#B6C6DB" }}>
                {pill}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "220px minmax(1100px, 1fr) 240px", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <SidePanel title="Codebase review">
              <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#C4D2E4" }}>
                <div>Shell/UI scaffold exists.</div>
                <div>Data-driven snapshot exists.</div>
                <div>Most intermediate versions are placeholders.</div>
                <div>V12 is the current visual baseline.</div>
                <div style={{ color: "#8FF1A0" }}>This screen starts the real custom renderer.</div>
              </div>
            </SidePanel>

            <SidePanel title="Engine layers">
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  ["Geometry", "Bezier area paths + strand splines"],
                  ["Encoding", "Width = value, spread = uncertainty"],
                  ["Overlay", "Actual + scenario in one renderer"],
                  ["Residuals", "Dashed leakage channels"],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontSize: 12, color: "#86A1C4" }}>{label}</div>
                    <div style={{ fontSize: 13, color: "#F4F8FF" }}>{value}</div>
                  </div>
                ))}
              </div>
            </SidePanel>

            <SidePanel title="Next build steps">
              <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#D5E0ED" }}>
                <div>1. Move renderer into its own route.</div>
                <div>2. Replace demo data with live node/link schema.</div>
                <div>3. Add hover isolation and lineage tracing.</div>
                <div>4. Switch SVG engine to Canvas/WebGL if needed.</div>
              </div>
            </SidePanel>
          </div>

          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 18, marginBottom: 12 }}>
              {data.stages.map((stage) => (
                <StageHeader key={stage.id} title={stage.title} subtitle={stage.subtitle} color={stage.color} />
              ))}
            </div>

            <div style={{ position: "relative", height: 760, border: `1px solid ${PANEL_BORDER}`, borderRadius: 24, background: "linear-gradient(180deg, rgba(4,10,19,0.94), rgba(3,8,16,0.98))", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 25% 20%, rgba(89,166,255,0.08), transparent 18%), radial-gradient(circle at 64% 40%, rgba(84,236,230,0.06), transparent 20%), radial-gradient(circle at 50% 84%, rgba(180,123,255,0.08), transparent 20%)" }} />
              <RiverRenderer flows={data.flows} nodesById={nodesById} width={1600} height={760} />
              {data.nodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
              <div style={{ position: "absolute", left: 32, right: 32, bottom: 16, display: "flex", gap: 12 }}>
                {data.metrics.map((metric) => (
                  <MetricBar key={metric.label} {...metric} />
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <SidePanel title="Render notes">
              <div style={{ display: "grid", gap: 9, fontSize: 13, color: "#D1DDED" }}>
                <div><span style={{ color: "#8EA7C8" }}>Solid body:</span> actual flow area</div>
                <div><span style={{ color: "#8EA7C8" }}>White dashes:</span> scenario overlay</div>
                <div><span style={{ color: "#8EA7C8" }}>Glow halo:</span> confidence corridor</div>
                <div><span style={{ color: "#8EA7C8" }}>Dashed branch:</span> residual / leakage</div>
              </div>
            </SidePanel>

            <SidePanel title="Why this is different">
              <div style={{ display: "grid", gap: 10, fontSize: 13, color: "#D5E1EE" }}>
                <div>Not a stock Sankey.</div>
                <div>Not a static illustration.</div>
                <div>It is geometry + rendering + product chrome.</div>
                <div style={{ color: "#8FF1A0" }}>This is the first buildable substrate for the full Odyssey system.</div>
              </div>
            </SidePanel>

            <SidePanel title="Integration target">
              <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#D1DDED" }}>
                <div>Route: /flows/odyssey</div>
                <div>State: actual / scenario / delta / confidence</div>
                <div>Inputs: node schema + lot lineage + constraints</div>
                <div>Outputs: hover path, node inspection, drill-through</div>
              </div>
            </SidePanel>
          </div>
        </div>
      </div>
    </div>
  );
}
