/* =========================================================================
   泡泡小勇士 · 3D 大冒险
   面向 4-6 岁的横版（2.5D）泡泡射击游戏：
   · 不流血、不死亡、不会失败  · 自动瞄准  · 大按钮 / 键盘双操作
   ========================================================================= */
(function () {
  'use strict';

  /* ===================== 0. 基础工具 ===================== */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

  const ERRS = [];
  window.addEventListener('error', (e) => ERRS.push('err:' + (e.message || e.type)));
  window.addEventListener('unhandledrejection', (e) => ERRS.push('rej:' + String(e.reason)));

  /* ===================== 1. 声音（必须由用户手势解锁） ===================== */
  const Sfx = (function () {
    let ctx = null, master = null, muted = false, step = 0, nextAt = 0, playing = false;
    const STEP = 0.24;
    const MEL = [523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 698, 0, 880, 0, 784, 0,
      523, 0, 659, 784, 1046, 0, 784, 0, 698, 0, 659, 0, 587, 0, 523, 0];
    const BAS = [131, 0, 0, 0, 196, 0, 0, 0, 147, 0, 0, 0, 175, 0, 0, 0,
      131, 0, 0, 0, 196, 0, 0, 0, 165, 0, 0, 0, 147, 0, 0, 0];

    function ensure() {
      if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return ctx; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; return null; }
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      return ctx;
    }

    function note(freq, at, dur, type, vol) {
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(master);
      o.start(at); o.stop(at + dur + 0.02);
    }

    function sweep(f0, f1, dur, type, vol, at) {
      if (!ctx) return;
      const t = at || ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function noise(dur, vol, hp) {
      if (!ctx) return;
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hp || 900; f.Q.value = 0.9;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    }

    const api = {
      unlock() { ensure(); },
      get muted() { return muted; },
      toggleMute() {
        muted = !muted;
        if (ctx) master.gain.value = muted ? 0 : 0.55;
        if (muted && window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
        return muted;
      },
      musicStart() { if (!ensure()) return; playing = true; nextAt = 0; step = 0; },
      musicStop() { playing = false; },
      schedule() {
        if (!ctx || !playing || muted) return;
        if (nextAt === 0) nextAt = ctx.currentTime + 0.06;
        while (nextAt < ctx.currentTime + 0.26) {
          if (MEL[step] > 0) note(MEL[step], nextAt, 0.38, 'triangle', 0.05);
          if (BAS[step] > 0) note(BAS[step], nextAt, 0.5, 'sine', 0.045);
          nextAt += STEP;
          step = (step + 1) % 32;
        }
      },
      shoot() { if (!ctx || muted) return; ensure(); sweep(880, 1500, 0.09, 'sine', 0.10); },
      pop() { if (!ctx || muted) return; ensure(); sweep(700, 220, 0.16, 'triangle', 0.14); noise(0.1, 0.07, 1600); },
      jump() { if (!ctx || muted) return; ensure(); sweep(420, 760, 0.14, 'sine', 0.09); },
      hurt() { if (!ctx || muted) return; ensure(); sweep(330, 130, 0.3, 'sawtooth', 0.10); },
      win() {
        if (!ctx || muted) return; ensure();
        const t = ctx.currentTime;
        [523, 659, 784, 1046, 1318].forEach((f, i) => note(f, t + i * 0.13, 0.5, 'triangle', 0.12));
      },
      say(text) {
        if (muted || !('speechSynthesis' in window)) return;
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = 'zh-CN'; u.rate = 1.02; u.pitch = 1.4; u.volume = 0.95;
          window.speechSynthesis.speak(u);
        } catch (e) { /* 语音不可用则静默 */ }
      }
    };
    return api;
  })();

  /* ===================== 2. 渲染器 / 场景 ===================== */
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(-2, 6, 13);

  /* --- 天空渐变 --- */
  (function sky() {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 256;
    const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0.00, '#5cc4f5');
    gr.addColorStop(0.34, '#9adcfb');
    gr.addColorStop(0.62, '#cfeeff');
    gr.addColorStop(0.84, '#ffeccb');
    gr.addColorStop(1.00, '#ffd9a8');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  })();

  scene.fog = new THREE.Fog(0xc9ecff, 52, 128);

  const hemi = new THREE.HemisphereLight(0xd8f2ff, 0x8ec96a, 0.95);
  scene.add(hemi);

  const sunLight = new THREE.DirectionalLight(0xfff4dd, 0.9);
  sunLight.position.set(8, 20, 9);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -16;
  sunLight.shadow.camera.right = 16;
  sunLight.shadow.camera.top = 16;
  sunLight.shadow.camera.bottom = -16;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 60;
  sunLight.shadow.bias = -0.0016;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  /* ===================== 3. 世界构建 ===================== */
  const LEVEL_END = 132;      // 到达此处即通关
  const WALL_X = 126;         // 大王泡泡墙位置
  const BOSS_TRIGGER = 96;    // 触发大王的位置

  const world = new THREE.Group();
  scene.add(world);

  function grassTexture() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#8ed96a';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 26 + Math.random() * 80;
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = Math.random() < 0.5 ? 'rgba(118,208,96,0.5)' : 'rgba(168,232,120,0.55)';
      g.fill();
    }
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(96,186,74,0.55)' : 'rgba(190,240,150,0.5)';
      g.fillRect(x, y, 2, 3 + Math.random() * 4);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(36, 24);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function pathTexture() {
    const S = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#f0dcb4';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 9;
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = Math.random() < 0.5 ? 'rgba(226,201,155,0.75)' : 'rgba(255,244,214,0.8)';
      g.fill();
    }
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 3 + Math.random() * 5;
      g.beginPath(); g.arc(x, y, r, 0, TAU);
      g.fillStyle = 'rgba(198,182,160,0.7)';
      g.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 3);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  (function buildGround() {
    const gm = new THREE.MeshLambertMaterial({ map: grassTexture() });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(470, 250, 1, 1), gm);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(90, 0, 0);
    ground.receiveShadow = true;
    world.add(ground);

    const pm = new THREE.MeshLambertMaterial({ map: pathTexture() });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(250, 6.9, 1, 1), pm);
    path.rotation.x = -Math.PI / 2;
    path.position.set(69, 0.012, 0);
    path.receiveShadow = true;
    world.add(path);
  })();

  /* --- 通用实例化工具 --- */
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();

  function makeInstanced(geo, mat, items, opts) {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      _v.set(it.x, it.y, it.z);
      _e.set(it.rx || 0, it.ry || 0, it.rz || 0);
      _q.setFromEuler(_e);
      _s.set(it.sx != null ? it.sx : it.s || 1, it.sy != null ? it.sy : it.s || 1, it.sz != null ? it.sz : it.s || 1);
      _m4.compose(_v, _q, _s);
      im.setMatrixAt(i, _m4);
      if (it.c != null) { _c.set(it.c); im.setColorAt(i, _c); }
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    if (opts && opts.shadow) im.castShadow = true;
    if (opts && opts.receive) im.receiveShadow = true;
    world.add(im);
    return im;
  }

  const MAT = {
    flat: new THREE.MeshLambertMaterial({ flatShading: true }),
    smooth: new THREE.MeshLambertMaterial({}),
  };

  (function buildProps() {
    const treeItems = [];
    const trunkItems = [];
    const bushItems = [];
    const flowerItems = [];
    const grassItems = [];
    const postItems = [];
    const railItems = [];
    const rockItems = [];
    const leafColors = [0x63c76a, 0x7fd66e, 0x4fb377, 0x8fe07a, 0x5cc98f];
    const flowerColors = [0xff8fb1, 0xffd93d, 0xffffff, 0xb99bff, 0xffb26b, 0x8fe7ff];

    // 树
    for (let i = 0; i < 68; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = side * rnd(9.0, 34);
      const x = rnd(-22, 188);
      const h = rnd(0.62, 1.15);
      trunkItems.push({ x: x, y: 0.7 * h, z: z, sx: h, sy: h, sz: h, c: 0x9a6b45 });
      treeItems.push({
        x: x, y: (1.4 + 1.5) * h, z: z, sx: h * rnd(0.9, 1.15), sy: h * rnd(1.0, 1.35), sz: h * rnd(0.9, 1.15),
        ry: rnd(0, TAU), c: pick(leafColors)
      });
    }
    // 灌木
    for (let i = 0; i < 84; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      bushItems.push({
        x: rnd(-20, 186), y: rnd(0.35, 0.7), z: side * rnd(6.0, 22),
        sx: rnd(0.7, 1.4), sy: rnd(0.55, 0.95), sz: rnd(0.7, 1.4),
        ry: rnd(0, TAU), c: pick([0x6fd06e, 0x86dd7c, 0x59bd72, 0x9ae88a])
      });
    }
    // 花
    for (let i = 0; i < 460; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = side * rnd(5.2, 24);
      flowerItems.push({
        x: rnd(-20, 190), y: rnd(0.16, 0.34), z: z,
        s: rnd(0.7, 1.35), c: pick(flowerColors)
      });
    }
    // 草
    for (let i = 0; i < 880; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      grassItems.push({
        x: rnd(-20, 192), y: 0.2, z: side * rnd(4.9, 18),
        sx: rnd(0.7, 1.5), sy: rnd(0.6, 1.7), sz: rnd(0.7, 1.5),
        ry: rnd(0, TAU), rz: rnd(-0.14, 0.14),
        c: pick([0x64c96a, 0x7ad776, 0x54b96b, 0x8ce084])
      });
    }
    // 路边小栅栏：立柱 + 横杆
    for (let i = 0; i < 34; i++) {
      const x = -6 + i * 4.4;
      if (x > 132) continue;
      postItems.push({ x: x, y: 0.42, z: 4.05, s: 1, c: 0xd7bb95 });
      postItems.push({ x: x, y: 0.42, z: -4.05, s: 1, c: 0xd7bb95 });
      railItems.push({ x: x + 2.2, y: 0.63, z: 4.05, sx: 4.4, sy: 0.1, sz: 0.1, c: 0xe3cbaa });
      railItems.push({ x: x + 2.2, y: 0.63, z: -4.05, sx: 4.4, sy: 0.1, sz: 0.1, c: 0xe3cbaa });
      railItems.push({ x: x + 2.2, y: 0.34, z: 4.05, sx: 4.4, sy: 0.08, sz: 0.08, c: 0xe3cbaa });
      railItems.push({ x: x + 2.2, y: 0.34, z: -4.05, sx: 4.4, sy: 0.08, sz: 0.08, c: 0xe3cbaa });
    }
    // 石头
    for (let i = 0; i < 62; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      rockItems.push({
        x: rnd(-18, 190), y: rnd(0.1, 0.24), z: side * rnd(5.4, 26),
        s: rnd(0.28, 0.75), ry: rnd(0, TAU), c: pick([0xd9d5cc, 0xc8c3b8, 0xe6e1d6])
      });
    }

    makeInstanced(new THREE.CylinderGeometry(0.13, 0.19, 1.4, 6), MAT.smooth, trunkItems, { shadow: true });
    makeInstanced(new THREE.SphereGeometry(1.5, 8, 6), MAT.flat, treeItems, { shadow: true });
    makeInstanced(new THREE.SphereGeometry(0.85, 7, 5), MAT.flat, bushItems, { shadow: true });
    makeInstanced(new THREE.SphereGeometry(0.19, 6, 4), MAT.flat, flowerItems, {});
    makeInstanced(new THREE.ConeGeometry(0.13, 0.55, 4), MAT.flat, grassItems, {});
    makeInstanced(new THREE.CylinderGeometry(0.09, 0.11, 0.85, 6), MAT.flat, postItems, { shadow: true });
    makeInstanced(new THREE.BoxGeometry(1, 1, 1), MAT.flat, railItems, { shadow: true });
    makeInstanced(new THREE.IcosahedronGeometry(1, 0), MAT.flat, rockItems, { shadow: true });
  })();

  /* --- 远山 / 云 / 太阳 --- */
  const clouds = new THREE.Group();
  (function buildFar() {
    const hillMat = new THREE.MeshLambertMaterial({ flatShading: true });
    const hills = [];
    for (let i = 0; i < 16; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      hills.push({
        x: rnd(-60, 240), y: rnd(-30, -14), z: side * rnd(58, 120),
        sx: rnd(28, 52), sy: rnd(16, 30), sz: rnd(26, 42),
        c: pick([0x9fd9a0, 0x8fcf9c, 0xaee0a8, 0xbcdff0])
      });
    }
    makeInstanced(new THREE.SphereGeometry(1, 10, 7), hillMat, hills, {});

    // 云
    const puffs = [];
    for (let i = 0; i < 22; i++) {
      const baseX = rnd(-80, 290), baseZ = rnd(-64, -36), baseY = rnd(8.5, 17);
      const n = rndi(3, 5);
      for (let k = 0; k < n; k++) {
        puffs.push({
          x: baseX + rnd(-7, 7), y: baseY + rnd(-1.4, 1.8), z: baseZ + rnd(-5, 5),
          sx: rnd(3.4, 7.5), sy: rnd(1.8, 3.6), sz: rnd(2.6, 5.2),
          c: 0xffffff
        });
      }
    }
    const cloudMat = new THREE.MeshLambertMaterial({ flatShading: true, color: 0xffffff, emissive: 0xf6faff, emissiveIntensity: 0.72 });
    const im = makeInstanced(new THREE.SphereGeometry(1, 7, 5), cloudMat, puffs, {});
    world.remove(im);
    clouds.add(im);
    scene.add(clouds);
  })();

  (function buildSun() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,252,214,1)');
    gr.addColorStop(0.42, 'rgba(255,236,140,0.95)');
    gr.addColorStop(0.7, 'rgba(255,220,120,0.28)');
    gr.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(46, 46, 1);
    sp.position.set(46, 48, -110);
    scene.add(sp);
  })();

  /* ===================== 4. 角色 ===================== */
  const MATS = {
    skin: new THREE.MeshLambertMaterial({ color: 0xffd8b4 }),
    shirt: new THREE.MeshLambertMaterial({ color: 0x6fd3ff }),
    pants: new THREE.MeshLambertMaterial({ color: 0x3f6fd6 }),
    hat: new THREE.MeshLambertMaterial({ color: 0xff6b8a }),
    band: new THREE.MeshLambertMaterial({ color: 0xfff2e2 }),
    scarf: new THREE.MeshLambertMaterial({ color: 0xffd23f }),
    pack: new THREE.MeshLambertMaterial({ color: 0xff8f6b }),
    shoe: new THREE.MeshLambertMaterial({ color: 0x584a7d }),
    sole: new THREE.MeshLambertMaterial({ color: 0xe9e3f7 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x2f2742 }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cheek: new THREE.MeshLambertMaterial({ color: 0xff9aae }),
    mouth: new THREE.MeshLambertMaterial({ color: 0x7a3046 }),
    gun: new THREE.MeshLambertMaterial({ color: 0xffc93c }),
    gunRing: new THREE.MeshLambertMaterial({ color: 0x7fe3ff, emissive: 0x2ec6f0, emissiveIntensity: 0.45 }),
    tank: new THREE.MeshLambertMaterial({ color: 0xbff0ff, emissive: 0x7fe3ff, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 }),
  };

  /* 小勇士：圆头 + 毛线帽 + 围巾 + 背带裤 + 玩具泡泡枪
     比例约 2.35 单位高，脚底在 y=0 */
  function buildPlayer() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    // ---------- 躯干（胶囊体，有肩有胯，不再是一个球） ----------
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.20, 8, 16), MATS.shirt);
    torso.position.y = 0.98;
    torso.scale.set(1.0, 1.0, 0.86);
    body.add(torso);

    // 背带裤：胸片 + 两条肩带
    const bib = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), MATS.pants);
    bib.position.set(0.09, 0.84, 0);
    bib.scale.set(0.72, 1.05, 0.84);
    body.add(bib);
    [-1, 1].forEach((sd) => {
      const strap = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.24, 3, 6), MATS.pants);
      strap.position.set(0.08, 1.26, sd * 0.23);
      strap.rotation.z = -0.14;
      body.add(strap);
    });

    // ---------- 背包 ----------
    const pack = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), MATS.pack);
    pack.position.set(-0.34, 1.06, 0);
    pack.scale.set(0.78, 1.0, 0.9);
    body.add(pack);

    // ---------- 围巾（遮住脖子接缝，还能飘） ----------
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.098, 10, 24), MATS.scarf);
    scarfRing.position.y = 1.40;
    scarfRing.rotation.x = Math.PI / 2;
    body.add(scarfRing);
    const tails = [];
    [-1, 1].forEach((sd) => {
      const pivot = new THREE.Group();
      pivot.position.set(-0.28, 1.38, sd * 0.11);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.26, 3, 6), MATS.scarf);
      tail.position.y = -0.17;
      pivot.add(tail);
      pivot.rotation.z = -0.75 + sd * 0.08;
      body.add(pivot);
      tails.push(pivot);
    });

    // ---------- 头 ----------
    const head = new THREE.Group();
    head.position.set(0.02, 1.78, 0);
    head.rotation.y = -0.63;
    body.add(head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.50, 22, 18), MATS.skin);
    skull.scale.set(1, 0.99, 1);
    head.add(skull);

    // 毛线帽：球冠 + 翻边 + 绒球（不再是交通锥）
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.525, 20, 14, 0, TAU, 0, Math.PI * 0.375), MATS.hat);
    dome.position.y = 0.01;
    head.add(dome);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.487, 0.062, 10, 26), MATS.band);
    band.position.y = 0.205;
    band.rotation.x = Math.PI / 2;
    head.add(band);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), MATS.band);
    pom.position.y = 0.585;
    head.add(pom);

    // ---------- 五官 ----------
    [-1, 1].forEach((sd) => {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.148, 14, 12), MATS.white);
      sclera.position.set(0.335, 0.0, sd * 0.19);
      sclera.scale.set(0.72, 1.05, 0.96);
      head.add(sclera);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), MATS.eye);
      pupil.position.set(0.412, -0.005, sd * 0.19);
      pupil.scale.set(0.5, 1.0, 0.9);
      head.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), MATS.white);
      glint.position.set(0.45, 0.055, sd * 0.165);
      head.add(glint);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), MATS.cheek);
      cheek.position.set(0.3, -0.19, sd * 0.285);
      cheek.scale.set(0.45, 0.62, 1.0);
      head.add(cheek);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), MATS.skin);
      ear.position.set(-0.05, -0.06, sd * 0.485);
      ear.scale.set(0.7, 1, 0.55);
      head.add(ear);
    });
    // 张嘴笑（扁球，远看也读得出来）
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), MATS.mouth);
    mouth.position.set(0.428, -0.155, 0);
    mouth.scale.set(0.30, 0.56, 0.92);
    head.add(mouth);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), MATS.cheek);
    tongue.position.set(0.452, -0.185, 0);
    tongue.scale.set(0.28, 0.42, 0.72);
    head.add(tongue);

    // ---------- 手臂（袖子 + 前臂 + 手） ----------
    const arms = {};
    [-1, 1].forEach((sd) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.01, 1.24, sd * 0.395);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), MATS.shirt);
      shoulder.position.y = -0.03;
      pivot.add(shoulder);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.16, 4, 10), MATS.shirt);
      sleeve.position.y = -0.13;
      pivot.add(sleeve);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.083, 0.16, 4, 10), MATS.skin);
      fore.position.y = -0.34;
      pivot.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.108, 12, 10), MATS.skin);
      hand.position.y = -0.46;
      pivot.add(hand);
      body.add(pivot);
      arms[sd] = pivot;
    });

    // ---------- 腿（裤腿 + 靴子 + 鞋底） ----------
    const legs = {};
    [-1, 1].forEach((sd) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.62, sd * 0.165);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.103, 0.20, 4, 10), MATS.pants);
      leg.position.y = -0.16;
      pivot.add(leg);
      const boot = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 10), MATS.shoe);
      boot.position.set(0.055, -0.44, 0);
      boot.scale.set(1.45, 0.88, 1.02);
      pivot.add(boot);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.055, 0.235), MATS.sole);
      sole.position.set(0.055, -0.50, 0);
      pivot.add(sole);
      body.add(pivot);
      legs[sd] = pivot;
    });

    // ---------- 玩具泡泡枪 ----------
    const gun = new THREE.Group();
    gun.position.set(0.26, 1.00, 0.32);
    body.add(gun);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.075, 0.32, 12), MATS.gun);
    barrel.rotation.z = -Math.PI / 2;
    barrel.position.x = 0.17;
    gun.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.042, 8, 16), MATS.gunRing);
    muzzle.position.x = 0.345;
    muzzle.rotation.y = Math.PI / 2;
    gun.add(muzzle);
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.098, 14, 10), MATS.tank);
    tank.position.set(0.15, 0.088, 0);
    tank.scale.set(1.15, 1, 0.95);
    gun.add(tank);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.15, 0.095), MATS.gun);
    grip.position.set(0.02, -0.10, 0);
    gun.add(grip);

    root.rotation.y = -0.42;
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { root: root, body: body, head: head, arms: arms, legs: legs, gun: gun, muzzle: muzzle, tails: tails };
  }

  const P = buildPlayer();
  world.add(P.root);

  // 脚下的柔和阴影贴片（真实阴影之外的“锚点”，低角度看更稳）
  const blobTex = (function () {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(40,70,40,0.42)');
    gr.addColorStop(0.6, 'rgba(40,70,40,0.18)');
    gr.addColorStop(1, 'rgba(40,70,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const playerBlob = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), blobMat);
  playerBlob.rotation.x = -Math.PI / 2;
  playerBlob.position.y = 0.02;
  world.add(playerBlob);

  // 保护泡泡（受到太多次碰撞后出现的护盾）
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.06, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide })
  );
  shieldMesh.visible = false;
  world.add(shieldMesh);

  /* ===================== 5. 敌人 ===================== */
  const ENEMY_KINDS = [
    { name: 'slime', r: 0.62, hp: 1, spd: 2.0, color: 0xb98bff, horn: 0xffe066 },
    { name: 'puff', r: 0.74, hp: 2, spd: 1.6, color: 0xff9bb8, horn: 0x9be7ff },
    { name: 'blob', r: 0.86, hp: 3, spd: 1.25, color: 0x8fe0a8, horn: 0xffb26b },
  ];

  function buildEnemy(kind, isBoss) {
    const r = isBoss ? 2.1 : kind.r;
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);

    const mat = new THREE.MeshLambertMaterial({ color: isBoss ? 0xc48bff : kind.color, flatShading: true });
    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    bodyMesh.position.y = r;
    inner.add(bodyMesh);

    // 脚
    [-1, 1].forEach((s) => {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 8, 6), mat);
      foot.position.set(0, r * 0.16, s * r * 0.55);
      foot.scale.set(1.1, 0.7, 1);
      inner.add(foot);
    });

    // 眼睛（模型正面 = +Z，靠 yaw 朝向玩家/镜头混合方向）
    const eyeY = r * 1.32, eyeZ = r * 0.72;
    [-1, 1].forEach((s) => {
      const w = new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 10, 8), MATS.white);
      w.position.set(s * r * 0.34, eyeY, eyeZ);
      w.scale.set(1, 1.05, 0.62);
      inner.add(w);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(r * 0.125, 8, 6), MATS.eye);
      pu.position.set(s * r * 0.34, eyeY + r * 0.02, eyeZ + r * 0.17);
      pu.scale.set(1, 1, 0.7);
      inner.add(pu);
    });

    // 天线 / 角
    const horn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 0.52, 7), new THREE.MeshLambertMaterial({ color: kind.horn }));
    horn.position.y = r * 2.1;
    inner.add(horn);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.14, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    ball.position.y = r * 2.4;
    inner.add(ball);

    // 腮红
    [-1, 1].forEach((s) => {
      const ck = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff9aae }));
      ck.position.set(s * r * 0.62, r * 1.14, r * 0.62);
      ck.scale.set(1, 0.8, 0.4);
      inner.add(ck);
    });

    if (isBoss) {
      const crown = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.78, 0.32, 12), new THREE.MeshLambertMaterial({ color: 0xffd93d, flatShading: true }));
      crown.add(ring);
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0xffd93d, flatShading: true }));
        const a = (i / 6) * TAU;
        sp.position.set(Math.cos(a) * 0.62, 0.38, Math.sin(a) * 0.62);
        crown.add(sp);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5c8a }));
        gem.position.set(Math.cos(a) * 0.62, 0.66, Math.sin(a) * 0.62);
        crown.add(gem);
      }
      crown.position.y = r * 2.16;
      inner.add(crown);
    }

    const blob = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.1, r * 3.1), blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    root.add(blob);

    root.traverse((o) => { if (o.isMesh && o !== blob) o.castShadow = true; });
    return { root: root, inner: inner, mat: mat, r: r, blob: blob };
  }

  /* ===================== 6. 泡泡 / 粒子 ===================== */
  const bubbleGeo = new THREE.SphereGeometry(0.42, 14, 12);
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xd8f6ff, transparent: true, opacity: 0.62, roughness: 0.06, metalness: 0.05,
    emissive: 0x63c9ff, emissiveIntensity: 0.45, depthWrite: false
  });
  const bubbleGeoInner = new THREE.SphereGeometry(0.16, 8, 6);
  const bubbleInnerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

  const bubbles = [];
  const bubblePool = [];
  function getBubble() {
    let b = bubblePool.pop();
    if (b) { b.mesh.visible = true; return b; }
    const grp = new THREE.Group();
    const m = new THREE.Mesh(bubbleGeo, bubbleMat);
    grp.add(m);
    const inner = new THREE.Mesh(bubbleGeoInner, bubbleInnerMat);
    inner.position.set(-0.12, 0.12, 0.1);
    grp.add(inner);
    world.add(grp);
    return { mesh: grp, vx: 0, vy: 0, vz: 0, life: 0 };
  }

  const PARTICLE_N = 420;
  const partGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const partMat = new THREE.MeshLambertMaterial({});
  const particleMesh = new THREE.InstancedMesh(partGeo, partMat, PARTICLE_N);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.frustumCulled = false;
  world.add(particleMesh);
  const parts = [];
  for (let i = 0; i < PARTICLE_N; i++) {
    parts.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, spin: 0, life: 0, max: 1, s: 1 });
    _c.set(0xffffff); particleMesh.setColorAt(i, _c);
  }
  let partCursor = 0;
  const PARTY = [0xffd93d, 0xff8fb1, 0x8fe7ff, 0xa8f0a0, 0xb99bff, 0xffb26b, 0xffffff];
  (function initParticleMatrices() {
    for (let i = 0; i < PARTICLE_N; i++) {
      _m4.makeScale(0, 0, 0);
      _m4.setPosition(0, -999, 0);
      particleMesh.setMatrixAt(i, _m4);
    }
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
  })();

  function burst(x, y, z, n, power, colors) {
    for (let k = 0; k < n; k++) {
      const p = parts[partCursor];
      const idx = partCursor;
      partCursor = (partCursor + 1) % PARTICLE_N;
      p.alive = true;
      p.x = x + rnd(-0.2, 0.2); p.y = y + rnd(-0.2, 0.2); p.z = z + rnd(-0.2, 0.2);
      const a = Math.random() * TAU, el = rnd(-0.3, 1.1), sp = rnd(power * 0.4, power);
      p.vx = Math.cos(a) * Math.cos(el) * sp;
      p.vz = Math.sin(a) * Math.cos(el) * sp;
      p.vy = Math.sin(el) * sp + power * 0.35;
      p.rx = rnd(0, TAU); p.ry = rnd(0, TAU); p.rz = rnd(0, TAU);
      p.spin = rnd(-9, 9);
      p.max = p.life = rnd(0.55, 1.15);
      p.s = rnd(0.6, 1.5);
      _c.set(colors ? pick(colors) : pick(PARTY));
      particleMesh.setColorAt(idx, _c);
    }
    particleMesh.instanceColor.needsUpdate = true;
  }

  /* ===================== 6.5 浮空星星（跳跃收集） ===================== */
  const STARN = 26;
  const starGeo = new THREE.OctahedronGeometry(0.36, 0);
  const starMat = new THREE.MeshLambertMaterial({ color: 0xffd93d, emissive: 0xffb400, emissiveIntensity: 0.6, flatShading: true });
  const starMesh = new THREE.InstancedMesh(starGeo, starMat, STARN);
  starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  starMesh.frustumCulled = false;
  world.add(starMesh);

  const pickups = [];
  function resetPickups() {
    pickups.length = 0;              // 必须清空，否则每次重玩都会追加一批幽灵星星
    for (let i = 0; i < STARN; i++) {
      const s = { x: 0, y: 0, z: 0, got: true, phase: 0 };
      const x = 8 + i * 4.7 + rnd(-0.9, 0.9);
      if (x < LEVEL_END - 7) {
        s.x = x; s.y = rnd(2.5, 3.0); s.z = rnd(-1.5, 1.5);
        s.got = false; s.phase = rnd(0, TAU);
      }
      pickups.push(s);
      if (s.got) {
        _m4.makeScale(0, 0, 0); _m4.setPosition(0, -999, 0);
      } else {
        _v.set(s.x, s.y, s.z); _q.identity(); _s.setScalar(1);
        _m4.compose(_v, _q, _s);
      }
      starMesh.setMatrixAt(i, _m4);
    }
    starMesh.instanceMatrix.needsUpdate = true;
  }
  resetPickups();

  function updatePickups(dt) {
    let dirty = false;
    for (let i = 0; i < STARN; i++) {
      const s = pickups[i];
      if (s.got) continue;
      const yy = s.y + Math.sin(G.t * 2.1 + s.phase) * 0.12;
      _v.set(s.x, yy, s.z);
      _e.set(0, G.t * 2.3 + s.phase, 0);
      _q.setFromEuler(_e);
      _s.setScalar(1);
      _m4.compose(_v, _q, _s);
      starMesh.setMatrixAt(i, _m4);
      dirty = true;

      if (Math.abs(s.x - G.x) < 2.2) {
        const dx = s.x - G.x, dy = yy - (G.y + 1.0), dz = s.z - G.z;
        if (dx * dx + dy * dy + dz * dz < 1.3 * 1.3) {
          s.got = true;
          _m4.makeScale(0, 0, 0); _m4.setPosition(0, -999, 0);
          starMesh.setMatrixAt(i, _m4);
          G.stars++;
          syncHUD();
          Sfx.pop();
          burst(s.x, yy, s.z, 9, 4.2, [0xffd93d, 0xffffff, 0xfff3c4]);
          _tmpV.set(s.x, yy, s.z);
          floaty(_tmpV, '+1 ★');
        }
      }
    }
    if (dirty) starMesh.instanceMatrix.needsUpdate = true;
  }

  /* ===================== 7. 彩虹门 & 泡泡墙 ===================== */
  const gateGroup = new THREE.Group();
  (function buildGate() {
    const cols = [0xff8fa8, 0xffb877, 0xffe27a, 0x9ae87e, 0x86d8ff, 0xb3a4ff];
    cols.forEach((cc, i) => {
      const rr = 4.15 - i * 0.46;
      const t = new THREE.Mesh(
        new THREE.TorusGeometry(rr, 0.27, 8, 26, Math.PI),
        new THREE.MeshLambertMaterial({ color: cc, emissive: cc, emissiveIntensity: 0.26 })
      );
      t.rotation.y = Math.PI / 2;
      gateGroup.add(t);
    });
    // 门柱
    [-1, 1].forEach((s) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.2, 10), new THREE.MeshLambertMaterial({ color: 0xfdfdff }));
      p.position.set(0, 0.6, s * 4.15);
      gateGroup.add(p);
    });
    // 顶上的星星
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0xffd93d, emissive: 0xffc400, emissiveIntensity: 0.6, flatShading: true }));
    star.position.y = 4.6;
    gateGroup.add(star);
    gateGroup.userData.star = star;
    gateGroup.position.set(LEVEL_END + 2.6, 0, 0);
    world.add(gateGroup);
  })();

  const wallGroup = new THREE.Group();
  (function buildWall() {
    const geo = new THREE.PlaneGeometry(13, 10, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9be8ff, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false
    });
    const w = new THREE.Mesh(geo, mat);
    w.rotation.y = -Math.PI / 2;
    w.position.y = 5;
    wallGroup.add(w);
    // 边框光带
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * 0.9, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: 0xbdf3ff, transparent: true, opacity: 0.5 }));
      r.position.set(0, 5 + Math.sin(i) * 1.2, Math.cos(i * 1.7) * 2.4);
      r.rotation.y = -Math.PI / 2;
      wallGroup.add(r);
    }
    wallGroup.position.set(WALL_X, 0, 0);
    wallGroup.visible = false;
    world.add(wallGroup);
  })();

  /* ===================== 8. 游戏状态 ===================== */
  const RUN_SPEED = 6.4;
  const BACK_SPEED = 4.6;
  const GRAV = -32;
  const JUMP_V = 11.2;
  const JUMP_V2 = 10.0;
  const FIRE_GAP = 0.22;

  const G = {
    mode: 'intro',
    x: 1.6, y: 0, z: 0, vy: 0,
    onGround: true, jumps: 0,
    hearts: 3, stars: 0, shots: 0,
    invuln: 0, shield: 0, hurtFlash: 0,
    fireCd: 0, runT: 0, walkPhase: 0, facing: 1, aimBackT: 0, dustCd: 0,
    bossFight: false, bossDead: false, bossRef: null, bossHp: 0, bossTriggered: false,
    spawnCd: 2.0, t: 0, elapsed: 0, shake: 0,
    maxX: LEVEL_END, started: false, tipShown: true,
    playing: false,
  };

  const enemies = [];
  const input = { left: false, right: false, fire: false, jumpReq: false, jumpHeld: false };

  /* ===================== 9. DOM ===================== */
  const $ = (id) => document.getElementById(id);
  const elHearts = Array.prototype.slice.call(document.querySelectorAll('#hearts .h'));
  const elStars = $('stars');
  const elStar = $('starNum');
  const elBar = $('bar');
  const elDot = $('barDot');
  const elMsg = $('msg');
  const elFlash = $('flash');
  const elTip = $('tip');
  const elIntro = $('intro');
  const elWin = $('win');
  const elHud = $('hud');
  const elPad = $('pad');
  const elBossBar = $('bossBar');
  const elBossFill = $('bossFill');
  const elBtnSound = $('btnSound');
  const elSoundUse = elBtnSound ? elBtnSound.querySelector('use') : null;
  let starShown = 0;

  let msgTimer = 0;
  function showMsg(text, ms) {
    elMsg.textContent = text;
    elMsg.classList.remove('show');
    void elMsg.offsetWidth;
    elMsg.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => elMsg.classList.remove('show'), ms || 1700);
  }

  function floaty(worldPos, text) {
    const v = worldPos.clone().project(camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'floaty';
    el.textContent = text;
    el.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    el.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
  }

  function syncHUD() {
    elHearts.forEach((h, i) => {
      if (i < G.hearts) h.classList.remove('off');
      else h.classList.add('off');
    });
    elStar.textContent = String(G.stars);
    // 星星变多时弹一下，孩子能立刻注意到“我捡到了”
    if (G.stars > starShown && elStars) {
      elStars.classList.remove('bump');
      void elStars.offsetWidth;
      elStars.classList.add('bump');
    }
    starShown = G.stars;
    const pct = clamp((G.x / LEVEL_END) * 100, 0, 100);
    elBar.style.width = pct + '%';
    elDot.style.left = pct + '%';
    syncBossBar();
  }

  // 大王血条：只在开打时出现，打完立刻收起
  function syncBossBar() {
    if (!elBossBar) return;
    const boss = G.bossRef;
    const fighting = !!(G.bossFight && boss && !boss.dead);
    elBossBar.classList.toggle('show', fighting);
    if (!fighting) return;
    const max = boss.maxHp || 26;
    const hp = Math.max(0, Math.min(max, boss.hp));
    const pct = (hp / max) * 100;
    elBossFill.style.width = pct + '%';
    elBossBar.classList.toggle('low', pct <= 34);
  }

  /* ===================== 10. 射击 / 伤害 / 击杀 ===================== */
  const _tmpV = new THREE.Vector3();
  const _tmpV2 = new THREE.Vector3();
  const _white = new THREE.Color(0xffffff);

  function nearestEnemy() {
    let best = null, bestD = 1e9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.x - G.x;
      if (dx > 18 || dx < -14) continue;
      // 身后目标权重更高（不优先抢），但依然可锁——否则跑到墙边就永远打不到身后的大王
      const w = dx < -0.8 ? 2.6 : 1;
      const d = (dx * dx + (e.z - G.z) * (e.z - G.z)) * w;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function shoot() {
    const b = getBubble();
    const tgt = nearestEnemy();
    const back = !!(tgt && tgt.x < G.x - 0.8);
    if (back) G.aimBackT = 0.7;
    const dirSign = back ? -1 : 1;
    const ox = G.x + dirSign * 0.78, oy = G.y + 1.06, oz = G.z + 0.34;
    b.mesh.position.set(ox, oy, oz);
    let dx, dy, dz;
    if (tgt) {
      // 提前量：让 4 岁孩子也能打中
      const dist = Math.abs(tgt.x - ox);
      const lead = dist / 26;
      dx = tgt.x + tgt.vx * lead - ox;
      dy = (tgt.y + tgt.r * 1.1) - oy;
      dz = tgt.z - oz;
    } else {
      dx = 12; dy = 0.4; dz = 0;
    }
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const SPD = 26;
    b.vx = (dx / len) * SPD;
    b.vy = (dy / len) * SPD;
    b.vz = (dz / len) * SPD;
    b.life = 1.5;
    b.mesh.scale.setScalar(rnd(0.9, 1.1));
    bubbles.push(b);
    G.shots++;
    Sfx.shoot();
    // 后坐力
    P.arms[1].rotation.x = -0.5;
  }

  function hurtPlayer(fromX) {
    if (G.invuln > 0 || G.shield > 0 || G.mode !== 'play') return;
    G.hearts--;
    G.invuln = 1.6;
    G.shake = 0.5;
    Sfx.hurt();
    elFlash.style.opacity = '1';
    setTimeout(() => { elFlash.style.opacity = '0'; }, 130);
    // 击退
    G.x = clamp(G.x - 1.1, 0, G.maxX);
    G.vy = 6.5;
    G.onGround = false;
    if (G.hearts <= 0) {
      G.hearts = 0;
      G.shield = 2.8;
      showMsg('保护泡泡来啦！');
      Sfx.say('别怕，保护泡泡来啦');
      setTimeout(() => {
        if (G.mode !== 'play') return;
        G.hearts = 3;
        syncHUD();
        elHearts.forEach((h) => { h.classList.add('pop'); setTimeout(() => h.classList.remove('pop'), 460); });
      }, 900);
    }
    const el = elHearts[Math.max(0, G.hearts)];
    if (el) el.classList.add('pop');
    syncHUD();
  }

  function killEnemy(e, idx) {
    e.dead = true;
    burst(e.x, e.y + e.r, e.z, e.boss ? 60 : 14, e.boss ? 12 : 6);
    Sfx.pop();
    const wasBoss = e.boss;
    world.remove(e.root);
    const i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);

    if (wasBoss) {
      G.bossDead = true;
      G.bossFight = false;
      G.bossRef = null;
      G.bossHp = 0;
      if (elBossFill) elBossFill.style.width = '0%';   // 血条先见底再收起
      G.maxX = LEVEL_END + 6;
      wallGroup.visible = false;
      G.shake = 1.0;
      showMsg('彩虹门打开啦！');
      Sfx.win();
      Sfx.say('太厉害了，快跑到彩虹门吧');
      for (let k = 0; k < 6; k++) {
        setTimeout(() => burst(rnd(G.x - 2, G.x + 10), rnd(2, 6), rnd(-3, 3), 20, 9), k * 160);
      }
    } else {
      G.stars += 1;
      _tmpV.set(e.x, e.y + e.r * 1.6, e.z);
      floaty(_tmpV, '+1 ★');
      syncHUD();
    }
  }

  /* ===================== 11. 敌人刷新 ===================== */
  function spawnEnemy(kindIdx) {
    const kind = ENEMY_KINDS[kindIdx != null ? kindIdx : rndi(0, ENEMY_KINDS.length - 1)];
    const built = buildEnemy(kind, false);
    const z = rnd(-2.4, 2.4);
    const e = {
      root: built.root, inner: built.inner, mat: built.mat, r: kind.r, blob: built.blob,
      x: G.x + viewWidth * 0.62 + rnd(2, 5), y: 0, z: z,
      hp: kind.hp, maxHp: kind.hp, spd: rnd(kind.spd * 0.85, kind.spd * 1.15),
      vx: 0, phase: rnd(0, TAU), dead: false, boss: false, hitT: 0, color: kind.color,
      baseY: 0, touchCd: 0
    };
    e.root.position.set(e.x, 0, e.z);
    enemies.push(e);
    world.add(e.root);
    return e;
  }

  function spawnBoss() {
    const built = buildEnemy(ENEMY_KINDS[0], true);
    const e = {
      root: built.root, inner: built.inner, mat: built.mat, r: built.r, blob: built.blob,
      x: G.x + viewWidth * 0.55 + 4, y: 0, z: 0, hp: 26, maxHp: 26, spd: 1.05,
      vx: 0, phase: 0, dead: false, boss: true, hitT: 0, color: 0xc48bff, touchCd: 0
    };
    e.root.position.set(e.x, 0, e.z);
    enemies.push(e);
    world.add(e.root);
    G.bossRef = e;
    G.bossFight = true;
    G.bossHp = e.hp;
    G.maxX = WALL_X - 1.4;
    wallGroup.visible = true;
    showMsg('大王来啦！');
    Sfx.say('大王来啦，用泡泡打败它');
    return e;
  }

  /* ===================== 12. 主循环 ===================== */
  let lastT = performance.now();
  let fpsAcc = 0, fpsCnt = 0, fpsAvg = 60;

  function updatePlayer(dt) {
    const canMove = G.mode === 'play';

    // --- 水平移动 ---
    let mv = 0;
    if (canMove) {
      if (input.left) mv -= 1;
      if (input.right) mv += 1;
    }
    const spd = mv > 0 ? RUN_SPEED : BACK_SPEED;
    if (mv !== 0) {
      G.x += mv * spd * dt;
      G.walkPhase += dt * 11;
    } else {
      G.walkPhase += dt * 2.4;
    }
    G.x = clamp(G.x, 0, G.maxX);

    // --- 转身（向后射击时回头看）---
    if (G.aimBackT > 0) G.aimBackT -= dt;
    let faceGoal = 1;
    if (G.aimBackT > 0) faceGoal = -1;
    else if (mv > 0) faceGoal = 1;
    else if (mv < 0) faceGoal = -1;
    G.facing = faceGoal;
    const rotGoal = faceGoal > 0 ? -0.42 : Math.PI + 0.42;
    let diff = rotGoal - P.root.rotation.y;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    P.root.rotation.y += diff * Math.min(1, dt * 15);

    // --- 跳跃 ---
    if (input.jumpReq) {
      input.jumpReq = false;
      if (canMove) {
        if (G.onGround) { G.vy = JUMP_V; G.onGround = false; G.jumps = 1; Sfx.jump(); }
        else if (G.jumps < 2) { G.vy = JUMP_V2; G.jumps = 2; Sfx.jump(); burst(G.x, G.y + 0.2, G.z, 5, 2.4, [0xffffff, 0xd8f6ff]); }
      }
    }
    if (!input.jumpHeld && G.vy > 4) G.vy -= 26 * dt; // 短按小跳

    G.vy += GRAV * dt;
    G.y += G.vy * dt;
    if (G.y <= 0) {
      if (!G.onGround && G.vy < -6) burst(G.x, 0.12, G.z, 4, 1.6, [0xdff0ff, 0xffffff]);
      G.y = 0; G.vy = 0; G.onGround = true; G.jumps = 0;
    }

    // --- 射击 ---
    G.fireCd -= dt;
    if (canMove && input.fire && G.fireCd <= 0) {
      G.fireCd = FIRE_GAP;
      shoot();
    }

    // --- 视觉 ---
    P.root.position.set(G.x, G.y, G.z);
    playerBlob.position.set(G.x, 0.02, G.z);
    const airK = clamp(G.y / 2.2, 0, 1);
    playerBlob.scale.setScalar(1 - airK * 0.28);
    playerBlob.material.opacity = 1 - airK * 0.45;

    const sw = Math.sin(G.walkPhase);
    const sw2 = Math.cos(G.walkPhase);
    if (G.onGround) {
      P.legs[-1].rotation.z = sw * 0.62;
      P.legs[1].rotation.z = -sw * 0.62;
      P.arms[-1].rotation.z = sw * 0.42;
      P.arms[1].rotation.z = -0.78 + sw * 0.07;   // 右手持枪
      P.body.position.y = Math.abs(sw2) * 0.055;
      P.body.rotation.z = sw * 0.045;
    } else {
      P.legs[-1].rotation.z = -0.55 + sw * 0.12;
      P.legs[1].rotation.z = 0.4;
      P.arms[-1].rotation.z = -1.5;
      P.arms[1].rotation.z = -1.15;
      P.body.position.y = 0;
      P.body.rotation.z = 0;
    }
    P.arms[1].rotation.x = damp(P.arms[1].rotation.x, 0, 9, dt);

    // 围巾尾巴：跑动越快飘得越厉害，滞空时向上翻
    const flutter = (mv !== 0 ? 1 : 0.45) * (G.onGround ? 1 : 1.6);
    for (let ti = 0; ti < P.tails.length; ti++) {
      const tl = P.tails[ti];
      tl.rotation.z = -0.75 + Math.sin(G.t * 10 + ti * 1.7) * 0.16 * flutter + (G.onGround ? 0 : 0.34);
      tl.rotation.x = Math.sin(G.t * 7.5 + ti * 2.1) * 0.14 * flutter;
    }

    // 枪口发光脉动
    if (P.muzzle && P.muzzle.material) {
      P.muzzle.material.emissiveIntensity = 0.35 + Math.sin(G.t * 4) * 0.12 + (G.fireCd > FIRE_GAP * 0.6 ? 0.5 : 0);
    }


    // 无敌闪烁 / 保护泡
    if (G.invuln > 0) {
      G.invuln -= dt;
      P.root.visible = Math.floor(G.invuln * 14) % 2 === 0;
      if (G.invuln <= 0) P.root.visible = true;
    } else {
      P.root.visible = true;
    }
    if (G.shield > 0) {
      G.shield -= dt;
      shieldMesh.visible = true;
      shieldMesh.position.set(G.x, G.y + 1.0, G.z);
      shieldMesh.scale.setScalar(1 + Math.sin(G.t * 9) * 0.05);
      shieldMesh.rotation.y += dt * 0.6;
      if (G.shield <= 0) { G.shield = 0; shieldMesh.visible = false; }
    } else {
      shieldMesh.visible = false;
    }

    // 头顶朝向：略微看镜头
    P.head.rotation.y = -0.63 + Math.sin(G.t * 0.9) * 0.05;
  }

  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.life -= dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      b.mesh.rotation.y += dt * 3;
      b.mesh.rotation.x += dt * 2;
      const sc = 1 + Math.sin(G.t * 22 + i) * 0.05;
      b.mesh.scale.setScalar(sc);

      let hit = false;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead) continue;
        const dx = b.mesh.position.x - e.x;
        const dy = b.mesh.position.y - (e.y + e.r);
        const dz = b.mesh.position.z - e.z;
        const rr = e.r + 0.55;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          hit = true;
          e.hp -= 1;
          e.hitT = e.boss ? 0.1 : 0.16;
          burst(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 5, 3.2, [0xffffff, 0xd8f6ff]);
          if (e.boss) { G.bossHp = Math.max(0, e.hp); G.shake = Math.max(G.shake, 0.18); }
          if (e.hp <= 0) killEnemy(e, k);
          else Sfx.pop();
          break;
        }
      }

      if (hit || b.life <= 0 || b.mesh.position.x > G.x + 32 || b.mesh.position.x < G.x - 26) {
        b.mesh.visible = false;
        bubbles.splice(i, 1);
        if (bubblePool.length < 40) bubblePool.push(b);
      }
    }
  }

  const _fwd = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _blend = new THREE.Vector3();

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) continue;

      // 朝玩家移动
      const dx = G.x - e.x;
      const dz = G.z - e.z;
      const distXZ = Math.sqrt(dx * dx + dz * dz) || 1;
      let stopDist = e.boss ? 3.2 : 0.95;
      if (distXZ > stopDist) {
        const s = e.spd;
        e.vx = (dx / distXZ) * s;
        e.x += e.vx * dt;
        if (distXZ > 6) e.z += (dz / distXZ) * s * dt * 0.9;
        else e.z += (0 - e.z) * Math.min(1, dt * 2.5);
      } else {
        e.vx = 0;
      }
      // 不出界
      e.x = clamp(e.x, G.x - 40, G.x + 40);
      e.z = clamp(e.z, -3.2, 3.2);

      // 弹跳
      const bob = Math.abs(Math.sin(G.t * (e.boss ? 2.2 : 4.2) + e.phase));
      const hop = bob * (e.boss ? 0.18 : 0.22);
      e.root.position.set(e.x, hop, e.z);
      const sq = 1 + Math.sin(G.t * (e.boss ? 4.4 : 8.4) + e.phase) * 0.05;
      e.inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      e.blob.position.y = 0.03 - hop;
      e.blob.scale.setScalar(1 - hop * 0.5);

      // 朝向：玩家方向与镜头方向的混合，保证两只眼睛都看得见
      _fwd.set(G.x - e.x, 0, G.z - e.z).normalize();
      camera.getWorldDirection(_camDir);
      _camDir.set(-_camDir.x, 0, -_camDir.z).normalize();
      _blend.copy(_fwd).multiplyScalar(e.boss ? 0.75 : 0.58).addScaledVector(_camDir, e.boss ? 0.25 : 0.42).normalize();
      const targetYaw = Math.atan2(_blend.x, _blend.z);
      e.root.rotation.y = damp(e.root.rotation.y, targetYaw, 6, dt);

      // 受击闪烁：亮一下就好，不要整只变白（连发时否则一直是白团）
      if (e.hitT > 0) {
        e.hitT -= dt;
        const k = Math.max(0, e.hitT / 0.16);
        if (!e.baseColor) e.baseColor = new THREE.Color(e.color);
        e.mat.emissive.copy(_white);
        e.mat.emissiveIntensity = 0.06 + k * 0.26;
        e.mat.color.copy(e.baseColor).lerp(_white, 0.16 + k * 0.30);
        if (e.hitT <= 0) { e.mat.emissiveIntensity = 0; e.mat.color.copy(e.baseColor); }
      }

      // 撞到玩家
      const ddx = e.x - G.x, ddz = e.z - G.z;
      const touchR = e.r + 0.55;
      if (ddx * ddx + ddz * ddz < touchR * touchR && G.y < e.r * 2.1 + 0.6) {
        if (G.invuln <= 0 && G.shield <= 0) {
          hurtPlayer(e.x);
          e.x -= 1.6; e.z += rnd(-0.6, 0.6);
        }
      }
      if (e.boss && G.bossFight) G.bossHp = Math.max(0, e.hp);
    }
  }

  function updateParticles(dt) {
    let any = false;
    for (let i = 0; i < PARTICLE_N; i++) {
      const p = parts[i];
      if (!p.alive) {
        _m4.makeScale(0, 0, 0);
        _m4.setPosition(0, -999, 0);
        particleMesh.setMatrixAt(i, _m4);
        continue;
      }
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        _m4.makeScale(0, 0, 0);
        _m4.setPosition(0, -999, 0);
        particleMesh.setMatrixAt(i, _m4);
        continue;
      }
      p.vy += GRAV * 0.55 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.08) { p.y = 0.08; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
      p.rx += p.spin * dt; p.ry += p.spin * dt;
      const k = clamp(p.life / p.max, 0, 1);
      _v.set(p.x, p.y, p.z);
      _e.set(p.rx, p.ry, p.rz || 0);
      _q.setFromEuler(_e);
      _s.setScalar(p.s * (0.35 + k * 0.85));
      _m4.compose(_v, _q, _s);
      particleMesh.setMatrixAt(i, _m4);
    }
    particleMesh.instanceMatrix.needsUpdate = true;
    return any;
  }

  const camGoal = { x: -2, y: 6, z: 13, tx: 4, ty: 1.5, tz: 0 };
  function updateCamera(dt) {
    const d = camDist;
    let cx, cy, cz, tx, ty, tz;
    if (G.mode === 'intro') {
      const t = G.t * 0.28;
      cx = G.x - d * 0.42 + Math.sin(t) * 1.6;
      cy = 1.1 + d * 0.34 + Math.sin(t * 0.7) * 0.28;
      cz = d * 1.06;
      tx = G.x + d * 0.46;
      ty = 2.3;
      tz = 0;
    } else {
      const bossK = G.bossFight ? 1 : 0;
      cx = G.x - d * 0.13;
      cy = 1.1 + d * (narrowScreen ? 0.24 : 0.30) + G.y * 0.17;
      cz = d * 0.95 + bossK * 2.2;
      tx = G.x + d * 0.22;
      ty = (narrowScreen ? 1.75 : 1.32) + G.y * 0.3;
      tz = 0;
    }
    const l = 7.5;
    camGoal.x = damp(camGoal.x, cx, l, dt);
    camGoal.y = damp(camGoal.y, cy, l, dt);
    camGoal.z = damp(camGoal.z, cz, l, dt);
    camGoal.tx = damp(camGoal.tx, tx, l * 1.25, dt);
    camGoal.ty = damp(camGoal.ty, ty, l, dt);
    camGoal.tz = damp(camGoal.tz, tz, l, dt);

    let shx = 0, shy = 0;
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt * 1.9);
      const s = G.shake * G.shake * 0.55;
      shx = rnd(-s, s); shy = rnd(-s, s);
    }
    camera.position.set(camGoal.x + shx, camGoal.y + shy, camGoal.z);
    camera.lookAt(camGoal.tx + shx * 0.5, camGoal.ty + shy * 0.5, camGoal.tz);

    // 光源跟随
    sunLight.position.set(G.x + 8, 20, 9);
    sunLight.target.position.set(G.x + 1, 0, 0);
    sunLight.target.updateMatrixWorld();
  }

  function updateSpawner(dt) {
    if (G.mode !== 'play') return;
    if (G.bossFight || G.bossDead) return;
    if (!G.bossTriggered && G.x > BOSS_TRIGGER) {
      G.bossTriggered = true;
      spawnBoss();
      return;
    }
    if (G.bossTriggered) return;
    G.spawnCd -= dt;
    if (G.spawnCd <= 0) {
      const alive = enemies.filter((e) => !e.dead).length;
      if (alive < 5) {
        spawnEnemy();
        G.spawnCd = rnd(1.5, 2.7);
      } else {
        G.spawnCd = 0.7;
      }
    }
  }

  function checkWin() {
    if (G.mode !== 'play' || !G.bossDead) return;
    if (G.x >= LEVEL_END - 0.2) {
      winGame();
    }
  }

  function winGame() {
    G.mode = 'win';
    G.playing = false;
    Sfx.musicStop();
    Sfx.win();
    Sfx.say('太棒啦，你赢了');
    elWin.classList.remove('gone');
    elWin.classList.add('hide');
    requestAnimationFrame(() => requestAnimationFrame(() => elWin.classList.remove('hide')));
    $('winStars').textContent = String(G.stars);
    $('winPops').textContent = String(G.shots);
    $('winTime').textContent = Math.round(G.elapsed) + 's';
    elHud.classList.add('hide');
    elPad.classList.add('hide');
    elTip.classList.add('hide');
    elMsg.classList.remove('show');   // 别让“彩虹门打开啦”留在结算面板背后
    for (let k = 0; k < 10; k++) {
      setTimeout(() => {
        burst(rnd(G.x - 5, G.x + 8), rnd(3, 8), rnd(-6, 6), 22, 10);
        Sfx.pop();
      }, k * 220);
    }
  }

  /* ===================== 13. 流程控制 ===================== */
  function clearWorld() {
    for (const e of enemies) world.remove(e.root);
    enemies.length = 0;
    for (const b of bubbles) { b.mesh.visible = false; bubblePool.push(b); }
    bubbles.length = 0;
    for (const p of parts) p.alive = false;
    G.bossFight = false; G.bossDead = false; G.bossTriggered = false; G.bossRef = null; G.bossHp = 0;
    G.maxX = LEVEL_END + 6;
    wallGroup.visible = false;
  }

  function resetGame() {
    clearWorld();
    resetPickups();
    G.x = 1.6; G.y = 0; G.z = 0; G.vy = 0;
    G.hearts = 3; G.stars = 0; G.shots = 0;
    G.invuln = 0; G.shield = 0; G.fireCd = 0; G.shake = 0;
    G.spawnCd = 1.4; G.elapsed = 0; G.walkPhase = 0;
    G.onGround = true; G.jumps = 0;
    camGoal.x = G.x - 3; camGoal.y = 6.4; camGoal.z = 13.6;
    camGoal.tx = G.x + 3; camGoal.ty = 1.6; camGoal.tz = 0;
    P.root.position.set(G.x, 0, G.z);
    P.root.visible = true;
    syncHUD();
  }

  function clearInput() {
    input.left = false; input.right = false;
    input.fire = false; input.jumpHeld = false; input.jumpReq = false;
  }

  function startGame() {
    clearInput();
    Sfx.unlock();
    Sfx.musicStart();
    resetGame();
    G.mode = 'play';
    G.playing = true;
    G.tipShown = true;
    elIntro.classList.add('hide');
    setTimeout(() => elIntro.classList.add('gone'), 480);
    elWin.classList.add('gone');
    elHud.classList.remove('hide');
    elPad.classList.remove('hide');
    elTip.classList.remove('hide');
    showMsg('出发啦！');
    Sfx.say('出发啦，去找彩虹门');
    setTimeout(() => {
      if (G.mode === 'play' && G.tipShown) {
        G.tipShown = false;
        elTip.classList.add('hide');
      }
    }, 5200);
  }

  function replay() {
    clearInput();
    elWin.classList.add('hide');
    setTimeout(() => elWin.classList.add('gone'), 460);
    resetGame();
    G.mode = 'play';
    Sfx.musicStart();
    elHud.classList.remove('hide');
    elPad.classList.remove('hide');
    elTip.classList.remove('hide');
    showMsg('再来一次！');
    setTimeout(() => elTip.classList.add('hide'), 3000);
  }

  /* ===================== 14. 输入 ===================== */
  function bindHold(el, onDown, onUp) {
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      el.classList.add('on');
      onDown();
    };
    const up = (e) => {
      if (e) e.preventDefault();
      el.classList.remove('on');
      if (onUp) onUp();
    };
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointerup', up, { passive: false });
    el.addEventListener('pointercancel', up, { passive: false });
    el.addEventListener('pointerleave', (e) => { if (e.buttons) up(e); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindHold($('btnLeft'), () => { input.left = true; }, () => { input.left = false; });
  bindHold($('btnRight'), () => { input.right = true; }, () => { input.right = false; });
  bindHold($('btnFire'), () => { input.fire = true; Sfx.unlock(); }, () => { input.fire = false; });
  bindHold($('btnJump'), () => { input.jumpReq = true; input.jumpHeld = true; Sfx.unlock(); }, () => { input.jumpHeld = false; });

  $('btnStart').addEventListener('click', (e) => { e.preventDefault(); startGame(); });
  $('btnReplay').addEventListener('click', (e) => { e.preventDefault(); replay(); });
  elBtnSound.addEventListener('click', (e) => {
    e.preventDefault();
    const m = Sfx.toggleMute();
    if (elSoundUse) {
      const id = m ? '#i-mute' : '#i-vol';
      elSoundUse.setAttribute('href', id);
      elSoundUse.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', id);
    }
    elBtnSound.classList.toggle('muted', m);
    elBtnSound.setAttribute('aria-label', m ? '打开声音' : '关闭声音');
  });
  $('btnAgain').addEventListener('click', (e) => {
    e.preventDefault();
    if (G.mode === 'play') { resetGame(); showMsg('重新开始'); }
    else if (G.mode === 'win') { replay(); }
  });

  window.addEventListener('keydown', (e) => {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') { input.left = true; e.preventDefault(); }
    if (c === 'ArrowRight' || c === 'KeyD') { input.right = true; e.preventDefault(); }
    if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW') {
      if (!e.repeat) input.jumpReq = true;
      input.jumpHeld = true;
      e.preventDefault();
    }
    if (c === 'KeyJ' || c === 'ShiftLeft') { input.fire = true; e.preventDefault(); }
    if (c === 'Enter') {
      if (G.mode === 'intro') startGame();
      else if (G.mode === 'win') replay();
    }
  });
  window.addEventListener('keyup', (e) => {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') input.left = false;
    if (c === 'ArrowRight' || c === 'KeyD') input.right = false;
    if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW') input.jumpHeld = false;
    if (c === 'KeyJ' || c === 'ShiftLeft') input.fire = false;
  });
  window.addEventListener('blur', () => {
    input.left = input.right = input.fire = input.jumpHeld = false;
  });

  // 禁止双指缩放 / 双指手势 / 下拉刷新
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ===================== 15. 自适应 ===================== */
  let resizeTimer = 0;
  let camDist = 10.5;
  let viewWidth = 15;
  let narrowScreen = false;
  function applySize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);

    // 让「横向可见的世界宽度」稳定在目标值：竖屏自动拉远并加大视角，
    // 否则手机竖屏只能看到 4 米宽，完全没法玩。
    const aspect = w / h;
    const narrow = aspect < 0.95;
    narrowScreen = narrow;
    const fov = narrow ? 62 : 48;
    const targetW = narrow ? 7.6 : 15.0;
    camDist = clamp(targetW / (2 * Math.tan((fov * Math.PI) / 360) * aspect), 8.6, 21);
    viewWidth = 2 * camDist * Math.tan((fov * Math.PI) / 360) * aspect;
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applySize, 180);
  });
  window.addEventListener('orientationchange', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applySize, 240);
  });
  applySize();

  /* ===================== 16. 帧循环 ===================== */
  let rafId = 0;
  let firstFrame = false;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.05);

    G.t += dt;
    if (G.mode === 'play') G.elapsed += dt;

    // 平滑帧率统计
    fpsAcc += dt; fpsCnt++;
    if (fpsAcc > 0.5) { fpsAvg = fpsCnt / fpsAcc; fpsAcc = 0; fpsCnt = 0; }

    updatePlayer(dt);
    updateSpawner(dt);
    updateEnemies(dt);
    updateBubbles(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateCamera(dt);
    checkWin();
    syncBossBar();

    // 场景动态元素
    clouds.position.x = Math.sin(G.t * 0.02) * 6;
    const st = gateGroup.userData.star;
    if (st) { st.rotation.y += dt * 1.2; st.position.y = 4.6 + Math.sin(G.t * 1.8) * 0.14; }
    if (wallGroup.visible) {
      wallGroup.children.forEach((c, i) => {
        if (c.material && c.material.opacity != null) {
          c.material.opacity = (i === 0 ? 0.22 : 0.4) + Math.sin(G.t * 2.4 + i) * 0.12;
        }
      });
    }
    if (G.bossFight || G.bossDead) {
      // 彩虹门在通关过程中轻微脉动
      gateGroup.children.forEach((c, i) => {
        if (c.material && c.material.emissiveIntensity != null) {
          c.material.emissiveIntensity = 0.28 + Math.sin(G.t * 1.6 - i * 0.4) * 0.16;
        }
      });
    }

    Sfx.schedule();
    renderer.render(scene, camera);

    if (!firstFrame) {
      firstFrame = true;
      window.GAME && (window.GAME.ready = true);
    }
  }

  /* ===================== 17. 调试接口（验收用） ===================== */
  window.GAME = {
    ready: false,
    errs: ERRS,
    G: G,
    enemies: enemies,
    bubbles: bubbles,
    pickups: pickups,
    camera: camera,
    scene: scene,
    info: function () {
      return {
        mode: G.mode, x: +G.x.toFixed(2), y: +G.y.toFixed(2),
        hearts: G.hearts, stars: G.stars, shots: G.shots,
        enemies: enemies.length, bossFight: G.bossFight, bossDead: G.bossDead,
        bossHp: G.bossHp, maxX: G.maxX,
        calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
        fps: Math.round(fpsAvg), errs: ERRS.length
      };
    },
    start: startGame,
    restart: replay,
    warp: function (x) { G.x = clamp(x, 0, G.maxX); },
    giveStars: function (n) { G.stars += n; syncHUD(); },
    killBoss: function () {
      if (G.bossRef) killEnemy(G.bossRef, 0);
    },
    fireOnce: function () { shoot(); },
    // 确定性推进（测试用：不依赖真实帧率，直接跑逻辑 + 渲染一帧）
    step: function (seconds) {
      const h = 1 / 60;
      const n = Math.max(1, Math.round(seconds / h));
      for (let i = 0; i < n; i++) {
        G.t += h;
        if (G.mode === 'play') G.elapsed += h;
        updatePlayer(h);
        updateSpawner(h);
        updateEnemies(h);
        updateBubbles(h);
        updatePickups(h);
        updateParticles(h);
        updateCamera(h);
        checkWin();
        syncBossBar();
      }
      Sfx.schedule();
      renderer.render(scene, camera);
      return this.info();
    },
    press: function (name, on) {
      if (name === 'left') input.left = !!on;
      if (name === 'right') input.right = !!on;
      if (name === 'fire') input.fire = !!on;
      if (name === 'jump' && on) { input.jumpReq = true; input.jumpHeld = true; }
      if (name === 'jump' && !on) input.jumpHeld = false;
    },
    screenshotReady: function () { return firstFrame; }
  };

  // 预置：开场让主角在前景待机
  P.root.position.set(G.x, 0, G.z);
  syncHUD();
  lastT = performance.now();
  rafId = requestAnimationFrame(tick);

  // 页签切回时重置时钟，避免 dt 爆炸
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastT = performance.now();
  });
})();
