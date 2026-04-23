import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "lighter";

    const flows = [
      { y: -120, color: "#6cff8f", strength: 1.2 },
      { y: -60, color: "#4db3ff", strength: 1.0 },
      { y: 0, color: "#66ffdd", strength: 0.9 },
      { y: 60, color: "#ffaa33", strength: 0.8 },
      { y: 120, color: "#cc66ff", strength: 0.7 },
    ];

    flows.forEach((flow) => {
      const strands = 1400;

      for (let i = 0; i < strands; i++) {
        const offset = (i - strands / 2) * 0.15;

        ctx.beginPath();

        for (let t = 0; t <= 1; t += 0.015) {
          const x = lerp(200, canvas.width - 200, t);

          const compression = Math.pow(Math.sin(t * Math.PI), 2);

          const y =
            canvas.height / 2 +
            flow.y +
            offset * (1 - compression * 0.95) +
            Math.sin(i * 0.01) * 2;

          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = flow.color;
        ctx.globalAlpha = 0.015 * flow.strength;
        ctx.lineWidth = 1;

        ctx.stroke();
      }
    });
  }, []);

  return (
    <div style={{ background: "#05070d", height: "100vh", width: "100vw" }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />

      {/* FLOATING NODES */}
      <div style={nodeStyle(220, "30%")}>
        TOTAL CONTRIBUTIONS<br />$87.4M
      </div>

      <div style={nodeStyle("75%", "35%")}>
        Growth Fund A<br />$24.1M
      </div>

      <div style={nodeStyle("75%", "50%")}>
        Value Fund B<br />$21.8M
      </div>

      <div style={nodeStyle("75%", "65%")}>
        International C<br />$17.3M
      </div>
    </div>
  );
}

function nodeStyle(left: any, top: any) {
  return {
    position: "absolute" as const,
    left,
    top,
    transform: "translate(-50%, -50%)",
    padding: "14px 18px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "white",
    fontFamily: "sans-serif",
    fontSize: "14px",
    backdropFilter: "blur(10px)",
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);