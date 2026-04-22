import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  CircleDollarSign,
  Gift,
  Globe,
  Home,
  Landmark,
  LayoutGrid,
  Leaf,
  Layers,
  LineChart,
  PieChart,
  Presentation,
  Scale,
  Settings,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Waves,
  Activity,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";

const COLORS = {
  bg: "#020816",
  panel: "#071221",
  panel2: "#09182a",
  border: "rgba(255,255,255,0.10)",
  text: "#F7FAFD",
  muted: "#97A9C4",
  source: "#7EE081",
  growth: "#4A90FF",
  value: "#21C58E",
  intl: "#F5A623",
  bond: "#F04A4A",
  realEstate: "#8B5CF6",
  activity: "#7388A6",
  invested: "#18D8D2",
  cash: "#D8A532",
  outflow: "#9D5CFF",
  result: "#35D2D2",
};

const NAV = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "flows", label: "Flows", icon: Waves },
  { id: "attribution", label: "Attribution", icon: BarChart3 },
  { id: "shape", label: "Shape", icon: PieChart },
  { id: "construction", label: "Construction", icon: Layers },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "presentation", label: "Presentation", icon: Presentation },
];

const FUNDS = [
  { id: "growth", name: "Growth Fund A", color: COLORS.growth, value: "$24.1M", pct: "27.6%" },
  { id: "value", name: "Value Fund B", color: COLORS.value, value: "$21.8M", pct: "24.9%" },
  { id: "intl", name: "International C", color: COLORS.intl, value: "$17.3M", pct: "19.8%" },
  { id: "bond", name: "Bond Fund D", color: COLORS.bond, value: "$13.2M", pct: "15.1%" },
  { id: "re", name: "Real Estate E", color: COLORS.realEstate, value: "$11.0M", pct: "12.6%" },
];

const STAGES = [
  { title: "1. Sources", subtitle: "Where capital comes from", color: COLORS.source },
  { title: "2. Allocation", subtitle: "Where it's invested", color: COLORS.growth },
  { title: "3. Activity", subtitle: "How it flows", color: "#D05CFF" },
  { title: "4. Outcomes", subtitle: "Where it goes", color: "#FFAA24" },
  { title: "5. Results", subtitle: "Performance impact", color: COLORS.result },
];

const KPI = [
  { label: "Total Contributions", value: "$87.4M", color: COLORS.source, icon: Wallet },
  { label: "Total Redemptions", value: "$29.3M", color: COLORS.cash, icon: CircleDollarSign },
  { label: "Net Cash Flow", value: "$58.1M", color: COLORS.growth, icon: Activity },
  { label: "Time Period", value: "YTD 2024", color: "#C75CFF", icon: LayoutGrid },
  { label: "Net Performance", value: "+$4.7M  +5.4%", color: COLORS.result, icon: BarChart3 },
];

function cx(...v: Array<string | false | undefined>) {
  return v.filter(Boolean).join(" ");
}

function ShellCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-[22px] border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md", className)}>{children}</div>;
}

function TopSelect({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[160px] rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 flex items-center justify-between text-sm text-white">
        <span>{value}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  );
}

function Sidebar({ route, setRoute }: { route: string; setRoute: (v: string) => void }) {
  return (
    <div className="flex h-full w-[206px] flex-col border-r border-white/10 bg-black/20">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-7">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-300 text-black">
          <div className="h-4 w-4 rounded-full border-2 border-black/70" />
        </div>
        <div className="text-xl font-semibold tracking-wide text-white">PORTFOLIO OS</div>
      </div>

      <div className="flex-1 px-3 py-5">
        <div className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setRoute(item.id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition",
                  active ? "bg-blue-500/15 text-white shadow-[inset_0_0_0_1px_rgba(80,160,255,0.18)]" : "text-slate-300 hover:bg-white/[0.05]"
                )}
              >
                <Icon className={cx("h-5 w-5", active ? "text-blue-300" : "text-slate-400")} />
                <span className="text-[15px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-white/10 p-4">
        <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-slate-300 hover:bg-white/[0.05]">
          <ChevronLeft className="h-5 w-5 text-slate-400" />
          <span>Collapse</span>
        </button>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
      <div className="flex flex-wrap gap-3">
        <TopSelect label="Time Period" value="YTD 2024" />
        <TopSelect label="View" value="Capital Flow Odyssey" />
        <TopSelect label="Currency" value="USD" />
        <TopSelect label="Entity" value="All Portfolios" />
      </div>
      <div className="flex items-center gap-4">
        <button className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300"><CircleHelp className="h-5 w-5" /></button>
        <button className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300"><Bell className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <ShellCard className="p-10">
      <div className="text-3xl font-semibold text-white">{title}</div>
      <div className="mt-3 max-w-2xl text-slate-400">Scaffold snapshot export.</div>
    </ShellCard>
  );
}

export default function PortfolioOSOdysseyV2Scaffold() {
  const [route, setRoute] = useState("flows");

  const content = useMemo(() => <PlaceholderScreen title={route} />, [route]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#031022_0%,#020816_38%,#01050d_100%)] text-white">
      <div className="flex min-h-screen">
        <Sidebar route={route} setRoute={setRoute} />
        <div className="flex-1">
          <TopBar />
          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.div key={route} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
                {content}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
