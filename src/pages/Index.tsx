import { useEffect, useRef, useState, useCallback } from "react";

const GRAVITY = 0.55;
const JUMP_FORCE = -12.5;
const PLAYER_SIZE = 40;
const GROUND_Y = 400;
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;

// --- LEVEL CONFIG ---
type LevelConfig = {
  id: number;
  name: string;
  speed: number;
  bgColors: [string, string, string];
  groundColor: [string, string];
  glowColor: string;
  starColor: string;
  obstacleColor: [string, string];
  obstacleStroke: string;
  groundLineColor: string;
  gridColor: string;
  minGap: number;
  maxGap: number;
  musicScale: number[];
  musicTempo: number;
  musicType: OscillatorType;
  musicVolume: number;
};

const LEVELS: LevelConfig[] = [
  {
    id: 1,
    name: "STEREO MADNESS",
    speed: 4,
    bgColors: ["#08001a", "#0d0035", "#1a0055"],
    groundColor: ["#180050", "#080020"],
    glowColor: "#44aaff",
    starColor: "rgba(255,255,255,",
    obstacleColor: ["#bb0077", "#ff55dd"],
    obstacleStroke: "#ff88ee",
    groundLineColor: "#44aaff",
    gridColor: "rgba(80,40,180,0.13)",
    minGap: 260,
    maxGap: 340,
    musicScale: [392, 440, 494, 523, 587, 523, 494, 440, 392, 349, 330, 349, 392, 440, 494, 523],
    musicTempo: 0.18,
    musicType: "square",
    musicVolume: 0.055,
  },
  {
    id: 2,
    name: "BASE AFTER BASE",
    speed: 5,
    bgColors: ["#001510", "#003322", "#004433"],
    groundColor: ["#002200", "#001100"],
    glowColor: "#00ff88",
    starColor: "rgba(100,255,180,",
    obstacleColor: ["#007744", "#00ffaa"],
    obstacleStroke: "#55ffcc",
    groundLineColor: "#00dd66",
    gridColor: "rgba(0,180,80,0.12)",
    minGap: 210,
    maxGap: 290,
    musicScale: [330, 370, 415, 440, 494, 440, 415, 370, 330, 294, 262, 294, 330, 370, 415, 440],
    musicTempo: 0.15,
    musicType: "triangle",
    musicVolume: 0.07,
  },
  {
    id: 3,
    name: "CANT LET GO",
    speed: 6,
    bgColors: ["#1a0800", "#330d00", "#4a1500"],
    groundColor: ["#330800", "#1a0200"],
    glowColor: "#ff6600",
    starColor: "rgba(255,200,100,",
    obstacleColor: ["#cc3300", "#ff7733"],
    obstacleStroke: "#ffaa55",
    groundLineColor: "#ff6600",
    gridColor: "rgba(200,80,0,0.13)",
    minGap: 170,
    maxGap: 250,
    musicScale: [523, 587, 659, 698, 784, 698, 659, 587, 523, 466, 415, 466, 523, 587, 659, 698],
    musicTempo: 0.13,
    musicType: "sawtooth",
    musicVolume: 0.05,
  },
];

type Obstacle = {
  x: number;
  type: "spike" | "block" | "doubleSpike";
  width: number;
  height: number;
};

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  color: string;
  size: number;
};

function generateLevel(cfg: LevelConfig): Obstacle[] {
  const obstacles: Obstacle[] = [];
  let x = 700;
  const types: Obstacle["type"][] = ["spike", "block", "doubleSpike"];
  for (let i = 0; i < 200; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    if (type === "spike") obstacles.push({ x, type, width: 40, height: 40 });
    else if (type === "doubleSpike") obstacles.push({ x, type, width: 80, height: 40 });
    else obstacles.push({ x, type, width: 40, height: 55 + Math.random() * 20 });
    x += cfg.minGap + Math.random() * (cfg.maxGap - cfg.minGap);
  }
  return obstacles;
}

function createAudioContext() {
  const W = window as Window & { webkitAudioContext?: typeof AudioContext };
  return new (W.AudioContext || W.webkitAudioContext!)();
}

function playJumpSound(ctx: AudioContext, glowColor: string) {
  const freq = glowColor === "#00ff88" ? 660 : glowColor === "#ff6600" ? 550 : 880;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(freq * 0.5, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.14);
}

function playDeathSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(380, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.45);
  gain.gain.setValueAtTime(0.22, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45);
}

function playLevelMusic(ctx: AudioContext, cfg: LevelConfig) {
  cfg.musicScale.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = cfg.musicType;
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * cfg.musicTempo;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(cfg.musicVolume, t + 0.02);
    gain.gain.linearRampToValueAtTime(cfg.musicVolume * 0.6, t + cfg.musicTempo - 0.02);
    gain.gain.linearRampToValueAtTime(0, t + cfg.musicTempo);
    osc.start(t); osc.stop(t + cfg.musicTempo);

    // bass note every 4 beats
    if (i % 4 === 0) {
      const bass = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bass.connect(bassGain); bassGain.connect(ctx.destination);
      bass.type = "sine";
      bass.frequency.value = freq / 2;
      bassGain.gain.setValueAtTime(0, t);
      bassGain.gain.linearRampToValueAtTime(cfg.musicVolume * 0.8, t + 0.01);
      bassGain.gain.linearRampToValueAtTime(0, t + cfg.musicTempo * 2);
      bass.start(t); bass.stop(t + cfg.musicTempo * 2);
    }
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
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
    obstacles: [] as Obstacle[],
    particles: [] as Particle[],
    bestScores: [0, 0, 0],
    currentLevel: 0,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [gameStatus, setGameStatus] = useState<"menu" | "playing" | "dead">("menu");
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState([0, 0, 0]);
  const animRef = useRef<number>(0);
  const statusRef = useRef<"menu" | "playing" | "dead">("menu");

  const jump = useCallback(() => {
    const g = gs.current;
    if (g.isOnGround) {
      g.playerVY = JUMP_FORCE;
      g.isOnGround = false;
      const cfg = LEVELS[g.currentLevel];
      if (audioCtxRef.current) playJumpSound(audioCtxRef.current, cfg.glowColor);
    }
  }, []);

  const startGame = useCallback((levelIdx: number) => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioContext();
    const g = gs.current;
    const cfg = LEVELS[levelIdx];
    g.playerY = GROUND_Y - PLAYER_SIZE;
    g.playerVY = 0;
    g.isOnGround = true;
    g.isAlive = true;
    g.score = 0;
    g.bgOffset = 0;
    g.rotation = 0;
    g.obstacles = generateLevel(cfg);
    g.particles = [];
    g.currentLevel = levelIdx;
    statusRef.current = "playing";
    setGameStatus("playing");
    setScore(0);
    playLevelMusic(audioCtxRef.current, cfg);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const PLAYER_X = 150;

    const drawPlayer = (x: number, y: number, rot: number, cfg: LevelConfig) => {
      ctx.save();
      ctx.translate(x + PLAYER_SIZE / 2, y + PLAYER_SIZE / 2);
      ctx.rotate(rot);
      ctx.shadowColor = cfg.glowColor;
      ctx.shadowBlur = 24;
      const grad = ctx.createLinearGradient(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE / 2, PLAYER_SIZE / 2);
      // Level-specific cube color
      if (cfg.id === 1) { grad.addColorStop(0, "#22aaff"); grad.addColorStop(1, "#0044cc"); }
      else if (cfg.id === 2) { grad.addColorStop(0, "#00ff99"); grad.addColorStop(1, "#007744"); }
      else { grad.addColorStop(0, "#ff8833"); grad.addColorStop(1, "#cc3300"); }
      ctx.fillStyle = grad;
      ctx.strokeStyle = cfg.glowColor;
      ctx.lineWidth = 2;
      roundRect(ctx, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 7);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(11, 0); ctx.lineTo(0, 11); ctx.lineTo(-11, 0);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-15, -15); ctx.lineTo(3, -15); ctx.lineTo(-15, 3);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fill();
      ctx.restore();
    };

    const drawSpike = (x: number, count: number, cfg: LevelConfig) => {
      for (let i = 0; i < count; i++) {
        const sx = x + i * 40;
        ctx.save();
        ctx.shadowColor = cfg.obstacleColor[1];
        ctx.shadowBlur = 16;
        const g = ctx.createLinearGradient(sx, GROUND_Y, sx + 20, GROUND_Y - 40);
        g.addColorStop(0, cfg.obstacleColor[0]);
        g.addColorStop(1, cfg.obstacleColor[1]);
        ctx.fillStyle = g;
        ctx.strokeStyle = cfg.obstacleStroke;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, GROUND_Y);
        ctx.lineTo(sx + 20, GROUND_Y - 40);
        ctx.lineTo(sx + 40, GROUND_Y);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    };

    const drawBlock = (x: number, height: number, cfg: LevelConfig) => {
      ctx.save();
      ctx.shadowColor = cfg.obstacleColor[1];
      ctx.shadowBlur = 14;
      const g = ctx.createLinearGradient(x, GROUND_Y - height, x + 40, GROUND_Y);
      g.addColorStop(0, cfg.obstacleColor[0]);
      g.addColorStop(1, cfg.obstacleColor[0] + "99");
      ctx.fillStyle = g;
      ctx.strokeStyle = cfg.obstacleStroke;
      ctx.lineWidth = 2;
      roundRect(ctx, x, GROUND_Y - height, 40, height, 4);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = cfg.obstacleStroke + "33";
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
      const g = gs.current;
      const cfg = LEVELS[g.currentLevel];

      if (statusRef.current === "playing" && g.isAlive) {
        g.playerVY += GRAVITY;
        g.playerY += g.playerVY;
        g.bgOffset += cfg.speed;

        if (!g.isOnGround) g.rotation += 0.09;

        if (g.playerY >= GROUND_Y - PLAYER_SIZE) {
          g.playerY = GROUND_Y - PLAYER_SIZE;
          g.playerVY = 0;
          g.isOnGround = true;
        } else {
          g.isOnGround = false;
        }

        g.score = Math.floor(g.bgOffset / 100);
        setScore(g.score);

        // Collision
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
            const colors = [cfg.glowColor, cfg.obstacleColor[1], "#fff", "#ffff44", cfg.obstacleColor[0]];
            for (let i = 0; i < 22; i++) {
              g.particles.push({
                x: PLAYER_X + PLAYER_SIZE / 2, y: g.playerY + PLAYER_SIZE / 2,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12 - 3,
                life: 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 3 + Math.random() * 5,
              });
            }
            const lvl = g.currentLevel;
            if (g.score > g.bestScores[lvl]) {
              g.bestScores[lvl] = g.score;
              setBestScores([...g.bestScores]);
            }
            if (audioCtxRef.current) playDeathSound(audioCtxRef.current);
            statusRef.current = "dead";
            setGameStatus("dead");
          }
        }
      }

      // Particles
      g.particles = g.particles.filter(p => p.life > 0);
      for (const p of g.particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.life -= 0.028;
      }

      // --- DRAW ---
      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      sky.addColorStop(0, cfg.bgColors[0]);
      sky.addColorStop(0.65, cfg.bgColors[1]);
      sky.addColorStop(1, cfg.bgColors[2]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Stars / particles bg
      for (let i = 0; i < 65; i++) {
        const sx = ((i * 131 - g.bgOffset * 0.07) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH;
        const sy = (i * 71) % (GROUND_Y - 30);
        const alpha = 0.3 + (Math.sin(ts * 0.002 + i) + 1) * 0.27;
        ctx.fillStyle = cfg.starColor + alpha + ")";
        ctx.fillRect(sx, sy, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
      }

      // Grid
      ctx.strokeStyle = cfg.gridColor;
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
      groundG.addColorStop(0, cfg.groundColor[0]);
      groundG.addColorStop(1, cfg.groundColor[1]);
      ctx.fillStyle = groundG;
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
      ctx.save();
      ctx.shadowColor = cfg.groundLineColor;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = cfg.groundLineColor;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(CANVAS_WIDTH, GROUND_Y); ctx.stroke();
      ctx.restore();
      const tileW = 60;
      const tileOff = g.bgOffset % tileW;
      ctx.strokeStyle = cfg.groundLineColor + "30";
      ctx.lineWidth = 1;
      for (let x = -tileOff; x < CANVAS_WIDTH; x += tileW) {
        ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
      }

      // Obstacles
      for (const obs of g.obstacles) {
        const sx = obs.x - g.bgOffset;
        if (sx + obs.width < -10) continue;
        if (sx > CANVAS_WIDTH + 10) break;
        if (obs.type === "spike") drawSpike(sx, 1, cfg);
        else if (obs.type === "doubleSpike") drawSpike(sx, 2, cfg);
        else drawBlock(sx, obs.height, cfg);
      }

      // Player
      if (g.isAlive) drawPlayer(PLAYER_X, g.playerY, g.rotation, cfg);

      // Particles
      for (const p of g.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.restore();
      }

      // HUD
      if (statusRef.current === "playing") {
        ctx.save();
        ctx.font = "bold 14px Orbitron, monospace";
        ctx.fillStyle = cfg.glowColor;
        ctx.shadowColor = cfg.glowColor;
        ctx.shadowBlur = 10;
        ctx.textAlign = "left";
        ctx.fillText(cfg.name, 20, 30);
        ctx.font = "bold 22px Orbitron, monospace";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = cfg.glowColor;
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
        else if (statusRef.current === "menu") startGame(selectedLevel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, startGame, selectedLevel]);

  const handleClick = () => {
    if (statusRef.current === "playing") jump();
  };

  const levelColors = [
    { glow: "#44aaff", btn: "linear-gradient(135deg, #44aaff, #0066ee)", text: "#0a001a" },
    { glow: "#00ff88", btn: "linear-gradient(135deg, #00ff88, #007744)", text: "#001a0a" },
    { glow: "#ff6600", btn: "linear-gradient(135deg, #ff8833, #cc3300)", text: "#1a0500" },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center select-none"
      style={{ background: "radial-gradient(ellipse at center, #1a0050 0%, #06000f 100%)" }}
    >
      <h1 style={{
        fontFamily: "'Orbitron', monospace",
        fontSize: "clamp(18px, 3vw, 38px)",
        fontWeight: 900,
        background: "linear-gradient(135deg, #44aaff 0%, #ff44cc 50%, #44aaff 100%)",
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        marginBottom: "14px",
        letterSpacing: "0.1em",
        animation: "shimmer 3s linear infinite",
      }}>
        GEOMETRY DASH
      </h1>

      <div style={{ position: "relative", borderRadius: "14px", overflow: "hidden",
        boxShadow: "0 0 50px rgba(80,160,255,0.3), 0 0 100px rgba(255,80,200,0.12), 0 0 0 2px rgba(80,160,255,0.2)", maxWidth: "100vw" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleClick}
          style={{ display: "block", cursor: "pointer", maxWidth: "100%", height: "auto" }}
        />

        {/* MENU */}
        {gameStatus === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: "rgba(4,0,18,0.88)", backdropFilter: "blur(8px)" }}>
            <div style={{ fontFamily: "'Orbitron', monospace", fontSize: "clamp(24px, 4.5vw, 50px)", fontWeight: 900,
              background: "linear-gradient(135deg, #44aaff, #ff44cc)", WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: "8px" }}>
              GEOMETRY DASH
            </div>
            <div style={{ color: "#7799dd", fontSize: "14px", marginBottom: "32px", fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.18em" }}>
              ВЫБЕРИ УРОВЕНЬ
            </div>

            <div style={{ display: "flex", gap: "16px", marginBottom: "32px", flexWrap: "wrap", justifyContent: "center" }}>
              {LEVELS.map((lvl, i) => {
                const lc = levelColors[i];
                const isSelected = selectedLevel === i;
                return (
                  <button key={lvl.id} onClick={() => setSelectedLevel(i)}
                    style={{
                      fontFamily: "'Orbitron', monospace", fontSize: "11px", fontWeight: 700,
                      color: isSelected ? lc.text : lc.glow,
                      background: isSelected ? lc.btn : "transparent",
                      border: `2px solid ${lc.glow}`,
                      borderRadius: "8px", padding: "12px 18px", cursor: "pointer",
                      boxShadow: isSelected ? `0 0 24px ${lc.glow}66` : "none",
                      transition: "all 0.2s",
                      letterSpacing: "0.06em",
                      textAlign: "center" as const,
                      minWidth: "130px",
                    }}>
                    <div style={{ fontSize: "18px", marginBottom: "4px" }}>
                      {i === 0 ? "①" : i === 1 ? "②" : "③"}
                    </div>
                    <div>{lvl.name}</div>
                    <div style={{ fontSize: "10px", opacity: 0.7, marginTop: "4px", color: isSelected ? lc.text : "#aaa" }}>
                      Скорость: {lvl.speed === 4 ? "★☆☆" : lvl.speed === 5 ? "★★☆" : "★★★"}
                    </div>
                    {bestScores[i] > 0 && (
                      <div style={{ fontSize: "9px", marginTop: "3px", opacity: 0.8 }}>
                        Рекорд: {bestScores[i]}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button onClick={() => startGame(selectedLevel)}
              style={{
                fontFamily: "'Orbitron', monospace", fontSize: "17px", fontWeight: 700,
                color: levelColors[selectedLevel].text,
                background: levelColors[selectedLevel].btn,
                border: "none", borderRadius: "8px", padding: "14px 52px", cursor: "pointer",
                boxShadow: `0 0 30px ${levelColors[selectedLevel].glow}88`,
                letterSpacing: "0.1em",
              }}>
              ИГРАТЬ
            </button>
            <div style={{ color: "#334466", fontSize: "12px", marginTop: "18px", fontFamily: "'Rajdhani', sans-serif" }}>
              ПРОБЕЛ / КЛИК — прыжок
            </div>
          </div>
        )}

        {/* DEAD */}
        {gameStatus === "dead" && (() => {
          const lvl = gs.current.currentLevel;
          const lc = levelColors[lvl];
          return (
            <div className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ background: "rgba(10,0,6,0.9)", backdropFilter: "blur(6px)" }}>
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: "clamp(26px, 4vw, 44px)", fontWeight: 900,
                color: "#ff3366", textShadow: "0 0 22px #ff3366, 0 0 50px #ff3366", marginBottom: "12px" }}>
                ПРОВАЛ
              </div>
              <div style={{ color: "#aaa", fontSize: "14px", fontFamily: "'Rajdhani', sans-serif", marginBottom: "4px", letterSpacing: "0.1em" }}>
                {LEVELS[lvl].name}
              </div>
              <div style={{ color: "#fff", fontSize: "22px", fontFamily: "'Rajdhani', sans-serif", marginBottom: "4px" }}>
                Счёт: <span style={{ color: lc.glow }}>{score}</span>
              </div>
              <div style={{ color: lc.glow, fontSize: "15px", fontFamily: "'Rajdhani', sans-serif", marginBottom: "30px", opacity: 0.8 }}>
                Рекорд: {Math.max(score, bestScores[lvl])}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => startGame(lvl)}
                  style={{ fontFamily: "'Orbitron', monospace", fontSize: "13px", fontWeight: 700,
                    color: lc.text, background: lc.btn, border: "none", borderRadius: "8px",
                    padding: "12px 32px", cursor: "pointer", boxShadow: `0 0 22px ${lc.glow}66`, letterSpacing: "0.08em" }}>
                  ЕЩЁ РАЗ
                </button>
                <button onClick={() => { statusRef.current = "menu"; setGameStatus("menu"); }}
                  style={{ fontFamily: "'Orbitron', monospace", fontSize: "13px", fontWeight: 700,
                    color: "#aaa", background: "transparent", border: "2px solid #444", borderRadius: "8px",
                    padding: "12px 32px", cursor: "pointer", letterSpacing: "0.08em" }}>
                  МЕНЮ
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {gameStatus === "playing" && (
        <div style={{ color: "#2a3a55", fontSize: "12px", marginTop: "12px", fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.1em" }}>
          ПРОБЕЛ / КЛИК — прыжок
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
