import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── Audio ────────────────────────────────────────────────────
function createAudio() {
  const W = window as Window & { webkitAudioContext?: typeof AudioContext };
  return new (W.AudioContext || W.webkitAudioContext!)();
}

function playShot(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const dist = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = (i * 2) / 256 - 1; curve[i] = (Math.PI + 400) * x / (Math.PI + 400 * Math.abs(x)); }
  dist.curve = curve;
  osc.connect(dist); dist.connect(g); g.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(180, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);
  g.gain.setValueAtTime(0.4, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
}

function playHit(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = 0.3;
  src.connect(g); g.connect(ctx.destination);
  src.start(ctx.currentTime);
}

function playDeath(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.5);
  g.gain.setValueAtTime(0.3, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
}

function playStep(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = 200;
  const g = ctx.createGain(); g.gain.value = 0.08;
  src.connect(flt); flt.connect(g); g.connect(ctx.destination);
  src.start(ctx.currentTime);
}

// ── Game constants ───────────────────────────────────────────
const MOVE_SPEED = 0.12;
const BULLET_SPEED = 1.2;
const BULLET_LIFETIME = 60;
const ENEMY_SPEED_BASE = 0.028;
const ARENA_SIZE = 24;
const MAX_HP = 100;
const AMMO_MAX = 30;
const RELOAD_TIME = 120;

type Enemy = {
  mesh: THREE.Mesh;
  hp: number;
  maxHp: number;
  speed: number;
  hpBar: THREE.Mesh;
  hpBarBg: THREE.Mesh;
};

type Bullet = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
};

type Particle = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
};

export default function ShooterGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"menu" | "playing" | "dead">("menu");
  const [hp, setHp] = useState(MAX_HP);
  const [ammo, setAmmo] = useState(AMMO_MAX);
  const [kills, setKills] = useState(0);
  const [wave, setWave] = useState(1);
  const [reloading, setReloading] = useState(false);
  const statusRef = useRef<"menu" | "playing" | "dead">("menu");
  const audioRef = useRef<AudioContext | null>(null);
  const gameRef = useRef({
    hp: MAX_HP, ammo: AMMO_MAX, kills: 0, wave: 1,
    reloadTimer: 0, reloading: false,
    stepTimer: 0,
    enemies: [] as Enemy[],
    bullets: [] as Bullet[],
    particles: [] as Particle[],
    keys: {} as Record<string, boolean>,
    yaw: 0, pitch: 0,
    scene: null as THREE.Scene | null,
    camera: null as THREE.PerspectiveCamera | null,
    renderer: null as THREE.WebGLRenderer | null,
    animId: 0,
    enemiesInWave: 0,
    enemiesLeft: 0,
    flashTimer: 0,
  });

  const startGame = () => {
    if (!audioRef.current) audioRef.current = createAudio();
    const g = gameRef.current;
    g.hp = MAX_HP; g.ammo = AMMO_MAX; g.kills = 0; g.wave = 1;
    g.reloadTimer = 0; g.reloading = false; g.stepTimer = 0;
    g.yaw = 0; g.pitch = 0; g.flashTimer = 0;
    g.bullets.forEach(b => g.scene?.remove(b.mesh));
    g.enemies.forEach(e => { g.scene?.remove(e.mesh); g.scene?.remove(e.hpBar); g.scene?.remove(e.hpBarBg); });
    g.particles.forEach(p => g.scene?.remove(p.mesh));
    g.bullets = []; g.enemies = []; g.particles = [];
    g.enemiesInWave = 5; g.enemiesLeft = 5;
    if (g.camera) { g.camera.position.set(0, 1.7, 0); }
    spawnWave(1);
    statusRef.current = "playing";
    setStatus("playing");
    setHp(MAX_HP); setAmmo(AMMO_MAX); setKills(0); setWave(1); setReloading(false);
  };

  function spawnWave(waveNum: number) {
    const g = gameRef.current;
    const count = 4 + waveNum * 2;
    g.enemiesInWave = count;
    g.enemiesLeft = count;
    for (let i = 0; i < count; i++) {
      spawnEnemy(waveNum);
    }
  }

  function spawnEnemy(waveNum: number) {
    const g = gameRef.current;
    if (!g.scene) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = ARENA_SIZE * 0.42 + Math.random() * 2;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xcc2200, emissive: 0x440000 });
    const mesh = new THREE.Mesh(bodyGeo, bodyMat);
    mesh.position.set(x, 1.1, z);
    mesh.castShadow = true;

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const eyeMat = new THREE.MeshPhongMaterial({ color: 0xff4400, emissive: 0xff2200 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.18, 0.35, -0.38);
    eyeR.position.set(0.18, 0.35, -0.38);
    mesh.add(eyeL); mesh.add(eyeR);

    // HP bar background
    const hpBarBgGeo = new THREE.PlaneGeometry(0.9, 0.1);
    const hpBarBgMat = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide });
    const hpBarBg = new THREE.Mesh(hpBarBgGeo, hpBarBgMat);
    hpBarBg.position.set(x, 2.4, z);

    // HP bar
    const hpBarGeo = new THREE.PlaneGeometry(0.9, 0.1);
    const hpBarMat = new THREE.MeshBasicMaterial({ color: 0xff2200, side: THREE.DoubleSide });
    const hpBar = new THREE.Mesh(hpBarGeo, hpBarMat);
    hpBar.position.set(x, 2.4, z);

    g.scene.add(mesh); g.scene.add(hpBarBg); g.scene.add(hpBar);

    const maxHp = 60 + waveNum * 20;
    g.enemies.push({ mesh, hp: maxHp, maxHp, speed: ENEMY_SPEED_BASE + waveNum * 0.005, hpBar, hpBarBg });
  }

  function spawnParticles(pos: THREE.Vector3, color: number, count = 10) {
    const g = gameRef.current;
    if (!g.scene) return;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.06 + Math.random() * 0.08, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        Math.random() * 0.25 + 0.05,
        (Math.random() - 0.5) * 0.3,
      );
      g.scene.add(mesh);
      g.particles.push({ mesh, vel, life: 30 + Math.random() * 20, maxLife: 40 });
    }
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const g = gameRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0010, 8, 45);
    g.scene = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(85, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 1.7, 0);
    g.camera = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0010);
    mount.appendChild(renderer.domElement);
    g.renderer = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0x221133, 0.8);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x8866ff, 1.2);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const pointLight = new THREE.PointLight(0xff4400, 2, 20);
    pointLight.position.set(0, 4, 0);
    scene.add(pointLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2, 24, 24);
    const floorMat = new THREE.MeshPhongMaterial({ color: 0x110022, shininess: 40 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid
    const gridHelper = new THREE.GridHelper(ARENA_SIZE * 2, 24, 0x330066, 0x220044);
    scene.add(gridHelper);

    // Arena walls
    const wallMat = new THREE.MeshPhongMaterial({ color: 0x1a0044, emissive: 0x0a0022, shininess: 60 });
    const wallH = 5;
    const wallThick = 0.5;
    const wallData = [
      { x: 0, z: -ARENA_SIZE, rx: 0 },
      { x: 0, z: ARENA_SIZE, rx: 0 },
      { x: -ARENA_SIZE, z: 0, ry: Math.PI / 2 },
      { x: ARENA_SIZE, z: 0, ry: Math.PI / 2 },
    ];
    wallData.forEach(w => {
      const geo = new THREE.BoxGeometry(ARENA_SIZE * 2, wallH, wallThick);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(w.x, wallH / 2, w.z);
      if (w.ry) mesh.rotation.y = w.ry;
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    });

    // Neon strips on walls
    const neonColors = [0xff0066, 0x0066ff, 0x00ffcc, 0xff6600];
    neonColors.forEach((col, i) => {
      const geo = new THREE.BoxGeometry(ARENA_SIZE * 2, 0.08, 0.08);
      const mat = new THREE.MeshBasicMaterial({ color: col });
      const m = new THREE.Mesh(geo, mat);
      const angle = (i / 4) * Math.PI * 2;
      m.position.set(Math.cos(angle) * (ARENA_SIZE - 0.3), 2.5, Math.sin(angle) * (ARENA_SIZE - 0.3));
      m.rotation.y = angle + Math.PI / 2;
      scene.add(m);
    });

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2);
    const ceilMat = new THREE.MeshPhongMaterial({ color: 0x0d0020, side: THREE.DoubleSide });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = wallH;
    scene.add(ceil);

    // Pillars
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const r = ARENA_SIZE * 0.55;
      const geo = new THREE.CylinderGeometry(0.3, 0.3, wallH, 8);
      const mat = new THREE.MeshPhongMaterial({ color: 0x220055, emissive: 0x110022 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(angle) * r, wallH / 2, Math.sin(angle) * r);
      m.castShadow = true;
      scene.add(m);
      // Pillar glow
      const glowGeo = new THREE.CylinderGeometry(0.05, 0.05, wallH, 6);
      const glowMat = new THREE.MeshBasicMaterial({ color: neonColors[i % 4] });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(Math.cos(angle) * r, wallH / 2, Math.sin(angle) * r);
      scene.add(glow);
    }

    // Crosshair canvas overlay — handled in JSX

    // ── Game loop ────────────────────────────────────────────
    let frame = 0;
    const loop = () => {
      g.animId = requestAnimationFrame(loop);
      frame++;
      if (statusRef.current !== "playing") {
        // still render scene
        if (g.camera) {
          g.camera.rotation.order = "YXZ";
          g.camera.rotation.y = g.yaw;
          g.camera.rotation.x = g.pitch;
        }
        renderer.render(scene, camera);
        return;
      }

      // ── Input / Movement ────────────────────────────────
      const forward = new THREE.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw));
      const right = new THREE.Vector3(Math.cos(g.yaw), 0, -Math.sin(g.yaw));
      const moveVec = new THREE.Vector3();
      if (g.keys["KeyW"] || g.keys["ArrowUp"]) moveVec.add(forward);
      if (g.keys["KeyS"] || g.keys["ArrowDown"]) moveVec.sub(forward);
      if (g.keys["KeyA"] || g.keys["ArrowLeft"]) moveVec.sub(right);
      if (g.keys["KeyD"] || g.keys["ArrowRight"]) moveVec.add(right);
      if (moveVec.length() > 0) {
        moveVec.normalize().multiplyScalar(MOVE_SPEED);
        const next = camera.position.clone().add(moveVec);
        next.x = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, next.x));
        next.z = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, next.z));
        camera.position.copy(next);
        g.stepTimer++;
        if (g.stepTimer % 28 === 0 && audioRef.current) playStep(audioRef.current);
      }

      // Camera rotation
      camera.rotation.order = "YXZ";
      camera.rotation.y = g.yaw;
      camera.rotation.x = g.pitch;

      // ── Reload ──────────────────────────────────────────
      if (g.reloading) {
        g.reloadTimer--;
        if (g.reloadTimer <= 0) {
          g.ammo = AMMO_MAX;
          g.reloading = false;
          setAmmo(AMMO_MAX);
          setReloading(false);
        }
      }

      // ── Bullets ─────────────────────────────────────────
      g.bullets = g.bullets.filter(b => {
        b.mesh.position.add(b.vel);
        b.life--;
        if (b.life <= 0) { scene.remove(b.mesh); return false; }

        // Hit enemy?
        for (let i = g.enemies.length - 1; i >= 0; i--) {
          const e = g.enemies[i];
          const dist = b.mesh.position.distanceTo(e.mesh.position);
          if (dist < 0.7) {
            e.hp -= 25;
            spawnParticles(b.mesh.position.clone(), 0xff3300, 6);
            if (audioRef.current) playHit(audioRef.current);
            // Update hp bar
            const ratio = Math.max(0, e.hp / e.maxHp);
            e.hpBar.scale.x = ratio;
            e.hpBar.position.x = e.mesh.position.x - (1 - ratio) * 0.45;
            if (e.hp <= 0) {
              spawnParticles(e.mesh.position.clone(), 0xff1100, 18);
              scene.remove(e.mesh); scene.remove(e.hpBar); scene.remove(e.hpBarBg);
              g.enemies.splice(i, 1);
              g.kills++;
              g.enemiesLeft--;
              setKills(g.kills);
              if (audioRef.current) playDeath(audioRef.current);
              if (g.enemiesLeft <= 0) {
                g.wave++;
                setWave(g.wave);
                setTimeout(() => spawnWave(g.wave), 2000);
              }
            }
            scene.remove(b.mesh);
            return false;
          }
        }
        return true;
      });

      // ── Enemies AI ──────────────────────────────────────
      g.enemies.forEach(e => {
        const dir = camera.position.clone().sub(e.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 0.01) {
          dir.normalize();
          e.mesh.position.addScaledVector(dir, e.speed);
          e.mesh.lookAt(camera.position.x, e.mesh.position.y, camera.position.z);
        }
        // HP bars always face camera
        e.hpBar.position.copy(e.mesh.position).add(new THREE.Vector3(0, 1.3, 0));
        e.hpBarBg.position.copy(e.hpBar.position);
        e.hpBar.lookAt(camera.position);
        e.hpBarBg.lookAt(camera.position);

        // Hit player
        if (dist < 0.9) {
          g.hp -= 0.4;
          g.flashTimer = 8;
          if (g.hp <= 0) {
            g.hp = 0;
            statusRef.current = "dead";
            setStatus("dead");
          }
          setHp(Math.max(0, Math.round(g.hp)));
        }
      });

      // ── Particles ───────────────────────────────────────
      g.particles = g.particles.filter(p => {
        p.mesh.position.add(p.vel);
        p.vel.y -= 0.012;
        p.life--;
        const scale = p.life / p.maxLife;
        p.mesh.scale.setScalar(Math.max(0.01, scale));
        if (p.life <= 0) { scene.remove(p.mesh); return false; }
        return true;
      });

      // ── Flash overlay ───────────────────────────────────
      if (g.flashTimer > 0) g.flashTimer--;

      // ── Render ──────────────────────────────────────────
      renderer.render(scene, camera);
    };
    loop();

    // ── Input handlers ───────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      g.keys[e.code] = e.type === "keydown";
      if (e.type === "keydown" && e.code === "KeyR" && statusRef.current === "playing") {
        if (!g.reloading && g.ammo < AMMO_MAX) {
          g.reloading = true;
          g.reloadTimer = RELOAD_TIME;
          setReloading(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const onMouse = (e: MouseEvent) => {
      if (statusRef.current !== "playing") return;
      g.yaw -= e.movementX * 0.0022;
      g.pitch -= e.movementY * 0.0022;
      g.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, g.pitch));
    };
    document.addEventListener("mousemove", onMouse);

    const onClick = () => {
      if (statusRef.current !== "playing") return;
      if (g.reloading) return;
      if (g.ammo <= 0) {
        g.reloading = true; g.reloadTimer = RELOAD_TIME; setReloading(true); return;
      }
      if (!audioRef.current) return;
      playShot(audioRef.current);
      g.ammo--;
      setAmmo(g.ammo);

      // Bullet
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const bGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const bMat = new THREE.MeshBasicMaterial({ color: 0xffee00 });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.position.copy(camera.position).addScaledVector(dir, 0.5);
      // Bullet trail light
      const bLight = new THREE.PointLight(0xffcc00, 3, 3);
      bMesh.add(bLight);
      scene.add(bMesh);
      g.bullets.push({ mesh: bMesh, vel: dir.clone().multiplyScalar(BULLET_SPEED), life: BULLET_LIFETIME });

      if (g.ammo <= 0) { g.reloading = true; g.reloadTimer = RELOAD_TIME; setReloading(true); }
    };
    mount.addEventListener("click", onClick);

    const onPointerLock = () => {
      if (statusRef.current === "playing") mount.requestPointerLock();
    };
    mount.addEventListener("click", onPointerLock);

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(g.animId);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("mousemove", onMouse);
      mount.removeEventListener("click", onClick);
      mount.removeEventListener("click", onPointerLock);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  const g = gameRef.current;
  const flashAlpha = g.flashTimer > 0 ? (g.flashTimer / 8) * 0.35 : 0;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0010", overflow: "hidden", position: "relative", fontFamily: "'Orbitron', monospace" }}>
      {/* Three.js canvas mount */}
      <div ref={mountRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />

      {/* Damage flash */}
      {flashAlpha > 0 && (
        <div style={{ position: "absolute", inset: 0, background: `rgba(255,0,0,${flashAlpha})`, pointerEvents: "none" }} />
      )}

      {/* HUD */}
      {status === "playing" && (
        <>
          {/* Crosshair */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
            <div style={{ position: "relative", width: 20, height: 20 }}>
              <div style={{ position: "absolute", top: 9, left: 0, width: 20, height: 2, background: "#00ffcc", boxShadow: "0 0 6px #00ffcc" }} />
              <div style={{ position: "absolute", top: 0, left: 9, width: 2, height: 20, background: "#00ffcc", boxShadow: "0 0 6px #00ffcc" }} />
              <div style={{ position: "absolute", top: 8, left: 8, width: 4, height: 4, borderRadius: "50%", border: "1px solid #00ffcc" }} />
            </div>
          </div>

          {/* HP bar */}
          <div style={{ position: "absolute", bottom: 28, left: 28 }}>
            <div style={{ color: "#ff4466", fontSize: 11, letterSpacing: "0.1em", marginBottom: 4, textShadow: "0 0 8px #ff4466" }}>HP</div>
            <div style={{ width: 180, height: 10, background: "rgba(255,0,0,0.15)", borderRadius: 5, border: "1px solid #ff4466", overflow: "hidden" }}>
              <div style={{ width: `${hp}%`, height: "100%", background: hp > 50 ? "linear-gradient(90deg, #ff4466, #ff2244)" : "linear-gradient(90deg, #ff0000, #aa0000)", transition: "width 0.1s", boxShadow: "0 0 8px #ff4466" }} />
            </div>
            <div style={{ color: "#ff4466", fontSize: 12, marginTop: 3 }}>{hp} / {MAX_HP}</div>
          </div>

          {/* Ammo */}
          <div style={{ position: "absolute", bottom: 28, right: 28, textAlign: "right" }}>
            <div style={{ color: "#ffcc00", fontSize: 11, letterSpacing: "0.1em", marginBottom: 4, textShadow: "0 0 8px #ffcc00" }}>ПАТРОНЫ</div>
            {reloading ? (
              <div style={{ color: "#ff8800", fontSize: 18, fontWeight: 700, animation: "pulse 0.4s infinite alternate" }}>ПЕРЕЗАРЯДКА...</div>
            ) : (
              <div style={{ color: "#ffcc00", fontSize: 28, fontWeight: 900, textShadow: "0 0 12px #ffcc00" }}>{ammo} <span style={{ fontSize: 16, opacity: 0.6 }}>/ {AMMO_MAX}</span></div>
            )}
          </div>

          {/* Stats top */}
          <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 24 }}>
            <div style={{ color: "#cc88ff", fontSize: 13, textShadow: "0 0 8px #cc88ff" }}>
              УБИТО: <span style={{ color: "#fff", fontWeight: 700 }}>{kills}</span>
            </div>
            <div style={{ color: "#00ccff", fontSize: 13, textShadow: "0 0 8px #00ccff" }}>
              ВОЛНА: <span style={{ color: "#fff", fontWeight: 700 }}>{wave}</span>
            </div>
          </div>

          {/* Controls hint */}
          <div style={{ position: "absolute", top: 16, right: 16, color: "#334466", fontSize: 11, textAlign: "right", lineHeight: 1.7 }}>
            WASD — движение<br />
            МЫШЬ — прицел<br />
            КЛИК — выстрел<br />
            R — перезарядка
          </div>
        </>
      )}

      {/* MENU */}
      {status === "menu" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(4,0,20,0.88)", backdropFilter: "blur(8px)" }}>
          <div style={{ fontSize: "clamp(28px, 5vw, 60px)", fontWeight: 900, background: "linear-gradient(135deg, #cc44ff, #4488ff, #00ffcc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 8, letterSpacing: "0.08em" }}>
            NEON STRIKE
          </div>
          <div style={{ color: "#6644aa", fontSize: 14, marginBottom: 48, letterSpacing: "0.2em" }}>3D ARENA SHOOTER</div>
          <button onClick={startGame} style={{ fontFamily: "'Orbitron', monospace", fontSize: 18, fontWeight: 700, color: "#0a0020", background: "linear-gradient(135deg, #cc44ff, #8822ff)", border: "none", borderRadius: 8, padding: "16px 56px", cursor: "pointer", boxShadow: "0 0 30px rgba(180,80,255,0.6)", letterSpacing: "0.1em", marginBottom: 24 }}>
            ИГРАТЬ
          </button>
          <div style={{ color: "#334466", fontSize: 12, lineHeight: 2, textAlign: "center" }}>
            WASD — движение · МЫШЬ — прицел · КЛИК — выстрел · R — перезарядка
          </div>
        </div>
      )}

      {/* DEAD */}
      {status === "dead" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(20,0,5,0.92)", backdropFilter: "blur(8px)" }}>
          <div style={{ fontSize: "clamp(32px, 5vw, 58px)", fontWeight: 900, color: "#ff2244", textShadow: "0 0 30px #ff2244, 0 0 60px #ff2244", marginBottom: 16 }}>
            ВЫ ПОГИБЛИ
          </div>
          <div style={{ color: "#aaa", fontSize: 20, fontFamily: "'Rajdhani', sans-serif", marginBottom: 6 }}>
            Убито врагов: <span style={{ color: "#cc88ff", fontWeight: 700 }}>{kills}</span>
          </div>
          <div style={{ color: "#aaa", fontSize: 17, fontFamily: "'Rajdhani', sans-serif", marginBottom: 40 }}>
            Волна: <span style={{ color: "#00ccff", fontWeight: 700 }}>{wave}</span>
          </div>
          <button onClick={startGame} style={{ fontFamily: "'Orbitron', monospace", fontSize: 16, fontWeight: 700, color: "#0a0010", background: "linear-gradient(135deg, #ff4466, #cc0033)", border: "none", borderRadius: 8, padding: "14px 48px", cursor: "pointer", boxShadow: "0 0 28px rgba(255,40,80,0.6)", letterSpacing: "0.1em" }}>
            ЕЩЁ РАЗ
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse { from { opacity: 1; } to { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
