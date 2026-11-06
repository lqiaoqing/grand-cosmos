/* 恢宏宇宙 · Grand Cosmos — Canvas2D cinematic scale explorer */
(() => {
  "use strict";

  // ───────── constants ─────────
  const C_LIGHT = 299792458; // m/s
  const AU = 1.495978707e11;
  const LY = 9.4607304725808e15;
  const PC = 3.085677581e16;

  const canvas = document.getElementById("cosmos");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  const elName = document.getElementById("scale-name");
  const elDist = document.getElementById("scale-dist");
  const elLight = document.getElementById("scale-light");
  const elHint = document.getElementById("hud-hint");
  const elTrack = document.getElementById("milestone-track");
  const elToast = document.getElementById("focus-toast");
  const elFps = document.getElementById("fps");
  const btnTour = document.getElementById("btn-tour");
  const btnHome = document.getElementById("btn-home");
  const btnIn = document.getElementById("btn-zoom-in");
  const btnOut = document.getElementById("btn-zoom-out");
  const btnLabels = document.getElementById("btn-labels");

  // log10(viewRadius in meters). Earth~7.0 → Observable~26.65
  const Z_MIN = 6.85;
  const Z_MAX = 26.72;

  /** @type {{id:string,name:string,z:number,blurb:string}[]} */
  const MILESTONES = [
    { id: "earth", name: "地球与大气", z: 7.15, blurb: "蓝色大理石与薄薄大气层" },
    { id: "moon", name: "地月系统", z: 8.75, blurb: "三十个地球并排的距离" },
    { id: "inner", name: "内太阳系", z: 11.25, blurb: "水星 · 金星 · 地球 · 火星" },
    { id: "outer", name: "外太阳系", z: 12.55, blurb: "气态巨行星的王国" },
    { id: "kuiper", name: "柯伊伯带", z: 12.95, blurb: "冰质天体的寒冷边疆" },
    { id: "helios", name: "日球层与旅行者", z: 13.35, blurb: "太阳风吹到的最远边界" },
    { id: "oort", name: "奥尔特云", z: 15.85, blurb: "彗星的遥远苗圃" },
    { id: "proxima", name: "比邻星", z: 16.6, blurb: "最近的另一颗恒星" },
    { id: "localstars", name: "太阳邻域", z: 17.5, blurb: "附近的恒星与星云" },
    { id: "milkyway", name: "银河系", z: 20.95, blurb: "两千亿颗恒星的旋涡家园" },
    { id: "localgroup", name: "本星系群", z: 22.5, blurb: "银河、仙女座与五十多个伙伴" },
    { id: "virgo", name: "室女座星系团", z: 23.75, blurb: "本超星系团的引力中心" },
    { id: "cosmicweb", name: "宇宙网", z: 25.15, blurb: "星系丝状结构与巨大空洞" },
    { id: "observable", name: "可观测宇宙", z: 26.55, blurb: "光能抵达的最远地平线" },
  ];

  // ───────── state ─────────
  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    z: 7.3,
    // pan in world meters relative to focus (Sun near origin)
    cx: 0,
    cy: 0,
    showLabels: true,
    dragging: false,
    lastX: 0,
    lastY: 0,
    pointers: new Map(),
    pinchStartDist: 0,
    pinchStartZ: 0,
    tour: null, // {from,to,t0,dur,waypoints,idx}
    animZ: null, // smooth zoom target
    animPan: null,
    seed: 20261106,
    starsNear: null,
    starsMid: null,
    starsFar: null,
    nebulae: null,
    localStars: null,
    galaxies: null,
    filaments: null,
    dust: null,
    time: 0,
    fps: 60,
    frames: 0,
    fpsT: 0,
    hintHidden: false,
    reducedMotion: false,
  };

  // ───────── utils ─────────
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function viewRadius() {
    return Math.pow(10, state.z);
  }

  function formatDist(meters) {
    if (meters < 1e3) return meters.toFixed(0) + " 米";
    if (meters < 1e6) return (meters / 1e3).toFixed(1) + " 千米";
    if (meters < 0.01 * AU) return (meters / 1e6).toFixed(1) + " 百万千米";
    if (meters < 1000 * AU) {
      const au = meters / AU;
      return au >= 10 ? au.toFixed(0) + " 天文单位" : au.toFixed(2) + " 天文单位";
    }
    if (meters < 1000 * LY) {
      const ly = meters / LY;
      return ly >= 10 ? ly.toFixed(0) + " 光年" : ly.toFixed(2) + " 光年";
    }
    if (meters < 1e3 * PC * 1e6) {
      const mpc = meters / (PC * 1e6);
      if (mpc < 1) return (meters / (PC * 1e3)).toFixed(0) + " 千秒差距";
      return mpc >= 10 ? mpc.toFixed(0) + " 百万秒差距" : mpc.toFixed(1) + " 百万秒差距";
    }
    return (meters / LY / 1e9).toFixed(1) + " 十亿光年";
  }

  function formatLight(meters) {
    const s = meters / C_LIGHT;
    if (s < 1) return (s * 1000).toFixed(0) + " 毫秒";
    if (s < 60) return s.toFixed(1) + " 秒";
    if (s < 3600) return (s / 60).toFixed(1) + " 分钟";
    if (s < 86400) return (s / 3600).toFixed(1) + " 小时";
    if (s < 365.25 * 86400) return (s / 86400).toFixed(1) + " 天";
    const y = s / (365.25 * 86400);
    if (y < 1000) return y.toFixed(y < 10 ? 2 : 0) + " 年";
    if (y < 1e6) return (y / 1000).toFixed(1) + " 千年";
    if (y < 1e9) return (y / 1e6).toFixed(1) + " 百万年";
    // Beyond ~age of universe, expansion matters — show cosmic-age framing
    if (y > 13.8e9) return "逾宇宙年龄（约 138 亿年）";
    return (y / 1e9).toFixed(2) + " 十亿年";
  }

  function currentMilestone() {
    let best = MILESTONES[0];
    let bestD = Infinity;
    for (const m of MILESTONES) {
      const d = Math.abs(m.z - state.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  function worldToScreen(wx, wy) {
    const R = viewRadius();
    const scale = Math.min(state.w, state.h) / (2 * R);
    return {
      x: state.w / 2 + (wx - state.cx) * scale,
      y: state.h / 2 + (wy - state.cy) * scale,
      s: scale,
    };
  }

  function screenToWorld(sx, sy) {
    const R = viewRadius();
    const scale = Math.min(state.w, state.h) / (2 * R);
    return {
      x: state.cx + (sx - state.w / 2) / scale,
      y: state.cy + (sy - state.h / 2) / scale,
    };
  }

  // ───────── procedural content ─────────
  function buildStars(n, minR, maxR, rng) {
    const arr = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = minR * Math.pow(maxR / minR, rng());
      arr[i] = {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        b: 0.35 + rng() * 0.65,
        s: 0.6 + rng() * 1.8,
        hue: rng() < 0.15 ? 210 + rng() * 40 : rng() < 0.08 ? 30 + rng() * 20 : 200 + rng() * 30,
      };
    }
    return arr;
  }

  function buildNebulae(rng) {
    const list = [];
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.3 + rng() * 2.2) * 1e17;
      list.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        rx: (0.15 + rng() * 0.55) * 1e17,
        ry: (0.1 + rng() * 0.4) * 1e17,
        rot: rng() * Math.PI,
        hue: [300, 200, 20, 260, 330][i % 5] + rng() * 20,
        a: 0.04 + rng() * 0.07,
      });
    }
    // Orion-ish near local
    list.push({ x: 1.3e16, y: -0.8e16, rx: 4e15, ry: 2.5e15, rot: 0.4, hue: 200, a: 0.09 });
    list.push({ x: -0.6e16, y: 1.1e16, rx: 3e15, ry: 2e15, rot: -0.3, hue: 320, a: 0.07 });
    return list;
  }

  function buildLocalStars(rng) {
    // Named nearby stars (approx positions on a schematic plane, distances real-ish)
    const names = [
      { name: "太阳", d: 0, ang: 0, color: "#ffe9a8", size: 1.4 },
      { name: "比邻星", d: 4.24 * LY, ang: 0.4, color: "#ff8866", size: 0.7 },
      { name: "半人马座α", d: 4.37 * LY, ang: 0.42, color: "#fff2c8", size: 1.1 },
      { name: "巴纳德星", d: 5.96 * LY, ang: 2.1, color: "#ff9a70", size: 0.65 },
      { name: "狼 359", d: 7.86 * LY, ang: 3.5, color: "#ff7a55", size: 0.55 },
      { name: "天狼星", d: 8.6 * LY, ang: 5.2, color: "#dcecff", size: 1.35 },
      { name: "ε 波江", d: 10.5 * LY, ang: 1.1, color: "#ffe0a0", size: 0.95 },
      { name: "南河三", d: 11.4 * LY, ang: 4.0, color: "#fff8e0", size: 1.05 },
      { name: "τ 鲸", d: 11.9 * LY, ang: 0.2, color: "#ffe8b0", size: 0.9 },
      { name: "天鹅座 61", d: 11.4 * LY, ang: 2.8, color: "#ffd090", size: 0.8 },
      { name: "拉兰德 21185", d: 8.31 * LY, ang: 1.7, color: "#ff8a60", size: 0.6 },
      { name: "罗斯 154", d: 9.68 * LY, ang: 4.6, color: "#ff8060", size: 0.55 },
    ];
    return names.map((s) => ({
      ...s,
      x: Math.cos(s.ang) * s.d,
      y: Math.sin(s.ang) * s.d,
    }));
  }

  function buildGalaxies(rng) {
    // Local Group + nearby clusters (schematic)
    const g = [
      { name: "银河系", x: 0, y: 0, type: "spiral", size: 5e20, bright: 1 },
      { name: "仙女座星系", x: 2.5e22, y: 0.4e22, type: "spiral", size: 6e20, bright: 0.95 },
      { name: "三角座星系", x: 2.7e22, y: -0.5e22, type: "spiral", size: 2.5e20, bright: 0.7 },
      { name: "大麦哲伦云", x: 1.6e21, y: -0.9e21, type: "irregular", size: 7e19, bright: 0.75 },
      { name: "小麦哲伦云", x: 1.9e21, y: -1.2e21, type: "irregular", size: 4e19, bright: 0.6 },
    ];
    // Virgo cluster members (schematic cloud)
    for (let i = 0; i < 48; i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.2 + rng() * 0.9) * 5e22;
      g.push({
        name: i < 3 ? ["M87", "M49", "M86"][i] : "",
        x: 5.0e23 + Math.cos(a) * r,
        y: 0.4e23 + Math.sin(a) * r * 0.7,
        type: rng() < 0.35 ? "elliptical" : "spiral",
        size: (0.3 + rng() * 1.2) * 4e20,
        bright: 0.35 + rng() * 0.45,
      });
    }
    // Background galaxies for cosmic web nodes
    for (let i = 0; i < 220; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.55) * 4e25;
      g.push({
        name: "",
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.85,
        type: rng() < 0.4 ? "elliptical" : "spiral",
        size: (0.2 + rng()) * 6e20,
        bright: 0.15 + rng() * 0.35,
      });
    }
    return g;
  }

  function buildFilaments(rng) {
    const fils = [];
    for (let i = 0; i < 28; i++) {
      const pts = [];
      let x = (rng() - 0.5) * 6e25;
      let y = (rng() - 0.5) * 5e25;
      const ang0 = rng() * Math.PI * 2;
      const len = (0.4 + rng() * 1.4) * 8e24;
      const segs = 8 + (rng() * 8 | 0);
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const wobble = Math.sin(t * 6 + i) * 0.15 * len;
        pts.push({
          x: x + Math.cos(ang0) * t * len + Math.cos(ang0 + Math.PI / 2) * wobble,
          y: y + Math.sin(ang0) * t * len + Math.sin(ang0 + Math.PI / 2) * wobble,
        });
      }
      fils.push({ pts, a: 0.08 + rng() * 0.12, w: 0.6 + rng() * 1.4 });
    }
    return fils;
  }

  function buildDust(rng) {
    const d = [];
    for (let i = 0; i < 80; i++) {
      d.push({
        a: rng() * Math.PI * 2,
        r: 0.2 + rng() * 0.9,
        s: 0.4 + rng() * 1.2,
        sp: 0.02 + rng() * 0.06,
        hue: 200 + rng() * 40,
      });
    }
    return d;
  }

  function initContent() {
    const rng = mulberry32(state.seed);
    state.starsNear = buildStars(900, 5e7, 3e13, rng);
    state.starsMid = buildStars(1400, 1e13, 2e18, rng);
    state.starsFar = buildStars(1800, 1e18, 5e25, rng);
    state.nebulae = buildNebulae(rng);
    state.localStars = buildLocalStars(rng);
    state.galaxies = buildGalaxies(rng);
    state.filaments = buildFilaments(rng);
    state.dust = buildDust(rng);
  }

  // ───────── solar system bodies (schematic, distances real AU) ─────────
  const PLANETS = [
    { name: "水星", a: 0.387 * AU, r: 2439e3, color: "#b1b1b1", mag: 2200 },
    { name: "金星", a: 0.723 * AU, r: 6052e3, color: "#e8c58a", mag: 1800 },
    { name: "地球", a: 1.000 * AU, r: 6371e3, color: "#6db3ff", mag: 1600 },
    { name: "火星", a: 1.524 * AU, r: 3390e3, color: "#d0785a", mag: 2000 },
    { name: "木星", a: 5.203 * AU, r: 69911e3, color: "#d9b48a", mag: 700 },
    { name: "土星", a: 9.537 * AU, r: 58232e3, color: "#e6d3a3", mag: 650 },
    { name: "天王星", a: 19.19 * AU, r: 25362e3, color: "#9fd6e5", mag: 900 },
    { name: "海王星", a: 30.07 * AU, r: 24622e3, color: "#5b7cff", mag: 900 },
  ];
  // Earth phase = 0 so it starts at (+AU, 0), matching the home camera
  const PLANET_PHASE = [0.35, 1.85, 0.0, 2.55, 0.9, 3.4, 4.6, 5.5];

  function planetAngle(i, t) {
    const pl = PLANETS[i];
    const periodFactor = Math.pow(pl.a / AU, 1.5);
    // Visual orbital drift (not real-time): slow enough that Earth-scale view stays readable
    return (t * 0.00035) / periodFactor + PLANET_PHASE[i];
  }

  function earthPos(t) {
    const ang = planetAngle(2, t);
    return { x: Math.cos(ang) * AU, y: Math.sin(ang) * AU };
  }
  const MOON_D = 384400e3;
  const SUN_R = 696340e3;
  const VOYAGER1 = 164 * AU; // approximate modern
  const HELIOPAUSE = 120 * AU;
  const OORT_INNER = 2000 * AU;
  const OORT_OUTER = 100000 * AU;

  // ───────── resize ─────────
  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = state.w + "px";
    canvas.style.height = state.h + "px";
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  // ───────── drawing helpers ─────────
  function drawBackground() {
    const g = ctx.createRadialGradient(
      state.w * 0.5, state.h * 0.42, 0,
      state.w * 0.5, state.h * 0.5, Math.max(state.w, state.h) * 0.75
    );
    // subtle hue shift with scale
    const t = clamp((state.z - 7) / 20, 0, 1);
    g.addColorStop(0, `rgb(${8 + t * 6},${10 + t * 4},${24 - t * 6})`);
    g.addColorStop(0.55, "#03040c");
    g.addColorStop(1, "#000008");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function drawStarLayer(stars, parallax, alphaMul, sizeMul) {
    const R = viewRadius();
    const cx = state.cx * parallax;
    const cy = state.cy * parallax;
    const scale = Math.min(state.w, state.h) / (2 * R);
    const margin = 40;
    ctx.save();
    for (const s of stars) {
      const x = state.w / 2 + (s.x - cx) * scale;
      const y = state.h / 2 + (s.y - cy) * scale;
      if (x < -margin || y < -margin || x > state.w + margin || y > state.h + margin) continue;
      // cull if star is way outside typical scale
      const dist = Math.hypot(s.x, s.y);
      if (dist > R * 12) continue;
      const sz = clamp(s.s * sizeMul * (0.7 + Math.log10(R + 1) * 0.02), 0.4, 2.8);
      const a = s.b * alphaMul;
      ctx.fillStyle = `hsla(${s.hue}, 70%, 85%, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDustParticles() {
    if (state.z > 14 || state.z < 7.5) return;
    const t = state.time;
    ctx.save();
    for (const d of state.dust) {
      const ang = d.a + t * d.sp * 0.15;
      const px = state.w / 2 + Math.cos(ang) * d.r * Math.min(state.w, state.h) * 0.45;
      const py = state.h / 2 + Math.sin(ang) * d.r * Math.min(state.w, state.h) * 0.32;
      ctx.fillStyle = `hsla(${d.hue}, 60%, 80%, 0.08)`;
      ctx.beginPath();
      ctx.arc(px, py, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function glowCircle(x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace("ALPHA", String(alpha)));
    g.addColorStop(0.45, color.replace("ALPHA", String(alpha * 0.35)));
    g.addColorStop(1, color.replace("ALPHA", "0"));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLabel(x, y, text, opts = {}) {
    if (!state.showLabels || !text) return;
    const size = opts.size || 12;
    const color = opts.color || "rgba(220,235,255,0.85)";
    const dy = opts.dy ?? -14;
    ctx.save();
    ctx.font = `${opts.weight || 500} ${size}px "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = opts.align || "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(0,0,10,0.45)";
    ctx.fillText(text, x + 1, y + dy + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + dy);
    ctx.restore();
  }

  // ───────── layer: Earth / Moon / Solar System ─────────
  function planetDisplayRadius(trueR, mag, scale) {
    // enlarge for visibility; still keep relative order roughly
    const base = Math.pow(trueR, 0.55) * 0.000012;
    return clamp(base * mag * scale * 0.0012, 2.2, 28);
  }

  function drawOrbit(a) {
    const p0 = worldToScreen(a, 0);
    const p1 = worldToScreen(0, 0);
    const rad = Math.abs(p0.x - p1.x);
    if (rad < 4 || rad > Math.max(state.w, state.h) * 2) return;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, rad, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(160,190,255,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawSun() {
    const p = worldToScreen(0, 0);
    const R = viewRadius();
    if (R > 5e16) return; // too far, become a star
    const scale = p.s;
    let pr = SUN_R * scale;
    // enlarge when small
    if (pr < 3) pr = clamp(3 + Math.log10(R) * 0.15, 3, 14);
    if (pr > 120) pr = 120;

    glowCircle(p.x, p.y, pr * 4.5, "rgba(255,200,80,ALPHA)", 0.22);
    glowCircle(p.x, p.y, pr * 2.2, "rgba(255,230,140,ALPHA)", 0.55);
    const g = ctx.createRadialGradient(p.x - pr * 0.2, p.y - pr * 0.2, pr * 0.1, p.x, p.y, pr);
    g.addColorStop(0, "#fff7d6");
    g.addColorStop(0.5, "#ffd56a");
    g.addColorStop(1, "#ff9a2e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
    ctx.fill();
    if (state.z < 13.5) drawLabel(p.x, p.y, "太阳", { size: 13, dy: -(pr + 16), color: "rgba(255,230,160,0.9)" });
  }

  function drawSolarSystem() {
    if (state.z > 16.2) return;

    // asteroid belt band
    if (state.z > 10.8 && state.z < 13.5) {
      const p0 = worldToScreen(0, 0);
      const r1 = 2.2 * AU * p0.s;
      const r2 = 3.3 * AU * p0.s;
      if (r2 > 8) {
        const g = ctx.createRadialGradient(p0.x, p0.y, r1, p0.x, p0.y, r2);
        g.addColorStop(0, "rgba(180,190,210,0)");
        g.addColorStop(0.5, "rgba(180,190,210,0.08)");
        g.addColorStop(1, "rgba(180,190,210,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r2, 0, Math.PI * 2);
        ctx.arc(p0.x, p0.y, r1, 0, Math.PI * 2, true);
        ctx.fill();
      }
    }

    // Kuiper belt
    if (state.z > 12.2 && state.z < 14.2) {
      const p0 = worldToScreen(0, 0);
      const r1 = 30 * AU * p0.s;
      const r2 = 50 * AU * p0.s;
      if (r2 > 10) {
        const g = ctx.createRadialGradient(p0.x, p0.y, r1, p0.x, p0.y, r2);
        g.addColorStop(0, "rgba(150,180,220,0)");
        g.addColorStop(0.5, "rgba(150,180,220,0.07)");
        g.addColorStop(1, "rgba(150,180,220,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r2, 0, Math.PI * 2);
        ctx.arc(p0.x, p0.y, Math.max(1, r1), 0, Math.PI * 2, true);
        ctx.fill();
      }
    }

    // Heliosphere
    if (state.z > 12.8 && state.z < 14.5) {
      const p0 = worldToScreen(0, 0);
      const rh = HELIOPAUSE * p0.s;
      if (rh > 12) {
        ctx.beginPath();
        ctx.ellipse(p0.x - rh * 0.08, p0.y, rh * 1.05, rh * 0.92, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(120,180,255,0.18)";
        ctx.lineWidth = 2;
        ctx.stroke();
        glowCircle(p0.x, p0.y, rh * 1.1, "rgba(100,160,255,ALPHA)", 0.05);
        if (state.showLabels) drawLabel(p0.x + rh * 0.7, p0.y - rh * 0.55, "日球层顶", { size: 11, color: "rgba(150,200,255,0.65)" });
      }
    }

    // Oort cloud
    if (state.z > 14.5 && state.z < 17.2) {
      const p0 = worldToScreen(0, 0);
      const r1 = OORT_INNER * p0.s;
      const r2 = OORT_OUTER * p0.s;
      if (r2 > 20) {
        const g = ctx.createRadialGradient(p0.x, p0.y, Math.max(1, r1), p0.x, p0.y, r2);
        g.addColorStop(0, "rgba(160,190,255,0)");
        g.addColorStop(0.55, "rgba(160,190,255,0.045)");
        g.addColorStop(1, "rgba(160,190,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r2, 0, Math.PI * 2);
        ctx.fill();
        if (state.showLabels && state.z > 15.2) {
          drawLabel(p0.x, p0.y - r2 * 0.72, "奥尔特云", { size: 13, color: "rgba(170,200,255,0.7)" });
        }
      }
    }

    drawSun();

    // planets
    if (state.z < 15.5) {
      for (let i = 0; i < PLANETS.length; i++) {
        const pl = PLANETS[i];
        const ang = planetAngle(i, state.time);
        const x = Math.cos(ang) * pl.a;
        const y = Math.sin(ang) * pl.a;

        if (state.z < 13.8) drawOrbit(pl.a);

        if (i === 2 && state.z < 9.5) {
          // Earth drawn in close-up pass below
          continue;
        }

        const p = worldToScreen(x, y);
        const pr = state.z < 8.5 && i === 2
          ? clamp(pl.r * p.s, 4, 80)
          : planetDisplayRadius(pl.r, pl.mag, p.s);

        if (i === 5 && pr > 3) {
          // Saturn rings
          ctx.strokeStyle = "rgba(220,200,150,0.45)";
          ctx.lineWidth = Math.max(1, pr * 0.35);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, pr * 2.1, pr * 0.55, -0.4, 0, Math.PI * 2);
          ctx.stroke();
        }

        glowCircle(p.x, p.y, pr * 2.4, pl.color.replace(")", ",ALPHA)").replace("rgb", "rgba").includes("ALPHA")
          ? `rgba(200,200,255,ALPHA)`
          : `rgba(180,200,255,ALPHA)`, 0.25);

        // parse hex to glow
        glowCircle(p.x, p.y, pr * 2.2, "rgba(200,220,255,ALPHA)", 0.15);

        ctx.fillStyle = pl.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
        ctx.fill();

        if (state.z < 13.2 || (state.z < 14.2 && i >= 4)) {
          drawLabel(p.x, p.y, pl.name, { size: 11, dy: -(pr + 10) });
        }
      }
    }

    // Earth+Moon close-up pass
    if (state.z < 9.8) {
      // use same orbital angle as planet Earth
      const pl = PLANETS[2];
      const ang = planetAngle(2, state.time);
      const ex = Math.cos(ang) * pl.a;
      const ey = Math.sin(ang) * pl.a;

      const p = worldToScreen(ex, ey);
      let er;
      if (state.z < 8.3) er = clamp(pl.r * p.s, 10, 100);
      else er = planetDisplayRadius(pl.r, pl.mag, p.s);

      glowCircle(p.x, p.y, er * 1.85, "rgba(100,170,255,ALPHA)", 0.4);
      const g = ctx.createRadialGradient(p.x - er * 0.3, p.y - er * 0.3, er * 0.15, p.x, p.y, er);
      g.addColorStop(0, "#a8d8ff");
      g.addColorStop(0.5, "#3f82d4");
      g.addColorStop(1, "#163968");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, er, 0, Math.PI * 2);
      ctx.fill();
      if (er > 12) {
        ctx.fillStyle = "rgba(80,160,100,0.5)";
        ctx.beginPath();
        ctx.ellipse(p.x - er * 0.1, p.y, er * 0.4, er * 0.25, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      drawLabel(p.x, p.y, "地球", { size: state.z < 8.2 ? 16 : 12, dy: -(er + 14) });

      const mang = ang * 13.368 + 0.8;
      const mx = ex + Math.cos(mang) * MOON_D;
      const my = ey + Math.sin(mang) * MOON_D;
      const mp = worldToScreen(mx, my);
      const mr = state.z < 8.5 ? clamp(1737e3 * mp.s, 2.5, 28) : clamp(planetDisplayRadius(1737e3, 2800, mp.s), 1.8, 12);
      ctx.fillStyle = "#cccdd4";
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, mr, 0, Math.PI * 2);
      ctx.fill();
      if (state.z < 9.6) drawLabel(mp.x, mp.y, "月球", { size: 11, dy: -(mr + 10), color: "rgba(210,215,230,0.85)" });

      if (state.z > 7.9 && state.z < 9.7) {
        const orad = MOON_D * p.s;
        if (orad > 8 && orad < Math.max(state.w, state.h) * 1.2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, orad, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(170,195,255,0.2)";
          ctx.stroke();
        }
      }
    }

    // Voyager 1
    if (state.z > 12.6 && state.z < 14.8) {
      const vx = VOYAGER1;
      const vy = VOYAGER1 * 0.18;
      const p = worldToScreen(vx, vy);
      glowCircle(p.x, p.y, 10, "rgba(180,220,255,ALPHA)", 0.5);
      ctx.fillStyle = "#dff2ff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      drawLabel(p.x, p.y, "旅行者 1 号", { size: 11, dy: -14, color: "rgba(180,220,255,0.8)" });
    }
  }

  // ───────── local stars & nebulae ─────────
  function drawNebulae() {
    if (state.z < 15.5 || state.z > 19.5) return;
    const fade = state.z < 16.2 ? smoothstep((state.z - 15.5) / 0.7)
      : state.z > 18.8 ? 1 - smoothstep((state.z - 18.8) / 0.7) : 1;
    ctx.save();
    for (const n of state.nebulae) {
      const p = worldToScreen(n.x, n.y);
      const rx = n.rx * p.s;
      const ry = n.ry * p.s;
      if (rx < 2 || rx > Math.max(state.w, state.h) * 3) continue;
      ctx.translate(p.x, p.y);
      ctx.rotate(n.rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `hsla(${n.hue}, 80%, 65%, ${n.a * fade})`);
      g.addColorStop(0.5, `hsla(${n.hue + 20}, 70%, 45%, ${n.a * 0.45 * fade})`);
      g.addColorStop(1, `hsla(${n.hue}, 60%, 30%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }
    ctx.restore();
  }

  function drawLocalStars() {
    if (state.z < 15.8 || state.z > 19.8) return;
    const fade = state.z < 16.4 ? smoothstep((state.z - 15.8) / 0.6)
      : state.z > 19.2 ? 1 - smoothstep((state.z - 19.2) / 0.6) : 1;

    for (const s of state.localStars) {
      if (s.d === 0 && state.z < 16.5) continue; // sun already drawn
      const p = worldToScreen(s.x, s.y);
      const sz = clamp(s.size * (1.2 + (19 - state.z) * 0.15), 1.2, 6) * fade;
      glowCircle(p.x, p.y, sz * 4, "rgba(220,230,255,ALPHA)", 0.35 * fade);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (state.z > 16.2 && state.z < 18.8) {
        drawLabel(p.x, p.y, s.name, { size: 11, dy: -(sz + 12), color: `rgba(220,230,255,${0.75 * fade})` });
      }
    }
  }

  // ───────── Milky Way ─────────
  function drawMilkyWay() {
    if (state.z < 18.8 || state.z > 23.2) return;
    const fade = state.z < 19.6 ? smoothstep((state.z - 18.8) / 0.8)
      : state.z > 22.4 ? 1 - smoothstep((state.z - 22.4) / 0.8) : 1;

    const p0 = worldToScreen(0, 0);
    // Galaxy diameter ~100k ly = ~9.5e20 m; Sun ~26k ly from center
    const sunOffset = 2.6e20;
    // Draw galaxy centered slightly offset so Sun isn't dead center of arms visually
    const gx = -sunOffset * 0.15;
    const gy = 0;
    const gp = worldToScreen(gx, gy);
    const scale = gp.s;
    const radius = 5.0e20 * scale; // ~53k ly radius

    if (radius < 8) return;

    ctx.save();
    ctx.translate(gp.x, gp.y);
    ctx.rotate(-0.35);
    ctx.globalAlpha = fade;

    // halo
    const halo = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius * 1.35);
    halo.addColorStop(0, "rgba(180,200,255,0.08)");
    halo.addColorStop(0.5, "rgba(120,140,220,0.05)");
    halo.addColorStop(1, "rgba(40,40,80,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.35, radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // disk
    const disk = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    disk.addColorStop(0, "rgba(255,230,180,0.22)");
    disk.addColorStop(0.25, "rgba(220,190,160,0.14)");
    disk.addColorStop(0.7, "rgba(120,140,200,0.08)");
    disk.addColorStop(1, "rgba(40,50,90,0)");
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();

    // spiral arms
    ctx.lineWidth = Math.max(1.5, radius * 0.045);
    ctx.lineCap = "round";
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      const a0 = arm * (Math.PI / 2) + 0.2;
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const ang = a0 + t * 3.4;
        const r = radius * (0.12 + t * 0.88);
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r * 0.62;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(170,200,255,${0.14 + arm % 2 * 0.05})`;
      ctx.stroke();
      // soft arm glow
      ctx.strokeStyle = `rgba(200,220,255,${0.05})`;
      ctx.lineWidth = Math.max(3, radius * 0.09);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.5, radius * 0.045);
    }

    // core
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.18);
    core.addColorStop(0, "rgba(255,240,200,0.55)");
    core.addColorStop(0.4, "rgba(255,200,120,0.25)");
    core.addColorStop(1, "rgba(255,160,80,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Sun marker in galaxy
    if (state.z > 19.5 && state.z < 22.0) {
      const sp = worldToScreen(0, 0);
      glowCircle(sp.x, sp.y, 8, "rgba(255,220,120,ALPHA)", 0.7 * fade);
      ctx.fillStyle = `rgba(255,230,150,${fade})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      drawLabel(sp.x, sp.y, "太阳系", { size: 11, dy: -14, color: `rgba(255,230,160,${0.85 * fade})` });
    }

    if (state.z > 20.2 && state.z < 22.5) {
      drawLabel(gp.x, gp.y - radius * 0.55, "银河系", { size: 15, color: `rgba(210,225,255,${0.85 * fade})` });
    }
  }

  // ───────── Local Group / Virgo / Cosmic Web ─────────
  function drawGalaxyIcon(g, fade) {
    const p = worldToScreen(g.x, g.y);
    const sz = clamp(g.size * p.s, 1.5, 90);
    if (sz < 0.8) return;
    if (p.x < -100 || p.y < -100 || p.x > state.w + 100 || p.y > state.h + 100) return;

    ctx.save();
    ctx.globalAlpha = fade * g.bright;
    ctx.translate(p.x, p.y);

    if (g.type === "spiral") {
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
      rg.addColorStop(0, "rgba(255,230,190,0.55)");
      rg.addColorStop(0.35, "rgba(180,190,255,0.22)");
      rg.addColorStop(1, "rgba(80,90,160,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(0, 0, sz, sz * 0.55, 0.4, 0, Math.PI * 2);
      ctx.fill();
      if (sz > 8) {
        ctx.strokeStyle = "rgba(180,200,255,0.2)";
        ctx.lineWidth = Math.max(1, sz * 0.06);
        ctx.beginPath();
        ctx.ellipse(0, 0, sz * 0.85, sz * 0.4, 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (g.type === "elliptical") {
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
      rg.addColorStop(0, "rgba(255,240,210,0.5)");
      rg.addColorStop(1, "rgba(180,160,120,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(0, 0, sz * 0.7, sz * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
      rg.addColorStop(0, "rgba(200,220,255,0.4)");
      rg.addColorStop(1, "rgba(100,120,180,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, sz * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (g.name && sz > 6) {
      drawLabel(p.x, p.y, g.name, {
        size: g.name === "银河系" || g.name === "仙女座星系" ? 14 : 11,
        dy: -(sz * 0.55 + 12),
        color: `rgba(210,225,255,${0.8 * fade})`,
      });
    }
  }

  function drawLocalGroup() {
    if (state.z < 21.2 || state.z > 24.2) return;
    const fade = state.z < 21.9 ? smoothstep((state.z - 21.2) / 0.7)
      : state.z > 23.6 ? 1 - smoothstep((state.z - 23.6) / 0.6) : 1;

    for (const g of state.galaxies) {
      if (Math.hypot(g.x, g.y) > 8e22) continue;
      drawGalaxyIcon(g, fade);
    }

    if (state.z > 21.8 && state.z < 23.5) {
      const p = worldToScreen(1.2e22, 0);
      drawLabel(p.x, p.y - 40, "本星系群", { size: 14, color: `rgba(190,210,255,${0.7 * fade})` });
    }
  }

  function drawVirgoAndWeb() {
    if (state.z < 22.8) return;
    const fade = state.z < 23.5 ? smoothstep((state.z - 22.8) / 0.7) : 1;

    // filaments first
    if (state.z > 24.0) {
      const ff = state.z < 24.6 ? smoothstep((state.z - 24.0) / 0.6) : 1;
      ctx.save();
      for (const f of state.filaments) {
        ctx.beginPath();
        for (let i = 0; i < f.pts.length; i++) {
          const p = worldToScreen(f.pts[i].x, f.pts[i].y);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(140,170,255,${f.a * ff * 0.9})`;
        ctx.lineWidth = f.w;
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const g of state.galaxies) {
      const d = Math.hypot(g.x, g.y);
      if (state.z < 24.0 && d < 8e22) continue; // local already drawn
      if (state.z < 23.2 && d > 2e24) continue;
      const lf = fade * (d > 1e24 ? clamp((state.z - 24) / 1.2, 0, 1) : 1);
      if (lf <= 0) continue;
      drawGalaxyIcon(g, lf);
    }

    if (state.z > 23.3 && state.z < 24.8) {
      const p = worldToScreen(5.0e23, 0.4e23);
      drawLabel(p.x, p.y - 50, "室女座星系团", { size: 14, color: `rgba(200,215,255,${0.75 * fade})` });
    }

    if (state.z > 24.6 && state.z < 26.2) {
      const p = worldToScreen(state.cx, state.cy);
      drawLabel(state.w / 2, state.h * 0.22, "宇宙网 · 星系丝状结构", {
        size: 14,
        color: `rgba(170,195,255,${0.55 * clamp((state.z - 24.6) / 0.5, 0, 1)})`,
      });
    }
  }

  function drawObservableHorizon() {
    if (state.z < 25.6) return;
    const fade = smoothstep((state.z - 25.6) / 0.5);
    const horizon = 4.4e26; // ~46.5 Gly comoving
    const p0 = worldToScreen(0, 0);
    const r = horizon * p0.s;

    ctx.save();
    ctx.globalAlpha = fade;

    // soft boundary ring
    if (r > 20 && r < Math.max(state.w, state.h) * 2.5) {
      const g = ctx.createRadialGradient(p0.x, p0.y, r * 0.82, p0.x, p0.y, r * 1.05);
      g.addColorStop(0, "rgba(80,100,180,0)");
      g.addColorStop(0.7, "rgba(100,140,255,0.06)");
      g.addColorStop(1, "rgba(140,180,255,0.18)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, r * 1.05, 0, Math.PI * 2);
      ctx.arc(p0.x, p0.y, Math.max(1, r * 0.82), 0, Math.PI * 2, true);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(160,190,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLabel(state.w / 2, state.h * 0.18, "可观测宇宙地平线", {
      size: 15,
      color: `rgba(190,210,255,${0.8 * fade})`,
    });
    drawLabel(state.w / 2, state.h * 0.18 + 22, "约 465 亿光年 · 光行时间约 138 亿年", {
      size: 11,
      dy: 0,
      color: `rgba(160,180,220,${0.55 * fade})`,
    });

    ctx.restore();
  }

  // ───────── scale bar ─────────
  function drawScaleBar() {
    const R = viewRadius();
    const target = R * 0.28;
    const exp = Math.floor(Math.log10(target));
    const base = Math.pow(10, exp);
    const mult = target / base < 2 ? 1 : target / base < 5 ? 2 : 5;
    const barM = base * mult;
    const p0 = worldToScreen(0, 0);
    const px = barM * p0.s;
    if (px < 30 || px > state.w * 0.5) return;

    const x = 18;
    const y = state.h - (state.w < 640 ? 100 : 88);
    ctx.save();
    ctx.strokeStyle = "rgba(180,200,255,0.45)";
    ctx.fillStyle = "rgba(200,220,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + px, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + px, y - 4);
    ctx.lineTo(x + px, y + 4);
    ctx.stroke();
    ctx.font = '11px "PingFang SC","Noto Sans SC",sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(formatDist(barM), x, y - 8);
    ctx.restore();
  }

  // ───────── render ─────────
  function render(dt) {
    state.time += dt;
    drawBackground();

    // star parallax layers
    const z = state.z;
    if (z < 20) drawStarLayer(state.starsNear, 0.15, z < 14 ? 0.9 : 0.35, 1);
    if (z > 10 && z < 23) drawStarLayer(state.starsMid, 0.45, 0.7, 0.9);
    if (z > 16) drawStarLayer(state.starsFar, 0.85, clamp((z - 16) / 2, 0, 0.85), 0.75);

    drawDustParticles();
    drawNebulae();
    drawSolarSystem();
    drawLocalStars();
    drawMilkyWay();
    drawLocalGroup();
    drawVirgoAndWeb();
    drawObservableHorizon();
    drawScaleBar();
  }

  // ───────── camera animation ─────────
  function setZoom(z, silent) {
    state.z = clamp(z, Z_MIN, Z_MAX);
    if (!silent) interruptTour();
    updateHUD();
  }

  function zoomAt(sx, sy, newZ) {
    const before = screenToWorld(sx, sy);
    state.z = clamp(newZ, Z_MIN, Z_MAX);
    const after = screenToWorld(sx, sy);
    state.cx += before.x - after.x;
    state.cy += before.y - after.y;
    updateHUD();
  }

  function interruptTour() {
    if (state.tour) {
      state.tour = null;
      btnTour.textContent = "开始宇宙之旅";
      btnTour.classList.remove("playing");
    }
  }

  function startTour() {
    if (state.tour) {
      interruptTour();
      return;
    }
    // reset near Earth
    state.animPan = null;
    const e0 = earthPos(state.time);
    state.cx = e0.x;
    state.cy = e0.y;
    state.z = 7.45;
    const waypoints = MILESTONES.map((m) => m.z);
    state.tour = {
      waypoints,
      idx: 0,
      from: state.z,
      to: waypoints[0],
      t0: performance.now(),
      dur: 3200,
    };
    btnTour.textContent = "停止漫游";
    btnTour.classList.add("playing");
    hideHint();
    toast("宇宙之旅开始");
  }

  function updateTour(now) {
    const t = state.tour;
    if (!t) return;
    const u = easeInOut(clamp((now - t.t0) / t.dur, 0, 1));
    state.z = lerp(t.from, t.to, u);

    // gentle pan drift outward with scale (keep sun-ish in frame until galaxy)
    if (state.z < 16) {
      const e = earthPos(state.time);
      const targetCx = state.z < 9.5 ? e.x : 0;
      const targetCy = state.z < 9.5 ? e.y : 0;
      state.cx = lerp(state.cx, targetCx, 0.04);
      state.cy = lerp(state.cy, targetCy, 0.04);
    } else if (state.z < 22) {
      state.cx = lerp(state.cx, 0, 0.03);
      state.cy = lerp(state.cy, 0, 0.03);
    } else if (state.z < 24.5) {
      state.cx = lerp(state.cx, 2e23, 0.02);
      state.cy = lerp(state.cy, 0.2e23, 0.02);
    } else {
      state.cx = lerp(state.cx, 0, 0.02);
      state.cy = lerp(state.cy, 0, 0.02);
    }

    if (u >= 1) {
      t.idx++;
      if (t.idx >= t.waypoints.length) {
        interruptTour();
        toast("已抵达可观测宇宙边界");
        return;
      }
      t.from = state.z;
      t.to = t.waypoints[t.idx];
      t.t0 = now;
      // dwell longer at grander scales
      t.dur = 2800 + t.idx * 220;
      const ms = MILESTONES[t.idx];
      if (ms) toast(ms.name);
    }
  }

  function goHome() {
    interruptTour();
    const e = earthPos(state.time);
    state.animZ = { from: state.z, to: 7.45, t0: performance.now(), dur: 1400 };
    state.animPan = {
      fromX: state.cx, fromY: state.cy,
      toX: e.x, toY: e.y,
      t0: performance.now(), dur: 1400,
    };
    toast("返回地球附近");
  }

  function followEarthIfNeeded() {
    if (state.dragging || state.pointers.size > 0) return;
    if (state.animPan || state.tour) return;
    if (state.z >= 9.9) return;
    const e = earthPos(state.time);
    state.cx = lerp(state.cx, e.x, 0.2);
    state.cy = lerp(state.cy, e.y, 0.2);
  }

  function updateAnims(now) {
    if (state.animZ) {
      const u = easeInOut(clamp((now - state.animZ.t0) / state.animZ.dur, 0, 1));
      state.z = lerp(state.animZ.from, state.animZ.to, u);
      if (u >= 1) state.animZ = null;
    }
    if (state.animPan) {
      const u = easeInOut(clamp((now - state.animPan.t0) / state.animPan.dur, 0, 1));
      state.cx = lerp(state.animPan.fromX, state.animPan.toX, u);
      state.cy = lerp(state.animPan.fromY, state.animPan.toY, u);
      if (u >= 1) state.animPan = null;
    }
  }

  // ───────── HUD ─────────
  function updateHUD() {
    const ms = currentMilestone();
    elName.textContent = ms.name;
    const R = viewRadius();
    elDist.textContent = "视野约 " + formatDist(R);
    elLight.textContent = "光行 " + formatLight(R);

    // milestone dots
    const dots = elTrack.querySelectorAll(".ms-dot");
    dots.forEach((d) => {
      d.classList.toggle("active", d.dataset.id === ms.id);
    });
  }

  function buildMilestoneUI() {
    elTrack.innerHTML = "";
    const n = MILESTONES.length;
    MILESTONES.forEach((m, i) => {
      const dot = document.createElement("div");
      dot.className = "ms-dot";
      dot.dataset.id = m.id;
      dot.dataset.label = m.name;
      const t = i / (n - 1);
      // top = near (earth), bottom = far
      dot.style.top = (t * 100) + "%";
      dot.title = m.name;
      dot.style.pointerEvents = "auto";
      dot.style.cursor = "pointer";
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        interruptTour();
        state.animZ = { from: state.z, to: m.z, t0: performance.now(), dur: 1600 };
        if (m.z < 9.5) {
          const e = earthPos(state.time);
          state.animPan = { fromX: state.cx, fromY: state.cy, toX: e.x, toY: e.y, t0: performance.now(), dur: 1600 };
        } else if (m.z < 23) {
          state.animPan = { fromX: state.cx, fromY: state.cy, toX: 0, toY: 0, t0: performance.now(), dur: 1600 };
        }
        toast(m.name);
        hideHint();
      });
      elTrack.appendChild(dot);
    });
  }

  let toastTimer = 0;
  function toast(msg) {
    elToast.hidden = false;
    elToast.textContent = msg;
    elToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elToast.classList.remove("show"), 1600);
  }

  function hideHint() {
    if (state.hintHidden) return;
    state.hintHidden = true;
    elHint.classList.add("hide");
  }

  // ───────── input ─────────
  function onWheel(e) {
    e.preventDefault();
    interruptTour();
    hideHint();
    const delta = e.deltaY;
    const factor = clamp(Math.abs(delta) / 400, 0.02, 0.18);
    const dir = delta > 0 ? 1 : -1;
    zoomAt(e.clientX, e.clientY, state.z + dir * factor * 1.15);
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.pointers.size === 1) {
      state.dragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      canvas.classList.add("dragging");
    } else if (state.pointers.size === 2) {
      state.dragging = false;
      const pts = [...state.pointers.values()];
      state.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      state.pinchStartZ = state.z;
    }
    interruptTour();
    hideHint();
  }

  function onPointerMove(e) {
    if (!state.pointers.has(e.pointerId)) return;
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (state.pinchStartDist > 0) {
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const ratio = dist / state.pinchStartDist;
        // pinch out = zoom in = decrease z
        const newZ = state.pinchStartZ - Math.log10(ratio) * 1.8;
        zoomAt(midX, midY, newZ);
      }
      return;
    }

    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    const R = viewRadius();
    const scale = Math.min(state.w, state.h) / (2 * R);
    state.cx -= dx / scale;
    state.cy -= dy / scale;
  }

  function onPointerUp(e) {
    state.pointers.delete(e.pointerId);
    if (state.pointers.size < 2) {
      state.pinchStartDist = 0;
    }
    if (state.pointers.size === 0) {
      state.dragging = false;
      canvas.classList.remove("dragging");
    } else if (state.pointers.size === 1) {
      const pt = [...state.pointers.values()][0];
      state.dragging = true;
      state.lastX = pt.x;
      state.lastY = pt.y;
    }
  }

  function onDblClick(e) {
    interruptTour();
    // zoom in toward click
    zoomAt(e.clientX, e.clientY, state.z - 0.85);
    const w = screenToWorld(e.clientX, e.clientY);
    state.animPan = {
      fromX: state.cx, fromY: state.cy,
      toX: w.x, toY: w.y,
      t0: performance.now(), dur: 700,
    };
    toast("聚焦此处");
  }

  function onKey(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const step = e.shiftKey ? 0.35 : 0.18;
    if (e.key === "+" || e.key === "=") {
      interruptTour();
      setZoom(state.z - step);
    } else if (e.key === "-" || e.key === "_") {
      interruptTour();
      setZoom(state.z + step);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      // previous milestone (closer)
      const ms = currentMilestone();
      const idx = Math.max(0, MILESTONES.findIndex((m) => m.id === ms.id) - 1);
      interruptTour();
      state.animZ = { from: state.z, to: MILESTONES[idx].z, t0: performance.now(), dur: 1000 };
      toast(MILESTONES[idx].name);
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      const ms = currentMilestone();
      const idx = Math.min(MILESTONES.length - 1, MILESTONES.findIndex((m) => m.id === ms.id) + 1);
      interruptTour();
      state.animZ = { from: state.z, to: MILESTONES[idx].z, t0: performance.now(), dur: 1000 };
      toast(MILESTONES[idx].name);
    } else if (e.key === "Home" || e.key === "0") {
      goHome();
    } else if (e.key === " ") {
      e.preventDefault();
      startTour();
    } else if (e.key === "l" || e.key === "L") {
      btnLabels.click();
    }
  }

  // ───────── loop ─────────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    updateTour(now);
    updateAnims(now);
    followEarthIfNeeded();
    render(dt);
    updateHUD();

    state.frames++;
    if (now - state.fpsT > 500) {
      state.fps = Math.round((state.frames * 1000) / (now - state.fpsT));
      state.frames = 0;
      state.fpsT = now;
      elFps.textContent = state.fps + " fps";
    }
    requestAnimationFrame(frame);
  }

  // ───────── wire UI ─────────
  function bind() {
    window.addEventListener("resize", resize);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("dblclick", onDblClick);
    window.addEventListener("keydown", onKey);

    btnTour.addEventListener("click", startTour);
    btnHome.addEventListener("click", goHome);
    btnIn.addEventListener("click", () => { interruptTour(); setZoom(state.z - 0.25); });
    btnOut.addEventListener("click", () => { interruptTour(); setZoom(state.z + 0.25); });
    btnLabels.addEventListener("click", () => {
      state.showLabels = !state.showLabels;
      btnLabels.classList.toggle("on", state.showLabels);
    });

    // prevent browser navigation gestures lightly
    document.addEventListener("gesturestart", (e) => e.preventDefault());
  }

  // ───────── boot ─────────
  function boot() {
    state.reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    initContent();
    resize();
    buildMilestoneUI();
    // start near Earth (phase 0 → +AU)
    state.z = 7.55;
    const eBoot = earthPos(0);
    state.cx = eBoot.x;
    state.cy = eBoot.y;
    bind();
    updateHUD();
    requestAnimationFrame(frame);

    // soft auto-start hint; don't force tour
    setTimeout(() => {
      if (!state.hintHidden) elHint.classList.remove("hide");
    }, 400);
  }

  boot();

  // debug/screenshot hook
  window.GrandCosmos = {
    setZ(z) { state.z = clamp(z, Z_MIN, Z_MAX); updateHUD(); },
    setView(z, cx, cy) {
      state.z = clamp(z, Z_MIN, Z_MAX);
      if (cx != null) state.cx = cx;
      if (cy != null) state.cy = cy;
      updateHUD();
    },
    earthPos: () => earthPos(state.time),
    get z() { return state.z; },
  };
})();
