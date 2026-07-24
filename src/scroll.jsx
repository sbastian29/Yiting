/* ===================================================================
   scroll.jsx — Lenis smooth scroll + GSAP ScrollTrigger choreography
   -------------------------------------------------------------------
   • Lenis drives the *native* scroll, so every existing rAF / IO /
     getBoundingClientRect reader keeps working — just with inertia.
   • GSAP ScrollTrigger is synced to Lenis' ticker.
   • Pages opt in via useScrollFX() + [data-fx] attributes on elements:
       data-fx="clip"  → clip-path line reveal (text)
       data-fx="rise"  → rise + fade in
       data-fx="row"   → directional rise for list rows
       data-fx="img"   → scale-from-inside (scrubbed) for image placeholders
   =================================================================== */
(function initScrollSystem(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Touch devices get native scroll (rubber-band + address-bar collapse intact).
  // Lenis + syncTouch fights iOS Safari and causes address-bar jitter.
  const coarse = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);

  // LENIS: smooth-scroll engine — EXAGGERATED config (heavy mass, long glide).
  // prefers-reduced-motion or coarse pointer → native scroll, no Lenis.
  if (window.Lenis && !reduce && !coarse){
    const expoOut = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t));
    const lenis = new window.Lenis({
      duration: 2.8,            // long, cinematic
      easing: expoOut,         // strong expo.out
      smoothWheel: true,
      wheelMultiplier: 1.4,     // extra push per wheel tick
      touchMultiplier: 2.0,
      lerp: 0.06,               // heavy inertia (lower = more mass)
      syncTouch: true,
      syncTouchLerp: 0.075,
      infinite: false,
    });
    window.__lenis = lenis;

    if (window.gsap && window.ScrollTrigger){
      gsap.registerPlugin(ScrollTrigger);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);

      // SCROLL FX: velocity-based skew. Live scroll velocity → a clamped skew
      // angle published as CSS var --vel-skew (big text opts in via .fx-skew).
      // Eases back to 0 when the page settles.
      let curSkew = 0;
      gsap.ticker.add(() => {
        const target = Math.max(-7, Math.min(7, (lenis.velocity || 0) * 0.22));
        curSkew += (target - curSkew) * 0.12;
        if (Math.abs(curSkew) < 0.004) curSkew = 0;
        document.documentElement.style.setProperty('--vel-skew', curSkew.toFixed(3) + 'deg');
      });
    } else {
      function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
    }

    // Lenis is created before React mounts the page content, so its first
    // measurement reports a 0 scroll-limit (inert). Re-measure once content,
    // fonts and full load have settled, otherwise there's no inertia at all.
    window.addEventListener('load', () => { lenis.resize(); if (window.ScrollTrigger) ScrollTrigger.refresh(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lenis.resize(); if (window.ScrollTrigger) ScrollTrigger.refresh(); });
  } else if (window.gsap && window.ScrollTrigger){
    gsap.registerPlugin(ScrollTrigger);
    // Touch: normalize scroll so pinned/scrubbed triggers survive iOS
    // address-bar collapse without jump on refresh.
    if (coarse && window.ScrollTrigger.normalizeScroll) {
      try { window.ScrollTrigger.normalizeScroll(true); } catch(e){}
    }
  }

  // LENIS: nav jumps feel like a long voyage (duration 3.2) vs normal scroll.
  window.__scrollTop = function(smooth){
    if (window.__lenis){
      if (smooth) window.__lenis.scrollTo(0, { duration: 3.2, easing: (t)=>Math.min(1,1.001-Math.pow(2,-10*t)) });
      else window.__lenis.scrollTo(0, { immediate: true });
    } else window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  };

  /* ---- re-measure Lenis + ScrollTrigger after layout changes ---- */
  window.__relayout = function(){
    if (window.__lenis) window.__lenis.resize();
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  };

  /* ---- guarded refresh: one refresh per settled resize, never a storm ----
     The shared viewport store (lib.jsx) is already debounced at 150ms and only
     notifies on a real change; the rAF flag collapses any bursts on top of
     that. This re-measures Lenis first (so it reports a fresh scroll-limit)
     then refreshes ScrollTrigger so no pinned/scrubbed section keeps a stale
     start/end after a resize or a browser-zoom change. */
  let __refreshPending = false;
  function guardedRefresh(){
    if (__refreshPending) return;
    __refreshPending = true;
    requestAnimationFrame(() => {
      __refreshPending = false;
      if (window.__lenis) window.__lenis.resize();
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    });
  }
  if (window.subscribeViewport) window.subscribeViewport(() => guardedRefresh());

  /* ---- build the [data-fx] choreography within a scope ----
     Discrete reveals (clip / rise / row) are *triggered* by IntersectionObserver
     — which fires independently of requestAnimationFrame, so a stalled frame can
     never leave content stuck hidden — and *animated* by GSAP. A hard fallback
     forces the final state if a tween ever fails to run. The continuous image
     scale uses a genuine GSAP ScrollTrigger scrub. ------------------------------ */
  function buildFX(scope, reduceMotion){
    if (!window.gsap) return { revert(){} };
    // reduced-motion comes from useViewport (reuse the single existing branch
    // below); fall back to the module-level match only if none was passed.
    const reduce = (reduceMotion !== undefined) ? reduceMotion
      : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasST = !!window.ScrollTrigger;
    const cleanup = [];

    const imgs = gsap.utils.toArray('[data-fx="img"]', scope);
    const forceVisible = (el) => gsap.set(el, { clipPath:'none', x:0, y:0, xPercent:0, yPercent:0, rotationY:0, scale:1, autoAlpha:1, willChange:'auto' });
    const stillHidden  = (el) => { const cs = getComputedStyle(el); return parseFloat(cs.opacity) < 0.12 || (cs.clipPath && cs.clipPath.indexOf('110') > -1); };

    // SCROLL FX: discrete reveal kinds. IntersectionObserver-triggered (fires
    // without rAF) + GSAP-animated, each with a hard fallback so nothing stays
    // hidden. clip=mask wipe · rise/row=lift · col=staggered columns ·
    // flip=3D rotateY · slide=lateral slide-in.
    const KINDS = {
      clip:  { from:{ clipPath:'inset(0 0 110% 0)', yPercent:8 }, to:{ clipPath:'inset(0 0 -8% 0)', yPercent:0, duration:0.95 }, done:(el)=>gsap.set(el,{clipPath:'none',willChange:'auto'}) },
      rise:  { from:{ y:26, autoAlpha:0 }, to:{ y:0, autoAlpha:1, duration:0.8 } },
      row:   { from:{ y:46, autoAlpha:0 }, to:{ y:0, autoAlpha:1, duration:0.95 } },
      col:   { from:{ y:60, autoAlpha:0 }, to:{ y:0, autoAlpha:1, duration:0.85 }, stagger:0.14 },
      flip:  { from:{ rotationY:90, autoAlpha:0, transformPerspective:760, transformOrigin:'center center' }, to:{ rotationY:0, autoAlpha:1, duration:0.95 }, stagger:0.12 },
      slide: { from:{ x:-160, autoAlpha:0 }, to:{ x:0, autoAlpha:1, duration:0.95 }, stagger:0.09 },
    };
    const revertEls = [];

    // SPLIT — per-character reveal (mesh3d-style). One-time DOM rewrite: each
    // word wraps in a nowrap span, each letter wraps in outer(overflow:hidden,
    // padding-bottom trick for descenders) + inner (the moving span). Spaces
    // become non-breaking-space nodes between word wrappers.
    const splitEls = gsap.utils.toArray('[data-fx="split"]', scope);
    const splitLetters = new WeakMap(); // el -> [innerSpan, ...]
    splitEls.forEach(el => {
      let letters;
      if (el.getAttribute('data-split-done') === '1'){
        letters = Array.from(el.querySelectorAll('[data-split-letter]'));
      } else {
        const text = (el.textContent || '').replace(/\s+/g, ' ');
        el.textContent = '';
        letters = [];
        const words = text.split(' ');
        words.forEach((word, wi) => {
          if (word.length){
            const wordSpan = document.createElement('span');
            wordSpan.setAttribute('data-split-word','1');
            wordSpan.style.display = 'inline-block';
            wordSpan.style.whiteSpace = 'nowrap';
            for (let i = 0; i < word.length; i++){
              const outer = document.createElement('span');
              outer.style.display = 'inline-block';
              outer.style.overflow = 'hidden';
              outer.style.paddingBottom = '0.22em';
              outer.style.marginBottom = '-0.22em';
              outer.style.verticalAlign = 'baseline';
              const inner = document.createElement('span');
              inner.setAttribute('data-split-letter','1');
              inner.style.display = 'inline-block';
              inner.style.willChange = 'transform, opacity';
              inner.textContent = word.charAt(i);
              outer.appendChild(inner);
              wordSpan.appendChild(outer);
              letters.push(inner);
            }
            el.appendChild(wordSpan);
          }
          if (wi < words.length - 1){
            el.appendChild(document.createTextNode('\u00A0'));
          }
        });
        el.setAttribute('data-split-done','1');
      }
      splitLetters.set(el, letters);
      gsap.set(letters, { yPercent: 110, autoAlpha: 0 });
      revertEls.push(el);
    });
    if (splitEls.length){
      const fireSplit = (el) => {
        const letters = splitLetters.get(el) || [];
        gsap.to(letters, {
          yPercent: 0, autoAlpha: 1, duration: 0.7,
          ease: 'power3.out', stagger: 0.035, overwrite: 'auto',
          onComplete: () => { letters.forEach(l => { l.style.willChange = 'auto'; }); },
        });
        // safety net: if the tween stalls, snap everything visible.
        setTimeout(() => {
          const last = letters[letters.length - 1];
          if (last && parseFloat(getComputedStyle(last).opacity) < 0.5){
            gsap.set(letters, { yPercent: 0, autoAlpha: 1, willChange: 'auto' });
          }
        }, 1600 + letters.length * 35);
      };
      const splitIO = new IntersectionObserver((ents)=>{
        ents.forEach(e => { if (e.isIntersecting){ splitIO.unobserve(e.target); fireSplit(e.target); } });
      }, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });
      splitEls.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.98) fireSplit(el);
        else splitIO.observe(el);
      });
      cleanup.push(() => splitIO.disconnect());
    }

    if (reduce){
      // reduced-motion: everything visible, only settle image scale.
      // Split elements still get their DOM rewrite (harmless, allows the rail
      // + layout to be consistent) but all letters render fully visible.
      gsap.utils.toArray('[data-fx="split"]', scope).forEach(el => {
        if (el.getAttribute('data-split-done') !== '1'){
          const text = (el.textContent || '').replace(/\s+/g, ' ');
          el.textContent = '';
          const words = text.split(' ');
          words.forEach((word, wi) => {
            if (word.length){
              const wordSpan = document.createElement('span');
              wordSpan.style.display = 'inline-block';
              wordSpan.style.whiteSpace = 'nowrap';
              wordSpan.textContent = word;
              el.appendChild(wordSpan);
            }
            if (wi < words.length - 1) el.appendChild(document.createTextNode('\u00A0'));
          });
          el.setAttribute('data-split-done','1');
        }
      });
      imgs.forEach(el => { const inner = el.firstElementChild || el; gsap.set(inner, { scale: 1 }); });
      return { revert(){} };
    }

    Object.keys(KINDS).forEach(k => {
      const cfg = KINDS[k];
      const els = gsap.utils.toArray('[data-fx="'+k+'"]', scope);
      if (!els.length) return;
      els.forEach(el => gsap.set(el, Object.assign({ willChange:'transform, opacity' }, cfg.from)));
      revertEls.push(...els);
      const fire = (el, i) => {
        gsap.to(el, Object.assign({}, cfg.to, {
          ease:'power3.out', delay:(cfg.stagger||0)*i, overwrite:'auto',
          onComplete:()=>{ if (cfg.done) cfg.done(el); else gsap.set(el,{willChange:'auto'}); },
        }));
        // safety net: snap visible if the GSAP ticker stalled
        setTimeout(()=>{ if (stillHidden(el)) forceVisible(el); }, 1600 + (cfg.stagger||0)*i*1000);
      };
      const io = new IntersectionObserver((ents)=>{
        ents.forEach(e=>{ if (e.isIntersecting){ io.unobserve(e.target); fire(e.target, els.indexOf(e.target)); } });
      }, { threshold:0.14, rootMargin:'0px 0px -7% 0px' });
      // anything already touching/above the viewport reveals immediately —
      // IO never reports an above-the-fold element as "entering".
      els.forEach((el,i)=>{ if (el.getBoundingClientRect().top < window.innerHeight*0.98) fire(el,i); else io.observe(el); });
      cleanup.push(()=>io.disconnect());
    });

    // IMG — continuous parallax-zoom: the inner layer drifts + scales as the
    // element travels the viewport (scroll-scrubbed), clipped by its container.
    if (hasST){
      imgs.forEach(el => {
        const inner = el.firstElementChild || el;
        const tw = gsap.fromTo(inner,
          { scale: 1.18, yPercent: -3 },
          { scale: 1.06, yPercent: 3, ease: 'none',
            scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6 } });
        cleanup.push(() => { if (tw.scrollTrigger) tw.scrollTrigger.kill(); tw.kill(); gsap.set(inner, { scale: 1, yPercent: 0 }); });
      });

      // PAR — parallax drift for flow elements (scroll-scrubbed depth)
      gsap.utils.toArray('[data-fx="par"]', scope).forEach(el => {
        const amt = parseFloat(el.getAttribute('data-par')) || 6;
        const tw = gsap.fromTo(el,
          { yPercent: amt },
          { yPercent: -amt, ease: 'none',
            scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
        cleanup.push(() => { if (tw.scrollTrigger) tw.scrollTrigger.kill(); tw.kill(); gsap.set(el, { yPercent: 0 }); });
      });

      requestAnimationFrame(() => { if (window.__lenis) window.__lenis.resize(); window.ScrollTrigger.refresh(); });
    } else {
      imgs.forEach(el => { const inner = el.firstElementChild || el; gsap.set(inner, { scale: 1 }); });
    }

    return {
      revert(){
        cleanup.forEach(fn => fn());
        // un-hide anything not yet revealed so a remount never inherits hidden state
        revertEls.forEach(forceVisible);
      }
    };
  }

  /* ---- React hook: attach the returned ref to a page's root ---- */
  window.useScrollFX = function useScrollFX(deps){
    const ref = React.useRef(null);
    // reduced-motion is read here (not from the module-level const) so a live
    // OS/setting change re-runs the effect into the existing reduce branch.
    const reduceMotion = window.useViewport ? window.useViewport().reduceMotion : reduce;
    React.useLayoutEffect(() => {
      if (!ref.current || !window.gsap) return;
      const ctx = buildFX(ref.current, reduceMotion);
      const t1 = setTimeout(() => window.__relayout && window.__relayout(), 260);
      const t2 = setTimeout(() => window.__relayout && window.__relayout(), 700);
      // a late relayout after webfonts swap in (canvas/text reflow)
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => window.__relayout && window.__relayout());
      return () => { clearTimeout(t1); clearTimeout(t2); if (ctx) ctx.revert(); };
    }, [...(deps || []), reduceMotion]);
    return ref;
  };

  window.refreshScroll = function(){ if (window.__relayout) window.__relayout(); else if (window.ScrollTrigger) window.ScrollTrigger.refresh(); };
})();
