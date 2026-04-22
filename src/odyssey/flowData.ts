export type Stage = "source" | "allocation" | "activity" | "outcome" | "result";

export type FlowNode = {
  id: string;
  stage: Stage;
  label: string;
  value: number;
  pctText: string;
  color: string;
  x?: number;
  y?: number;
  w: number;
  h: number;
  glow?: boolean;
  dark?: boolean;
  detail?: string;
  order?: number;
};

export type FlowEdge = {
  id: string;
  from: string;
  to: string;
  value: number;
  color: string;
  lots: string[];
  scenarioDelta?: number;
  confidence: number;
  constraint?: "capacity" | "timing" | "friction";
};

export type CapitalLot = {
  id: string;
  label: string;
  vintage: string;
  amount: number;
  color: string;
  ageDays: number;
};

export const palette = {
  bg: "#030a14",
  panel: "rgba(8,18,32,0.82)",
  panelAlt: "rgba(10,22,38,0.92)",
  border: "rgba(255,255,255,0.11)",
  text: "#eef6ff",
  muted: "#91a4c1",
  green: "#7EE081",
  blue: "#4A90FF",
  emerald: "#21C58E",
  amber: "#F5A623",
  red: "#F04A4A",
  purple: "#9D5CFF",
  teal: "#35D2D2",
  slate: "#7A8AA7",
};

export const lots: CapitalLot[] = [
  { id: "lot-growth", label: "2025 YTD", vintage: "2025", amount: 24.1, color: palette.green, ageDays: 120 },
  { id: "lot-value", label: "2024", vintage: "2024", amount: 21.8, color: palette.blue, ageDays: 320 },
  { id: "lot-intl", label: "2023", vintage: "2023", amount: 17.3, color: palette.emerald, ageDays: 620 },
  { id: "lot-bond", label: "2022", vintage: "2022", amount: 13.2, color: palette.amber, ageDays: 910 },
  { id: "lot-re", label: "2021 & Prior", vintage: "2021 & Prior", amount: 11.0, color: palette.purple, ageDays: 1350 },
];

export const nodes: FlowNode[] = [
  { id: "source", stage: "source", label: "Total Contributions", value: 87.4, pctText: "100%", color: palette.green, x: 28, y: 92, w: 170, h: 464, glow: true, detail: "5 capital lots" },
  { id: "growth", stage: "allocation", label: "Growth Fund A", value: 24.1, pctText: "27.6%", color: palette.blue, x: 360, y: 98, w: 216, h: 96, detail: "Utilization 82%" },
  { id: "value", stage: "allocation", label: "Value Fund B", value: 21.8, pctText: "24.9%", color: palette.green, x: 360, y: 212, w: 216, h: 96, detail: "Utilization 71%" },
  { id: "intl", stage: "allocation", label: "International C", value: 17.3, pctText: "19.8%", color: palette.amber, x: 360, y: 326, w: 216, h: 96, detail: "Utilization 65%" },
  { id: "bond", stage: "allocation", label: "Bond Fund D", value: 13.2, pctText: "15.1%", color: palette.red, x: 360, y: 440, w: 216, h: 96, detail: "Utilization 79%" },
  { id: "realEstate", stage: "allocation", label: "Real Estate E", value: 11.0, pctText: "12.6%", color: palette.purple, x: 360, y: 554, w: 216, h: 96, detail: "Utilization 59%" },
  { id: "rebalancing", stage: "activity", label: "Rebalancing", value: 28.7, pctText: "32.9%", color: palette.slate, x: 660, y: 98, w: 202, h: 96, dark: true, detail: "Velocity 1.33x" },
  { id: "dividends", stage: "activity", label: "Dividends", value: 19.3, pctText: "22.1%", color: palette.slate, x: 660, y: 212, w: 202, h: 96, dark: true, detail: "Velocity 0.85x" },
  { id: "interest", stage: "activity", label: "Interest", value: 15.8, pctText: "18.1%", color: palette.slate, x: 660, y: 326, w: 202, h: 96, dark: true, detail: "Velocity 1.02x" },
  { id: "fees", stage: "activity", label: "Fees", value: 8.6, pctText: "9.9%", color: palette.slate, x: 660, y: 440, w: 202, h: 96, dark: true, detail: "Friction 0.78x" },
  { id: "other", stage: "activity", label: "Other (Ops)", value: 14.7, pctText: "16.9%", color: palette.slate, x: 660, y: 554, w: 202, h: 96, dark: true, detail: "Velocity 0.91x" },
  { id: "invested", stage: "outcome", label: "Invested Value", value: 67.2, pctText: "76.8%", color: palette.teal, x: 986, y: 118, w: 188, h: 254, glow: true, detail: "Utilization 88%" },
  { id: "cash", stage: "outcome", label: "Cash Returned", value: 16.5, pctText: "18.9%", color: palette.amber, x: 986, y: 420, w: 188, h: 118, detail: "Velocity 0.96x" },
  { id: "outflow", stage: "outcome", label: "Net Outflows", value: 3.7, pctText: "4.2%", color: palette.purple, x: 986, y: 566, w: 188, h: 84, detail: "Velocity 0.74x" },
  { id: "nav", stage: "result", label: "Ending NAV", value: 92.1, pctText: "+5.4%", color: palette.teal, x: 1276, y: 116, w: 194, h: 196, glow: true, detail: "Scenario +$6.3M" },
  { id: "return", stage: "result", label: "Total Return", value: 9.6, pctText: "11.6%", color: palette.teal, x: 1276, y: 374, w: 194, h: 116, detail: "IRR 11.6%" },
  { id: "dist", stage: "result", label: "Distributions", value: 12.8, pctText: "14.6%", color: palette.teal, x: 1276, y: 534, w: 194, h: 116, detail: "Yield 4.8%" },
];

export const edges: FlowEdge[] = [
  { id: "s-growth", from: "source", to: "growth", value: 24.1, color: palette.blue, lots: ["lot-growth"], scenarioDelta: 2.8, confidence: 0.88 },
  { id: "s-value", from: "source", to: "value", value: 21.8, color: palette.green, lots: ["lot-value"], scenarioDelta: 1.8, confidence: 0.9 },
  { id: "s-intl", from: "source", to: "intl", value: 17.3, color: palette.amber, lots: ["lot-intl"], scenarioDelta: -1.6, confidence: 0.72, constraint: "timing" },
  { id: "s-bond", from: "source", to: "bond", value: 13.2, color: palette.red, lots: ["lot-bond"], scenarioDelta: -1.0, confidence: 0.68, constraint: "friction" },
  { id: "s-realEstate", from: "source", to: "realEstate", value: 11.0, color: palette.purple, lots: ["lot-re"], scenarioDelta: -2.0, confidence: 0.63, constraint: "capacity" },

  { id: "growth-rebal", from: "growth", to: "rebalancing", value: 10.2, color: palette.blue, lots: ["lot-growth"], scenarioDelta: 1.6, confidence: 0.83 },
  { id: "growth-div", from: "growth", to: "dividends", value: 4.8, color: palette.blue, lots: ["lot-growth"], scenarioDelta: 0.8, confidence: 0.82 },
  { id: "growth-interest", from: "growth", to: "interest", value: 3.2, color: palette.blue, lots: ["lot-growth"], scenarioDelta: 0.2, confidence: 0.8 },
  { id: "growth-fees", from: "growth", to: "fees", value: 2.3, color: palette.blue, lots: ["lot-growth"], scenarioDelta: -0.2, confidence: 0.74 },
  { id: "growth-other", from: "growth", to: "other", value: 3.6, color: palette.blue, lots: ["lot-growth"], scenarioDelta: 0.4, confidence: 0.76 },

  { id: "value-rebal", from: "value", to: "rebalancing", value: 8.6, color: palette.green, lots: ["lot-value"], scenarioDelta: 1.1, confidence: 0.87 },
  { id: "value-div", from: "value", to: "dividends", value: 5.7, color: palette.green, lots: ["lot-value"], scenarioDelta: 0.5, confidence: 0.9 },
  { id: "value-interest", from: "value", to: "interest", value: 2.1, color: palette.green, lots: ["lot-value"], scenarioDelta: 0.1, confidence: 0.84 },
  { id: "value-fees", from: "value", to: "fees", value: 1.5, color: palette.green, lots: ["lot-value"], scenarioDelta: -0.1, confidence: 0.79 },
  { id: "value-other", from: "value", to: "other", value: 3.9, color: palette.green, lots: ["lot-value"], scenarioDelta: 0.2, confidence: 0.82 },

  { id: "intl-rebal", from: "intl", to: "rebalancing", value: 4.7, color: palette.amber, lots: ["lot-intl"], scenarioDelta: -0.8, confidence: 0.69, constraint: "timing" },
  { id: "intl-div", from: "intl", to: "dividends", value: 4.6, color: palette.amber, lots: ["lot-intl"], scenarioDelta: -0.4, confidence: 0.71 },
  { id: "intl-interest", from: "intl", to: "interest", value: 3.3, color: palette.amber, lots: ["lot-intl"], scenarioDelta: -0.2, confidence: 0.67 },
  { id: "intl-fees", from: "intl", to: "fees", value: 1.3, color: palette.amber, lots: ["lot-intl"], scenarioDelta: -0.1, confidence: 0.61 },
  { id: "intl-other", from: "intl", to: "other", value: 3.4, color: palette.amber, lots: ["lot-intl"], scenarioDelta: -0.1, confidence: 0.64 },

  { id: "bond-rebal", from: "bond", to: "rebalancing", value: 2.8, color: palette.red, lots: ["lot-bond"], scenarioDelta: -0.5, confidence: 0.62, constraint: "friction" },
  { id: "bond-div", from: "bond", to: "dividends", value: 2.4, color: palette.red, lots: ["lot-bond"], scenarioDelta: -0.2, confidence: 0.68 },
  { id: "bond-interest", from: "bond", to: "interest", value: 4.3, color: palette.red, lots: ["lot-bond"], scenarioDelta: 0.2, confidence: 0.74 },
  { id: "bond-fees", from: "bond", to: "fees", value: 1.7, color: palette.red, lots: ["lot-bond"], scenarioDelta: -0.1, confidence: 0.56, constraint: "friction" },
  { id: "bond-other", from: "bond", to: "other", value: 2.0, color: palette.red, lots: ["lot-bond"], scenarioDelta: -0.4, confidence: 0.58 },

  { id: "re-rebal", from: "realEstate", to: "rebalancing", value: 2.4, color: palette.purple, lots: ["lot-re"], scenarioDelta: -0.2, confidence: 0.55, constraint: "capacity" },
  { id: "re-div", from: "realEstate", to: "dividends", value: 1.8, color: palette.purple, lots: ["lot-re"], scenarioDelta: -0.1, confidence: 0.6 },
  { id: "re-interest", from: "realEstate", to: "interest", value: 2.9, color: palette.purple, lots: ["lot-re"], scenarioDelta: 0.0, confidence: 0.63 },
  { id: "re-fees", from: "realEstate", to: "fees", value: 1.8, color: palette.purple, lots: ["lot-re"], scenarioDelta: 0.0, confidence: 0.57, constraint: "capacity" },
  { id: "re-other", from: "realEstate", to: "other", value: 2.1, color: palette.purple, lots: ["lot-re"], scenarioDelta: -0.1, confidence: 0.58 },

  { id: "act-invested-1", from: "rebalancing", to: "invested", value: 22.4, color: palette.teal, lots: ["lot-growth", "lot-value", "lot-intl"], scenarioDelta: 3.3, confidence: 0.86 },
  { id: "act-invested-2", from: "dividends", to: "invested", value: 15.8, color: palette.teal, lots: ["lot-growth", "lot-value", "lot-intl", "lot-bond"], scenarioDelta: 1.2, confidence: 0.83 },
  { id: "act-invested-3", from: "interest", to: "invested", value: 14.2, color: palette.teal, lots: ["lot-bond", "lot-re"], scenarioDelta: 1.8, confidence: 0.79 },
  { id: "act-cash-1", from: "dividends", to: "cash", value: 3.5, color: palette.amber, lots: ["lot-value", "lot-bond"], scenarioDelta: 0.3, confidence: 0.82 },
  { id: "act-cash-2", from: "interest", to: "cash", value: 1.6, color: palette.amber, lots: ["lot-bond"], scenarioDelta: 0.2, confidence: 0.77 },
  { id: "act-cash-3", from: "fees", to: "cash", value: 5.7, color: palette.amber, lots: ["lot-growth", "lot-intl"], scenarioDelta: -0.5, confidence: 0.71, constraint: "friction" },
  { id: "act-cash-4", from: "other", to: "cash", value: 5.7, color: palette.amber, lots: ["lot-re"], scenarioDelta: 0.0, confidence: 0.73 },
  { id: "act-outflow-1", from: "fees", to: "outflow", value: 2.9, color: palette.purple, lots: ["lot-growth", "lot-re"], scenarioDelta: -0.4, confidence: 0.58, constraint: "friction" },
  { id: "act-outflow-2", from: "other", to: "outflow", value: 0.8, color: palette.purple, lots: ["lot-intl"], scenarioDelta: -0.1, confidence: 0.55, constraint: "timing" },

  { id: "outcome-nav", from: "invested", to: "nav", value: 67.2, color: palette.teal, lots: ["lot-growth", "lot-value", "lot-intl", "lot-bond", "lot-re"], scenarioDelta: 6.3, confidence: 0.87 },
  { id: "cash-return", from: "cash", to: "return", value: 9.6, color: palette.teal, lots: ["lot-value", "lot-bond"], scenarioDelta: 2.2, confidence: 0.84 },
  { id: "cash-dist", from: "cash", to: "dist", value: 6.9, color: palette.teal, lots: ["lot-growth", "lot-intl"], scenarioDelta: 0.7, confidence: 0.82 },
  { id: "outflow-dist", from: "outflow", to: "dist", value: 5.9, color: palette.teal, lots: ["lot-re"], scenarioDelta: -0.5, confidence: 0.6, constraint: "capacity" },
];
