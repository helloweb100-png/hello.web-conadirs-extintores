/* =====================================================================
   CONADIRS | Interacciones y animaciones de scroll
   Sin dependencias obligatorias. Lenis (scroll suave) se carga por CDN y,
   si no está disponible, la página usa el scroll nativo.

   Arquitectura:
   - Un único bucle requestAnimationFrame. Cada efecto de scroll registra
     una función de lectura (mide) y otra de escritura (aplica estilos),
     para evitar layout thrashing.
   - Solo se procesan los efectos cuyo bloque está cerca del viewport.
   - prefers-reduced-motion desactiva scroll suave, shaders, partículas y
     efectos pineados; el contenido queda estático y legible.
   ===================================================================== */
(() => {
  'use strict';

  const d = document;
  const w = window;
  const root = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const mq = q => w.matchMedia(q).matches;

  const REDUCE = mq('(prefers-reduced-motion: reduce)');
  const FINE = mq('(hover: hover) and (pointer: fine)');
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* Número de WhatsApp de CONADIRS: 271 749 3583 (formato internacional MX) */
  const PHONE = '522717493583';
  const waUrl = msg => `https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`;

  /* Estado compartido del scroll */
  const S = { y: 0, vy: 0, vh: w.innerHeight, vw: w.innerWidth, docH: 0, lenis: null, expandE: 0 };
  const tickers = [];   // funciones por cuadro: (now, dt, y)
  const scrubs = [];    // { el, read, write, near, data }

  const run = (name, fn) => {
    try { fn(); } catch (err) { console.warn('[CONADIRS] ' + name + ':', err); }
  };

  /* ---------------------------------------------------------------
     Motor de scrub: lectura y escritura separadas, solo si está cerca
     --------------------------------------------------------------- */
  const nearIO = 'IntersectionObserver' in w
    ? new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.target.__scrub) e.target.__scrub.near = e.isIntersecting; });
      }, { rootMargin: '120% 0px 120% 0px' })
    : null;

  function scrub(el, read, write) {
    const s = { el, read, write, near: true, data: null };
    scrubs.push(s);
    if (el && nearIO) { el.__scrub = s; nearIO.observe(el); }
    return s;
  }

  let lastT = performance.now();
  let prevY = w.scrollY;

  function frame(now) {
    const dt = Math.min(64, now - lastT);
    lastT = now;
    if (S.lenis) S.lenis.raf(now);

    const y = w.scrollY;
    S.vy = lerp(S.vy, y - prevY, .18);
    prevY = y;
    S.y = y;

    for (let i = 0; i < scrubs.length; i++) { const s = scrubs[i]; if (s.near) s.data = s.read(y); }
    for (let i = 0; i < scrubs.length; i++) { const s = scrubs[i]; if (s.near && s.data !== null && s.data !== undefined) s.write(s.data, y); }
    for (let i = 0; i < tickers.length; i++) tickers[i](now, dt, y);

    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------
     Utilidades de texto
     --------------------------------------------------------------- */
  /* mode "mask": cada palabra sube desde una máscara. mode "fade": cada palabra es un span .mw */
  function splitWords(el, mode) {
    let i = 0;
    const walk = node => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3) {
          const frag = d.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(' ')); return; }
            if (mode === 'mask') {
              const outer = d.createElement('span'); outer.className = 'sw';
              const inner = d.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', i++);
              outer.appendChild(inner); frag.appendChild(outer);
            } else {
              const s = d.createElement('span'); s.className = 'mw'; s.textContent = part; i++;
              frag.appendChild(s);
            }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    };
    walk(el);
    return i;
  }

  /* ---------------------------------------------------------------
     WhatsApp: todos los [data-wa] reciben su mensaje precargado
     --------------------------------------------------------------- */
  function initWhatsApp() {
    $$('[data-wa]').forEach(a => {
      a.href = waUrl(a.dataset.wa);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  /* ---------------------------------------------------------------
     Scroll suave (Lenis) y anclas
     --------------------------------------------------------------- */
  function initSmooth() {
    if (REDUCE || typeof w.Lenis !== 'function') return;
    S.lenis = new w.Lenis({
      duration: 1.25,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: .9,
      touchMultiplier: 1.5,
      autoRaf: false
    });
    if (root.classList.contains('is-loading')) S.lenis.stop();
  }

  function scrollToEl(el) {
    const offset = el.id === 'inicio' ? 0 : -8;
    if (S.lenis) S.lenis.scrollTo(el, { offset, duration: 1.7, easing: t => 1 - Math.pow(1 - t, 4) });
    else el.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
  }

  function initAnchors() {
    d.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      const target = d.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      closeMenu();
      scrollToEl(target);
      try { history.replaceState(null, '', id); } catch (_) { /* file:// */ }
    });
  }

  /* ---------------------------------------------------------------
     Menú móvil
     --------------------------------------------------------------- */
  let closeMenu = () => {};
  function initMenu() {
    const btn = $('#nav-burger');
    const menu = $('#menu');
    if (!btn || !menu) return;
    $$('.menu__nav a', menu).forEach((a, i) => a.style.setProperty('--i', i));

    const focusables = () => [btn, ...$$('a[href], button', menu)];
    const open = () => {
      menu.inert = false;
      menu.classList.add('is-open');
      root.classList.add('menu-open');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Cerrar menú');
      if (S.lenis) S.lenis.stop();
      setTimeout(() => { const first = $('a', menu); if (first) first.focus({ preventScroll: true }); }, 350);
    };
    closeMenu = () => {
      if (!menu.classList.contains('is-open')) return;
      menu.classList.remove('is-open');
      root.classList.remove('menu-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Abrir menú');
      menu.inert = true;
      if (S.lenis) S.lenis.start();
    };
    btn.addEventListener('click', () => (menu.classList.contains('is-open') ? closeMenu() : open()));
    d.addEventListener('keydown', e => {
      if (!menu.classList.contains('is-open')) return;
      if (e.key === 'Escape') { closeMenu(); btn.focus(); return; }
      if (e.key === 'Tab') {
        const f = focusables();
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    w.matchMedia('(min-width: 1024px)').addEventListener('change', ev => { if (ev.matches) closeMenu(); });
  }

  /* ---------------------------------------------------------------
     Loader: manómetro de verificación y cortina que se abre
     --------------------------------------------------------------- */
  function finishIntro() {
    root.classList.remove('is-loading');
    root.classList.add('is-ready');
    if (S.lenis) S.lenis.start();
    const fl = $('#wa-float');
    if (fl) {
      setTimeout(() => fl.classList.add('show-tip'), 5200);
      setTimeout(() => fl.classList.remove('show-tip'), 10200);
    }
  }

  function initLoader() {
    const loader = $('#loader');
    if (!loader || REDUCE) {
      if (loader) loader.remove();
      finishIntro();
      return;
    }

    const ring = $('#loader-ring');
    const pct = $('#loader-pct');
    const status = $('#loader-status');
    const ticksG = $('#loader-ticks');
    const steps = $$('.loader__steps li', loader);
    const N = 48;
    const ticks = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const r1 = 93, r2 = i % 4 === 0 ? 100 : 97;
      const l = d.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', (110 + Math.cos(a) * r1).toFixed(2));
      l.setAttribute('y1', (110 + Math.sin(a) * r1).toFixed(2));
      l.setAttribute('x2', (110 + Math.cos(a) * r2).toFixed(2));
      l.setAttribute('y2', (110 + Math.sin(a) * r2).toFixed(2));
      ticksG.appendChild(l);
      ticks.push(l);
    }

    const lines = ['Verificando presión', 'Inspeccionando componentes', 'Comprobando hermeticidad', 'Certificando equipo'];
    const MIN = 2700, MAX = 8000;
    const t0 = performance.now();
    let loaded = d.readyState === 'complete';
    let fontsOk = !(d.fonts && d.fonts.ready);
    if (!loaded) w.addEventListener('load', () => { loaded = true; }, { once: true });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => { fontsOk = true; });

    let p = 0, shown = -1, ending = false;

    const render = v => {
      pct.textContent = Math.round(v);
      ring.style.strokeDashoffset = (100 - v).toFixed(2);
      const on = Math.round((v / 100) * N);
      ticks.forEach((t, i) => t.classList.toggle('on', i < on));
      const idx = Math.min(3, Math.floor(v / 25));
      if (idx !== shown) {
        shown = idx;
        status.textContent = lines[idx];
        steps.forEach((s, i) => s.classList.toggle('on', i <= idx));
      }
    };

    const end = () => {
      if (ending) return;
      ending = true;
      render(100);
      loader.classList.add('is-ok');
      status.textContent = 'Equipo certificado';
      steps.forEach(s => s.classList.add('on'));
      setTimeout(() => {
        loader.classList.add('is-done');
        setTimeout(finishIntro, 380);
        setTimeout(() => loader.remove(), 1500);
      }, 520);
    };

    (function loop(now) {
      const el = now - t0;
      const ready = loaded && fontsOk;
      const byTime = easeInOut(clamp(el / MIN)) * 100;
      const goal = Math.min(ready ? 100 : 90, byTime);
      p = lerp(p, goal, .14);
      if (goal >= 99.9 && p > 99.2) p = 100;
      render(p);
      if (p >= 100 || el > MAX) { end(); return; }
      requestAnimationFrame(loop);
    })(performance.now());
  }

  /* ---------------------------------------------------------------
     Navegación: tema según la sección, enlace actual y progreso
     --------------------------------------------------------------- */
  function initNav() {
    const nav = $('#nav');
    const bar = $('#progress');
    if (!nav) return;
    const secs = $$('main > section[data-theme], footer[data-theme]');
    const links = $$('.nav__links a');
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    let curTheme = nav.dataset.theme;
    let curId = '';

    scrub(null, y => {
      let theme = null, id = '';
      for (let i = 0; i < secs.length; i++) {
        const r = secs[i].getBoundingClientRect();
        if (r.top <= 44 && r.bottom > 44) { theme = secs[i].dataset.theme; id = secs[i].id; }
      }
      if (id === 'practica') theme = S.expandE > .55 ? 'dark' : 'light';
      return { theme, id, y };
    }, data => {
      if (data.theme && data.theme !== curTheme) { curTheme = data.theme; nav.dataset.theme = data.theme; }
      if (data.id !== curId) {
        curId = data.id;
        links.forEach(a => a.classList.remove('is-current'));
        const a = map.get(curId); if (a) a.classList.add('is-current');
      }
      if (bar) {
        const max = Math.max(1, S.docH - S.vh);
        bar.style.transform = 'scaleX(' + clamp(data.y / max).toFixed(4) + ')';
      }
    });
  }

  /* ---------------------------------------------------------------
     Revelado al entrar en pantalla
     --------------------------------------------------------------- */
  function initReveal() {
    $$('[data-stagger]').forEach(g => Array.from(g.children).forEach((c, i) => c.style.setProperty('--i', i)));
    $$('.h2, .expand__title').forEach(h => splitWords(h, 'mask'));

    const fw = $('#footer-word');
    if (fw) {
      const txt = fw.textContent.trim();
      fw.textContent = '';
      txt.split('').forEach((ch, i) => {
        const s = d.createElement('span'); s.className = 'fl'; s.textContent = ch; s.style.setProperty('--i', i);
        fw.appendChild(s);
      });
    }

    const items = $$('[data-reveal], [data-stagger], .expand__title, #footer-word');
    if (REDUCE || !('IntersectionObserver' in w)) { items.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(el => io.observe(el));
  }

  function initCounters() {
    const els = $$('[data-count]');
    if (!els.length) return;
    if (REDUCE || !('IntersectionObserver' in w)) { els.forEach(el => { el.textContent = el.dataset.count; }); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = 1500;
        (function step(n) {
          const k = clamp((n - t0) / dur);
          el.textContent = Math.round(to * easeOut(k));
          if (k < 1) requestAnimationFrame(step);
        })(t0);
      });
    }, { threshold: .6 });
    els.forEach(el => io.observe(el));
  }

  /* =====================================================================
     EFECTOS VISUALES: fuego (WebGL), brasas (canvas 2D), hero y franja
     ===================================================================== */
  const resizers = [];

  /* Observa si un elemento está en pantalla para pausar shaders y partículas */
  function watch(el) {
    const st = { v: true };
    if (el && 'IntersectionObserver' in w) {
      new IntersectionObserver(es => { st.v = es[0].isIntersecting; }, { rootMargin: '10% 0px' }).observe(el);
    }
    return st;
  }

  function fitCanvas(c, scale) {
    const dpr = Math.min(w.devicePixelRatio || 1, S.vw < 700 ? 1.25 : 1.5);
    const W = Math.max(2, Math.round(c.clientWidth * dpr * scale));
    const H = Math.max(2, Math.round(c.clientHeight * dpr * scale));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    return { W, H, dpr };
  }

  /* ---------------------------------------------------------------
     Fuego procedural: ruido fractal en un fragment shader.
     Se dibuja a media resolución y se pausa fuera de pantalla.
     --------------------------------------------------------------- */
  const FIRE_VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FIRE_FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 uRes;uniform float uTime;uniform float uPow;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    'float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));',
    'return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}',
    'void main(){',
    'vec2 uv=gl_FragCoord.xy/uRes;float asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);float t=uTime*.4;',
    'float n=fbm(vec2(p.x*3.,p.y*2.2-t*1.7));',
    'float n2=fbm(vec2(p.x*6.5+3.1,p.y*3.6-t*2.6));',
    'float h=.4+.22*fbm(vec2(p.x*1.7,t*.55));',
    'float body=smoothstep(h,0.,uv.y+(n-.5)*.55);',
    'float f=body*(.3+1.25*n2);',
    'f=pow(clamp(f,0.,1.),1.7)*uPow;',
    'vec3 col=mix(vec3(.42,.02,0.),vec3(.9,.12,.02),smoothstep(.02,.3,f));',
    'col=mix(col,vec3(1.,.42,.04),smoothstep(.25,.55,f));',
    'col=mix(col,vec3(1.,.8,.18),smoothstep(.55,.9,f));',
    'float a=smoothstep(.03,.5,f);',
    'gl_FragColor=vec4(col*a,a);}'
  ].join('\n');

  function createFire(canvas, power) {
    if (!canvas || REDUCE) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) { canvas.style.display = 'none'; return; }
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, FIRE_VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FIRE_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    gl.uniform1f(gl.getUniformLocation(prog, 'uPow'), power);

    const lowPower = S.vw < 800;
    const size = () => {
      const f = fitCanvas(canvas, lowPower ? .42 : .55);
      gl.viewport(0, 0, f.W, f.H);
      gl.uniform2f(uRes, f.W, f.H);
    };
    size();
    resizers.push(size);

    const vis = watch(canvas);
    const t0 = performance.now();
    let acc = 0;
    tickers.push((now, dt) => {
      if (!vis.v || d.hidden) return;
      acc += dt;
      if (lowPower && acc < 33) return;   // 30 fps en móvil
      acc = 0;
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); canvas.style.display = 'none'; });
  }

  /* ---------------------------------------------------------------
     Brasas: partículas que suben con deriva y parpadeo.
     Usa un sprite precalculado (drawImage) en lugar de gradientes por cuadro.
     --------------------------------------------------------------- */
  function createEmbers(canvas, count) {
    if (!canvas || REDUCE) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sprite = d.createElement('canvas');
    sprite.width = sprite.height = 64;
    const sc = sprite.getContext('2d');
    const g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,240,170,1)');
    g.addColorStop(.25, 'rgba(255,170,40,.75)');
    g.addColorStop(.6, 'rgba(224,27,15,.22)');
    g.addColorStop(1, 'rgba(224,27,15,0)');
    sc.fillStyle = g; sc.fillRect(0, 0, 64, 64);

    let W = 1, H = 1, dpr = 1;
    const n = S.vw < 700 ? Math.round(count * .5) : count;
    const ps = [];
    const spawn = (p, initial) => {
      p.x = Math.random() * W;
      p.y = initial ? Math.random() * H : H + 24 * dpr;
      p.s = (2 + Math.random() * 5) * dpr;
      p.vy = (24 + Math.random() * 64) * dpr;
      p.vx = (Math.random() - .5) * 16 * dpr;
      p.ph = Math.random() * 6.28;
      p.fr = .6 + Math.random() * 1.8;
      return p;
    };
    const size = () => {
      const f = fitCanvas(canvas, 1);
      W = f.W; H = f.H; dpr = f.dpr;
      if (!ps.length) for (let i = 0; i < n; i++) ps.push(spawn({}, true));
    };
    size();
    resizers.push(size);

    const vis = watch(canvas);
    tickers.push((now, dt) => {
      if (!vis.v || d.hidden) return;
      const k = dt / 1000;
      const boost = 1 + Math.min(2.4, Math.abs(S.vy) * .05);   // el scroll aviva las brasas
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.y -= p.vy * k * boost;
        p.x += (p.vx + Math.sin(now / 1000 * p.fr + p.ph) * 18 * dpr) * k;
        if (p.y < -30 * dpr || p.x < -30 || p.x > W + 30) spawn(p, false);
        const life = clamp(p.y / H);
        const flick = .65 + .35 * Math.sin(now / 130 * p.fr + p.ph);
        ctx.globalAlpha = clamp(Math.pow(life, .55) * flick);
        const s = p.s * (.55 + life * .6) * 3.2;
        ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    });
  }

  function initFire() {
    run('fire-hero', () => createFire($('#fire-hero'), 1));
    run('embers-hero', () => createEmbers($('#embers-hero'), 70));
    run('fire-contact', () => createFire($('#fire-contact'), .85));
    run('embers-contact', () => createEmbers($('#embers-contact'), 46));
  }

  /* ---------------------------------------------------------------
     Hero: entrada escalonada, inclinación 3D del emblema y parallax
     --------------------------------------------------------------- */
  function initHero() {
    const hero = $('#inicio');
    if (!hero) return;
    $$('[data-hero]', hero).forEach((el, i) => el.style.setProperty('--n', i));
    if (REDUCE) return;

    const tilt = $('#emblem-tilt');
    const stage = $('#hero-stage');
    const copy = $('#hero-copy');
    const vis = watch(hero);

    let tx = 0, ty = 0, cx = 0, cy = 0, active = false;
    if (FINE) {
      hero.addEventListener('pointermove', e => {
        const r = hero.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width) * 2 - 1;
        ty = ((e.clientY - r.top) / r.height) * 2 - 1;
        active = true;
      });
      hero.addEventListener('pointerleave', () => { active = false; });
    }
    tickers.push(now => {
      if (!vis.v || !tilt) return;
      if (!active) { tx = Math.sin(now / 2700) * .38; ty = Math.cos(now / 3300) * .26; }   // vaivén propio si no hay cursor
      cx = lerp(cx, tx, .06); cy = lerp(cy, ty, .06);
      tilt.style.transform = 'rotateY(' + (cx * 13).toFixed(2) + 'deg) rotateX(' + (-cy * 10).toFixed(2) + 'deg)';
    });

    scrub(hero, y => clamp(y / S.vh), p => {
      if (stage) stage.style.transform = 'translate3d(0,' + (p * -60).toFixed(1) + 'px,0) scale(' + (1 - p * .12).toFixed(3) + ')';
      if (copy) { copy.style.transform = 'translate3d(0,' + (p * 50).toFixed(1) + 'px,0)'; copy.style.opacity = (1 - p * 1.25).toFixed(3); }
    });
  }

  /* ---------------------------------------------------------------
     Franja de servicios: avanza sola y reacciona a la velocidad del scroll
     --------------------------------------------------------------- */
  function initMarquee() {
    const track = $('#marquee-track');
    if (!track || REDUCE) return;
    const first = track.firstElementChild;
    const vis = watch($('#marquee'));
    let x = 0, dir = 1, listW = first.offsetWidth;
    resizers.push(() => { listW = first.offsetWidth; });
    tickers.push((now, dt) => {
      if (!vis.v) return;
      const speed = 70 + clamp(Math.abs(S.vy) * 14, 0, 700);
      dir = lerp(dir, S.vy < -1 ? -1 : 1, .08);
      x -= speed * dir * dt / 1000;
      if (x <= -listW) x += listW;
      if (x > 0) x -= listW;
      track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    });
  }

  /* =====================================================================
     SECCIONES CON EFECTOS DE SCROLL
     ===================================================================== */

  /* Manifiesto: las palabras se encienden al avanzar y la frase se subraya */
  function initManifesto() {
    const el = $('#manifesto-text');
    if (!el) return;
    const n = splitWords(el, 'fade');
    const words = $$('.mw', el);
    if (REDUCE) return;
    const last = new Array(n).fill(-1);
    scrub(el, () => {
      const r = el.getBoundingClientRect();
      return clamp((S.vh * .85 - r.top) / (S.vh * .4 + r.height));
    }, p => {
      const k = p * n * 1.12;
      for (let i = 0; i < n; i++) {
        const on = clamp(k - i + 1);
        if (Math.abs(on - last[i]) > .01) { last[i] = on; words[i].style.setProperty('--on', on.toFixed(3)); }
      }
    });
  }

  /* Imagen que se abre: del recuadro a pantalla completa y aparece el texto */
  function initExpand() {
    const sec = $('#practica');
    if (!sec) return;
    if (REDUCE) { S.expandE = 1; return; }
    scrub(sec, () => {
      const r = sec.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - S.vh));
      return { e: easeInOut(clamp(p / .58)), t: easeOut(clamp((p - .6) / .24)) };
    }, v => {
      S.expandE = v.e;
      sec.style.setProperty('--e', v.e.toFixed(4));
      sec.style.setProperty('--t', v.t.toFixed(4));
    });
  }

  /* Servicios: cada tarjeta se reduce y se oscurece al cubrirla la siguiente */
  function initStack() {
    const stack = $('#stack');
    if (!stack || REDUCE) return;
    const cards = $$('[data-stack]', stack);
    let sticky = !mq('(max-height: 700px)');
    resizers.push(() => { sticky = !mq('(max-height: 700px)'); });
    const navH = () => parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 60;
    let nh = navH();
    resizers.push(() => { nh = navH(); });

    scrub(stack, () => {
      if (!sticky) return null;
      const out = [];
      for (let i = 0; i < cards.length - 1; i++) {
        const top = cards[i + 1].getBoundingClientRect().top;
        const stick = nh + 26 + (i + 1) * 16;
        out.push(clamp(1 - (top - stick) / (S.vh * .7)));
      }
      return out;
    }, ps => {
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        cards[i].style.transform = 'scale(' + (1 - p * .055).toFixed(4) + ')';
        cards[i].style.setProperty('--dim', (p * .36).toFixed(3));
      }
    });
  }

  /* Proceso: el manómetro sube a medida que se recorren las cuatro etapas */
  function initGauge() {
    const gauge = $('#gauge');
    const needle = $('#gauge-needle');
    const steps = $$('[data-step]');
    if (!gauge || !needle || !steps.length) return;

    const polar = (r, a) => { const t = a * Math.PI / 180; return [160 + r * Math.sin(t), 160 - r * Math.cos(t)]; };
    const f = v => v.toFixed(2);
    const arc = (r, a0, a1) => {
      const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
      return 'M' + f(x0) + ' ' + f(y0) + 'A' + r + ' ' + r + ' 0 ' + (Math.abs(a1 - a0) > 180 ? 1 : 0) + ' 1 ' + f(x1) + ' ' + f(y1);
    };
    const zones = $('#gauge-zones');
    [[-128, -62, '#E01B0F'], [-60, -29, '#FFB000'], [-27, 69, '#0DA650'], [71, 128, '#E01B0F']].forEach(([a0, a1, c]) => {
      const p = d.createElementNS(SVGNS, 'path');
      p.setAttribute('d', arc(128, a0, a1));
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', c); p.setAttribute('stroke-width', '11'); p.setAttribute('stroke-linecap', 'round');
      zones.appendChild(p);
    });
    const ticks = $('#gauge-ticks');
    for (let i = 0; i <= 40; i++) {
      const a = -128 + i * 6.4, major = i % 5 === 0;
      const [x0, y0] = polar(112, a), [x1, y1] = polar(major ? 97 : 104, a);
      const l = d.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', f(x0)); l.setAttribute('y1', f(y0)); l.setAttribute('x2', f(x1)); l.setAttribute('y2', f(y1));
      l.setAttribute('stroke', 'rgba(255,255,255,' + (major ? '.85' : '.4') + ')');
      l.setAttribute('stroke-width', major ? '2.4' : '1.4'); l.setAttribute('stroke-linecap', 'round');
      ticks.appendChild(l);
    }

    const angles = [-104, -46, 0, 34];
    const labels = ['Presión baja, equipo recibido', 'Recargando con agente certificado', 'Presión y hermeticidad correctas', 'Equipo listo para actuar'];
    const state = $('#gauge-state');
    let cur = angles[0], vel = 0, target = angles[0], idx = -1;
    const setStep = i => {
      if (i === idx) return;
      idx = i; target = angles[i];
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
      state.textContent = labels[i];
      gauge.classList.toggle('is-ok', i >= 2);
    };
    needle.style.setProperty('--rot', cur + 'deg');

    if (REDUCE) {
      steps.forEach(s => s.classList.add('is-active'));
      state.textContent = labels[3]; gauge.classList.add('is-ok');
      needle.style.setProperty('--rot', angles[3] + 'deg');
      return;
    }

    scrub($('#process-grid'), () => {
      const focus = S.vh * (S.vw >= 900 ? .5 : .66);
      let best = 0, bd = 1e9;
      for (let i = 0; i < steps.length; i++) {
        const r = steps[i].getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - focus);
        if (dist < bd) { bd = dist; best = i; }
      }
      return best;
    }, setStep);

    const vis = watch($('#process-grid'));
    tickers.push(now => {                       // aguja con resorte y temblor leve
      if (!vis.v) return;
      vel += (target - cur) * .12;
      vel *= .8;
      cur += vel;
      needle.style.setProperty('--rot', (cur + Math.sin(now / 160) * .5).toFixed(2) + 'deg');
    });
  }

  /* Selector de extintor por clase de fuego */
  function initFuego() {
    const tabs = $$('.tab');
    const stage = $('.fuego__stage');
    const letter = $('#fuego-letter');
    const cta = $('#fuego-cta');
    if (!tabs.length || !stage) return;
    const msgs = {
      a: 'Hola CONADIRS, quiero asesoría para mi espacio. Tengo riesgo de fuego clase A (papel, madera, tela).',
      b: 'Hola CONADIRS, quiero asesoría para mi espacio. Tengo riesgo de fuego clase B (combustibles y solventes).',
      c: 'Hola CONADIRS, quiero asesoría para mi espacio. Tengo riesgo de fuego clase C (equipo eléctrico).',
      k: 'Hola CONADIRS, quiero asesoría para mi cocina. Tengo riesgo de fuego clase K (aceites y grasas).'
    };
    const select = (tab, focus) => {
      const k = tab.dataset.fire;
      tabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const p = d.getElementById(t.getAttribute('aria-controls'));
        if (p) { p.hidden = !on; p.classList.toggle('is-active', on); }
      });
      stage.dataset.class = k;
      letter.textContent = k.toUpperCase();
      cta.dataset.wa = msgs[k];
      cta.href = waUrl(msgs[k]);
      if (focus) tab.focus();
    };
    tabs.forEach(t => t.addEventListener('click', () => select(t, false)));
    $('.tabs').addEventListener('keydown', e => {
      const i = tabs.indexOf(d.activeElement);
      if (i < 0) return;
      let n = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n >= 0) { e.preventDefault(); select(tabs[n], true); }
    });
    stage.dataset.class = 'a';
  }

  /* Cartel del curso: inclinación 3D y brillo que sigue al cursor */
  function initTilt() {
    if (!FINE || REDUCE) return;
    $$('[data-tilt]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.transform = 'rotateX(' + ((.5 - py) * 12).toFixed(2) + 'deg) rotateY(' + ((px - .5) * 14).toFixed(2) + 'deg)';
        el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* Sectores: en escritorio el panel se fija y avanza en horizontal con el scroll */
  function initSectors() {
    const sec = $('#sectores');
    const sticky = $('#sectors-sticky');
    const track = $('#sectors-track');
    const viewport = $('#sectors-viewport');
    const bar = $('#sectors-bar');
    if (!sec || !track) return;
    let pinned = false, dist = 0;

    const setup = () => {
      const want = !REDUCE && S.vw >= 900 && S.vh >= 560;
      if (want) {
        sec.classList.add('is-pinned');
        viewport.scrollLeft = 0;
        const g = parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
        dist = Math.max(0, track.scrollWidth + g * 2 - S.vw);
        sec.style.setProperty('--sh', (S.vh + dist) + 'px');
        pinned = true;
      } else {
        sec.classList.remove('is-pinned');
        sec.style.removeProperty('--sh');
        track.style.transform = '';
        pinned = false;
      }
    };
    setup();
    resizers.push(setup);
    sticky.addEventListener('scroll', () => { sticky.scrollLeft = 0; });   // el foco no debe desplazar el panel fijado

    scrub(sec, () => {
      if (!pinned) return null;
      const r = sec.getBoundingClientRect();
      return clamp(-r.top / Math.max(1, r.height - S.vh));
    }, p => {
      track.style.transform = 'translate3d(' + (-p * dist).toFixed(1) + 'px,0,0)';
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    });
  }

  /* Preguntas frecuentes: una abierta a la vez */
  function initFaq() {
    const items = $$('.qa');
    items.forEach(qa => {
      const q = $('.qa__q', qa);
      q.addEventListener('click', () => {
        const open = q.getAttribute('aria-expanded') === 'true';
        items.forEach(o => { o.classList.remove('is-open'); $('.qa__q', o).setAttribute('aria-expanded', 'false'); });
        if (!open) { qa.classList.add('is-open'); q.setAttribute('aria-expanded', 'true'); }
      });
    });
  }

  /* Luz que sigue al cursor sobre las celdas de respaldo */
  function initSpotlight() {
    if (!FINE) return;
    const bento = $('.bento');
    if (!bento) return;
    bento.addEventListener('pointermove', e => {
      const c = e.target.closest('[data-spot]');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }

  /* Botones magnéticos */
  function initMagnetic() {
    if (!FINE || REDUCE) return;
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.translate = ((e.clientX - r.left - r.width / 2) * .22).toFixed(1) + 'px ' + ((e.clientY - r.top - r.height / 2) * .32).toFixed(1) + 'px';
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });
  }

  /* =====================================================================
     FORMULARIO: valida y abre WhatsApp con el mensaje armado
     ===================================================================== */
  function initForm() {
    const form = $('#contact-form');
    if (!form) return;
    const nombre = $('#f-nombre'), empresa = $('#f-empresa'), tel = $('#f-tel');
    const servicio = $('#f-servicio'), mensaje = $('#f-mensaje');
    const btn = $('#form-submit'), ok = $('#form-ok'), fallback = $('#form-fallback');
    nombre.setAttribute('aria-describedby', 'e-nombre');
    servicio.setAttribute('aria-describedby', 'e-servicio');

    const setErr = (input, id, msg) => {
      input.closest('.field').classList.toggle('has-error', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      $('#' + id).textContent = msg || '';
    };
    const check = () => {
      const a = nombre.value.trim().length >= 2;
      const b = !!servicio.value;
      setErr(nombre, 'e-nombre', a ? '' : 'Escribe tu nombre para poder dirigirnos a ti.');
      setErr(servicio, 'e-servicio', b ? '' : 'Elige el servicio que necesitas.');
      return a && b;
    };
    nombre.addEventListener('input', () => { if (nombre.value.trim().length >= 2) setErr(nombre, 'e-nombre', ''); });
    servicio.addEventListener('change', () => setErr(servicio, 'e-servicio', ''));

    form.addEventListener('submit', e => {
      e.preventDefault();
      ok.hidden = true;
      if (!check()) { (nombre.value.trim().length < 2 ? nombre : servicio).focus(); return; }

      const lines = ['Hola CONADIRS, soy ' + nombre.value.trim() + (empresa.value.trim() ? ' de ' + empresa.value.trim() : '') + '.', 'Necesito: ' + servicio.value + '.'];
      if (mensaje.value.trim()) lines.push('Detalles: ' + mensaje.value.trim());
      if (tel.value.trim()) lines.push('Mi teléfono: ' + tel.value.trim());
      const url = waUrl(lines.join('\n'));

      btn.classList.add('is-loading');
      fallback.href = url;
      w.open(url, '_blank', 'noopener');
      setTimeout(() => { btn.classList.remove('is-loading'); ok.hidden = false; }, 700);
    });
  }

  /* =====================================================================
     ARRANQUE
     ===================================================================== */
  function measure() {
    S.vh = w.innerHeight;
    S.vw = w.innerWidth;
    S.docH = root.scrollHeight;
  }

  function init() {
    if (!REDUCE && $('#loader')) root.classList.add('is-loading');
    measure();

    run('whatsapp', initWhatsApp);
    run('smooth', initSmooth);
    run('anchors', initAnchors);
    run('menu', initMenu);
    run('reveal', initReveal);
    run('counters', initCounters);
    run('nav', initNav);
    run('hero', initHero);
    run('fire', initFire);
    run('marquee', initMarquee);
    run('manifesto', initManifesto);
    run('expand', initExpand);
    run('stack', initStack);
    run('gauge', initGauge);
    run('fuego', initFuego);
    run('tilt', initTilt);
    run('sectors', initSectors);
    run('faq', initFaq);
    run('spotlight', initSpotlight);
    run('magnetic', initMagnetic);
    run('form', initForm);
    run('loader', initLoader);

    let rt;
    w.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { measure(); resizers.forEach(fn => run('resize', fn)); }, 150);
    });
    if ('ResizeObserver' in w) new ResizeObserver(() => { S.docH = root.scrollHeight; }).observe(d.body);

    requestAnimationFrame(frame);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
})();
