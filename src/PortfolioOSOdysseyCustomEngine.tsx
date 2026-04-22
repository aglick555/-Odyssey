import React, { useMemo, useState } from "react";
import CustomFlowEngine from "./odyssey/CustomFlowEngine";
import { edges, lots, nodes, palette } from "./odyssey/flowData";

type Mode = "actual" | "robust" | "delta";

function cardStyle(active = false): React.CSSProperties {
  return {
    border: `1px solid ${active ? "rgba(74,144,255,0.38)" : "rgba(255,255,255,0.10)"}`,
    borderRadius: 18,
    background: active ? "rgba(10,22,40,0.88)" : "rgba(8,18,32,0.75)",
    boxShadow: active ? "0 0 0 1px rgba(74,144,255,0.16), 0 18px 44px rgba(0,0,0,0.28)" : "0 16px 38px rgba(0,0,0,0.22)",
    backdropFilter: "blur(12px)",
  };
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ ...cardStyle(), padding: 16 }}>
      <div style={{ fontSize: 12, color: palette.muted }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 29, fontWeight: 700, color }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, fontSize: 12, color: palette.muted }}>{sub}</div> : null}
    </div>
  );
}

function ModeButton({ value, current, setCurrent }: { value: Mode; current: Mode; setCurrent: (v: Mode) => void }) {
  const active = value === current;
  return (
    <button
      onClick={() => setCurrent(value)}
      style={{
        ...cardStyle(active),
        padding: "10px 14px",
        color: active ? palette.text : palette.muted,
        cursor: "pointer",
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {value}
    </button>
  );
}

function StageHeader() {
  const stages = [
    ["1. Sources", "Where capital comes from", palette.green],
    ["2. Allocation", "Where it's invested", palette.blue],
    ["3. Activity", "How capital moves", palette.purple],
    ["4. Outcomes", "Where it goes", palette.amber],
    ["5. Results", "Performance impact", palette.teal],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
      {stages.map(([title, subtitle, color]) => (
        <div key={title as string} style={{ padding: "8px 4px" }}>
          <div style={{ color: color as string, fontWeight: 700, fontSize: 16 }}>{title as string}</div>
          <div style={{ marginTop: 4, color: palette.muted, fontSize: 12 }}>{subtitle as string}</div>
        </div>
      ))}
    </div>
  );
}

function SidebarLots() {
  return (
    <div style={{ ...cardStyle(), padding: 18 }}>
      <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: palette.muted }}>Capital Cohorts</div>
      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {lots.map((lot) => (
          <div key={lot.id} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 10, alignItems: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: lot.color, boxShadow: `0 0 14px ${lot.color}` }} />
            <div>
              <div style={{ fontSize: 14, color: palette.text }}>{lot.label}</div>
              <div style={{ marginTop: 2, fontSize: 11, color: palette.muted }}>Age {lot.ageDays}d</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, color: palette.text }}>${lot.amount.toFixed(1)}M</div>
              <div style={{ fontSize: 11, color: palette.muted }}>{lot.vintage}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewPanel() {
  return (
    <div style={{ ...cardStyle(), padding: 18 }}>
      <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: palette.muted }}>Codebase review</div>
      <div style={{ marginTop: 12, display: "grid", gap: 10, fontSize: 13, color: "#d4e0f3" }}>
        <div><strong>What was already real:</strong> Vite shell, React entrypoint, one visual snapshot, and a stable dark product language.</div>
        <div><strong>What was missing:</strong> no reusable flow model, no layout engine, no interaction layer, no scenario overlay logic, and no custom renderer.</div>
        <div><strong>What this file starts:</strong> a true custom rendering engine inside the existing UI shell, with nodes, edges, lot strands, uncertainty bands, scenario deltas, and hover-driven highlighting.</div>
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    ["Solid ribbon", "Actual flow", "#d7e3f4"],
    ["Dashed line", "Scenario delta", "#7EE081"],
    ["Glow band", "Confidence corridor", "#35D2D2"],
    ["Fine strands", "Capital lots", "#9D5CFF"],
    ["Triangle", "Constraint / bottleneck", "#F04A4A"],
  ];
  return (
    <div style={{ ...cardStyle(), padding: 18 }}>
      <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: palette.muted }}>Renderer legend</div>
      <div style={{ marginTop: 12, display: "grid", gap: 9 }}>
        {items.map(([a, b, c]) => (
          <div key={a as string} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, fontSize: 12 }}>
            <div style={{ color: c as string, fontWeight: 600 }}>{a as string}</div>
            <div style={{ color: palette.muted }}>{b as string}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortfolioOSOdysseyCustomEngine() {
  const [mode, setMode] = useState<Mode>("actual");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const uplift = edges.reduce((sum, e) => sum + (e.scenarioDelta || 0), 0);
    const constrained = edges.filter((e) => e.constraint).length;
    const avgConfidence = edges.reduce((sum, e) => sum + e.confidence, 0) / edges.length;
    return { uplift, constrained, avgConfidence };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        color: palette.text,
        background:
          "radial-gradient(circle at 12% 8%, rgba(74,144,255,0.12), transparent 22%), radial-gradient(circle at 78% 14%, rgba(53,210,210,0.10), transparent 22%), radial-gradient(circle at 54% 42%, rgba(157,92,255,0.10), transparent 28%), linear-gradient(180deg, #020814 0%, #02050b 100%)",
        padding: 22,
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1640, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ ...cardStyle(), padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.2 }}>Capital Flow Odyssey</div>
                <div style={{ ...cardStyle(true), padding: "6px 10px", fontSize: 13, color: palette.blue }}>custom-engine α</div>
              </div>
              <div style={{ marginTop: 8, color: palette.muted, fontSize: 16 }}>
                Reviewed the exported snapshots. Only V12 contained a real visual layer. This now includes a separate deterministic layout + routing module feeding the reusable custom renderer inside the product UI.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <ModeButton value="actual" current={mode} setCurrent={setMode} />
              <ModeButton value="robust" current={mode} setCurrent={setMode} />
              <ModeButton value="delta" current={mode} setCurrent={setMode} />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 300px", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 16 }}>
            <SidebarLots />
            <Metric label="Avg confidence" value={`${Math.round(summary.avgConfidence * 100)}%`} sub="Across routed edges" color={palette.teal} />
            <Metric label="Scenario uplift" value={`+$${summary.uplift.toFixed(1)}M`} sub="Summed from edge deltas" color={palette.green} />
            <Metric label="Constrained edges" value={`${summary.constrained}`} sub="Capacity / timing / friction markers" color={palette.red} />
            <ReviewPanel />
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ ...cardStyle(), padding: 18 }}>
              <StageHeader />
              <div style={{ marginTop: 16, height: 760 }}>
                <CustomFlowEngine nodes={nodes} edges={edges} lots={lots} hoveredId={hoveredId} setHoveredId={setHoveredId} mode={mode} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              <Metric label="Total Contributions" value="$87.4M" color={palette.green} />
              <Metric label="Total Redemptions" value="$29.3M" color={palette.amber} />
              <Metric label="Net Cash Flow" value="$58.1M" color={palette.blue} />
              <Metric label="Time Period" value="YTD 2025" color={palette.purple} />
              <Metric label="Net Performance" value="+$4.7M" sub="+5.4% IRR" color={palette.teal} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <Legend />
            <div style={{ ...cardStyle(), padding: 18 }}>
              <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: palette.muted }}>Hovered entity</div>
              <div style={{ marginTop: 12, fontSize: 14, color: hoveredId ? palette.text : palette.muted }}>
                {hoveredId ? hoveredId : "Hover any node or flow to inspect its routed lineage and keep the render focused."}
              </div>
            </div>
            <div style={{ ...cardStyle(), padding: 18 }}>
              <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: palette.muted }}>What was added in code</div>
              <ul style={{ margin: "12px 0 0 18px", padding: 0, color: "#d4e0f3", display: "grid", gap: 8, fontSize: 13 }}>
                <li>Reusable node, lot, and edge schema.</li>
                <li>Deterministic stage layout computed from stage, size, and sort order instead of hand-placed coordinates.</li>
                <li>Custom SVG band renderer for actual, robust, and delta states.</li>
                <li>Uncertainty corridors driven by edge confidence.</li>
                <li>Multi-strand lineage rendering for capital lots.</li>
                <li>Deterministic routing offsets and curvature computed in a standalone engine module.</li>
              </ul>
            </div>
            <div style={{ ...cardStyle(), padding: 18 }}>
              <div style={{ fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", color: palette.muted }}>Next engineering steps</div>
              <ol style={{ margin: "12px 0 0 18px", padding: 0, color: "#d4e0f3", display: "grid", gap: 8, fontSize: 13 }}>
                <li>Port the renderer from SVG to Canvas or PixiJS for higher strand density and better performance.</li>
                <li>Add lane reservation and bundle-aware routing so large path families cohere before splitting.</li>
                <li>Introduce deterministic tests and golden fixtures for layout + routing outputs.</li>
                <li>Wire actual portfolio data and scenario state into this renderer instead of snapshot values.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
