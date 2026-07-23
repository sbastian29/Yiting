/* ===================================================================
   cursor.jsx — dot + ring + 14-point trail, contextual states
   states: default | hover | project | drag | text  (via data-cursor)
   =================================================================== */
function CustomCursor(){
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const trailRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const dot = dotRef.current, ring = ringRef.current;
    const trailEls = Array.from(trailRef.current.children);
    const N = trailEls.length;
    const trail = Array.from({length:N}, () => ({ x: Mouse.x, y: Mouse.y }));

    let rx = Mouse.x, ry = Mouse.y, raf;
    const loop = () => {
      // dot — no lag
      dot.style.transform = `translate(${Mouse.x}px, ${Mouse.y}px)`;
      // ring — lerp 0.18
      rx += (Mouse.x - rx) * 0.18; ry += (Mouse.y - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      // trail — chase
      let px = Mouse.x, py = Mouse.y;
      for (let i=0;i<N;i++){
        trail[i].x += (px - trail[i].x) * 0.32;
        trail[i].y += (py - trail[i].y) * 0.32;
        const s = 1 - i/N;
        trailEls[i].style.transform = `translate(${trail[i].x}px, ${trail[i].y}px) scale(${s})`;
        trailEls[i].style.opacity = (0.5 * s).toFixed(2);
        px = trail[i].x; py = trail[i].y;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // contextual state via delegation
    const root = rootRef.current;
    const setState = (state) => {
      root.classList.remove('cur-hover','cur-project','cur-drag','cur-text');
      if (state && state!=='default') root.classList.add('cur-'+state);
    };
    const onOver = (e) => {
      const el = e.target.closest('[data-cursor], a, button');
      if (!el){ setState('default'); return; }
      const c = el.getAttribute('data-cursor');
      if (c) setState(c==='cell'?'hover':c);
      else setState('hover');
    };
    const onOut = (e) => { if (!e.relatedTarget) setState('default'); };
    const onDown = () => root.classList.add('cur-press');
    const onUp = () => root.classList.remove('cur-press');
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);

    const onLeaveWin = () => root.classList.add('cur-hidden');
    const onEnterWin = () => root.classList.remove('cur-hidden');
    document.addEventListener('mouseleave', onLeaveWin);
    document.addEventListener('mouseenter', onEnterWin);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('mouseleave', onLeaveWin);
      document.removeEventListener('mouseenter', onEnterWin);
    };
  }, []);

  /* MEJORA 4A · magnetic pull on hover affordances ([data-cursor="hover"]).
     Off on touch / reduced-motion. Rest-center is recovered from the live rect
     minus the current gsap offset, so it stays correct through Lenis scroll. */
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.gsap) return;
    let current = null;
    const onOver = (e) => { const el = e.target.closest('[data-cursor="hover"]'); if (el) current = el; };
    const onMove = (e) => {
      if (!current) return;
      if (!current.isConnected){ current = null; return; }
      const gx = Number(window.gsap.getProperty(current, 'x')) || 0;
      const gy = Number(window.gsap.getProperty(current, 'y')) || 0;
      const r = current.getBoundingClientRect();
      const cx = r.left - gx + r.width / 2;
      const cy = r.top - gy + r.height / 2;
      window.gsap.to(current, { x: (e.clientX - cx) * 0.35, y: (e.clientY - cy) * 0.35, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    };
    const onOut = (e) => {
      const el = e.target.closest('[data-cursor="hover"]');
      if (el && el === current){
        window.gsap.to(current, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)', overwrite: 'auto' });
        current = null;
      }
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerout', onOut);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
    };
  }, []);

  /* === CURSOR ABOUT · living cloud + fading trail, active only on About ===
     Canvas 2D effect (no DOM particles, no Three.js). Detects the active
     route from location.hash, toggles body.in-about, runs only while active.
     Self-contained: touches no other file. */
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;   // no hover on touch

    const canvas = document.createElement('canvas');
    canvas.id = 'cursor-about-canvas';
    // Opacity is driven by a CSS transition (this project keeps GSAP's ticker
    // frozen for its scroll integration, so gsap.to tweens never advance).
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998;opacity:0;transition:opacity 0.5s ease;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let isActive = false;
    let rafId = null;

    // --- System 1: living cloud (15 orbital particles) ---
    const cloudParticles = Array.from({ length: 15 }, () => ({
      x: mouseX, y: mouseY,
      size: 1.5 + Math.random() * 2,
      opacity: 0,
      targetOpacity: Math.random() * 0.6 + 0.2,
      opacitySpeed: 0.008 + Math.random() * 0.015,
      fadeDir: Math.random() > 0.5 ? 1 : -1,
      driftAngle: Math.random() * Math.PI * 2,
      driftSpeed: 0.003 + Math.random() * 0.004,
      driftRadius: 15 + Math.random() * 25,
      lag: 0.04 + Math.random() * 0.08,
    }));

    const updateCloudParticle = (p) => {
      p.driftAngle += p.driftSpeed;
      const tx = Math.cos(p.driftAngle) * p.driftRadius;
      const ty = Math.sin(p.driftAngle) * p.driftRadius * 0.6;
      p.x += ((mouseX + tx) - p.x) * p.lag;
      p.y += ((mouseY + ty) - p.y) * p.lag;
      p.opacity += p.opacitySpeed * p.fadeDir;
      if (p.opacity >= p.targetOpacity) {
        p.fadeDir = -1;
      } else if (p.opacity <= 0) {
        p.fadeDir = 1;
        p.opacity = 0;
        p.driftAngle += Math.PI * 0.3 + Math.random() * Math.PI;
        p.targetOpacity = Math.random() * 0.6 + 0.2;
        p.size = 1.5 + Math.random() * 2;
      }
    };

    // --- System 2: fading trail (8 points) ---
    const trail = [];
    const TRAIL_MAX = 8;
    const TRAIL_LIFETIME = 600;
    const cleanTrail = () => {
      const now = Date.now();
      while (trail.length && now - trail[0].born > TRAIL_LIFETIME) trail.shift();
    };

    const onMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!isActive) return;
      trail.push({ x: e.clientX, y: e.clientY, born: Date.now() });
      if (trail.length > TRAIL_MAX) trail.shift();
    };
    document.addEventListener('pointermove', onMove);

    const loop = () => {
      if (!isActive) return;
      rafId = requestAnimationFrame(loop);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cleanTrail();
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue('--page-accent').trim() || '#22C55E';

      // trail underneath
      const now = Date.now();
      trail.forEach((point, i) => {
        const life = Math.max(0, 1 - (now - point.born) / TRAIL_LIFETIME);
        if (life <= 0) return;
        ctx.save();
        ctx.globalAlpha = life * 0.4 * ((i + 1) / TRAIL_MAX);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.5 * life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // cloud on top
      cloudParticles.forEach((p) => {
        updateCloudParticle(p);
        if (p.opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const isAbout = () => ((location.hash||'#home').replace('#','') === 'about');
    let fadeOutTimer = null;
    const sync = () => {
      const want = isAbout();
      if (want && !isActive) {
        isActive = true;
        if (fadeOutTimer) { clearTimeout(fadeOutTimer); fadeOutTimer = null; }
        document.body.classList.add('in-about');
        canvas.style.transitionDuration = '0.5s';
        canvas.style.opacity = '1';
        loop();
      } else if (!want && isActive) {
        isActive = false;
        document.body.classList.remove('in-about');
        canvas.style.transitionDuration = '0.4s';
        canvas.style.opacity = '0';
        fadeOutTimer = setTimeout(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (rafId) cancelAnimationFrame(rafId);
          trail.length = 0;
          fadeOutTimer = null;
        }, 450);
      }
    };
    sync();
    window.addEventListener('hashchange', sync);

    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointermove', onMove);
      if (fadeOutTimer) clearTimeout(fadeOutTimer);
      if (rafId) cancelAnimationFrame(rafId);
      document.body.classList.remove('in-about');
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  /* === CURSOR WORK · technical measuring ruler, active only on Work ===
     Canvas 2D fullscreen. Extends a tick ruler from a lagged cursor, draws
     dashed lines to every visible project, labels distance to the nearest
     one, and morphs into a marksman crosshair on project hover.
     Show/hide via CSS opacity transition (GSAP ticker is frozen here).
     Self-contained: touches no other file. */
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;   // no hover on touch

    const canvas = document.createElement('canvas');
    canvas.id = 'cursor-work-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998;opacity:0;transition:opacity 0.4s ease;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    let workMx = window.innerWidth / 2, workMy = window.innerHeight / 2;
    let workCx = workMx, workCy = workMy;   // lagged
    let workHover = false;
    let workHoverP = 0;                      // 0=ruler, 1=crosshair
    let workActive = false;
    let workRaf = null;

    const hexToRgb = (hex) => {
      hex = hex.replace('#','');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const n = parseInt(hex, 16);
      return `${(n>>16)&255},${(n>>8)&255},${n&255}`;
    };
    const readAccent = () => {
      const a = getComputedStyle(document.documentElement).getPropertyValue('--page-accent').trim();
      return (a && a[0] === '#') ? a : '#fbbf7a';
    };

    const getProjectCenters = () => {
      const cards = document.querySelectorAll('[data-cursor="project"]');
      const cr = canvas.getBoundingClientRect();
      const out = [];
      cards.forEach((card, i) => {
        const r = card.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        // skip off-screen cards
        if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return;
        out.push({
          x: r.left - cr.left + r.width / 2,
          y: r.top - cr.top + r.height / 2,
          index: String(i + 1).padStart(2, '0'),
        });
      });
      return out;
    };

    /* The focused-media target is a DOM placeholder (.oi-turntable / .sp-hero)
       in the open detail panel. Per the coordinate-space contract we take it
       straight from getBoundingClientRect() and never project it — DOM and
       Three paths stay separate. Rect is read fresh each frame so scroll never
       leaves it stale. Canvas is fullscreen fixed, so its rect origin is (0,0)
       and screen pixels equal canvas pixels. */
    const getFocusMedia = () => {
      const el = document.querySelector('.orbital-info.open .oi-turntable, .side-panel.open .sp-hero');
      if (!el) return null;
      const cr = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      if (r.bottom < 0 || r.top > window.innerHeight) return null;
      return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 };
    };

    const drawRuler = (cx, cy) => {
      const projects = getProjectCenters();
      const accent = readAccent();
      const rgb = hexToRgb(accent);
      ctx.save();

      // horizontal ruler
      const rulerLen = 72;
      ctx.strokeStyle = `rgba(${rgb},0.55)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - rulerLen, cy);
      ctx.lineTo(cx + rulerLen, cy);
      ctx.stroke();

      // tick marks
      for (let i = -rulerLen; i <= rulerLen; i += 4) {
        const isMajor = i % 20 === 0;
        const tickH = isMajor ? 9 : 4;
        ctx.beginPath();
        ctx.moveTo(cx + i, cy - tickH / 2);
        ctx.lineTo(cx + i, cy + tickH / 2);
        ctx.lineWidth = isMajor ? 1.2 : 0.7;
        ctx.stroke();
      }

      // central vertical tick
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy + 5);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb},0.9)`;
      ctx.fill();

      // nearest project
      let nearest = null, nd = Infinity;
      projects.forEach(p => {
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < nd) { nd = d; nearest = p; }
      });

      projects.forEach(p => {
        const dist = Math.round(Math.hypot(p.x - cx, p.y - cy));
        const isNearest = nearest && p.index === nearest.index;
        const op = isNearest ? 0.45 : 0.12;
        ctx.setLineDash([2, 5]);
        ctx.lineWidth = isNearest ? 1 : 0.7;
        ctx.strokeStyle = `rgba(${rgb},${op})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isNearest) {
          const midX = (cx + p.x) / 2, midY = (cy + p.y) / 2;
          const label = dist + 'px';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(8,8,16,0.7)';
          ctx.fillRect(midX - tw / 2 - 4, midY - 8, tw + 8, 14);
          ctx.fillStyle = `rgba(${rgb},0.75)`;
          ctx.fillText(label, midX, midY + 3);
          ctx.font = '9px monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = `rgba(${rgb},0.4)`;
          ctx.fillText('·' + p.index, p.x + 10, p.y - 6);
        }
      });

      /* PRIMARY POINTER → focused media placeholder (DOM target, screen space).
         Angle = atan2(target - pointer) with NO extra negation / no -π / no
         per-case sign patch, so the arrowhead always points AT the media. */
      const fm = getFocusMedia();
      if (fm) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${rgb},0.7)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(fm.x, fm.y);
        ctx.stroke();
        const ang = Math.atan2(fm.y - cy, fm.x - cx);
        const ah = 9;
        ctx.beginPath();
        ctx.moveTo(fm.x, fm.y);
        ctx.lineTo(fm.x - ah * Math.cos(ang - 0.4), fm.y - ah * Math.sin(ang - 0.4));
        ctx.moveTo(fm.x, fm.y);
        ctx.lineTo(fm.x - ah * Math.cos(ang + 0.4), fm.y - ah * Math.sin(ang + 0.4));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fm.x, fm.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        const d = Math.round(Math.hypot(fm.x - cx, fm.y - cy));
        const mx = (cx + fm.x) / 2, my = (cy + fm.y) / 2;
        const label = d + 'px';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(8,8,16,0.78)';
        ctx.fillRect(mx - tw / 2 - 4, my - 8, tw + 8, 14);
        ctx.fillStyle = `rgba(${rgb},0.85)`;
        ctx.fillText(label, mx, my + 3);
        ctx.restore();
      }
      ctx.restore();
    };

    const drawCrosshair = (cx, cy, progress) => {
      if (progress <= 0) return;
      const accent = readAccent();
      const size = 18, gap = 5;
      ctx.save();
      ctx.globalAlpha = progress;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(cx + sx * gap, cy + sy * gap);
        ctx.lineTo(cx + sx * size, cy + sy * gap);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + sx * gap, cy + sy * gap);
        ctx.lineTo(cx + sx * gap, cy + sy * size);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    };

    const onMove = (e) => {
      workMx = e.clientX;
      workMy = e.clientY;
      if (!workActive) return;
      const el = e.target.closest && e.target.closest('[data-cursor="project"]');
      workHover = !!el;
    };
    document.addEventListener('pointermove', onMove);

    const workLoop = () => {
      if (!workActive) return;
      workRaf = requestAnimationFrame(workLoop);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      workCx += (workMx - workCx) * 0.1;
      workCy += (workMy - workCy) * 0.1;
      workHoverP += (workHover ? 1 : -1) * 0.07;
      workHoverP = Math.max(0, Math.min(1, workHoverP));
      ctx.globalAlpha = 1 - workHoverP;
      drawRuler(workCx, workCy);
      ctx.globalAlpha = 1;
      drawCrosshair(workCx, workCy, workHoverP);
    };

    const isWork = () => ((location.hash||'#home').replace('#','') === 'work');
    let fadeOutTimer = null;
    const sync = () => {
      const want = isWork();
      if (want && !workActive) {
        workActive = true;
        if (fadeOutTimer) { clearTimeout(fadeOutTimer); fadeOutTimer = null; }
        document.body.classList.add('in-work');
        canvas.style.transitionDuration = '0.4s';
        canvas.style.opacity = '1';
        workLoop();
      } else if (!want && workActive) {
        workActive = false;
        workHover = false;
        document.body.classList.remove('in-work');
        canvas.style.transitionDuration = '0.3s';
        canvas.style.opacity = '0';
        fadeOutTimer = setTimeout(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (workRaf) cancelAnimationFrame(workRaf);
          fadeOutTimer = null;
        }, 350);
      }
    };
    sync();
    window.addEventListener('hashchange', sync);

    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointermove', onMove);
      if (fadeOutTimer) clearTimeout(fadeOutTimer);
      if (workRaf) cancelAnimationFrame(workRaf);
      document.body.classList.remove('in-work');
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden="true">
      <div ref={dotRef} className="cursor-dot"></div>
      <div ref={ringRef} className="cursor-ring"></div>
      <div ref={trailRef} className="cursor-trail">
        {Array.from({length:14}).map((_,i) => <span key={i}></span>)}
      </div>
    </div>
  );
}

Object.assign(window, { CustomCursor });
