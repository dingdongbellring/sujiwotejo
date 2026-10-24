(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shadowCanvas = document.getElementById('shadows');
  const wordCanvas = document.getElementById('words');
  const sx = shadowCanvas.getContext('2d');
  const wx = wordCanvas.getContext('2d');

  const PHRASES = ['Sujiwo Tejo', 'President Jancukers'];
  const FONT = '"EB Garamond", Georgia, serif';
  const SHADOW_SCALE = 0.5; // the shadow layer is blurred anyway, so render it at half size
  const MAX_SHAPES = reduceMotion ? 60 : 220;
  const SPAWN_STEP = 22; // px of movement per shadow shape

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let W = 0, H = 0, dpr = 1, fontSize = 24;

  function resize() {
    W = innerWidth;
    H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    fontSize = clamp(W * 0.022, 16, 28);
    shadowCanvas.width = Math.ceil(W * SHADOW_SCALE);
    shadowCanvas.height = Math.ceil(H * SHADOW_SCALE);
    wordCanvas.width = Math.ceil(W * dpr);
    wordCanvas.height = Math.ceil(H * dpr);
  }

  // ── Shadow shapes ──────────────────────────────────────────────
  // Mostly gunungan: broad at the base, rising to a point, standing
  // roughly upright and leaning with the movement. Now and then a thin
  // rod, like the puppet's control stick.
  const shapes = [];

  function spawn(x, y, dx, dy) {
    const speed = Math.hypot(dx, dy);
    const nx = speed ? -dy / speed : 0, ny = speed ? dx / speed : 0;
    const side = rand(-1, 1) * clamp(speed * 0.5, 6, 36);
    const kind = Math.random() < 0.05 ? 'rod' : 'gunungan';
    const w = kind === 'rod' ? rand(2, 4) : rand(30, 70) + clamp(speed * 0.5, 0, 40);
    const carry = rand(0.02, 0.045);
    shapes.push({
      kind,
      x: x + nx * side,
      y: y + ny * side,
      vx: dx * carry + rand(-0.3, 0.3),
      vy: dy * carry + rand(-0.3, 0.3),
      a: kind === 'rod' ? rand(-0.4, 0.4) : clamp(dx * 0.012, -0.6, 0.6) + rand(-0.25, 0.25),
      va: rand(-0.004, 0.004),
      w,
      h: kind === 'rod' ? rand(80, 180) : w * rand(1.25, 1.7),
      grow: rand(1.001, 1.005),
      life: 1,
      decay: rand(0.005, 0.01),
    });
    if (shapes.length > MAX_SHAPES) shapes.splice(0, shapes.length - MAX_SHAPES);
  }

  function gununganPath(w, h) {
    sx.moveTo(0, -h);
    sx.bezierCurveTo(w * 0.5, -h * 0.5, w, h * 0.1, w * 0.8, h * 0.55);
    sx.quadraticCurveTo(w * 0.4, h * 0.75, 0, h * 0.72);
    sx.quadraticCurveTo(-w * 0.4, h * 0.75, -w * 0.8, h * 0.55);
    sx.bezierCurveTo(-w, h * 0.1, -w * 0.5, -h * 0.5, 0, -h);
  }

  // carried along by the movement, then slowly rising like smoke
  function drift(p, f, damp) {
    p.x += p.vx * f;
    p.y += p.vy * f;
    p.vx *= damp;
    p.vy = p.vy * damp - 0.012 * f;
  }

  let flicker = 1; // the blencong lamp never burns perfectly steady

  function drawShadows(f) {
    sx.setTransform(SHADOW_SCALE, 0, 0, SHADOW_SCALE, 0, 0);
    sx.globalCompositeOperation = 'source-over';
    sx.clearRect(0, 0, W, H);
    sx.globalCompositeOperation = 'lighter';

    flicker += (rand(0.8, 1.04) - flicker) * 0.08;
    const damp = Math.pow(0.97, f);

    for (let i = shapes.length - 1; i >= 0; i--) {
      const p = shapes[i];
      p.life -= p.decay * f;
      if (p.life <= 0) { shapes.splice(i, 1); continue; }
      drift(p, f, damp);
      p.a += p.va * f;
      const g = Math.pow(p.grow, f);
      p.w *= g;
      p.h *= g;

      const alpha = p.life * p.life * 0.2 * flicker;
      sx.fillStyle = sx.strokeStyle = `rgba(255,255,255,${alpha})`;
      sx.save();
      sx.translate(p.x, p.y);
      sx.rotate(p.a);
      sx.beginPath();
      if (p.kind === 'rod') {
        sx.lineWidth = p.w;
        sx.lineCap = 'round';
        sx.moveTo(0, -p.h / 2);
        sx.lineTo(0, p.h / 2);
        sx.stroke();
      } else {
        gununganPath(p.w, p.h);
        sx.fill();
      }
      sx.restore();
    }
  }

  // ── Words ──────────────────────────────────────────────────────
  // The name sits still in the middle of the page, in black on black:
  // it can only be read where a shadow passes behind it.
  let fontsReady = false;

  function drawWords() {
    wx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wx.clearRect(0, 0, W, H);
    if (!fontsReady) return;
    wx.font = `400 ${fontSize}px ${FONT}`;
    wx.textAlign = 'center';
    wx.textBaseline = 'middle';
    wx.fillStyle = '#000';
    const lineH = fontSize * 1.35;
    PHRASES.forEach((text, i) => {
      wx.fillText(text, W / 2, H / 2 + (i - (PHRASES.length - 1) / 2) * lineH);
    });
  }

  // ── Sound ──────────────────────────────────────────────────────
  // Browsers only allow sound after a click or tap. Once started, the
  // song stays barely audible and swells while the shadows are moving.
  const invite = document.querySelector('.invite');
  const audio = document.querySelector('audio');
  const QUIET = 0.04, LOUD = 0.9;
  let started = false; // nothing happens until the circle is clicked
  let audioCtx = null, gain = null;
  let energy = 0; // 0..1, how much movement there has been lately

  function start() {
    if (started) return;
    started = true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
      gain = audioCtx.createGain();
      gain.gain.value = QUIET;
      audioCtx.createMediaElementSource(audio).connect(gain).connect(audioCtx.destination);
      audioCtx.resume();
    } else {
      audioCtx = true;
      audio.volume = QUIET;
    }
    audio.play().catch(() => {});
    invite.classList.add('is-playing');
  }

  function updateVolume(dt) {
    energy *= Math.pow(0.2, dt); // fades back to quiet within a few seconds of stillness
    if (!audioCtx) return;
    const level = QUIET + (LOUD - QUIET) * energy;
    if (gain) gain.gain.setTargetAtTime(level, audioCtx.currentTime, 0.25);
    else audio.volume = level;
  }

  invite.addEventListener('click', start);
  document.addEventListener('visibilitychange', () => {
    if (!audioCtx) return;
    if (document.hidden) audio.pause();
    else audio.play().catch(() => {});
  });

  // ── Input ──────────────────────────────────────────────────────
  let px = null, py = null;
  let spawnAcc = 0;

  function moveTo(x, y) {
    if (!started) return;
    if (px === null) { px = x; py = y; return; }
    const dx = x - px, dy = y - py;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;

    // spawn shadows evenly along the path, whatever the event rate
    spawnAcc += d;
    const step = reduceMotion ? SPAWN_STEP * 3 : SPAWN_STEP;
    spawnAcc = Math.min(spawnAcc, step * 4); // a fast flick shouldn't flood the screen white
    while (spawnAcc >= step) {
      spawnAcc -= step;
      const t = 1 - spawnAcc / d;
      spawn(px + dx * t, py + dy * t, dx, dy);
    }

    energy = Math.min(1, energy + d / 1000);
    px = x; py = y;
  }

  function onPointer(e) {
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (events.length) events.forEach((ev) => moveTo(ev.clientX, ev.clientY));
    else moveTo(e.clientX, e.clientY);
  }

  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (!started) return;
    px = e.clientX; py = e.clientY;
    for (let i = 0; i < 3; i++) spawn(px, py, rand(-10, 10), rand(-10, 10));
  }, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') px = null; }, { passive: true });
  addEventListener('pointerleave', () => { px = null; });
  addEventListener('resize', () => { resize(); drawWords(); });

  // ── Loop ───────────────────────────────────────────────────────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const f = dt * 60;
    drawShadows(f);
    updateVolume(dt);
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  const fontLoad = document.fonts ? document.fonts.load(`400 24px ${FONT}`) : Promise.resolve();
  Promise.race([fontLoad, new Promise((r) => setTimeout(r, 2500))]).then(() => { fontsReady = true; drawWords(); });
})();
