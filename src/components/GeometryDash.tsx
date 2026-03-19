import { useEffect, useRef, useState, useCallback } from "react";

const GRAVITY = 0.55;
const JUMP_FORCE = -12.5;
const PLAYER_SIZE = 40;
const GROUND_Y = 400;
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;

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
};

const LEVELS: LevelConfig[] = [
  {
    id: 1, name: "STEREO MADNESS", speed: 4,
    bgColors: ["#08001a", "#0d0035", "#1a0055"],
    groundColor: ["#180050", "#080020"],
    glowColor: "#44aaff", starColor: "rgba(255,255,255,",
    obstacleColor: ["#bb0077", "#ff55dd"], obstacleStroke: "#ff88ee",
    groundLineColor: "#44aaff", gridColor: "rgba(80,40,180,0.13)",
    minGap: 260, maxGap: 340,
  },
  {
    id: 2, name: "BASE AFTER BASE", speed: 5,
    bgColors: ["#001510", "#003322", "#004433"],
    groundColor: ["#002200", "#001100"],
    glowColor: "#00ff88", starColor: "rgba(100,255,180,",
    obstacleColor: ["#007744", "#00ffaa"], obstacleStroke: "#55ffcc",
    groundLineColor: "#00dd66", gridColor: "rgba(0,180,80,0.12)",
    minGap: 210, maxGap: 290,
  },
  {
    id: 3, name: "CANT LET GO", speed: 6,
    bgColors: ["#1a0800", "#330d00", "#4a1500"],
    groundColor: ["#330800", "#1a0200"],
    glowColor: "#ff6600", starColor: "rgba(255,200,100,",
    obstacleColor: ["#cc3300", "#ff7733"], obstacleStroke: "#ffaa55",
    groundLineColor: "#ff6600", gridColor: "rgba(200,80,0,0.13)",
    minGap: 170, maxGap: 250,
  },
];

type Obstacle = { x: number; type: "spike" | "block" | "doubleSpike"; width: number; height: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };

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
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(freq * 0.5, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.14);
}

function playDeathSound(ctx: AudioContext) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(380, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.45);
  gain.gain.setValueAtTime(0.22, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45);
}

function n(ctx: AudioContext, freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(dest); osc.type = type; osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + dur - 0.02); g.gain.linearRampToValueAtTime(0, t + dur);
  osc.start(t); osc.stop(t + dur + 0.02);
}
function kick(ctx: AudioContext, t: number, dest: AudioNode) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(dest); osc.type = "sine";
  osc.frequency.setValueAtTime(180, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.start(t); osc.stop(t + 0.16);
}
function snare(ctx: AudioContext, t: number, dest: AudioNode) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); src.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  src.start(t); src.stop(t + 0.11);
}
function hihat(ctx: AudioContext, t: number, vol: number, dest: AudioNode) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const flt = ctx.createBiquadFilter(); flt.type = "highpass"; flt.frequency.value = 7000;
  const g = ctx.createGain(); src.connect(flt); flt.connect(g); g.connect(dest);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.start(t); src.stop(t + 0.06);
}
function wobbleBass(ctx: AudioContext, t: number, freq: number, dur: number, dest: AudioNode) {
  const osc = ctx.createOscillator(); const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain(); const flt = ctx.createBiquadFilter(); const g = ctx.createGain();
  osc.type = "sawtooth"; osc.frequency.value = freq;
  flt.type = "lowpass"; flt.frequency.value = 400; flt.Q.value = 8;
  lfo.type = "sine"; lfo.frequency.value = 6; lfoGain.gain.value = 800;
  lfo.connect(lfoGain); lfoGain.connect(flt.frequency);
  osc.connect(flt); flt.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.02);
  g.gain.setValueAtTime(0.22, t + dur - 0.04); g.gain.linearRampToValueAtTime(0, t + dur);
  lfo.start(t); lfo.stop(t + dur + 0.02); osc.start(t); osc.stop(t + dur + 0.02);
}

function playTrack1(ctx: AudioContext) {
  const master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
  const T = ctx.currentTime + 0.05; const bpm = 140; const b = 60 / bpm;
  [523,659,784,659,523,415,523,659,784,880,784,659,523,659,784,1047].forEach((f,i) => n(ctx,f,T+i*b*0.5,b*0.45,"sawtooth",0.06,master));
  [262,330,392,330,294,370,440,370].forEach((f,i) => n(ctx,f,T+i*b,b*0.9,"square",0.04,master));
  [131,131,98,110,131,131,110,98].forEach((f,i) => n(ctx,f,T+i*b,b*0.8,"square",0.12,master));
  for (let i=0;i<8;i++) { kick(ctx,T+i*b,master); if(i%2===1) snare(ctx,T+i*b,master); hihat(ctx,T+i*b*0.5,0.06,master); }
  [[523,659,784],[440,554,659],[494,622,740],[523,659,784]].forEach(([a,b2,c],i) => {
    const st=T+i*b*2; n(ctx,a,st,b*0.15,"square",0.05,master); n(ctx,b2,st,b*0.15,"square",0.05,master); n(ctx,c,st,b*0.15,"square",0.05,master);
  });
}
function playTrack2(ctx: AudioContext) {
  const master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
  const T = ctx.currentTime + 0.05; const bpm = 128; const b = 60 / bpm;
  [440,494,523,587,659,587,523,494,440,415,440,494,523,494,440,415].forEach((f,i) => n(ctx,f,T+i*b*0.5,b*0.48,"triangle",0.07,master));
  [[220,277,330],[196,247,294],[220,277,330],[246,311,370]].forEach(([a,b2,c],i) => {
    const st=T+i*b*2; n(ctx,a,st,b*1.9,"sine",0.06,master); n(ctx,b2,st,b*1.9,"sine",0.06,master); n(ctx,c,st,b*1.9,"sine",0.05,master);
  });
  [110,110,138,110,123,110,138,146].forEach((f,i) => { n(ctx,f,T+i*b,b*0.4,"square",0.14,master); n(ctx,f,T+i*b+b*0.5,b*0.35,"square",0.09,master); });
  for (let i=0;i<8;i++) { kick(ctx,T+i*b,master); if(i%2===1) snare(ctx,T+i*b,master); hihat(ctx,T+i*b,0.05,master); hihat(ctx,T+i*b+b*0.5,0.03,master); }
}
function playTrack3(ctx: AudioContext) {
  const master = ctx.createGain(); master.gain.value = 0.65; master.connect(ctx.destination);
  const T = ctx.currentTime + 0.05; const bpm = 150; const b = 60 / bpm;
  [698,784,880,784,698,622,698,784,880,988,880,784,698,784,698,622].forEach((f,i) => n(ctx,f,T+i*b*0.5,b*0.42,"sawtooth",0.055,master));
  [87,87,98,87,110,87,98,110].forEach((f,i) => wobbleBass(ctx,T+i*b,f,b*0.95,master));
  [1047,1175,1319,1175,1047,932,1047,1175].forEach((f,i) => n(ctx,f,T+i*b,b*0.2,"square",0.025,master));
  for (let i=0;i<8;i++) { kick(ctx,T+i*b,master); kick(ctx,T+i*b+b*0.75,master); if(i%2===1) snare(ctx,T+i*b,master); if(i%4===2) snare(ctx,T+i*b+b*0.5,master); hihat(ctx,T+i*b*0.5,0.08,master); }
}

function playLevelMusic(ctx: AudioContext, cfg: LevelConfig) {
  if (cfg.id === 1) playTrack1(ctx);
  else if (cfg.id === 2) playTrack2(ctx);
  else playTrack3(ctx);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

export default function GeometryDash({ onBack }: { onBack?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gs = useRef({
    playerY: GROUND_Y - PLAYER_SIZE, playerVY: 0, isOnGround: true, isAlive: true,
    score: 0, bgOffset: 0, rotation: 0, obstacles: [] as Obstacle[],
    particles: [] as Particle[], bestScores: [0,0,0], currentLevel: 0,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [gameStatus, setGameStatus] = useState<"menu"|"playing"|"dead">("menu");
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [bestScores, setBestScores] = useState([0,0,0]);
  const animRef = useRef<number>(0);
  const statusRef = useRef<"menu"|"playing"|"dead">("menu");

  const jump = useCallback(() => {
    const g = gs.current;
    if (g.isOnGround) {
      g.playerVY = JUMP_FORCE; g.isOnGround = false;
      if (audioCtxRef.current) playJumpSound(audioCtxRef.current, LEVELS[g.currentLevel].glowColor);
    }
  }, []);

  const startGame = useCallback((levelIdx: number) => {
    if (!audioCtxRef.current) audioCtxRef.current = createAudioContext();
    const g = gs.current; const cfg = LEVELS[levelIdx];
    g.playerY = GROUND_Y - PLAYER_SIZE; g.playerVY = 0; g.isOnGround = true;
    g.isAlive = true; g.score = 0; g.bgOffset = 0; g.rotation = 0;
    g.obstacles = generateLevel(cfg); g.particles = []; g.currentLevel = levelIdx;
    statusRef.current = "playing"; setGameStatus("playing"); setScore(0);
    playLevelMusic(audioCtxRef.current, cfg);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const PLAYER_X = 150;

    const drawPlayer = (x: number, y: number, rot: number, cfg: LevelConfig) => {
      ctx.save(); ctx.translate(x+PLAYER_SIZE/2, y+PLAYER_SIZE/2); ctx.rotate(rot);
      ctx.shadowColor = cfg.glowColor; ctx.shadowBlur = 24;
      const grad = ctx.createLinearGradient(-PLAYER_SIZE/2,-PLAYER_SIZE/2,PLAYER_SIZE/2,PLAYER_SIZE/2);
      if (cfg.id===1) { grad.addColorStop(0,"#22aaff"); grad.addColorStop(1,"#0044cc"); }
      else if (cfg.id===2) { grad.addColorStop(0,"#00ff99"); grad.addColorStop(1,"#007744"); }
      else { grad.addColorStop(0,"#ff8833"); grad.addColorStop(1,"#cc3300"); }
      ctx.fillStyle=grad; ctx.strokeStyle=cfg.glowColor; ctx.lineWidth=2;
      roundRect(ctx,-PLAYER_SIZE/2,-PLAYER_SIZE/2,PLAYER_SIZE,PLAYER_SIZE,7);
      ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(11,0); ctx.lineTo(0,11); ctx.lineTo(-11,0); ctx.closePath();
      ctx.fillStyle="rgba(255,255,255,0.32)"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-15,-15); ctx.lineTo(3,-15); ctx.lineTo(-15,3); ctx.closePath();
      ctx.fillStyle="rgba(255,255,255,0.2)"; ctx.fill();
      ctx.restore();
    };

    const drawSpike = (x: number, count: number, cfg: LevelConfig) => {
      for (let i=0; i<count; i++) {
        const sx = x+i*40; ctx.save();
        ctx.shadowColor=cfg.obstacleColor[1]; ctx.shadowBlur=16;
        const g = ctx.createLinearGradient(sx,GROUND_Y,sx+20,GROUND_Y-40);
        g.addColorStop(0,cfg.obstacleColor[0]); g.addColorStop(1,cfg.obstacleColor[1]);
        ctx.fillStyle=g; ctx.strokeStyle=cfg.obstacleStroke; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(sx,GROUND_Y); ctx.lineTo(sx+20,GROUND_Y-40); ctx.lineTo(sx+40,GROUND_Y); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
    };

    const drawBlock = (x: number, height: number, cfg: LevelConfig) => {
      ctx.save(); ctx.shadowColor=cfg.obstacleColor[1]; ctx.shadowBlur=14;
      const g = ctx.createLinearGradient(x,GROUND_Y-height,x+40,GROUND_Y);
      g.addColorStop(0,cfg.obstacleColor[0]); g.addColorStop(1,cfg.obstacleColor[0]+"99");
      ctx.fillStyle=g; ctx.strokeStyle=cfg.obstacleStroke; ctx.lineWidth=2;
      roundRect(ctx,x,GROUND_Y-height,40,height,4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle=cfg.obstacleStroke+"33"; ctx.lineWidth=1;
      for (let i=1;i<3;i++) { ctx.beginPath(); ctx.moveTo(x,GROUND_Y-height+i*(height/3)); ctx.lineTo(x+40,GROUND_Y-height+i*(height/3)); ctx.stroke(); }
      ctx.restore();
    };

    const loop = (ts: number) => {
      const g = gs.current; const cfg = LEVELS[g.currentLevel];
      if (statusRef.current==="playing" && g.isAlive) {
        g.playerVY+=GRAVITY; g.playerY+=g.playerVY; g.bgOffset+=cfg.speed;
        if (!g.isOnGround) g.rotation+=0.09;
        if (g.playerY>=GROUND_Y-PLAYER_SIZE) { g.playerY=GROUND_Y-PLAYER_SIZE; g.playerVY=0; g.isOnGround=true; }
        else g.isOnGround=false;
        g.score=Math.floor(g.bgOffset/100); setScore(g.score);

        for (const obs of g.obstacles) {
          const sx = obs.x-g.bgOffset;
          if (sx+obs.width<0) continue; if (sx>CANVAS_WIDTH) break;
          let hit=false;
          if (obs.type==="spike"||obs.type==="doubleSpike") {
            const count=obs.type==="doubleSpike"?2:1;
            for (let i=0;i<count;i++) {
              const tx=sx+i*40;
              if (PLAYER_X+PLAYER_SIZE-5>tx+4&&PLAYER_X+5<tx+36&&g.playerY+PLAYER_SIZE>GROUND_Y-38&&g.playerY+PLAYER_SIZE<=GROUND_Y+2) {
                const relX=Math.abs((PLAYER_X+PLAYER_SIZE/2)-(tx+20)); const tH=38-relX*1.9;
                if (tH>0&&g.playerY+PLAYER_SIZE>GROUND_Y-tH+4) hit=true;
              }
            }
          } else {
            if (PLAYER_X+PLAYER_SIZE-5>sx+4&&PLAYER_X+5<sx+36&&g.playerY+PLAYER_SIZE>GROUND_Y-obs.height+4&&g.playerY<GROUND_Y) hit=true;
          }
          if (hit) {
            g.isAlive=false;
            const colors=[cfg.glowColor,cfg.obstacleColor[1],"#fff","#ffff44",cfg.obstacleColor[0]];
            for (let i=0;i<22;i++) g.particles.push({ x:PLAYER_X+PLAYER_SIZE/2, y:g.playerY+PLAYER_SIZE/2, vx:(Math.random()-0.5)*12, vy:(Math.random()-0.5)*12-3, life:1, color:colors[Math.floor(Math.random()*colors.length)], size:3+Math.random()*5 });
            const lvl=g.currentLevel; if (g.score>g.bestScores[lvl]) { g.bestScores[lvl]=g.score; setBestScores([...g.bestScores]); }
            if (audioCtxRef.current) playDeathSound(audioCtxRef.current);
            statusRef.current="dead"; setGameStatus("dead");
          }
        }
      }
      g.particles=g.particles.filter(p=>p.life>0);
      for (const p of g.particles) { p.x+=p.vx; p.y+=p.vy; p.vy+=0.28; p.life-=0.028; }

      const sky=ctx.createLinearGradient(0,0,0,CANVAS_HEIGHT);
      sky.addColorStop(0,cfg.bgColors[0]); sky.addColorStop(0.65,cfg.bgColors[1]); sky.addColorStop(1,cfg.bgColors[2]);
      ctx.fillStyle=sky; ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);

      for (let i=0;i<65;i++) {
        const sx=((i*131-g.bgOffset*0.07)%CANVAS_WIDTH+CANVAS_WIDTH)%CANVAS_WIDTH;
        const sy=(i*71)%(GROUND_Y-30);
        const alpha=0.3+(Math.sin(ts*0.002+i)+1)*0.27;
        ctx.fillStyle=cfg.starColor+alpha+")"; ctx.fillRect(sx,sy,i%4===0?2:1,i%4===0?2:1);
      }

      ctx.strokeStyle=cfg.gridColor; ctx.lineWidth=1;
      const gOff=g.bgOffset%60;
      for (let x=-gOff;x<CANVAS_WIDTH;x+=60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,GROUND_Y); ctx.stroke(); }
      for (let y=0;y<GROUND_Y;y+=60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_WIDTH,y); ctx.stroke(); }

      const groundG=ctx.createLinearGradient(0,GROUND_Y,0,CANVAS_HEIGHT);
      groundG.addColorStop(0,cfg.groundColor[0]); groundG.addColorStop(1,cfg.groundColor[1]);
      ctx.fillStyle=groundG; ctx.fillRect(0,GROUND_Y,CANVAS_WIDTH,CANVAS_HEIGHT-GROUND_Y);
      ctx.save(); ctx.shadowColor=cfg.groundLineColor; ctx.shadowBlur=12; ctx.strokeStyle=cfg.groundLineColor; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,GROUND_Y); ctx.lineTo(CANVAS_WIDTH,GROUND_Y); ctx.stroke(); ctx.restore();
      const tileOff=g.bgOffset%60;
      ctx.strokeStyle=cfg.groundLineColor+"30"; ctx.lineWidth=1;
      for (let x=-tileOff;x<CANVAS_WIDTH;x+=60) { ctx.beginPath(); ctx.moveTo(x,GROUND_Y); ctx.lineTo(x,CANVAS_HEIGHT); ctx.stroke(); }

      for (const obs of g.obstacles) {
        const sx=obs.x-g.bgOffset;
        if (sx+obs.width<-10) continue; if (sx>CANVAS_WIDTH+10) break;
        if (obs.type==="spike") drawSpike(sx,1,cfg);
        else if (obs.type==="doubleSpike") drawSpike(sx,2,cfg);
        else drawBlock(sx,obs.height,cfg);
      }

      if (g.isAlive) drawPlayer(PLAYER_X,g.playerY,g.rotation,cfg);

      for (const p of g.particles) {
        ctx.save(); ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=10;
        ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size); ctx.restore();
      }

      if (statusRef.current==="playing") {
        ctx.save();
        ctx.font="bold 14px Orbitron, monospace"; ctx.fillStyle=cfg.glowColor; ctx.shadowColor=cfg.glowColor; ctx.shadowBlur=10; ctx.textAlign="left";
        ctx.fillText(cfg.name,20,30);
        ctx.font="bold 22px Orbitron, monospace"; ctx.fillStyle="#ffffff"; ctx.textAlign="right";
        ctx.fillText(String(g.score),CANVAS_WIDTH-24,38); ctx.restore();
      }

      animRef.current=requestAnimationFrame(loop);
    };

    animRef.current=requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  useEffect(() => {
    const onKey=(e: KeyboardEvent) => {
      if (e.code==="Space"||e.code==="ArrowUp") {
        e.preventDefault();
        if (statusRef.current==="playing") jump();
        else if (statusRef.current==="menu") startGame(selectedLevel);
      }
    };
    window.addEventListener("keydown",onKey);
    return () => window.removeEventListener("keydown",onKey);
  }, [jump,startGame,selectedLevel]);

  const levelColors = [
    { glow:"#44aaff", btn:"linear-gradient(135deg,#44aaff,#0066ee)", text:"#0a001a" },
    { glow:"#00ff88", btn:"linear-gradient(135deg,#00ff88,#007744)", text:"#001a0a" },
    { glow:"#ff6600", btn:"linear-gradient(135deg,#ff8833,#cc3300)", text:"#1a0500" },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center select-none"
      style={{ background:"radial-gradient(ellipse at center,#1a0050 0%,#06000f 100%)" }}>

      {/* Back button */}
      {onBack && (
        <button onClick={onBack} style={{ position:"fixed", top:16, left:16, fontFamily:"'Orbitron',monospace", fontSize:11, color:"#334466", background:"transparent", border:"1px solid #222244", borderRadius:6, padding:"6px 14px", cursor:"pointer", letterSpacing:"0.1em", zIndex:10 }}>
          ← НАЗАД
        </button>
      )}

      <h1 style={{ fontFamily:"'Orbitron',monospace", fontSize:"clamp(18px,3vw,38px)", fontWeight:900, background:"linear-gradient(135deg,#44aaff 0%,#ff44cc 50%,#44aaff 100%)", backgroundSize:"200% auto", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", marginBottom:14, letterSpacing:"0.1em", animation:"shimmer 3s linear infinite" }}>
        GEOMETRY DASH
      </h1>

      <div style={{ position:"relative", borderRadius:14, overflow:"hidden", boxShadow:"0 0 50px rgba(80,160,255,0.3),0 0 100px rgba(255,80,200,0.12),0 0 0 2px rgba(80,160,255,0.2)", maxWidth:"100vw" }}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
          onClick={() => { if (statusRef.current==="playing") jump(); }}
          style={{ display:"block", cursor:"pointer", maxWidth:"100%", height:"auto" }} />

        {gameStatus==="menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background:"rgba(4,0,18,0.88)", backdropFilter:"blur(8px)" }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:"clamp(24px,4.5vw,50px)", fontWeight:900, background:"linear-gradient(135deg,#44aaff,#ff44cc)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", marginBottom:8 }}>
              GEOMETRY DASH
            </div>
            <div style={{ color:"#7799dd", fontSize:14, marginBottom:32, fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.18em" }}>ВЫБЕРИ УРОВЕНЬ</div>
            <div style={{ display:"flex", gap:16, marginBottom:32, flexWrap:"wrap", justifyContent:"center" }}>
              {LEVELS.map((lvl,i) => {
                const lc=levelColors[i]; const isSelected=selectedLevel===i;
                return (
                  <button key={lvl.id} onClick={() => setSelectedLevel(i)} style={{ fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, color:isSelected?lc.text:lc.glow, background:isSelected?lc.btn:"transparent", border:`2px solid ${lc.glow}`, borderRadius:8, padding:"12px 18px", cursor:"pointer", boxShadow:isSelected?`0 0 24px ${lc.glow}66`:"none", transition:"all 0.2s", textAlign:"center" as const, minWidth:130 }}>
                    <div style={{ fontSize:18, marginBottom:4 }}>{i===0?"①":i===1?"②":"③"}</div>
                    <div>{lvl.name}</div>
                    <div style={{ fontSize:10, opacity:0.7, marginTop:4, color:isSelected?lc.text:"#aaa" }}>Скорость: {lvl.speed===4?"★☆☆":lvl.speed===5?"★★☆":"★★★"}</div>
                    {bestScores[i]>0&&<div style={{ fontSize:9, marginTop:3, opacity:0.8 }}>Рекорд: {bestScores[i]}</div>}
                  </button>
                );
              })}
            </div>
            <button onClick={() => startGame(selectedLevel)} style={{ fontFamily:"'Orbitron',monospace", fontSize:17, fontWeight:700, color:levelColors[selectedLevel].text, background:levelColors[selectedLevel].btn, border:"none", borderRadius:8, padding:"14px 52px", cursor:"pointer", boxShadow:`0 0 30px ${levelColors[selectedLevel].glow}88`, letterSpacing:"0.1em" }}>
              ИГРАТЬ
            </button>
            <div style={{ color:"#334466", fontSize:12, marginTop:18, fontFamily:"'Rajdhani',sans-serif" }}>ПРОБЕЛ / КЛИК — прыжок</div>
          </div>
        )}

        {gameStatus==="dead" && (() => {
          const lvl=gs.current.currentLevel; const lc=levelColors[lvl];
          return (
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background:"rgba(10,0,6,0.9)", backdropFilter:"blur(6px)" }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:"clamp(26px,4vw,44px)", fontWeight:900, color:"#ff3366", textShadow:"0 0 22px #ff3366,0 0 50px #ff3366", marginBottom:12 }}>ПРОВАЛ</div>
              <div style={{ color:"#aaa", fontSize:14, fontFamily:"'Rajdhani',sans-serif", marginBottom:4, letterSpacing:"0.1em" }}>{LEVELS[lvl].name}</div>
              <div style={{ color:"#fff", fontSize:22, fontFamily:"'Rajdhani',sans-serif", marginBottom:4 }}>Счёт: <span style={{ color:lc.glow }}>{score}</span></div>
              <div style={{ color:lc.glow, fontSize:15, fontFamily:"'Rajdhani',sans-serif", marginBottom:30, opacity:0.8 }}>Рекорд: {Math.max(score,bestScores[lvl])}</div>
              <div style={{ display:"flex", gap:12 }}>
                <button onClick={() => startGame(lvl)} style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:lc.text, background:lc.btn, border:"none", borderRadius:8, padding:"12px 32px", cursor:"pointer", boxShadow:`0 0 22px ${lc.glow}66`, letterSpacing:"0.08em" }}>ЕЩЁ РАЗ</button>
                <button onClick={() => { statusRef.current="menu"; setGameStatus("menu"); }} style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:"#aaa", background:"transparent", border:"2px solid #444", borderRadius:8, padding:"12px 32px", cursor:"pointer", letterSpacing:"0.08em" }}>МЕНЮ</button>
              </div>
            </div>
          );
        })()}
      </div>

      {gameStatus==="playing" && <div style={{ color:"#2a3a55", fontSize:12, marginTop:12, fontFamily:"'Rajdhani',sans-serif", letterSpacing:"0.1em" }}>ПРОБЕЛ / КЛИК — прыжок</div>}

      <style>{`@keyframes shimmer{0%{background-position:0% center}100%{background-position:200% center}}`}</style>
    </div>
  );
}
