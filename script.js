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
  const IDLE_MS = 3500;

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

  // shadows and letters move together: carried along, then slowly rising like smoke
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
  // Every so often the movement writes a phrase, one letter at a time
  // along its own path. The letters are black, so they only show where
  // they fall inside a shadow, and they fade with it.
  const letters = [];
  let writing = null;
  let phraseIndex = 0;
  let fontsReady = false;
  let dirX = 1, dirY = 0; // smoothed direction of travel

  function startWriting() {
    if (!fontsReady || writing) return;
    const text = PHRASES[phraseIndex++ % PHRASES.length];
    // moving leftwards: lay the phrase down backwards and turn each letter
    // over, so it still reads left to right and upright
    const flip = dirX < 0;
    const chars = flip ? [...text].reverse() : [...text];
    wx.font = `400 ${fontSize}px ${FONT}`;
    const tracking = fontSize * 0.06;
    const widths = chars.map((c) => wx.measureText(c).width + tracking);
    // distance from the previous letter's centre to this one's
    const gaps = widths.map((w, i) => (i ? (widths[i - 1] + w) / 2 : 0));
    writing = { chars, i: 0, acc: 0, flip, gaps };
  }

  function writeAlong(x0, y0, dx, dy, d) {
    let pos = 0; // distance already used along this segment
    while (writing) {
      const need = writing.gaps[writing.i] - writing.acc;
      if (pos + need > d) { writing.acc += d - pos; return; }
      pos += need;
      writing.acc = 0;
      const t = pos / d;
      const speed = Math.min(d, 30);
      letters.push({
        ch: writing.chars[writing.i],
        x: x0 + dx * t,
        y: y0 + dy * t,
        a: Math.atan2(dirY, dirX) + (writing.flip ? Math.PI : 0),
        vx: (dx / d) * speed * 0.03,
        vy: (dy / d) * speed * 0.03,
        age: 0,
        life: rand(3.6, 4.4),
      });
      if (++writing.i >= writing.chars.length) writing = null;
    }
  }

  function drawWords(dt, f) {
    wx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wx.clearRect(0, 0, W, H);
    if (!letters.length) return;

    const damp = Math.pow(0.97, f);
    wx.font = `400 ${fontSize}px ${FONT}`;
    wx.textAlign = 'center';
    wx.textBaseline = 'middle';
    wx.fillStyle = '#000';

    for (let i = letters.length - 1; i >= 0; i--) {
      const l = letters[i];
      l.age += dt;
      if (l.age >= l.life) { letters.splice(i, 1); continue; }
      drift(l, f, damp);
      const fadeIn = Math.min(l.age / 0.35, 1);
      const fadeOut = Math.min((l.life - l.age) / 1.4, 1);
      wx.globalAlpha = fadeIn * fadeOut;
      wx.save();
      wx.translate(l.x, l.y);
      wx.rotate(l.a);
      wx.fillText(l.ch, 0, 0);
      wx.restore();
    }
    wx.globalAlpha = 1;
  }

  // ── Input ──────────────────────────────────────────────────────
  let px = null, py = null;
  let spawnAcc = 0;
  let travel = 0;
  let nextWordAt = rand(900, 1600);
  let lastInput = -Infinity;
  let ghostActive = false;

  function moveTo(x, y) {
    if (px === null) { px = x; py = y; return; }
    const dx = x - px, dy = y - py;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;

    dirX += (dx / d - dirX) * 0.25;
    dirY += (dy / d - dirY) * 0.25;
    const len = Math.hypot(dirX, dirY) || 1;
    dirX /= len; dirY /= len;

    // spawn shadows evenly along the path, whatever the event rate
    spawnAcc += d;
    const step = reduceMotion ? SPAWN_STEP * 3 : SPAWN_STEP;
    spawnAcc = Math.min(spawnAcc, step * 4); // a fast flick shouldn't flood the screen white
    while (spawnAcc >= step) {
      spawnAcc -= step;
      const t = 1 - spawnAcc / d;
      spawn(px + dx * t, py + dy * t, dx, dy);
    }

    writeAlong(px, py, dx, dy, d);

    px = x; py = y;
    travel += d;
    if (!writing && travel > nextWordAt) {
      startWriting();
      travel = 0;
      nextWordAt = rand(1400, 2800);
    }
  }

  function onPointer(e) {
    lastInput = performance.now();
    if (ghostActive) { ghostActive = false; px = null; }
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (events.length) events.forEach((ev) => moveTo(ev.clientX, ev.clientY));
    else moveTo(e.clientX, e.clientY);
  }

  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', (e) => {
    lastInput = performance.now();
    ghostActive = false;
    px = e.clientX; py = e.clientY;
    for (let i = 0; i < 3; i++) spawn(px, py, rand(-10, 10), rand(-10, 10));
  }, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') px = null; }, { passive: true });
  addEventListener('pointerleave', () => { px = null; });
  addEventListener('resize', resize);

  // When nobody is moving, an unseen dalang keeps the shadows alive.
  let ghostT = Math.random() * 100;
  function ghost(dt) {
    if (reduceMotion || performance.now() - lastInput < IDLE_MS) return;
    if (!ghostActive) { ghostActive = true; px = null; }
    ghostT += dt * (0.55 + 0.3 * Math.sin(ghostT * 0.37)); // the hand speeds up and lingers
    const x = W * (0.5 + 0.34 * Math.sin(ghostT * 0.9) * Math.cos(ghostT * 0.31) + 0.05 * Math.sin(ghostT * 2.3));
    const y = H * (0.42 + 0.2 * Math.sin(ghostT * 1.3 + 1.1));
    moveTo(x, y);
  }

  // ── Loop ───────────────────────────────────────────────────────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const f = dt * 60;
    ghost(dt);
    drawShadows(f);
    drawWords(dt, f);
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  const fontLoad = document.fonts ? document.fonts.load(`400 24px ${FONT}`) : Promise.resolve();
  Promise.race([fontLoad, new Promise((r) => setTimeout(r, 2500))]).then(() => { fontsReady = true; });
})();
