import React, { useMemo } from "react";

export default function PortfolioOSOdysseyDataDriven() {
  const data = useMemo(() => ({
    stages: ["sources", "allocation", "activity", "outcomes", "results"],
    title: "Capital Flow Odyssey",
    subtitle: "Data-driven snapshot",
  }), []);

  return (
    <div style={{ minHeight: "100vh", background: "#020816", color: "white", padding: 24 }}>
      <h1>{data.title}</h1>
      <p>{data.subtitle}</p>
      <pre style={{ background: "#081223", padding: 16, borderRadius: 12 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
