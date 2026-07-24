/* ===================================================================
   work.jsx — "La Órbita" : Three.js orbital gallery + zigzag list
   Orbital section replaced with Three.js canvas (reference: work-25904c02.html)
   Bottom list (ZigzagRow, SidePanel, SelloBand) kept exactly as before.
   Data source: window.DATA.work
   =================================================================== */
const getProjects = () => (window.DATA && Array.isArray(window.DATA.work)) ? window.DATA.work : [];

/* ------------------------------------------------------------------ */
/* EMPTY STATE                                                          */
/* ------------------------------------------------------------------ */
function EmptyWork(){
  return (
    <div className="work-empty">
      <div className="work-empty-card">
        <div className="eyebrow">∅ · NO PROJECTS LOADED</div>
        <h2>Próximamente</h2>
        <h2>Coming&nbsp;soon</h2>
        <h2>即将上线</h2>
        <div className="work-empty-hint mono-tag">// edit data/work.json to populate the orbit</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CARD TEXTURE — drawn on a 2D canvas, used as Three.js CanvasTexture */
/* ------------------------------------------------------------------ */
function drawCardTexture(p, idx, THREE){
  const W = 640, H = 400;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // bg
  ctx.fillStyle = '#0d0d12';
  ctx.fillRect(0, 0, W, H);

  /* ---- image placeholder zone (top) ---- */
  const IX = 16, IY = 16, IW = W-32, IH = 246;
  ctx.save();
  ctx.beginPath(); ctx.rect(IX, IY, IW, IH); ctx.clip();
  ctx.fillStyle = '#13131a';
  ctx.fillRect(IX, IY, IW, IH);
  // diagonal hatch — matches site .ph placeholders
  ctx.strokeStyle = 'rgba(251,191,122,0.07)';
  ctx.lineWidth = 1;
  for (let x = -IH; x < IW + IH; x += 18){
    ctx.beginPath();
    ctx.moveTo(IX + x, IY + IH);
    ctx.lineTo(IX + x + IH, IY);
    ctx.stroke();
  }
  // soft amber glow, lower-left
  const g = ctx.createRadialGradient(IX+IW*0.22, IY+IH*0.92, 0, IX+IW*0.22, IY+IH*0.92, IW*0.66);
  g.addColorStop(0, 'rgba(251,191,122,0.10)');
  g.addColorStop(1, 'rgba(251,191,122,0)');
  ctx.fillStyle = g;
  ctx.fillRect(IX, IY, IW, IH);
  // ghost project number, centered
  ctx.fillStyle = 'rgba(251,191,122,0.15)';
  ctx.font = '800 150px Syne, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(idx+1).padStart(2,'0'), IX+IW/2, IY+IH/2+10);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // placeholder frame + labels
  ctx.strokeStyle = 'rgba(251,191,122,0.26)';
  ctx.lineWidth = 1;
  ctx.strokeRect(IX+0.5, IY+0.5, IW-1, IH-1);
  ctx.fillStyle = '#5c5a6e';
  ctx.font = '400 13px Martian Mono, monospace';
  ctx.fillText('RENDER · ' + (p.id || ''), IX+14, IY+28);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(251,191,122,0.6)';
  ctx.fillText(p.year || '', IX+IW-14, IY+28);
  ctx.textAlign = 'left';

  /* ---- info zone (bottom) ---- */
  // title
  ctx.fillStyle = '#e8e6f0';
  ctx.font = '700 36px Syne, sans-serif';
  const title = p.title.length > 18 ? p.title.slice(0,17)+'…' : p.title;
  ctx.fillText(title, 24, 318);
  // index, right-aligned on title line
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fbbf7a';
  ctx.font = '400 15px Martian Mono, monospace';
  ctx.fillText(String(idx+1).padStart(2,'0') + ' /', W-24, 318);
  ctx.textAlign = 'left';
  // role / tools
  const roleRaw = (p.role && (p.role.en || p.role.es)) || p.tools || '';
  const role = roleRaw.length > 52 ? roleRaw.slice(0,50)+'…' : roleRaw;
  ctx.fillStyle = '#5c5a6e';
  ctx.font = '400 13px Martian Mono, monospace';
  ctx.fillText(role, 24, 352);
  // award (if any)
  if (p.award) {
    const awRaw = p.award.en || p.award.es || '';
    const aw = awRaw.length > 60 ? awRaw.slice(0,58)+'…' : awRaw;
    ctx.fillStyle = '#fbbf7a';
    ctx.font = '400 12px Martian Mono, monospace';
    ctx.fillText('★ ' + aw, 24, 380);
  }

  /* ---- amber outer border + corner accents ---- */
  ctx.strokeStyle = '#fbbf7a';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W-2, H-2);
  const cs = 26;
  ctx.lineWidth = 1;
  [[2,2],[W-2,2],[2,H-2],[W-2,H-2]].forEach(([x,y])=>{
    const dx = x < W/2 ? cs : -cs;
    const dy = y < H/2 ? cs : -cs;
    ctx.beginPath(); ctx.moveTo(x+dx,y); ctx.lineTo(x,y); ctx.lineTo(x,y+dy); ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ */
/* NDC → SCREEN — the ONE conversion helper. Every 3D→2D pointer/target */
/* calc routes through this. project() gives normalized device coords    */
/* (origin centre, Y up, -1..1); we map to CSS pixels relative to the    */
/* canvas rect with the explicit Y sign flip. Never mix raw NDC with     */
/* clientX/clientY anywhere.                                             */
/* ------------------------------------------------------------------ */
function ndcToScreen(v3, camera, rect){
  const ndc = v3.clone().project(camera);
  return {
    x: (ndc.x * 0.5 + 0.5) * rect.width  + rect.left,
    y: (-ndc.y * 0.5 + 0.5) * rect.height + rect.top,
  };
}

/* ------------------------------------------------------------------ */
/* ORBITAL SCENE — Three.js canvas                                     */
/* ------------------------------------------------------------------ */
function OrbitalScene({ projects, onCardClick, reduceMotion, isTouch }){
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  // live config read inside the mount-once effect via a ref (no rebuild)
  const cfg = useRef({ reduceMotion: !!reduceMotion, isTouch: !!isTouch });
  useEffect(()=>{ cfg.current.reduceMotion = !!reduceMotion; cfg.current.isTouch = !!isTouch; }, [reduceMotion, isTouch]);

  useEffect(()=>{
    const canvas = canvasRef.current;
    if (!canvas || !window.THREE) return;
    const T = window.THREE;
    const N = projects.length;
    if (!N) return;

    /* Renderer ---------------------------------------------------- */
    const renderer = new T.WebGLRenderer({ canvas, antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const setSize = () => {
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.aspect = aspect;
      // Fit all 8 cards in the frustum for THIS aspect. Pull the camera back
      // when the viewport is narrow/portrait (so nothing leaves frame), clamped
      // to 9 so the wide desktop "Y3" framing is untouched.
      const vFov = 42 * Math.PI / 180;
      const hHalf = Math.atan(Math.tan(vFov / 2) * aspect);
      const needW = (RADIUS + CW * 0.75) / Math.tan(hHalf);
      const needH = (RADIUS + CH * 0.9)  / Math.tan(vFov / 2);
      baseCamZ = Math.max(9, needW, needH);
      fitScale = Math.min(1.4, baseCamZ / 9);
      camera.updateProjectionMatrix();
    };

    /* Scene + Camera ---------------------------------------------- */
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.6, 9);

    /* Atmospheric halo — warm radial glow behind the orbit -------- */
    const halo = new T.Mesh(
      new T.PlaneGeometry(20, 20),
      new T.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uColor: { value: new T.Color('#fbbf7a') } },
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform vec3 uColor;
          void main(){
            float d = length(vUv - 0.5);
            float a = smoothstep(0.5, 0.05, d) * 0.18;
            gl_FragColor = vec4(uColor, a);
          }
        `
      })
    );
    halo.position.z = -3;
    scene.add(halo);

    /* Ring group -------------------------------------------------- */
    const ring = new T.Group();
    ring.rotation.x = -0.32;
    ring.position.y = -0.5;    // push the whole orbit down on screen
    scene.add(ring);

    const RADIUS = 4.2;
    const CW = 2.4, CH = 1.5;
    let baseCamZ = 9;      // camera distance, recomputed per aspect in setSize
    let fitScale = 1;      // card scale multiplier that keeps apparent size when pulled back
    const rm = () => cfg.current.reduceMotion;

    /* Starfield ---------------------------------------------------- */
    const starN = 420;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++){
      const r  = 11 + Math.random() * 22;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i*3]   = r * Math.sin(ph) * Math.cos(th);
      starPos[i*3+1] = r * Math.sin(ph) * Math.sin(th) * 0.6;
      starPos[i*3+2] = r * Math.cos(ph);
    }
    const starGeo = new T.BufferGeometry();
    starGeo.setAttribute('position', new T.BufferAttribute(starPos, 3));
    const starMat = new T.PointsMaterial({ color: 0xe8e6f0, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
    const stars = new T.Points(starGeo, starMat);
    scene.add(stars);

    /* Orbit path rings ---------------------------------------------- */
    const ringPts = [];
    for (let i = 0; i <= 128; i++){
      const a = (i / 128) * Math.PI * 2;
      ringPts.push(new T.Vector3(Math.cos(a)*RADIUS, 0, Math.sin(a)*RADIUS));
    }
    const pathGeo = new T.BufferGeometry().setFromPoints(ringPts);
    const pathMat = new T.LineBasicMaterial({ color: 0xfbbf7a, transparent: true, opacity: 0.16 });
    const ringPath = new T.LineLoop(pathGeo, pathMat);
    ring.add(ringPath);
    const pathMat2 = new T.LineBasicMaterial({ color: 0xfbbf7a, transparent: true, opacity: 0.05 });
    const ringPath2 = new T.LineLoop(pathGeo, pathMat2);
    ringPath2.scale.setScalar(1.24);
    ring.add(ringPath2);

    /* Core glow ------------------------------------------------------ */
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d');
    const gg = gctx.createRadialGradient(128,128,0,128,128,128);
    gg.addColorStop(0,    'rgba(251,191,122,0.85)');
    gg.addColorStop(0.18, 'rgba(251,191,122,0.30)');
    gg.addColorStop(0.5,  'rgba(251,191,122,0.07)');
    gg.addColorStop(1,    'rgba(251,191,122,0)');
    gctx.fillStyle = gg;
    gctx.fillRect(0,0,256,256);
    const coreMat = new T.SpriteMaterial({ map: new T.CanvasTexture(glowCanvas), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const core = new T.Sprite(coreMat);
    core.scale.setScalar(2.2);
    ring.add(core);

    /* Dust particles on the orbital plane ---------------------------- */
    const dustN = 260;
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++){
      const a = Math.random() * Math.PI * 2;
      const r = RADIUS * (0.5 + Math.random() * 1.2);
      dustPos[i*3]   = Math.cos(a) * r;
      dustPos[i*3+1] = (Math.random() - 0.5) * 0.5;
      dustPos[i*3+2] = Math.sin(a) * r;
    }
    const dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
    const dustMat = new T.PointsMaterial({ color: 0xfbbf7a, size: 0.028, transparent: true, opacity: 0.45, depthWrite: false });
    const dust = new T.Points(dustGeo, dustMat);
    ring.add(dust);

    /* Card meshes ------------------------------------------------- */
    function getOrbitalPos(i, total){
      const a = (i / total) * Math.PI * 2;
      return new T.Vector3(
        Math.cos(a) * 4.2,
        Math.sin(a * 2.0) * 0.32 * 1.6,
        Math.sin(a) * 4.2
      );
    }

    const meshes = [];
    projects.forEach((p, i) => {
      const geo = new T.PlaneGeometry(CW, CH);
      const mat = new T.MeshBasicMaterial({
        map: drawCardTexture(p, i, T),
        transparent: true,
        side: T.FrontSide,
      });
      const mesh = new T.Mesh(geo, mat);

      const pos = getOrbitalPos(i, N);
      mesh.userData = {
        idx: i, project: p,
        phase: (i / N) * Math.PI * 2,
        base: pos.clone(),     // resting orbital position (for fly-in + float)
        scaleTarget: 1         // smoothed scale target (for hover / focus)
      };
      // initial OFFSET position (outside orbit, below) for the entrance fly-in
      mesh.position.copy(pos).multiplyScalar(2.6);
      mesh.position.y -= 4;
      mesh.scale.setScalar(0.6);
      ring.add(mesh);
      meshes.push(mesh);
    });

    setSize();
    camera.position.set(0, 0.6, baseCamZ);

    // redraw textures once webfonts are ready (canvas may have used fallbacks)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        meshes.forEach((mesh) => {
          const old = mesh.material.map;
          mesh.material.map = drawCardTexture(mesh.userData.project, mesh.userData.idx, T);
          mesh.material.needsUpdate = true;
          if (old) old.dispose();
        });
      });
    }

    /* Hidden-tab fallback ----------------------------------------
       If we mount while the tab is hidden, requestAnimationFrame is throttled to
       zero, so the entrance fly-in never runs and the cards would stay stranded at
       their off-screen start. Snap them to their resting orbit + draw one frame so
       the gallery is visible without a running loop. (When the tab is visible the
       entrance plays normally and this is skipped.) */
    let entranceDone = false;
    if (document.hidden) {
      meshes.forEach(m => {
        m.position.copy(m.userData.base);
        m.scale.setScalar(1);
        m.material.opacity = 1;
      });
      ring.updateMatrixWorld(true);
      meshes.forEach(m => m.lookAt(camera.position));
      entranceDone = true;
      renderer.render(scene, camera);
    }

    /* Interaction state ------------------------------------------- */
    let targetY = 0, currentY = 0;
    let dragging = false, startX = 0, startRY = 0, dragDelta = 0;
    let hovered = null;
    let focusedCard = null;
    const pointer = { x: 0, y: 0 };

    const cx = (e) => e.touches ? e.touches[0].clientX : e.clientX;

    const onDown = (e) => {
      dragging = true; startX = cx(e); startRY = targetY; dragDelta = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch(_){}
    };
    const onMove = (e) => {
      if (!dragging) return;
      dragDelta = cx(e) - startX;
      targetY = startRY - dragDelta * 0.007;
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e) => { targetY -= e.deltaY * 0.003; };

    /* Raycaster — click to open info panel ------------------------ */
    const ray = new T.Raycaster();
    const m2  = new T.Vector2();
    const onClick = (e) => {
      if (Math.abs(dragDelta) > 8) return;
      const rect = canvas.getBoundingClientRect();
      m2.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      m2.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      ray.setFromCamera(m2, camera);
      const hits = ray.intersectObjects(meshes);
      const clicked = hits.length ? hits[0].object : null;
      if (!clicked) {
        // click outside: release focus + close the info panel (preserves `front`)
        focusedCard = null;
        document.querySelector('.orbital-info.open .oi-close')?.click();
        return;
      }
      focusedCard = focusedCard === clicked ? null : clicked;
      if (focusedCard) {
        // open the existing React info panel + focus the camera
        onCardClick(clicked.userData.project, clicked.userData.idx);
      } else {
        document.querySelector('.orbital-info.open .oi-close')?.click();
      }
    };

    // hover raycast + pointer tracking (for parallax)
    const onHover = (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      pointer.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      if (dragging) { hovered = null; return; }
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects(meshes);
      hovered = hits.length ? hits[0].object : null;
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive:true });
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('pointermove', onHover);

    const ro = new ResizeObserver(setSize);
    ro.observe(canvas.parentElement);
    // also re-fit on the shared debounced viewport change (covers dpr / zoom)
    const unsubVp = window.subscribeViewport ? window.subscribeViewport(setSize) : null;

    /* Animate ----------------------------------------------------- */
    // Lazy clock: the entrance starts on the FIRST frame that actually runs, not at
    // mount — so a tab that was hidden at load still plays/holds correctly.
    let introStart = null;
    const tmp = new T.Vector3();
    let raf;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (introStart === null) introStart = performance.now();
      const elapsed = (performance.now() - introStart) / 1000;
      const t = elapsed;

      // ── ENTRANCE: fly cards in from offset to their base position ──
      meshes.forEach((mesh, i) => {
        const base = mesh.userData.base;
        if (entranceDone || rm()) {  // snapped (hidden mount) or reduced-motion: hold
          mesh.position.copy(base);
          mesh.scale.setScalar(mesh.userData.scaleTarget * fitScale);
          return;
        }
        const localT = Math.max(0, elapsed - i * 0.08);
        const k = Math.min(1, localT / 1.4);
        const ease = 1 - Math.pow(1 - k, 3);   // cubic ease out
        const startPos = base.clone().multiplyScalar(2.6);
        startPos.y -= 4;
        mesh.position.lerpVectors(startPos, base, ease);
        // scale 0.6 → 1 during entrance
        const entryScale = 0.6 + 0.4 * ease;
        mesh.scale.setScalar(entryScale * mesh.userData.scaleTarget * fitScale);
      });

      // ── ROTATION ──
      if (!dragging && !rm()) targetY += 0.0018;   // slower auto-rotate (off when reduced-motion)
      currentY += (targetY - currentY) * 0.08;
      ring.rotation.y = currentY;

      // ── STARS / DUST / CORE ──
      stars.rotation.y = t * 0.01;
      dust.rotation.y  = -t * 0.05;
      core.scale.setScalar(2.2 + Math.sin(t * 1.6) * 0.16);

      // ── CAMERA PARALLAX ──
      camera.position.x += (pointer.x * 0.35 - camera.position.x) * 0.04;
      camera.position.y += (0.6 + pointer.y * 0.2 - camera.position.y) * 0.04;

      // ── FOCUS: ease the camera toward the focused card ──
      if (focusedCard) {
        const worldPos = new T.Vector3();
        focusedCard.getWorldPosition(worldPos);
        const camTarget = worldPos.clone().multiplyScalar(0.45);
        camTarget.z += 3.2;
        camTarget.y += 0.3;
        camera.position.lerp(camTarget, rm() ? 1 : 0.06);   // instant when reduced-motion
        camera.lookAt(worldPos);
        // Focus indicator: project the focused card to screen via the ONE helper
        // (fresh rect every frame → never stale after scroll/resize; explicit Y
        // flip → tracks the card, never mirrored).
        if (dotRef.current) {
          const rect = canvas.getBoundingClientRect();
          const s = ndcToScreen(worldPos, camera, rect);
          const host = dotRef.current.parentElement.getBoundingClientRect();
          dotRef.current.style.transform = `translate(${s.x - host.left}px, ${s.y - host.top}px)`;
          dotRef.current.style.opacity = cfg.current.isTouch ? '0' : '1';
        }
      } else {
        const home = new T.Vector3(0, 0.6, baseCamZ);
        camera.position.lerp(home, rm() ? 1 : 0.05);
        camera.lookAt(0, 0, 0);
        if (dotRef.current) dotRef.current.style.opacity = '0';
      }

      // ── PER-CARD: billboard + opacity + scale + float ──
      meshes.forEach(mesh => {
        const isHover = mesh === hovered;
        const isFocus = mesh === focusedCard;
        const isDim   = (focusedCard && !isFocus) ||
                        (hovered && !isHover && !focusedCard);

        // billboard: turn toward the camera
        mesh.lookAt(camera.position);

        // opacity
        const opTarget = isDim ? 0.32 : 1;
        mesh.material.opacity = T.MathUtils.lerp(
          mesh.material.opacity, opTarget, 0.1
        );

        // scale target by state
        const sTarget = isFocus ? 1.2 : (isHover ? 1.05 : 1);
        mesh.userData.scaleTarget = T.MathUtils.lerp(
          mesh.userData.scaleTarget, sTarget, 0.12
        );

        // gentle float (only once the entrance for this card has finished)
        const floating = entranceDone ||
          (elapsed - mesh.userData.idx * 0.08) > 1.4;
        if (floating && !rm()) {
          mesh.position.y = mesh.userData.base.y +
            Math.sin(t * 0.9 + mesh.userData.phase) * 0.07;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointermove', onHover);
      ro.disconnect();
      if (unsubVp) unsubVp();
      starGeo.dispose(); starMat.dispose();
      pathGeo.dispose(); pathMat.dispose(); pathMat2.dispose();
      dustGeo.dispose(); dustMat.dispose();
      coreMat.map.dispose(); coreMat.dispose();
      halo.material.dispose(); halo.geometry.dispose();
      meshes.forEach(m => { m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); });
      renderer.dispose();
    };
  }, []);   // run once on mount — projects stable reference

  return (
    <React.Fragment>
      <canvas ref={canvasRef}
        style={{width:'100%', height:'100%', display:'block', cursor:'grab', touchAction:'none'}}/>
      <span ref={dotRef} aria-hidden="true" style={{
        position:'absolute', left:0, top:0, width:14, height:14,
        marginLeft:-7, marginTop:-7, borderRadius:'50%',
        border:'1.5px solid #fbbf7a', boxShadow:'0 0 12px rgba(251,191,122,0.9)',
        pointerEvents:'none', opacity:0, transition:'opacity 0.3s var(--ease-out)', zIndex:3
      }}/>
    </React.Fragment>
  );
}

/* ------------------------------------------------------------------ */
/* MEDIA SLOT — JSON-driven media with placeholder fallback           */
/*   slot = null / undefined          → renders the exact placeholder  */
/*   slot = { type:'image', src }     → <img> lazy + fade-in on load   */
/*   slot = { type:'video', src, poster } → <video> muted loop, paused */
/*                                      when off-screen (IO)           */
/*   slot = { type:'model', src }      → <div data-model> (Block 4)    */
/* Shared globally so play.jsx (loaded later) can use it too.          */
/* ------------------------------------------------------------------ */
function MediaSlot({ slot, className='', label, children, cover=true, style }){
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const type = slot && slot.src ? slot.type : null;

  // videos: play only while in viewport (spare the GPU with several at once)
  useEffect(()=>{
    if (type !== 'video') return;
    const v = ref.current && ref.current.querySelector('video');
    if (!v) return;
    const io = new IntersectionObserver((e)=>{
      if (e[0].isIntersecting) { v.play().catch(()=>{}); } else { v.pause(); }
    }, { threshold: 0.15 });
    io.observe(v);
    return ()=>io.disconnect();
  }, [type, slot && slot.src]);

  // no media → keep the existing placeholder look (data-label + children)
  if (!type){
    return <div className={('ph '+className).trim()} data-label={label} style={style}>{children}</div>;
  }

  const mediaStyle = {
    position:'absolute', inset:0, width:'100%', height:'100%',
    objectFit: cover ? 'cover' : 'contain',
    opacity: loaded ? 1 : 0,
    transition: 'opacity 0.6s var(--ease-out)'
  };
  return (
    <div ref={ref} className={('media-slot '+className).trim()} style={style}>
      {type==='image' &&
        <img src={slot.src} alt={label||''} loading="lazy" style={mediaStyle}
             onLoad={()=>setLoaded(true)}/>}
      {type==='video' &&
        <video src={slot.src} poster={slot.poster||undefined}
               muted loop playsInline autoPlay preload="metadata"
               style={mediaStyle} onLoadedData={()=>setLoaded(true)}/>}
      {type==='model' &&
        <div className="media-model" data-model={slot.src}></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* INFO PANEL — slides in from right on card click                    */
/* ------------------------------------------------------------------ */
function OrbitalInfoPanel({ project, idx, onClose }){
  const { lang } = useLang();
  const [title, scramble] = useScramble(project ? project.title : '', {});
  useEffect(()=>{ if(project) scramble(project.title); }, [project]);

  return (
    <aside className={'orbital-info' + (project ? ' open' : '')} data-lenis-prevent>
      {project && (
        <React.Fragment>
          <div className="oi-num">{String((idx||0)+1).padStart(2,'0')}</div>
          <div className="oi-head">
            <div className="oi-title">{title}</div>
            <div className="oi-tags mono-tag">{tr(project.role, lang) || project.tools || ''}</div>
          </div>
          <MediaSlot slot={project.media && project.media.turntable} className="oi-turntable">
            <div className="oi-ph-corner">TURNTABLE</div>
            <div className="oi-ph-label">360° loop · MP4</div>
          </MediaSlot>
          <p className="oi-desc">{tr(project.description, lang) || '—'}</p>
          {project.award && (
            <div className="oi-award mono-tag">{tr(project.award, lang)}</div>
          )}
          <div className="oi-cta">
            <button className="oi-close" data-cursor="hover" onClick={onClose}>
              <span>[ close ✕ ]</span>
            </button>
          </div>
        </React.Fragment>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* ORBITAL LIST (mobile) — no canvas, no custom pointer, no hover.      */
/* Plain readable vertical list of the 8 projects; tap opens the same   */
/* info panel the orbit uses.                                           */
/* ------------------------------------------------------------------ */
function OrbitalListMobile({ projects, onOpen }){
  const { lang } = useLang();
  const total = String(projects.length).padStart(2,'0');
  return (
    <div className="orbital-mobile-list" style={{
      display:'flex', flexDirection:'column', gap:10,
      padding:'6px 4px 28px', width:'100%',
    }}>
      <div className="mono-tag" style={{padding:'4px 4px 10px', color:'var(--text-mid)', letterSpacing:'0.18em', fontSize:11}}>
        {lang==='es'?'01':'01'}–{total} · {total} {lang==='es'?'PROYECTOS':lang==='zh'?'项目':'PROJECTS'}
      </div>
      {projects.map((p, i) => (
        <button key={p.id} data-cursor="hover" onClick={()=>onOpen(p, i)} style={{
          display:'flex', alignItems:'center', gap:14, minHeight:64,
          padding:'14px 16px', textAlign:'left', width:'100%',
          background:'var(--surface,#13131a)', border:'1px solid var(--border,#1f1f2e)',
          borderRadius:2, color:'var(--text,#e8e6f0)', cursor:'pointer',
          touchAction:'manipulation',
        }}>
          <span style={{fontFamily:'var(--f-mono,monospace)', fontSize:14, color:'#fbbf7a', minWidth:34}}>{String(i+1).padStart(2,'0')}</span>
          <span style={{display:'flex', flexDirection:'column', gap:4, flex:1, minWidth:0}}>
            <span style={{fontFamily:'var(--f-head,"Syne",sans-serif)', fontWeight:700, fontSize:19, lineHeight:1.15, letterSpacing:'-0.01em'}}>{p.title}</span>
            <span style={{fontFamily:'var(--f-mono,monospace)', fontSize:12, color:'var(--text-mid,#5c5a6e)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{tr(p.role,lang) || p.tools || ''}</span>
          </span>
          <span style={{fontFamily:'var(--f-mono,monospace)', fontSize:12, color:'var(--text-mid,#5c5a6e)'}}>{p.year || ''}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ORBITAL GALLERY — canvas stage + info panel + head + hint          */
/* ------------------------------------------------------------------ */
function OrbitalGallery({ projects, onFront }){
  const { lang } = useLang();
  const vp = useViewport();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const N = projects.length;
  const [activeProject, setActiveProject] = useState(null);
  const [activeIdx,     setActiveIdx]     = useState(null);

  const handleCardClick = (project, idx) => {
    setActiveProject(project);
    setActiveIdx(idx);
    if (onFront) onFront(project);
  };
  const handleClose = () => { setActiveProject(null); setActiveIdx(null); };

  return (
    <div className="orbital-wrap" data-screen-label="Work / Orbit">

      {/* Title row — top of section */}
      <div className="orbital-head">
        <h1 className="oh-title">
          <span className="oh-work">{lang==='es'?'Obra':'Work'}</span>
          <em className="oh-em">{lang==='es'?'en órbita.':'in orbit.'}</em>
        </h1>
        <div className="oh-meta mono-tag">
          <div>{String(N).padStart(2,'0')} {lang==='es'?'PROYECTOS':'PROJECTS'}</div>
          <div>{isMobile
            ? (lang==='es'?'TOCA PARA ABRIR':'TAP TO OPEN')
            : (lang==='es'?'ARRASTRA · CLIC PARA ENFOCAR':'DRAG TO ROTATE · CLICK TO FOCUS')}</div>
        </div>
      </div>

      {/* Three.js stage (desktop/laptop/tablet) or plain list (mobile) */}
      <div className="orbital-stage">
        {N > 0 && !isMobile && <OrbitalScene projects={projects} onCardClick={handleCardClick} reduceMotion={vp.reduceMotion} isTouch={vp.isTouch}/>}
        {N > 0 && isMobile && <OrbitalListMobile projects={projects} onOpen={handleCardClick}/>}
        {/* crosshair (orbit only) */}
        {!isMobile && <span className="orbital-ch orbital-ch-h"></span>}
        {!isMobile && <span className="orbital-ch orbital-ch-v"></span>}
        {/* info panel */}
        <OrbitalInfoPanel project={activeProject} idx={activeIdx} onClose={handleClose}/>
      </div>

      {/* Bottom hint */}
      <div className="orbital-hint">
        {isMobile ? (
          <React.Fragment>
            <span className="kbd-tag">TAP</span>
            <span>{lang==='es'?'abrir proyecto':'open project'}</span>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <span className="kbd-tag">DRAG</span>
            <span>{lang==='es'?'rotar órbita':'rotate orbit'}</span>
            <span className="oh-dot">·</span>
            <span className="kbd-tag">CLICK</span>
            <span>{lang==='es'?'enfocar tarjeta':'focus card'}</span>
            <span className="oh-dot">·</span>
            <span className="kbd-tag">SCROLL</span>
            <span>{lang==='es'?'ciclar':'cycle'}</span>
          </React.Fragment>
        )}
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ZIGZAG LIST — kept exactly as before                               */
/* ------------------------------------------------------------------ */
function ZigzagRow({ p, i, onOpen }){
  const { lang } = useLang();
  const right = i%2===1;
  return (
    <div className={'zz-row'+(right?' right':'')} data-fx="row">
      <div className="zz-thumb" data-fx="img">
        <a className="ph" data-cursor="project" data-label={'render · '+p.title} href={'#work'} onClick={(e)=>{e.preventDefault();onOpen(p);}} style={{display:'block'}}></a>
      </div>
      <div className="zz-info" data-fx="par" data-par="4">
        <div className="zz-id" data-fx="rise">{p.id} · {p.year}</div>
        <a className="zz-title" data-fx="clip" data-cursor="project" href="#work" onClick={(e)=>{e.preventDefault();onOpen(p);}}>{p.title}</a>
        <div className="zz-meta" data-fx="rise">{tr(p.role,lang)}</div>
        {p.award && <div className="zz-award" data-fx="rise">{tr(p.award,lang)}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SIDE PANEL — kept exactly as before (used by ZigzagRow clicks)    */
/* ------------------------------------------------------------------ */
function SidePanel({ project, onClose }){
  const t = useT();
  const { lang } = useLang();
  const [title, scramble] = useScramble(project ? project.title : '', {});
  useEffect(()=>{ if(project) scramble(project.title); }, [project]);
  return (
    <React.Fragment>
      <div className={'scrim'+(project?' on':'')} onClick={onClose}></div>
      <aside className={'side-panel'+(project?' open':'')} data-lenis-prevent>
        {project && <React.Fragment>
          <button className="sp-close" data-cursor="hover" onClick={onClose}>[ {t('work.close')} ✕ ]</button>
          <div className="sp-id">{project.id}</div>
          <h1 className="sp-title">{title}</h1>
          <div className="sp-hero"><MediaSlot slot={project.media && project.media.hero} label={'hero render · '+project.title}/></div>
          <div className="sp-row"><span className="k">{t('work.role')}</span><span className="v">{tr(project.role,lang)}</span></div>
          <div className="sp-row"><span className="k">{t('work.year')}</span><span className="v">{project.year}</span></div>
          {project.award && <div className="sp-row"><span className="k">{t('work.award')}</span><span className="v" style={{color:'var(--warm)'}}>{tr(project.award,lang)}</span></div>}
          <div className="sp-row"><span className="k">Tools</span><span className="v" style={{fontFamily:'var(--f-mono)',fontSize:12}}>{project.tools}</span></div>
          <div className="sp-hero" style={{marginTop:26}}><MediaSlot slot={project.media && project.media.breakdown} label="breakdown · wireframe → textured"/></div>
        </React.Fragment>}
      </aside>
    </React.Fragment>
  );
}

/* ==================================================================
   TOOL FILTER + ZIGZAG REVEAL  (new section, below the orbital)
   -------------------------------------------------------------------
   • Reads the `tool` field added to data/work.json.
   • Mini orbital "tool wheel" (own lightweight Three.js instance —
     does NOT touch OrbitalScene) single-selects a tool filter.
   • Pinned zigzag reveal walks the filtered list one project at a
     time (sticky + scroll-progress, the About-timeline pattern), with
     alternating-side conveyor entrance/exit + click-to-expand detail.
   • prefers-reduced-motion / mobile → static stacked fallback, static
     tool row, no pin, no rotating wheel.
   ================================================================== */
const TOOL_ABBR = {
  'Maya':'MY', 'Blender':'BL', 'Unreal':'UE', '3D-Coat':'3DC',
  'Marmoset':'MT', 'Substance Painter':'SP', 'Unity':'UN',
};
const toolAbbr = (name) => TOOL_ABBR[name] || (name||'?').replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase();
function uniqueTools(projects){
  const out = [];
  projects.forEach(p => { if (p.tool && out.indexOf(p.tool) < 0) out.push(p.tool); });
  return out;
}
const WORK_ACCENT = '#fbbf7a';

/* ---- Tool filter: simple flat pill row (shared desktop + mobile) ---- */
function ToolPills({ tools, selected, onSelect }){
  const { lang } = useLang();
  const clearLabel = lang==='es' ? 'TODOS' : lang==='zh' ? '全部' : 'ALL';
  return (
    <div className="tf-pills" style={{display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center'}}>
      <button type="button" data-cursor="hover" onClick={()=>onSelect(null)} style={chipStyle(selected===null)}>{clearLabel}</button>
      {tools.map(tool => (
        <button key={tool} type="button" data-cursor="hover" onClick={()=>onSelect(selected===tool?null:tool)} style={chipStyle(selected===tool)}>
          {tool}
        </button>
      ))}
    </div>
  );
}

function chipStyle(active){
  return {
    fontFamily:'var(--f-mono)', fontSize:12, letterSpacing:'0.1em', textTransform:'uppercase',
    padding:'12px 18px', minHeight:44, borderRadius:2, cursor:'pointer',
    background: active ? 'rgba(251,191,122,0.14)' : 'var(--surface)',
    border: '1px solid ' + (active ? WORK_ACCENT : 'var(--border)'),
    color: active ? WORK_ACCENT : 'var(--text)',
    transition:'color .3s, border-color .3s, background .3s',
    display:'inline-flex', alignItems:'center', justifyContent:'center',
  };
}

/* ---- One combined project block (image + text together) ---- */
function ZzBlock({ p, i, active, onExpand }){
  const { lang } = useLang();
  const mirror = i % 2 === 1;
  return (
    <article className={'zzr-block'+(active?' active':'')}
      onClick={active ? onExpand : undefined}
      data-cursor={active ? 'project' : null}
      style={{
        display:'flex', flexDirection: mirror ? 'row-reverse' : 'row',
        alignItems:'center', gap:'clamp(20px,3vw,48px)',
        width:'min(1080px, 92vw)', maxWidth:'92vw',
        cursor: active ? 'pointer' : 'default',
      }}>
      <div style={{flex:'0 0 46%', maxWidth:'46%'}}>
        <div className="zzr-img" style={{position:'relative', aspectRatio:'16/10', borderRadius:5, overflow:'hidden', border:'1px solid var(--border)'}}>
          <MediaSlot slot={p.media && p.media.hero} label={'render · '+p.title} style={{position:'absolute', inset:0}}/>
        </div>
      </div>
      <div style={{flex:1, display:'flex', flexDirection:'column', gap:12, alignItems: mirror ? 'flex-end':'flex-start', textAlign: mirror?'right':'left'}}>
        <div className="mono-tag" style={{color:WORK_ACCENT, letterSpacing:'0.14em'}}>{p.id} · {p.year}</div>
        <h3 style={{fontFamily:'var(--f-head)', fontWeight:800, fontSize:'clamp(30px,4.4vw,60px)', lineHeight:0.98, margin:0, letterSpacing:'-0.02em'}}>{p.title}</h3>
        <div style={{fontFamily:'var(--f-mono)', fontSize:13, color:'var(--text-mid)'}}>{tr(p.role, lang) || p.tools}</div>
        <div style={{display:'flex', gap:10, alignItems:'center', flexDirection: mirror?'row-reverse':'row'}}>
          <span style={{fontFamily:'var(--f-mono)', fontSize:11, letterSpacing:'0.1em', padding:'5px 11px', border:'1px solid rgba(251,191,122,0.5)', borderRadius:2, color:WORK_ACCENT}}>
            {toolAbbr(p.tool)} · {p.tool}
          </span>
          {p.award && <span style={{fontFamily:'var(--f-mono)', fontSize:11, color:WORK_ACCENT}}>{tr(p.award, lang)}</span>}
        </div>
        {active && (
          <div className="mono-tag" style={{marginTop:6, color:'var(--text-mid)'}}>
            [ {lang==='es'?'CLIC PARA EXPANDIR':lang==='zh'?'点击展开':'CLICK TO EXPAND'} ]
          </div>
        )}
      </div>
    </article>
  );
}

/* ---- Expanded in-place detail ---- */
function ZzDetail({ p, onClose }){
  const { lang } = useLang();
  const t = useT();
  if (!p) return null;
  return (
    <div className="zzr-detail" data-lenis-prevent style={{
      position:'absolute', inset:0, zIndex:20, overflowY:'auto',
      background:'rgba(6,6,8,0.96)', backdropFilter:'blur(4px)',
      padding:'clamp(24px,5vh,64px) clamp(20px,6vw,110px)',
    }}>
      <button className="oi-close" data-cursor="hover" onClick={onClose}
        style={{fontFamily:'var(--f-mono)', fontSize:12, color:WORK_ACCENT, background:'none', border:'none', cursor:'pointer', letterSpacing:'0.1em'}}>
        [ {t('work.close')} ✕ ]
      </button>
      <div style={{display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(0,1fr)', gap:'clamp(24px,4vw,56px)', marginTop:20, alignItems:'start'}} className="zzr-detail-grid">
        <div style={{position:'relative', aspectRatio:'16/10', borderRadius:5, overflow:'hidden', border:'1px solid var(--border)'}}>
          <MediaSlot slot={p.media && p.media.hero} label={'hero render · '+p.title} style={{position:'absolute', inset:0}}/>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <div className="mono-tag" style={{color:WORK_ACCENT}}>{p.id} · {p.year}</div>
          <h2 style={{fontFamily:'var(--f-head)', fontWeight:800, fontSize:'clamp(34px,5vw,64px)', lineHeight:0.98, margin:0, letterSpacing:'-0.02em'}}>{p.title}</h2>
          <p style={{fontFamily:'var(--f-body)', fontSize:'clamp(15px,1.5vw,18px)', lineHeight:1.6, color:'var(--text)', textWrap:'pretty', margin:0}}>{tr(p.description, lang) || '—'}</p>
          <div style={{display:'flex', flexDirection:'column', gap:10, marginTop:6}}>
            <DetailRow k={t('work.role')} v={tr(p.role, lang)}/>
            <DetailRow k="Tool" v={p.tool} accent/>
            <DetailRow k="Tools" v={p.tools} mono/>
            <DetailRow k={t('work.year')} v={p.year}/>
            {p.award && <DetailRow k={t('work.award')} v={tr(p.award, lang)} accent/>}
          </div>
          {Array.isArray(p.tags) && p.tags.length > 0 && (
            <div style={{display:'flex', flexWrap:'wrap', gap:8, marginTop:6}}>
              {p.tags.map(tag => (
                <span key={tag} style={{fontFamily:'var(--f-mono)', fontSize:10.5, letterSpacing:'0.1em', padding:'4px 9px', border:'1px solid var(--border)', borderRadius:2, color:'var(--text-mid)'}}>#{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function DetailRow({ k, v, accent, mono }){
  if (!v) return null;
  return (
    <div style={{display:'flex', gap:16, borderTop:'1px solid var(--border)', paddingTop:9}}>
      <span style={{fontFamily:'var(--f-mono)', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-mid)', minWidth:80}}>{k}</span>
      <span style={{fontFamily: mono ? 'var(--f-mono)' : 'var(--f-body)', fontSize: mono?12:14, color: accent ? WORK_ACCENT : 'var(--text)'}}>{v}</span>
    </div>
  );
}

/* ---- Pinned zigzag reveal (conveyor of combined blocks) ---- */
function ZigzagReveal({ projects, filterKey, disabled, tools, selected, onSelect }){
  const { lang } = useLang();
  const wrapRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const N = projects.length;
  const perStepVh = 90;
  const trackHeight = (100 + N * perStepVh) + 'vh';

  // scroll-progress (same mechanism as About's PinnedChapter / timeline)
  useEffect(()=>{
    if (disabled) return;
    const wrap = wrapRef.current; if (!wrap) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const r = wrap.getBoundingClientRect();
      const scrollable = Math.max(1, r.height - window.innerHeight);
      const p = Math.max(0, Math.min(1, -r.top / scrollable));
      setProgress(p);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [disabled, N, filterKey]);

  // filter change → collapse + return to the first project in the new list
  useEffect(()=>{
    setExpanded(false);
    if (disabled) return;
    const wrap = wrapRef.current; if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < window.innerHeight;
    if (visible){
      const top = r.top + window.scrollY;
      if (window.__lenis) window.__lenis.scrollTo(top, { duration: 0.8 });
      else window.scrollTo({ top });
    }
    if (window.ScrollTrigger) requestAnimationFrame(()=>window.ScrollTrigger.refresh());
  }, [filterKey]);

  // lock scroll + Esc-to-close while expanded
  useEffect(()=>{
    if (!expanded) return;
    const lenis = window.__lenis;
    if (lenis) lenis.stop();
    const onKey = (e)=>{ if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => { if (lenis) lenis.start(); window.removeEventListener('keydown', onKey); };
  }, [expanded]);

  if (!N) return null;

  /* ---- reduced-motion / mobile: static readable stacked list ---- */
  if (disabled){
    return (
      <div className="zzr-static" style={{padding:'20px 0 60px'}}>
        <div style={{marginBottom:'clamp(28px,5vw,48px)'}}>
          <ToolPills tools={tools} selected={selected} onSelect={onSelect}/>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:'clamp(40px,7vw,80px)'}}>
        {projects.map((p, i) => (
          <StaticBlock key={p.id} p={p} i={i}/>
        ))}
        </div>
      </div>
    );
  }

  // segment progress with a dwell plateau per project
  const rawPos = progress * N;
  const idx = Math.max(0, Math.min(N-1, Math.floor(rawPos)));
  const fracRaw = Math.max(0, Math.min(1, rawPos - idx));
  const HOLD = 0.55;
  let tSeg = 0;
  if (fracRaw > HOLD){ const u = (fracRaw - HOLD) / (1 - HOLD); tSeg = u*u*(3 - 2*u); }
  const virtualPos = Math.min(N-1, idx + tSeg);
  const cur = Math.min(N-1, Math.floor(virtualPos));
  const frac = virtualPos - cur;                 // 0 (held) → 1 (fully advanced)
  const hasNext = cur < N-1 && frac > 0.001;
  const activeIdx = Math.round(virtualPos);
  const activeProject = projects[activeIdx];

  const side = (i) => (i % 2 === 0 ? -1 : 1);     // even enters from left(-), odd from right(+)
  const OFF = 118;                                 // off-stage travel (%)

  const blocks = [];
  // outgoing = cur : exits toward the side opposite the incoming block's entrance
  {
    const exitSign = hasNext ? -side(cur+1) : 0;
    const x = exitSign * frac * OFF;
    const op = hasNext ? 1 - frac : 1;
    blocks.push({ i: cur, x, op, z: hasNext ? 2 : 4 });
  }
  // incoming = cur+1 : enters from its own alternating side
  if (hasNext){
    const enterSign = side(cur+1);
    const x = enterSign * (1 - frac) * OFF;
    blocks.push({ i: cur+1, x, op: frac, z: 4 });
  }

  return (
    <div className="zzr-wrap" ref={wrapRef} style={{ height: trackHeight, position:'relative' }}>
      <div className="zzr-sticky" style={{ position:'sticky', top:0, height:'100dvh', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {/* filter pills — pinned, so they stay visible for the whole sequence */}
        <div className="zzr-pills" style={{ position:'absolute', top:'clamp(78px,11vh,120px)', left:'clamp(20px,6vw,110px)', right:'clamp(20px,6vw,110px)', zIndex:15 }}>
          <ToolPills tools={tools} selected={selected} onSelect={onSelect}/>
        </div>
        {/* stage */}
        <div className="zzr-stage" style={{ position:'relative', width:'100%', height:'100%' }}>
          {blocks.map(b => {
            const p = projects[b.i];
            const isActive = b.i === activeIdx;
            const scale = 0.94 + b.op * 0.06;
            return (
              <div key={p.id} style={{
                position:'absolute', left:'50%', top:'50%', width:'100%',
                display:'flex', justifyContent:'center',
                transform:`translate(-50%,-50%) translateX(${b.x}%) scale(${scale})`,
                opacity: b.op, zIndex: b.z,
                filter: b.op < 0.75 ? `blur(${(0.75-b.op)*4}px)` : 'none',
                pointerEvents: isActive && !expanded ? 'auto' : 'none',
                willChange:'transform, opacity',
              }}>
                <ZzBlock p={p} i={b.i} active={isActive && !expanded} onExpand={()=>setExpanded(true)}/>
              </div>
            );
          })}
        </div>

        {/* HUD */}
        <div className="zzr-hud" style={{ position:'absolute', left:'clamp(20px,6vw,110px)', right:'clamp(20px,6vw,110px)', bottom:34, display:'flex', flexDirection:'column', gap:10, zIndex:12, pointerEvents:'none' }}>
          <div style={{ height:2, background:'var(--border)', position:'relative' }}>
            <span style={{ position:'absolute', left:0, top:0, bottom:0, background:WORK_ACCENT, transform:`scaleX(${progress})`, transformOrigin:'left', width:'100%' }}></span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span className="mono-tag" style={{ color:WORK_ACCENT }}>{String(activeIdx+1).padStart(2,'0')} / {String(N).padStart(2,'0')}</span>
            <span className="mono-tag" style={{ color:'var(--text-mid)' }}>{lang==='es'?'DESLIZA · UNO A UNO':lang==='zh'?'滚动 · 逐一浮现':'SCROLL · ONE AT A TIME'}</span>
          </div>
        </div>

        {expanded && <ZzDetail p={activeProject} onClose={()=>setExpanded(false)}/>}
      </div>
    </div>
  );
}

function StaticBlock({ p, i }){
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const t = useT();
  const mirror = i % 2 === 1;
  return (
    <div className="zzr-static-row" data-fx="row">
      <div style={{display:'flex', flexDirection: mirror?'row-reverse':'row', gap:'clamp(16px,4vw,48px)', alignItems:'center', flexWrap:'wrap'}}>
        <div style={{flex:'1 1 300px', minWidth:0}}>
          <div style={{position:'relative', aspectRatio:'16/10', borderRadius:5, overflow:'hidden', border:'1px solid var(--border)'}}>
            <MediaSlot slot={p.media && p.media.hero} label={'render · '+p.title} style={{position:'absolute', inset:0}}/>
          </div>
        </div>
        <div style={{flex:'1 1 300px', minWidth:0, display:'flex', flexDirection:'column', gap:10, textAlign: mirror?'right':'left', alignItems: mirror?'flex-end':'flex-start'}}>
          <div className="mono-tag" style={{color:WORK_ACCENT}}>{p.id} · {p.year}</div>
          <h3 style={{fontFamily:'var(--f-head)', fontWeight:800, fontSize:'clamp(26px,6vw,44px)', lineHeight:1, margin:0}}>{p.title}</h3>
          <div style={{fontFamily:'var(--f-mono)', fontSize:12, color:'var(--text-mid)'}}>{tr(p.role, lang) || p.tools}</div>
          <span style={{fontFamily:'var(--f-mono)', fontSize:11, padding:'5px 11px', border:'1px solid rgba(251,191,122,0.5)', borderRadius:2, color:WORK_ACCENT}}>{toolAbbr(p.tool)} · {p.tool}</span>
          <button type="button" data-cursor="hover" onClick={()=>setOpen(o=>!o)} style={{fontFamily:'var(--f-mono)', fontSize:11, letterSpacing:'0.1em', color:'var(--text-mid)', background:'none', border:'none', cursor:'pointer', padding:0}}>
            [ {open ? (lang==='es'?'MENOS':'LESS') : (lang==='es'?'MÁS':'MORE')} ]
          </button>
          {open && (
            <p style={{fontFamily:'var(--f-body)', fontSize:15, lineHeight:1.6, color:'var(--text)', textWrap:'pretty', maxWidth:520, margin:0}}>{tr(p.description, lang)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Section wrapper: owns the single-select filter state ---- */
function ToolFilterSection({ projects }){
  const { lang } = useLang();
  const vp = useViewport();
  const bp = useBreakpoint();
  const disabled = vp.reduceMotion || bp === 'mobile';
  const [tool, setTool] = useState(null);
  const tools = React.useMemo(() => uniqueTools(projects), [projects]);
  const filtered = React.useMemo(() => tool ? projects.filter(p => p.tool === tool) : projects, [projects, tool]);

  return (
    <section className="tool-filter-section" data-screen-label="Work / Tools" style={{ position:'relative', zIndex:3, padding:'clamp(48px,9vh,120px) clamp(20px,6vw,110px) 0' }}>
      <div className="orbital-head" style={{ marginBottom:28 }}>
        <h2 className="oh-title" style={{ fontFamily:'var(--f-head)', fontWeight:800, fontSize:'clamp(30px,5vw,68px)', lineHeight:0.95, letterSpacing:'-0.02em', margin:0 }}>
          {lang==='es'?'Filtra por':'Filter by'} <em style={{ color:WORK_ACCENT, fontStyle:'italic', fontFamily:'var(--f-display)', fontWeight:300 }}>{lang==='es'?'herramienta.':'tool.'}</em>
        </h2>
        <div className="oh-meta mono-tag" style={{ textAlign:'right', color:'var(--text-mid)' }}>
          <div>{String(tools.length).padStart(2,'0')} {lang==='es'?'HERRAMIENTAS':'TOOLS'}</div>
          <div>{disabled ? (lang==='es'?'TOCA PARA FILTRAR':'TAP TO FILTER') : (lang==='es'?'CLIC PARA FILTRAR':'CLICK TO FILTER')}</div>
        </div>
      </div>

      <ZigzagReveal projects={filtered} filterKey={tool || '__all__'} disabled={disabled} tools={tools} selected={tool} onSelect={setTool}/>
    </section>
  );
}

/* ---- Closing CTA: suggest heading to the About route ---- */
function WorkAboutCTA({ navigate }){
  const { lang } = useLang();
  const [hover, setHover] = useState(false);
  const [shown, setShown] = useState(false);
  const ref = useRef(null);
  const go = (e) => { e.preventDefault(); if (navigate) navigate('about'); };
  // Self-contained rise reveal via a scroll check (the shared [data-fx] IO —
  // and a plain IntersectionObserver — don't reliably fire for this lone element
  // after the tall pinned section establishes layout).
  useEffect(()=>{
    const el = ref.current; if (!el) return;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(_){}
    if (reduce){ setShown(true); return; }
    let raf = 0, done = false;
    const tick = () => {
      if (done) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0){ done = true; setShown(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=>{ done = true; if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="work-about-cta" style={{ padding:'clamp(80px,14vh,180px) clamp(20px,6vw,110px) clamp(90px,15vh,170px)' }}>
      <a ref={ref} href="#about" onClick={go} data-cursor="hover"
        onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
        style={{
          display:'flex', alignItems:'center', gap:'clamp(18px,3vw,40px)',
          width:'min(760px,100%)', margin:'0 auto', padding:'clamp(18px,2.4vw,28px)',
          border:'1px solid ' + (hover ? WORK_ACCENT : 'var(--border)'),
          borderRadius:4, textDecoration:'none', color:'var(--text)',
          background: hover ? 'rgba(251,191,122,0.05)' : 'var(--surface)',
          opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(26px)',
          transition:'border-color .35s var(--ease-out), background .35s var(--ease-out), opacity .8s var(--ease-out), transform .8s var(--ease-out)',
        }}>
        {/* small static About preview (portrait crop placeholder) */}
        <span className="ph" data-label="portrait" aria-hidden="true"
          style={{ width:'clamp(76px,9vw,104px)', height:'clamp(96px,11vw,132px)', borderRadius:4, flex:'0 0 auto' }}></span>
        <span style={{ display:'flex', flexDirection:'column', gap:9, flex:1, minWidth:0 }}>
          <span className="mono-tag" style={{ color:WORK_ACCENT, letterSpacing:'0.16em' }}>{lang==='es'?'SIGUIENTE':lang==='zh'?'下一个':'NEXT'} · ABOUT</span>
          <span style={{ fontFamily:'var(--f-head)', fontWeight:800, fontSize:'clamp(23px,3.2vw,42px)', lineHeight:1.02, letterSpacing:'-0.02em', textWrap:'pretty' }}>
            {lang==='es'?'Conoce a la persona detrás de las superficies.':lang==='zh'?'认识表面背后的人。':'Meet the person behind the surfaces.'}
          </span>
          <span style={{ fontFamily:'var(--f-mono)', fontSize:12, letterSpacing:'0.06em', color:'var(--text-mid)' }}>
            {lang==='es'?'Ir a About':lang==='zh'?'前往关于':'Go to About'} →
          </span>
        </span>
        {/* icon */}
        <span aria-hidden="true" style={{
          marginLeft:'auto', flex:'0 0 auto', width:'clamp(40px,4.5vw,56px)', height:'clamp(40px,4.5vw,56px)',
          display:'grid', placeItems:'center', borderRadius:'50%',
          border:'1px solid ' + (hover ? WORK_ACCENT : 'var(--text-mid)'),
          color: hover ? WORK_ACCENT : 'var(--text-mid)', fontSize:18,
          transform: hover ? 'translateX(4px)' : 'none',
          transition:'color .35s var(--ease-out), border-color .35s var(--ease-out), transform .35s var(--ease-out)',
        }}>↗</span>
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* WORK PAGE                                                           */
/* ------------------------------------------------------------------ */
function Work({ navigate }){
  const t = useT();
  const { log } = useToast();
  const fxRef = useScrollFX([]);
  const PROJECTS = getProjects();
  const [front, setFront] = useState(PROJECTS[0] || null);
  useEffect(()=>{ log('// loading orbital gallery...'); }, []);

  if (!PROJECTS.length){
    return (
      <div className="page work" data-screen-label="Work">
        <EmptyWork/>
      </div>
    );
  }

  return (
    <div className="page work" ref={fxRef} data-screen-label="Work">
      {/* Three.js orbital — manages its own info panel internally */}
      <OrbitalGallery projects={PROJECTS} onFront={setFront}/>

      {/* NEW: tool-pill filter + pinned zigzag reveal (directly below the orbital) */}
      <ToolFilterSection projects={PROJECTS}/>

      {/* Sello band — unchanged */}
      <SelloBand project={front}/>

      {/* Closing suggestion — head to About */}
      <WorkAboutCTA navigate={navigate}/>
    </div>
  );
}

Object.assign(window, { Work, getProjects, MediaSlot, ndcToScreen, ToolFilterSection, ZigzagReveal, WorkAboutCTA });
