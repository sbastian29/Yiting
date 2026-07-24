/* ===================================================================
   imageflow.jsx — persistent WebGL "portrait" layer that morphs between
   <ImageSlot id="..."/> markers on route changes (Home ↔ About).

   Slots are empty DOM markers used ONLY to measure where the plane
   should sit. The visible image lives on a fullscreen WebGL canvas
   that outlives every route change — pages never mount it, never
   unmount it, they just re-locate it.
   =================================================================== */

// One-line photo swap. Same image for both slots (this is one continuous
// portrait plane, not two different pictures) — seeded picsum so every
// load returns the same file. Sized to the actual on-screen slot: mobile
// slots are ~130×168, desktop up to 340×440. Anything bigger is wasted
// bandwidth on 4G. High-DPR gets a 2x variant.
const PORTRAIT_SRC = (() => {
  if (typeof window === 'undefined') return 'https://picsum.photos/seed/lisa-portrait/1000/1300';
  const isTouch = (window.isTouchDevice ? window.isTouchDevice() : false) || window.innerWidth < 768;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = isTouch ? Math.round(280 * dpr) : Math.round(700 * dpr);
  const h = Math.round(w * 1.3);
  return `https://picsum.photos/seed/lisa-portrait/${w}/${h}`;
})();

/* -------------------------------------------------------------------
   Slot registry — module-level, shared across component instances.
   _rects preserves the LAST KNOWN rect even after unregister so the
   persistent layer has a "from" position after the old page unmounts.
   ------------------------------------------------------------------- */
const _slots = new Map();   // id -> live element
const _rects = new Map();   // id -> { x, y, w, h }   (kept after unmount)
const _routeListeners = new Set();

function _measure(el){
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function registerSlot(id, el){
  if (!id || !el) return;
  _slots.set(id, el);
  const r = _measure(el);
  if (r) _rects.set(id, r);
}

function updateSlotRect(id, el){
  if (!id) return;
  const target = el || _slots.get(id);
  const r = _measure(target);
  if (r) _rects.set(id, r);
}

function unregisterSlot(id){
  if (!id) return;
  _slots.delete(id);
  // intentional: _rects[id] survives — the persistent layer uses it
  // as the animation "from" position after the old page unmounts.
}

function getSlotRect(id){ return _rects.get(id) || null; }

// Route-change signal called from app.jsx immediately after setRoute(to).
// The layer captures the current 'from' rect synchronously (React hasn't
// committed the swap yet), then waits for the destination's ImageSlot to
// mount + layout to settle before measuring the 'to' rect.
window.imageflowNotifyRouteChange = function(from, to){
  _routeListeners.forEach(fn => { try { fn(from, to); } catch(e){ console.error('[imageflow] listener error', e); } });
};

/* -------------------------------------------------------------------
   <ImageSlot id="..."/> — empty layout marker
   ------------------------------------------------------------------- */
function ImageSlot({ id, className, style }){
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    registerSlot(id, el);
    const ro = new ResizeObserver(() => updateSlotRect(id, el));
    ro.observe(el);
    const onScroll = () => updateSlotRect(id, el);
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll);
    return () => {
      unregisterSlot(id);
      ro.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [id]);
  return <div ref={ref} className={'img-slot '+(className||'')} style={style} data-slot-id={id} aria-hidden="true"/>;
}

/* -------------------------------------------------------------------
   Displacement shader — samples the portrait texture with liquid UV
   offset proportional to (progress + velocity). At rest both are 0 →
   image reads crisp/undistorted.
   ------------------------------------------------------------------- */
const IMAGEFLOW_FRAG = `
uniform sampler2D uTex;
uniform float uProgress;   // 0 idle .. 1 mid-morph
uniform float uVelocity;   // frame-to-frame delta magnitude, ~0..1.5
uniform float uOpacity;
uniform vec2  uTexAspect;  // object-cover fit (shrinks sampled region)
void main(){
  vec2 uv = vUv;
  // object-cover: sample a centered subregion of the texture whose
  // aspect matches the on-screen slot, so the image is never squished.
  vec2 tuv = (uv - 0.5) * uTexAspect + 0.5;

  float strength = clamp(uVelocity*1.1 + uProgress*0.9, 0.0, 1.6);
  if (strength > 0.001){
    // curl + fbm gives the fluid, non-repeating "gooey" flow
    vec2 c = curl(uv*2.6 + uTime*0.32);
    float n = fbm(uv*3.4 - uTime*0.28);
    vec2 disp = (c*0.55 + vec2(n, -n)*0.22) * strength * 0.11;
    tuv += disp;
  }

  vec2 samp = clamp(tuv, vec2(0.0001), vec2(0.9999));
  vec4 tex = texture2D(uTex, samp);
  gl_FragColor = vec4(tex.rgb, tex.a * uOpacity);
}`;

/* -------------------------------------------------------------------
   <ImageFlowLayer/> — mounted ONCE at the app root, outside <main key>.
   Owns the Three.js scene/camera/renderer for the entire session.
   ------------------------------------------------------------------- */
function ImageFlowLayer(){
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    if (!window.THREE){ console.error('[imageflow] THREE not available on window'); return; }
    if (!window.gsap){  console.error('[imageflow] GSAP not available on window'); return; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, premultipliedAlpha:false });
    } catch(e){
      console.error('[imageflow] WebGL context creation failed:', e);
      return;
    }
    // Touch devices get a tighter DPR cap — the plane is small and the
    // curl+fbm displacement shader is fillrate-bound on mid-tier mobile GPUs.
    const isTouch = window.isTouchDevice ? window.isTouchDevice() : false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, isTouch ? 1.25 : 1.75));

    /* ----- Ortho camera aligned to DOM coordinates (origin top-left, y-down)
       so that plane pixel size == CSS pixel size, no math per frame. ----- */
    let W = window.innerWidth, H = window.innerHeight;
    const camera = new THREE.OrthographicCamera(0, W, 0, H, -100, 100);
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = H;
    camera.near = -100; camera.far = 100;
    camera.updateProjectionMatrix();
    camera.position.z = 1;
    renderer.setSize(W, H, false);

    const scene = new THREE.Scene();

    /* ----- texture ----- */
    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');
    const state = {
      texAspect: new THREE.Vector2(1, 1),
      texW: 1, texH: 1,
      texReady: false,
    };
    const tex = texLoader.load(
      PORTRAIT_SRC,
      (t) => {
        state.texReady = true;
        const img = t.image || {};
        state.texW = img.naturalWidth || img.width || 1;
        state.texH = img.naturalHeight || img.height || 1;
        _syncTexAspect();
        _snapToInitial();
        console.log('[imageflow] texture loaded', state.texW + 'x' + state.texH);
      },
      undefined,
      (err) => console.error('[imageflow] texture load failed', err)
    );
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex:       { value: tex },
        uTime:      { value: 0 },
        uProgress:  { value: 0 },
        uVelocity:  { value: 0 },
        uOpacity:   { value: 0 },
        uMouse:     { value: new THREE.Vector2(0.5, 0.5) },
        uHover:     { value: 0 },
        uRes:       { value: new THREE.Vector2(W, H) },
        uAccent:    { value: new THREE.Vector3(1, 1, 1) },
        uTexAspect: { value: state.texAspect },
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: GLSL_PRELUDE + IMAGEFLOW_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);

    // where the mesh is currently painted, and prev-frame for velocity
    const cur  = { x: W/2, y: H/2, w: 0, h: 0 };
    const prev = { x: W/2, y: H/2, w: 0, h: 0 };

    function _syncTexAspect(){
      if (!state.texReady) return;
      const rectAspect = (cur.w || 1) / (cur.h || 1);
      const texAspect  = state.texW / state.texH;
      // object-cover: shrink sampled region on the axis that's too big
      if (texAspect > rectAspect){
        state.texAspect.set(rectAspect / texAspect, 1);
      } else {
        state.texAspect.set(1, texAspect / rectAspect);
      }
    }

    function _positionMesh(x, y, w, h){
      cur.x = x; cur.y = y; cur.w = w; cur.h = h;
      mesh.position.set(x + w/2, y + h/2, 0);
      mesh.scale.set(Math.max(1, w), Math.max(1, h), 1);
      _syncTexAspect();
    }

    function _snapToInitial(){
      const r = getSlotRect('portrait');
      if (r){
        _positionMesh(r.x, r.y, r.w, r.h);
        prev.x = cur.x; prev.y = cur.y; prev.w = cur.w; prev.h = cur.h;
        if (state.texReady) mat.uniforms.uOpacity.value = 1;
        console.log('[imageflow] snapped to portrait slot', r);
      } else {
        mat.uniforms.uOpacity.value = 0;
      }
    }

    /* ----- resize — use visualViewport so iOS address-bar collapse doesn't
       trigger a reflow storm every scroll frame. ----- */
    const vv = window.visualViewport;
    const onResize = () => {
      W = window.innerWidth;
      H = (vv && vv.height) || window.innerHeight;
      camera.right = W; camera.bottom = H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
      mat.uniforms.uRes.value.set(W, H);
    };
    window.addEventListener('resize', onResize);
    if (vv) vv.addEventListener('resize', onResize);

    /* ----- render loop ----- */
    let raf = 0;
    let lastFrameTime = performance.now();
    let hiddenSince = 0; // ms opacity has been ~0 while no tween is running
    const tween = { g: null, p: null, active: false };

    const render = (now) => {
      // Pause rAF when the tab is hidden — invisible work drains battery.
      if (document.hidden) { raf = 0; return; }

      // Auto-park: after 1 s of ~0 opacity with no tween, stop the loop.
      // A pending tween or a route change will restart it below.
      if (!tween.active && mat.uniforms.uOpacity.value < 0.02) {
        if (!hiddenSince) hiddenSince = now;
        else if (now - hiddenSince > 1000) { raf = 0; return; }
      } else {
        hiddenSince = 0;
      }

      raf = requestAnimationFrame(render);
      const dt = Math.max(1, now - lastFrameTime);
      lastFrameTime = now;

      // rough velocity signal from mesh delta
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      const dw = cur.w - prev.w, dh = cur.h - prev.h;
      const posSpeed  = Math.sqrt(dx*dx + dy*dy) / dt;
      const sizeSpeed = Math.sqrt(dw*dw + dh*dh) / dt;
      const speed = (posSpeed + sizeSpeed*0.5) * 11;
      const vPrev = mat.uniforms.uVelocity.value;
      // smooth into place, decay quickly when idle
      mat.uniforms.uVelocity.value = vPrev + (Math.min(1.5, speed) - vPrev) * 0.32;
      prev.x = cur.x; prev.y = cur.y; prev.w = cur.w; prev.h = cur.h;

      mat.uniforms.uTime.value = now / 1000;

      // outside a tween, keep tracking the live slot rect (handles scroll,
      // resize, ScrollTrigger reflows, etc. without a separate rAF chain).
      if (!tween.active){
        const r = getSlotRect('portrait');
        if (r && _slots.has('portrait')){
          if (Math.abs(r.x-cur.x) > 0.5 || Math.abs(r.y-cur.y) > 0.5 || Math.abs(r.w-cur.w) > 0.5 || Math.abs(r.h-cur.h) > 0.5){
            _positionMesh(r.x, r.y, r.w, r.h);
          }
        }
      }

      renderer.render(scene, camera);
    };
    // Kick a render (used to resume after auto-park / tab hidden / route change).
    const ensureRender = () => {
      hiddenSince = 0;
      lastFrameTime = performance.now();
      if (!raf && !document.hidden) raf = requestAnimationFrame(render);
    };
    ensureRender();
    const onVisibility = () => { if (!document.hidden) ensureRender(); };
    document.addEventListener('visibilitychange', onVisibility);

    /* ----- route-change handler ----- */
    const T = (window.TRANSITION_MS && window.TRANSITION_MS.fabric) || { in: 700, out: 700 };
    const morphSec = (T.in + T.out) / 1000;
    const fadeSec  = 0.25;

    const onRouteChange = (from, to) => {
      // Sync capture: React hasn't committed the swap yet, so _rects still
      // has the OLD portrait rect. After 2 rAFs it'll have the NEW one.
      const fromRect = _slots.has('portrait') ? _measure(_slots.get('portrait')) || getSlotRect('portrait') : getSlotRect('portrait');

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const newEl = _slots.get('portrait');
        if (newEl) updateSlotRect('portrait', newEl);
        const toRect = getSlotRect('portrait');
        const hasSlot = !!newEl && !!toRect;

        console.log('[imageflow] route', from, '→', to, '· from:', fromRect, '· to:', toRect, '· hasSlot:', hasSlot);
        ensureRender(); // wake the render loop if it was parked

        // kill any in-flight tweens so rapid clicks don't stack
        if (tween.g){ tween.g.kill(); tween.g = null; }
        if (tween.p){ tween.p.kill(); tween.p = null; }
        tween.active = false;

        if (hasSlot && fromRect){
          // MORPH: tween from old rect to new rect
          _positionMesh(fromRect.x, fromRect.y, fromRect.w, fromRect.h);
          mat.uniforms.uOpacity.value = 1;
          mat.uniforms.uProgress.value = 0;
          tween.active = true;
          const proxy = { x: fromRect.x, y: fromRect.y, w: fromRect.w, h: fromRect.h };
          tween.g = window.gsap.to(proxy, {
            x: toRect.x, y: toRect.y, w: toRect.w, h: toRect.h,
            duration: morphSec, ease: 'power3.inOut',
            onUpdate: () => _positionMesh(proxy.x, proxy.y, proxy.w, proxy.h),
            onComplete: () => { tween.active = false; tween.g = null; },
          });
          // extra distortion peak mid-morph: 0 → 1 → 0
          tween.p = window.gsap.to(mat.uniforms.uProgress, {
            value: 1, duration: morphSec / 2, ease: 'power2.out',
            yoyo: true, repeat: 1,
            onComplete: () => { mat.uniforms.uProgress.value = 0; tween.p = null; },
          });
        } else if (hasSlot){
          // no from-rect: snap under cover of invisible, fade in
          _positionMesh(toRect.x, toRect.y, toRect.w, toRect.h);
          mat.uniforms.uOpacity.value = 0;
          tween.g = window.gsap.to(mat.uniforms.uOpacity, {
            value: 1, duration: fadeSec, ease: 'power2.out',
            onComplete: () => { tween.g = null; },
          });
        } else {
          // no destination slot on this route: fade out cleanly
          tween.g = window.gsap.to(mat.uniforms.uOpacity, {
            value: 0, duration: fadeSec, ease: 'power2.out',
            onComplete: () => { tween.g = null; },
          });
        }
      }));
    };
    _routeListeners.add(onRouteChange);

    /* ----- initial snap — home might already have mounted its slot ----- */
    _snapToInitial();
    requestAnimationFrame(() => _snapToInitial());
    setTimeout(_snapToInitial, 120);
    setTimeout(_snapToInitial, 400);

    console.log('[imageflow] mounted; canvas:', canvas.width + 'x' + canvas.height, '· slots:', Array.from(_slots.keys()));

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (vv) vv.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      _routeListeners.delete(onRouteChange);
      try { if (tween.g) tween.g.kill(); if (tween.p) tween.p.kill(); } catch(e){}
      try {
        geom.dispose(); mat.dispose(); tex.dispose(); renderer.dispose();
        const ext = renderer.getContext().getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch(e){}
    };
  }, []);

  return <canvas ref={canvasRef} className="imageflow-canvas" aria-hidden="true"></canvas>;
}

Object.assign(window, { ImageFlowLayer, ImageSlot });
