(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shadowCanvas = document.getElementById('shadows');
  const wordCanvas = document.getElementById('words');
  const sx = shadowCanvas.getContext('2d');
  const wx = wordCanvas.getContext('2d');
  const footer = document.querySelector('footer');

  const PHRASES = ['Sujiwo Tejo', 'President Jancukers'];
  const FONT = '"Fraunces", Georgia, serif';
  const SHADOW_SCALE = 0.5; // the shadow layer is blurred anyway, so render it at half size
  const MAX_SHAPES = reduceMotion ? 120 : 520;
  const IDLE_MS = 3500;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let W = 0, H = 0, dpr = 1;

  function resize() {
    W = innerWidth;
    H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    shadowCanvas.width = Math.ceil(W * SHADOW_SCALE);
    shadowCanvas.height = Math.ceil(H * SHADOW_SCALE);
    wordCanvas.width = Math.ceil(W * dpr);
    wordCanvas.height = Math.ceil(H * dpr);
    word = null;
  }

  // ── Shadow shapes ──────────────────────────────────────────────
  // Three abstract wayang forms: soft elongated bodies, thin rods (the
  // puppet's control sticks / arms) and pointed leaves (gunungan).
  const shapes = [];

  function spawn(x, y, dx, dy) {
    const speed = Math.hypot(dx, dy);
    const r = Math.random();
    const kind = r < 0.1 ? 'rod' : r < 0.17 && speed > 14 ? 'leaf' : 'body';
    const drift = rand(0.02, 0.05);
    // scatter sideways from the path so a trail reads as several limbs, not one smear
    const side = rand(-1, 1) * clamp(speed * 0.6, 4, 40);
    const nx = speed ? -dy / speed : 0, ny = speed ? dx / speed : 0;
    shapes.push({
      kind,
      x: x + nx * side,
      y: y + ny * side,
      vx: dx * drift + rand(-0.3, 0.3),
      vy: dy * drift + rand(-0.3, 0.3),
      a: kind === 'rod' ? Math.PI / 2 + rand(-0.6, 0.6) : Math.atan2(dy, dx) + rand(-0.35, 0.35),
      va: rand(-0.008, 0.008),
      len: kind === 'rod' ? rand(70, 180) : clamp(20 + speed * 1.4, 20, 150) * rand(0.6, 1.2),
      wid: kind === 'rod' ? rand(2, 4) : rand(9, 26),
      grow: rand(1.002, 1.01),
      life: 1,
      decay: rand(0.006, 0.013),
    });
    if (shapes.length > MAX_SHAPES) shapes.splice(0, shapes.length - MAX_SHAPES);
  }

  let flicker = 1; // the blencong lamp never burns perfectly steady

  function drawShadows(f) {
    sx.setTransform(SHADOW_SCALE, 0, 0, SHADOW_SCALE, 0, 0);
    sx.globalCompositeOperation = 'source-over';
    sx.clearRect(0, 0, W, H);
    sx.globalCompositeOperation = 'lighter';

    flicker += (rand(0.78, 1.04) - flicker) * 0.08;
    const damp = Math.pow(0.97, f);

    for (let i = shapes.length - 1; i >= 0; i--) {
      const p = shapes[i];
      p.life -= p.decay * f;
      if (p.life <= 0) { shapes.splice(i, 1); continue; }
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vx *= damp;
      p.vy = p.vy * damp - 0.012 * f; // shadows slowly rise like smoke
      p.a += p.va * f;
      p.len *= Math.pow(p.grow, f);

      const alpha = p.life * p.life * 0.32 * flicker;
      sx.fillStyle = sx.strokeStyle = `rgba(255,255,255,${alpha})`;
      sx.save();
      sx.translate(p.x, p.y);
      sx.rotate(p.a);
      sx.beginPath();
      if (p.kind === 'rod') {
        sx.lineWidth = p.wid;
        sx.lineCap = 'round';
        sx.moveTo(-p.len / 2, 0);
        sx.lineTo(p.len / 2, 0);
        sx.stroke();
      } else if (p.kind === 'leaf') {
        const l = p.len, w = p.wid * 2.2;
        sx.moveTo(-l, 0);
        sx.quadraticCurveTo(0, -w, l, 0);
        sx.quadraticCurveTo(0, w, -l, 0);
        sx.fill();
      } else {
        sx.ellipse(0, 0, p.len, p.wid, 0, 0, Math.PI * 2);
        sx.fill();
      }
      sx.restore();
    }

    // soft halo behind any word that is forming
    if (word && word.alpha > 0) {
      sx.fillStyle = `rgba(255,255,255,${word.alpha * 0.07 * flicker})`;
      sx.beginPath();
      const r = word.gap * 2;
      for (const p of word.pts) {
        sx.moveTo(p.x + r, p.y);
        sx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      sx.fill();
    }
  }

  // ── Words ──────────────────────────────────────────────────────
  // Every so often the shadows gather into a phrase, hold, then dissolve.
  const GATHER = 1.8, HOLD = 1.6, DISSOLVE = 2.4; // seconds
  let word = null;
  let phraseIndex = 0;
  let fontsReady = false;

  function layoutText(text) {
    const o = document.createElement('canvas').getContext('2d');
    const maxW = W * 0.86;
    const maxSize = Math.min(W * 0.14, 150);
    const fit = (lines) => {
      o.font = `italic 500 100px ${FONT}`;
      const widest = Math.max(...lines.map((l) => o.measureText(l).width));
      return Math.min(maxSize, (100 * maxW) / widest);
    };
    let lines = [text];
    let size = fit(lines);
    if (size < 52 && text.includes(' ')) {
      lines = text.split(' ');
      size = fit(lines);
    }
    return { lines, size };
  }

  function sampleText(text) {
    const { lines, size } = layoutText(text);
    const lineH = size * 1.08;
    const c = document.createElement('canvas');
    const o = c.getContext('2d', { willReadFrequently: true });
    o.font = `italic 500 ${size}px ${FONT}`;
    const blockW = Math.ceil(Math.max(...lines.map((l) => o.measureText(l).width)) + size * 0.4);
    const blockH = Math.ceil(lines.length * lineH + size * 0.3);
    c.width = blockW;
    c.height = blockH;
    o.font = `italic 500 ${size}px ${FONT}`;
    o.fillStyle = '#fff';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    lines.forEach((l, i) => o.fillText(l, blockW / 2, blockH / 2 + (i - (lines.length - 1) / 2) * lineH));

    const data = o.getImageData(0, 0, blockW, blockH).data;
    let gap = Math.max(2, Math.round(size / 34));
    let pts;
    do {
      pts = [];
      for (let y = 0; y < blockH; y += gap) {
        for (let x = 0; x < blockW; x += gap) {
          if (data[(y * blockW + x) * 4 + 3] > 128) pts.push({ x: x - blockW / 2, y: y - blockH / 2 });
        }
      }
      gap++;
    } while (pts.length > 2600);
    return { pts, gap: gap - 1, blockW, blockH };
  }

  function triggerWord(ox, oy) {
    if (!fontsReady || word) return;
    const text = PHRASES[phraseIndex++ % PHRASES.length];
    const { pts, gap, blockW, blockH } = sampleText(text);
    const footerTop = H - footer.offsetHeight;
    const cx = clamp(ox, blockW / 2 + 16, Math.max(blockW / 2 + 16, W - blockW / 2 - 16));
    const cy = clamp(oy, blockH / 2 + 24, Math.max(blockH / 2 + 24, footerTop - blockH / 2 - 16));
    word = {
      t: 0,
      blur: 0,
      gap,
      alpha: 0,
      pts: pts.map((p) => {
        const ang = rand(0, Math.PI * 2), dist = 70 * Math.sqrt(Math.random());
        return {
          tx: cx + p.x,
          ty: cy + p.y,
          x: ox + Math.cos(ang) * dist,
          y: oy + Math.sin(ang) * dist,
          delay: rand(0, 0.7),
          ease: rand(0.05, 0.09),
          seed: Math.random() * 1000,
          rise: rand(0.2, 0.9),
        };
      }),
    };
  }

  function drawWord(dt, f) {
    wx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wx.clearRect(0, 0, W, H);
    if (!word) return;

    word.t += dt;
    const t = word.t;
    const dissolveT = t - GATHER - HOLD;
    if (dissolveT > DISSOLVE) { word = null; return; }

    const k = dissolveT > 0 ? dissolveT / DISSOLVE : 0;
    word.alpha = t < 0.9 ? t / 0.9 : 1 - k * k;
    const r = word.gap * 0.75 * (1 + k * 1.5);

    for (const p of word.pts) {
      if (dissolveT > 0) {
        p.x += Math.sin(p.seed + t * 1.7) * 0.5 * f;
        p.y -= p.rise * (0.3 + k * 1.2) * f;
      } else if (t > p.delay) {
        const e = 1 - Math.pow(1 - p.ease, f);
        p.x += (p.tx - p.x) * e;
        p.y += (p.ty - p.y) * e;
      }
    }

    // letters come into focus out of the shadow and blur away again
    const blur = t < GATHER ? 1.4 + 9 * Math.pow(1 - t / GATHER, 2) : 1.4 + k * 10;
    if (Math.abs(blur - word.blur) > 0.15) {
      word.blur = blur;
      wordCanvas.style.filter = `blur(${blur.toFixed(2)}px)`;
    }

    wx.fillStyle = `rgba(255,255,255,${word.alpha * (0.88 + (flicker - 0.9) * 0.6)})`;
    wx.beginPath();
    for (const p of word.pts) {
      wx.moveTo(p.x + r, p.y);
      wx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    wx.fill();
  }

  // ── Input ──────────────────────────────────────────────────────
  let px = null, py = null;
  let travel = 0;
  let nextWordAt = rand(1600, 2600);
  let lastInput = -Infinity;
  let ghostActive = false;

  function moveTo(x, y) {
    if (px === null) { px = x; py = y; return; }
    const dx = x - px, dy = y - py;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const n = Math.min(reduceMotion ? 2 : 6, Math.ceil(d / 16));
    for (let i = 1; i <= n; i++) spawn(px + (dx * i) / n, py + (dy * i) / n, dx, dy);
    px = x; py = y;
    travel += d;
    if (!word && travel > nextWordAt) {
      triggerWord(x, y);
      travel = 0;
      nextWordAt = rand(2600, 4800);
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
    for (let i = 0; i < 6; i++) spawn(px, py, rand(-12, 12), rand(-12, 12));
  }, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') px = null; }, { passive: true });
  addEventListener('pointerleave', () => { px = null; });
  addEventListener('resize', resize);

  // When nobody is moving, an unseen dalang keeps the shadows alive.
  let ghostT = Math.random() * 100;
  function ghost(dt) {
    if (reduceMotion || performance.now() - lastInput < IDLE_MS) return;
    if (!ghostActive) { ghostActive = true; px = null; }
    ghostT += dt * (0.7 + 0.45 * Math.sin(ghostT * 0.37)); // the dalang's hand speeds up and lingers
    const x = W * (0.5 + 0.36 * Math.sin(ghostT * 0.9) * Math.cos(ghostT * 0.31) + 0.06 * Math.sin(ghostT * 3.1));
    const y = H * (0.42 + 0.22 * Math.sin(ghostT * 1.3 + 1.1));
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
    drawWord(dt, f);
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  const fontLoad = document.fonts ? document.fonts.load(`italic 500 100px ${FONT}`) : Promise.resolve();
  Promise.race([fontLoad, new Promise((r) => setTimeout(r, 2500))]).then(() => {
    fontsReady = true;
    // introduce the name shortly after arrival
    setTimeout(() => { if (!word) triggerWord(px ?? W / 2, py ?? H / 2); travel = 0; }, 900);
  });
})();
