import { useEffect, useRef, useState, useCallback } from "react";

const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const PLAYER_SIZE = 40;
const GROUND_Y = 400;
const SPEED = 6;
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;

type Obstacle = {
  x: number;
  type: "spike" | "block" | "doubleSpike";
  width: number;
  height: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

function generateObstacle(x: number): Obstacle {
  const types: Obstacle["type"][] = ["spike", "block", "doubleSpike"];
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === "spike") return { x, type, width: 40, height: 40 };
  if (type === "doubleSpike") return { x, type, width: 80, height: 40 };
  return { x, type, width: 40, height: 60 };
}

function generateLevel(): Obstacle[] {
  const obstacles: Obstacle[] = [];
  let x = 700;
  for (let i = 0; i < 200; i++) {
    obstacles.push(generateObstacle(x));
    x += 200 + Math.random() * 250;
  }
  return obstacles;
}

function createAudioContext() {
  const W = window as Window & { webkitAudioContext?: typeof AudioContext };
  return new (W.AudioContext || W.webkitAudioContext!)();
}

function playJumpSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

function playDeathSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

function playBgMusic(ctx: AudioContext) {
  const melody = [392, 440, 494, 523, 587, 523, 494, 440, 392, 349, 330, 349, 392, 440, 494, 523];
  const noteDur = 0.16;
  melody.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * noteDur;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.02);
    gain.gain.linearRampToValueAtTime(0.03, t + noteDur - 0.02);
    gain.gain.linearRampToValueAtTime(0, t + noteDur);
    osc.start(t);
    osc.stop(t + noteDur);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gs = useRef({
    playerY: GROUND_Y - PLAYER_SIZE,
    playerVY: 0,
    isOnGround: true,
    isAlive: true,
    score: 0,
    bgOffset: 0,
    rotation: 0,
    obstacles: generateLevel(),
    particles: [] as Particle[],
    bestScore: 0,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [gameStatus, setGameStatus] = useState<"menu" | "playing" | "dead">("menu");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const animRef = useRef<number>(0);
  const statusRef = useRef<"menu" | "playing" | "dead">("menu");
  const timeRef = useRef(0);

  const jump = useCallback(() => {
    if (gs.current.isOnGround) {
      gs.current.playerVY = JUMP_FORCE;
      gs.current.isOnGround = false;
      if (audioCtxRef.current) playJumpSound(audioCtxRef.current);
    }
  }, []);

  const startGame = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioContext();
    const g = gs.current;
    g.playerY = GROUND_Y - PLAYER_SIZE;
    g.playerVY = 0;
    g.isOnGround = true;
    g.isAlive = true;
    g.score = 0;
    g.bgOffset = 0;
    g.rotation = 0;
    g.obstacles = generateLevel();
    g.particles = [];
    statusRef.current = "playing";
    setGameStatus("playing");
    setScore(0);
    playBgMusic(audioCtxRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const PLAYER_X = 150;

    const drawPlayer = (x: number, y: number, rot: number) => {
      ctx.save();
      ctx.translate(x + PLAYER_SIZE / 2, y + PLAYER_SIZE / 2);
      ctx.rotate(rot);
      ctx.shadowColor = "#4aaff0";
      ctx.shadowBlur = 22;
      const g = ctx.createLinearGradient(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE / 2, PLAYER_SIZE / 2);
      g.addColorStop(0, "#22aaff");
      g.addColorStop(1, "#0044cc");
      ctx.fillStyle = g;
      ctx.strokeStyle = "#88ddff";
      ctx.lineWidth = 2;
      roundRect(ctx, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 7);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(11, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-11, 0);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-15, -15);
      ctx.lineTo(3, -15);
      ctx.lineTo(-15, 3);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fill();
      ctx.restore();
    };

    const drawSpike = (x: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const sx = x + i * 40;
        ctx.save();
        ctx.shadowColor = "#ff44cc";
        ctx.shadowBlur = 16;
        const g = ctx.createLinearGradient(sx, GROUND_Y, sx + 20, GROUND_Y - 40);
        g.addColorStop(0, "#bb0077");
        g.addColorStop(1, "#ff55dd");
        ctx.fillStyle = g;
        ctx.strokeStyle = "#ff88ee";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, GROUND_Y);
        ctx.lineTo(sx + 20, GROUND_Y - 40);
        ctx.lineTo(sx + 40, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    };

    const drawBlock = (x: number, height: number) => {
      ctx.save();
      ctx.shadowColor = "#ff44cc";
      ctx.shadowBlur = 14;
      const g = ctx.createLinearGradient(x, GROUND_Y - height, x + 40, GROUND_Y);
      g.addColorStop(0, "#990077");
      g.addColorStop(1, "#550044");
      ctx.fillStyle = g;
      ctx.strokeStyle = "#ff66cc";
      ctx.lineWidth = 2;
      roundRect(ctx, x, GROUND_Y - height, 40, height, 4);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,100,200,0.18)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - height + i * (height / 3));
        ctx.lineTo(x + 40, GROUND_Y - height + i * (height / 3));
        ctx.stroke();
      }
      ctx.restore();
    };

    const loop = (ts: number) => {
      timeRef.current = ts;
      const g = gs.current;

      if (statusRef.current === "playing" && g.isAlive) {
        g.playerVY += GRAVITY;
        g.playerY += g.playerVY;
        g.bgOffset += SPEED;

        if (!g.isOnGround) g.rotation += 0.1;

        if (g.playerY >= GROUND_Y - PLAYER_SIZE) {
          g.playerY = GROUND_Y - PLAYER_SIZE;
          g.playerVY = 0;
          g.isOnGround = true;
        } else {
          g.isOnGround = false;
        }

        g.score = Math.floor(g.bgOffset / 100);
        setScore(g.score);

        for (const obs of g.obstacles) {
          const sx = obs.x - g.bgOffset;
          if (sx + obs.width < 0) continue;
          if (sx > CANVAS_WIDTH) break;

          let hit = false;
          if (obs.type === "spike" || obs.type === "doubleSpike") {
            const count = obs.type === "doubleSpike" ? 2 : 1;
            for (let i = 0; i < count; i++) {
              const tx = sx + i * 40;
              if (
                PLAYER_X + PLAYER_SIZE - 5 > tx + 4 &&
                PLAYER_X + 5 < tx + 36 &&
                g.playerY + PLAYER_SIZE > GROUND_Y - 38 &&
                g.playerY + PLAYER_SIZE <= GROUND_Y + 2
              ) {
                const relX = Math.abs((PLAYER_X + PLAYER_SIZE / 2) - (tx + 20));
                const tH = 38 - relX * 1.9;
                if (tH > 0 && g.playerY + PLAYER_SIZE > GROUND_Y - tH + 4) hit = true;
              }
            }
          } else {
            if (
              PLAYER_X + PLAYER_SIZE - 5 > sx + 4 &&
              PLAYER_X + 5 < sx + 36 &&
              g.playerY + PLAYER_SIZE > GROUND_Y - obs.height + 4 &&
              g.playerY < GROUND_Y
            ) hit = true;
          }

          if (hit) {
            g.isAlive = false;
            const colors = ["#4af", "#f4a", "#fa4", "#fff", "#a4f"];
            for (let i = 0; i < 20; i++) {
              g.particles.push({
                x: PLAYER_X + PLAYER_SIZE / 2,
                y: g.playerY + PLAYER_SIZE / 2,
                vx: (Math.random() - 0.5) * 11,
                vy: (Math.random() - 0.5) * 11 - 3,
                life: 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 3 + Math.random() * 5,
              });
            }
            if (g.score > g.bestScore) {
              g.bestScore = g.score;
              setBestScore(g.score);
            }
            if (audioCtxRef.current) playDeathSound(audioCtxRef.current);
            statusRef.current = "dead";
            setGameStatus("dead");
          }
        }
      }

      g.particles = g.particles.filter(p => p.life > 0);
      for (const p of g.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.28;
        p.life -= 0.028;
      }

      // Background
      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      sky.addColorStop(0, "#08001a");
      sky.addColorStop(0.65, "#0d0035");
      sky.addColorStop(1, "#1a0055");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Stars
      for (let i = 0; i < 70; i++) {
        const sx = ((i * 131 - g.bgOffset * 0.08) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
        const sy = (i * 71) % (GROUND_Y - 30);
        const alpha = 0.35 + (Math.sin(ts * 0.002 + i) + 1) * 0.28;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
      }

      // Grid
      ctx.strokeStyle = "rgba(80,40,180,0.13)";
      ctx.lineWidth = 1;
      const gSize = 60;
      const gOff = g.bgOffset % gSize;
      for (let x = -gOff; x < CANVAS_WIDTH; x += gSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GROUND_Y); ctx.stroke();
      }
      for (let y = 0; y < GROUND_Y; y += gSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
      }

      // Ground
      const groundG = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
      groundG.addColorStop(0, "#180050");
      groundG.addColorStop(1, "#080020");
      ctx.fillStyle = groundG;
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
      ctx.save();
      ctx.shadowColor = "#4af";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#44aaff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(CANVAS_WIDTH, GROUND_Y); ctx.stroke();
      ctx.restore();
      const tileW = 60;
      const tileOff = g.bgOffset % tileW;
      ctx.strokeStyle = "rgba(70,160,255,0.18)";
      ctx.lineWidth = 1;
      for (let x = -tileOff; x < CANVAS_WIDTH; x += tileW) {
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
      }

      // Obstacles
      for (const obs of g.obstacles) {
        const sx = obs.x - g.bgOffset;
        if (sx + obs.width < -10) continue;
        if (sx > CANVAS_WIDTH + 10) break;
        if (obs.type === "spike") drawSpike(sx, 1);
        else if (obs.type === "doubleSpike") drawSpike(sx, 2);
        else drawBlock(sx, obs.height);
      }

      // Player
      if (g.isAlive) drawPlayer(PLAYER_X, g.playerY, g.rotation);

      // Particles
      for (const p of g.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 9;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.restore();
      }

      // Score HUD
      if (statusRef.current === "playing") {
        ctx.save();
        ctx.font = "bold 22px Orbitron, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#4af";
        ctx.shadowBlur = 12;
        ctx.textAlign = "right";
        ctx.fillText(String(g.score), CANVAS_WIDTH - 24, 38);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (statusRef.current === "playing") jump();
        else startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, startGame]);

  const handleClick = () => {
    if (statusRef.current === "playing") jump();
    else startGame();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center select-none"
      style={{ background: "radial-gradient(ellipse at center, #1a0050 0%, #06000f 100%)" }}
    >
      <h1
        style={{
          fontFamily: "'Orbitron', monospace",
          fontSize: "clamp(20px, 3.5vw, 40px)",
          fontWeight: 900,
          background: "linear-gradient(135deg, #44aaff 0%, #ff44cc 50%, #44aaff 100%)",
          backgroundSize: "200% auto",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          marginBottom: "16px",
          letterSpacing: "0.1em",
          animation: "shimmer 3s linear infinite",
        }}
      >
        GEOMETRY DASH
      </h1>

      <div
        style={{
          position: "relative",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 0 50px rgba(80,160,255,0.35), 0 0 100px rgba(255,80,200,0.15), 0 0 0 2px rgba(80,160,255,0.25)",
          maxWidth: "100vw",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleClick}
          style={{ display: "block", cursor: "pointer", maxWidth: "100%", height: "auto" }}
        />

        {gameStatus === "menu" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(4,0,18,0.86)", backdropFilter: "blur(6px)" }}
          >
            <div style={{ fontFamily: "'Orbitron', monospace", fontSize: "clamp(28px, 5vw, 56px)", fontWeight: 900, background: "linear-gradient(135deg, #44aaff, #ff44cc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: "10px" }}>
              GEOMETRY DASH
            </div>
            <div style={{ color: "#7799dd", fontSize: "16px", marginBottom: "44px", fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Browser Edition
            </div>
            {bestScore > 0 && (
              <div style={{ color: "#ff88ee", fontSize: "15px", marginBottom: "20px", fontFamily: "'Rajdhani', sans-serif" }}>
                Рекорд: {bestScore}
              </div>
            )}
            <button onClick={startGame} style={{ fontFamily: "'Orbitron', monospace", fontSize: "17px", fontWeight: 700, color: "#020010", background: "linear-gradient(135deg, #44aaff, #0066ee)", border: "none", borderRadius: "8px", padding: "14px 52px", cursor: "pointer", boxShadow: "0 0 28px rgba(70,170,255,0.55)", letterSpacing: "0.1em" }}>
              ИГРАТЬ
            </button>
            <div style={{ color: "#334466", fontSize: "13px", marginTop: "22px", fontFamily: "'Rajdhani', sans-serif" }}>
              ПРОБЕЛ / КЛИК — прыжок
            </div>
          </div>
        )}

        {gameStatus === "dead" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(16,0,8,0.88)", backdropFilter: "blur(6px)" }}
          >
            <div style={{ fontFamily: "'Orbitron', monospace", fontSize: "clamp(28px, 4.5vw, 46px)", fontWeight: 900, color: "#ff3388", textShadow: "0 0 24px #ff3388, 0 0 50px #ff3388", marginBottom: "16px" }}>
              ПРОВАЛ
            </div>
            <div style={{ color: "#fff", fontSize: "22px", fontFamily: "'Rajdhani', sans-serif", marginBottom: "6px" }}>
              Счёт: <span style={{ color: "#44aaff" }}>{score}</span>
            </div>
            <div style={{ color: "#ff88cc", fontSize: "16px", fontFamily: "'Rajdhani', sans-serif", marginBottom: "38px" }}>
              Рекорд: {Math.max(score, bestScore)}
            </div>
            <button onClick={startGame} style={{ fontFamily: "'Orbitron', monospace", fontSize: "15px", fontWeight: 700, color: "#0a0020", background: "linear-gradient(135deg, #ff44cc, #aa0077)", border: "none", borderRadius: "8px", padding: "13px 44px", cursor: "pointer", boxShadow: "0 0 28px rgba(255,70,200,0.5)", letterSpacing: "0.1em" }}>
              ЕЩЁ РАЗ
            </button>
          </div>
        )}
      </div>

      {gameStatus === "playing" && (
        <div style={{ color: "#2a3a55", fontSize: "12px", marginTop: "14px", fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.1em" }}>
          ПРОБЕЛ / КЛИК — прыжок • Избегай шипов и блоков
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
}