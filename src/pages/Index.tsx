import { useState } from "react";
import GeometryDash from "@/components/GeometryDash";
import ShooterGame from "@/components/ShooterGame";

export default function Index() {
  const [game, setGame] = useState<"menu" | "geo" | "shooter">("menu");

  if (game === "geo") return <GeometryDash onBack={() => setGame("menu")} />;
  if (game === "shooter") return <ShooterGame />;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, #1a0050 0%, #06000f 100%)",
      fontFamily: "'Orbitron', monospace",
    }}>
      <div style={{
        fontSize: "clamp(22px, 4vw, 46px)", fontWeight: 900,
        background: "linear-gradient(135deg, #44aaff 0%, #ff44cc 50%, #cc44ff 100%)",
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        marginBottom: 12, letterSpacing: "0.1em",
        animation: "shimmer 3s linear infinite",
      }}>
        GAME ARCADE
      </div>
      <div style={{ color: "#5544aa", fontSize: 13, marginBottom: 52, letterSpacing: "0.2em" }}>
        ВЫБЕРИ ИГРУ
      </div>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Geometry Dash */}
        <button onClick={() => setGame("geo")} style={{
          fontFamily: "'Orbitron', monospace", background: "transparent",
          border: "2px solid #44aaff", borderRadius: 14, padding: "32px 36px",
          cursor: "pointer", color: "#44aaff", textAlign: "center",
          minWidth: 200, transition: "all 0.2s",
          boxShadow: "0 0 0 rgba(68,170,255,0)",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 30px rgba(68,170,255,0.4)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(68,170,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 rgba(68,170,255,0)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🟦</div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>GEOMETRY DASH</div>
          <div style={{ fontSize: 11, color: "#4466aa", lineHeight: 1.6 }}>
            Прыгай через препятствия<br />3 уровня · своя музыка
          </div>
        </button>

        {/* Shooter */}
        <button onClick={() => setGame("shooter")} style={{
          fontFamily: "'Orbitron', monospace", background: "transparent",
          border: "2px solid #cc44ff", borderRadius: 14, padding: "32px 36px",
          cursor: "pointer", color: "#cc44ff", textAlign: "center",
          minWidth: 200, transition: "all 0.2s",
          boxShadow: "0 0 0 rgba(200,68,255,0)",
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 30px rgba(200,68,255,0.4)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(200,68,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 rgba(200,68,255,0)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔫</div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8 }}>NEON STRIKE</div>
          <div style={{ fontSize: 11, color: "#8844aa", lineHeight: 1.6 }}>
            3D шутер от первого лица<br />Волны врагов · арена
          </div>
        </button>
      </div>

      <style>{`
        @keyframes shimmer { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }
      `}</style>
    </div>
  );
}
