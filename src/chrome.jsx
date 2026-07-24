/* ===================================================================
   chrome.jsx — Floating pill NavBar / lang / live status / curtain
   =================================================================== */
function LiveStatus(){
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () => {
      try {
        const s = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date());
        setTime(s);
      } catch(e){ setTime(new Date().toLocaleTimeString()); }
    };
    fmt(); const id = setInterval(fmt, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="live-status">
      <span className="live-dot"></span>
      <span>MADRID {time}</span>
    </div>
  );
}

/* three-bar menu glyph — morphs to X via GSAP (see icon effect in NavBar) */
function MenuIcon(){
  return (
    <span className="nbm-icon">
      <svg className="menu-icon" width="24" height="16" viewBox="0 0 24 16" fill="none" aria-hidden="true">
        <rect className="bar bar-1" x="0" y="0"  width="24" height="2" fill="currentColor" rx="1"/>
        <rect className="bar bar-2" x="0" y="7"  width="24" height="2" fill="currentColor" rx="1"/>
        <rect className="bar bar-3" x="0" y="14" width="24" height="2" fill="currentColor" rx="1"/>
      </svg>
    </span>
  );
}

/* 3D "LISA" rendered with Three.js box-bars — no font loader required.
   Mounts only while the panel is open; disposes the renderer on close. */
function NavCanvas({ open }){
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const THREE = window.THREE;
    const g = window.gsap;
    const canvas = canvasRef.current;
    if (!THREE || !canvas) return;

    let disposed = false;
    const CW = 560, CH = 200;
    const mobile = window.innerWidth < 760;

    const getAccent = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--page-accent').trim();
      try { return new THREE.Color(raw || '#7B5CF5'); } catch(e){ return new THREE.Color('#7B5CF5'); }
    };

    /* ---- renderer / scene / camera ---- */
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, CW/CH, 0.1, 100);
    camera.position.set(0, 0, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(CW, CH, false);
    renderer.setClearColor(0x000000, 0);

    /* deferred build — let the panel open animation paint first.
       Particle targets are sampled from a 2D offscreen canvas that
       draws "LISA" with the system font: simple and reliable. */
    let rafId = 0;
    let particleGeo = null, particleMat = null, points = null;
    let currentPos = [];

    const initParticles = (targets) => {
      if (disposed || !targets.length) return;
      const N = targets.length;
      const posArr = new Float32Array(N * 3);

      currentPos = targets.map(() => ({
        x: (Math.random() - 0.5) * 12,
        y: Math.random() * 6 + 2,          // start above the frame
        z: (Math.random() - 0.5) * 3,
      }));
      currentPos.forEach((p, i) => { posArr[i*3]=p.x; posArr[i*3+1]=p.y; posArr[i*3+2]=p.z; });

      particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      particleMat = new THREE.PointsMaterial({
        color: getAccent(), size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0,
      });
      points = new THREE.Points(particleGeo, particleMat);
      scene.add(points);

      const posAttr = particleGeo.attributes.position;

      if (g){
        g.to(particleMat, { opacity: 0.95, duration: 0.4 });
        targets.forEach((target, i) => {
          g.to(currentPos[i], {
            x: target.x, y: target.y, z: target.z,
            duration: 0.9 + Math.random()*0.5, delay: 0.05 + Math.random()*0.7, ease: 'power3.out',
            onUpdate: () => {
              posArr[i*3]=currentPos[i].x; posArr[i*3+1]=currentPos[i].y; posArr[i*3+2]=currentPos[i].z;
              posAttr.needsUpdate = true;
            },
          });
        });
      } else {
        targets.forEach((t, i) => { posArr[i*3]=t.x; posArr[i*3+1]=t.y; posArr[i*3+2]=t.z; });
        posAttr.needsUpdate = true;
        particleMat.opacity = 0.95;
      }

      /* breathing loop + live accent colour */
      renderer.setAnimationLoop(() => {
        const t = Date.now() * 0.001;
        points.rotation.z = Math.sin(t * 0.4) * 0.018;
        points.position.y = Math.sin(t * 0.6) * 0.04;
        particleMat.color.set(getAccent());
        renderer.render(scene, camera);
      });
    };

    const start = () => {
      if (disposed) return;
      document.fonts.ready.then(() => {
        if (disposed) return;
        const off = document.createElement('canvas');
        off.width = 520; off.height = 160;
        const ctx = off.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 520, 160);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 120px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LISA', 260, 80);

        const { data } = ctx.getImageData(0, 0, 520, 160);
        const step = mobile ? 8 : 6;
        const targets = [];
        for (let y = 0; y < 160; y += step){
          for (let x = 0; x < 520; x += step){
            if (data[(y * 520 + x) * 4] > 128){
              targets.push({
                x: (x / 520 - 0.5) * 9,
                y: -(y / 160 - 0.5) * 2.8,
                z: 0,
              });
            }
          }
        }
        initParticles(targets);
      });
    };

    rafId = requestAnimationFrame(() => { rafId = requestAnimationFrame(start); });

    /* ---- teardown on close ---- */
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (g) g.killTweensOf(currentPos);
      if (g && particleMat) g.killTweensOf(particleMat);
      renderer.setAnimationLoop(null);
      if (particleGeo) particleGeo.dispose();
      if (particleMat) particleMat.dispose();
      renderer.dispose();
    };
  }, [open]);

  return (
    <div className="nav-canvas-wrapper">
      <canvas ref={canvasRef} className="nav-canvas"></canvas>
    </div>
  );
}

const NB_PHRASES = [
  '// nav cerrado · elige destino',
  '// looking sharp today',
  '// yi-ting yang tang · 2025',
  '// madrid · utc+1',
];

function NavBar({ route, navigate, lang, setLang }){
  const [open, setOpen] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [avail, setAvail] = useState(true);

  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const centerRef = useRef(null);
  const pendingRoute = useRef(null);
  const firstRun = useRef(true);
  const t = useT();

  const items = ['home','about','work','play','contact'];
  const labelFor = (r) => r==='home' ? tr({es:'Inicio',en:'Home',zh:'首页'}, lang) : t('nav.'+r);
  const menuWord  = lang==='zh' ? '菜单' : (lang==='es' ? 'Menú' : 'Menu');
  const closeWord = lang==='zh' ? '关闭' : (lang==='es' ? 'Cerrar' : 'Close');

  /* blinking availability dot */
  useEffect(() => {
    const iv = setInterval(() => setAvail(a => !a), 1500);
    return () => clearInterval(iv);
  }, []);

  /* rotating centre phrase — only while the panel is closed */
  useEffect(() => {
    if (open) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const g = window.gsap;
    if (g) g.set(centerRef.current, { autoAlpha: 1 });
    const iv = setInterval(() => {
      const el = centerRef.current; if (!el) return;
      if (!g || reduce){ setPhraseIdx(i => (i+1) % NB_PHRASES.length); return; }
      g.to(el, { autoAlpha:0, duration:0.4, ease:'power1.in', onComplete:() => {
        setPhraseIdx(i => (i+1) % NB_PHRASES.length);
        g.to(el, { autoAlpha:1, duration:0.4, ease:'power1.out' });
      }});
    }, 4000);
    return () => clearInterval(iv);
  }, [open]);

  /* open / close choreography */
  useEffect(() => {
    const overlay = overlayRef.current, panel = panelRef.current;
    if (!overlay || !panel) return;
    const g = window.gsap;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const linkEls = Array.from(panel.querySelectorAll('.nav-item'));
    const ascii  = panel.querySelector('.nav-canvas-wrapper');
    const foot   = panel.querySelector('.nav-footer-inner');

    if (firstRun.current){
      firstRun.current = false;
      if (g){ g.set(overlay, { autoAlpha:0 }); g.set(panel, { clipPath:'inset(0 0 100% 0)', autoAlpha:1 }); }
      return;
    }

    const navAfter = () => {
      if (pendingRoute.current){ const r = pendingRoute.current; pendingRoute.current = null; navigate(r); }
    };
    if (g) g.set(centerRef.current, { autoAlpha:1 });

    if (open){
      // iOS-safe scroll lock — pins body via top:-scrollY so the address bar
      // and rubber-band scroll can't leak through the overlay.
      if (window.lockBodyScroll) window.lockBodyScroll();
      else document.body.style.overflow = 'hidden';
      if (!g || reduce){
        if (g){ g.set(overlay,{autoAlpha:1}); g.set(panel,{clipPath:'inset(0 0 0% 0)',autoAlpha:1}); g.set(linkEls,{y:0,autoAlpha:1}); if(ascii)g.set(ascii,{autoAlpha:1}); if(foot)g.set(foot,{autoAlpha:1}); }
        else { overlay.style.visibility='visible'; overlay.style.opacity='1'; panel.style.clipPath='inset(0 0 0% 0)'; }
        return;
      }
      g.killTweensOf([overlay, panel, ...linkEls, ascii, foot]);
      g.to(overlay, { autoAlpha:1, duration:0.3 });
      g.fromTo(panel, { clipPath:'inset(0 0 100% 0)', autoAlpha:1 }, { clipPath:'inset(0 0 0% 0)', duration:0.45, ease:'power3.out' });
      g.fromTo(linkEls, { y:16, autoAlpha:0 }, { y:0, autoAlpha:1, stagger:0.06, duration:0.35, ease:'power2.out', delay:0.2 });
      if (ascii) g.fromTo(ascii, { autoAlpha:0 }, { autoAlpha:1, duration:0.3, delay:0.5 });
      if (foot)  g.fromTo(foot,  { autoAlpha:0 }, { autoAlpha:1, duration:0.25, delay:0.6 });
    } else {
      if (window.unlockBodyScroll) window.unlockBodyScroll();
      else document.body.style.overflow = '';
      if (!g || reduce){
        if (g){ g.set(overlay,{autoAlpha:0}); g.set(panel,{clipPath:'inset(0 0 100% 0)'}); }
        else { overlay.style.visibility='hidden'; overlay.style.opacity='0'; panel.style.clipPath='inset(0 0 100% 0)'; }
        navAfter();
        return;
      }
      g.killTweensOf([overlay, panel, ...linkEls, ascii, foot]);
      g.to([...linkEls, ascii, foot].filter(Boolean), { autoAlpha:0, y:-8, stagger:0.03, duration:0.2 });
      g.to(panel, { clipPath:'inset(0 0 100% 0)', duration:0.35, ease:'power3.in', delay:0.15 });
      g.to(overlay, { autoAlpha:0, duration:0.3, delay:0.2 });
      setTimeout(navAfter, 450);
    }
  }, [open]);

  /* hamburger → X morph */
  useEffect(() => {
    const g = window.gsap;
    if (!g) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce){
      g.set('.bar-1', { y: open?7:0,  rotation: open?45:0 });
      g.set('.bar-2', { autoAlpha: open?0:1 });
      g.set('.bar-3', { y: open?-7:0, rotation: open?-45:0 });
      return;
    }
    if (open){
      g.to('.bar-1', { y:7,  rotation:45,  transformOrigin:'center', duration:0.35, ease:'power3.inOut' });
      g.to('.bar-2', { autoAlpha:0, duration:0.2 });
      g.to('.bar-3', { y:-7, rotation:-45, transformOrigin:'center', duration:0.35, ease:'power3.inOut' });
    } else {
      g.to('.bar-1', { y:0, rotation:0, duration:0.35, ease:'power3.inOut' });
      g.to('.bar-2', { autoAlpha:1, duration:0.3, delay:0.1 });
      g.to('.bar-3', { y:0, rotation:0, duration:0.35, ease:'power3.inOut' });
    }
  }, [open]);

  /* close on Escape + focus trap + focus restoration
     - Opening the menu focuses the first nav link (skip past the close button
       so screen readers announce the actual destination first).
     - Tab is trapped within the panel while open.
     - On close, focus returns to the menu toggle so keyboard users don't get
       dumped at the top of the document. */
  const returnFocusRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    returnFocusRef.current = document.activeElement;
    // defer focus so the panel open animation doesn't fight the scroll-into-view
    const t = setTimeout(() => {
      const first = panel.querySelector('.nav-item, button, a');
      if (first && first.focus) first.focus({ preventScroll: true });
    }, 320);

    const getFocusable = () => Array.from(panel.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);

    const onKey = (e) => {
      if (e.key === 'Escape'){ pendingRoute.current = null; setOpen(false); return; }
      if (e.key !== 'Tab') return;
      const nodes = getFocusable();
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    if (open) return;
    const el = returnFocusRef.current;
    if (el && el.focus && document.contains(el)) el.focus({ preventScroll: true });
    returnFocusRef.current = null;
  }, [open]);

  const cerrar = () => setOpen(false);
  const go = (r) => { pendingRoute.current = r; cerrar(); };
  const onLogo = (e) => { e.preventDefault(); e.stopPropagation(); if (open) go('home'); else navigate('home'); };
  const toggleMenu = () => { if (open) pendingRoute.current = null; setOpen(o => !o); };

  const hoverIn = (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const g = window.gsap; if (!g) return;
    const nm = e.currentTarget.querySelector('.nav-link-name');
    if (nm) g.to(nm, { x:6, duration:0.25, ease:'power2.out' });
  };
  const hoverOut = (e) => {
    const g = window.gsap; if (!g) return;
    const nm = e.currentTarget.querySelector('.nav-link-name');
    if (nm) g.to(nm, { x:0, duration:0.25, ease:'power2.out' });
  };

  const centerText = open ? '// elige tu destino' : NB_PHRASES[phraseIdx];

  return (
    <React.Fragment>
      {/* dimmed, blurred backdrop */}
      <div className={'nav-fl-overlay'+(open?' open':'')} ref={overlayRef}
           onClick={() => { pendingRoute.current = null; cerrar(); }} aria-hidden="true"></div>

      {/* drop-down panel (emerges from beneath the floating bar) */}
      <div className="nav-fl-panel" id="nav-panel" role="dialog" aria-modal={open}
           ref={panelRef} aria-hidden={!open}>
        <nav className="nav-fl-links">
          {items.map((r,i) => (
            <a key={r} href={'#'+r} data-cursor="hover"
               className={'nav-item'+(route===r?' active':'')}
               onClick={(e)=>{e.preventDefault(); go(r);}}
               onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              <span className="nav-link-index">{String(i+1).padStart(2,'0')}</span>
              <span className="nav-link-name">{labelFor(r)}</span>
              <span className="nav-chevron" aria-hidden="true">›</span>
            </a>
          ))}
          {/* Certifications lives outside the SPA — full page load, not a WorldTransition */}
          <a href="certifications.html" data-cursor="hover" className="nav-item"
             onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
            <span className="nav-link-index">{String(items.length+1).padStart(2,'0')}</span>
            <span className="nav-link-name">{tr({es:'Certificaciones',en:'Certifications',zh:'认证'}, lang)}</span>
            <span className="nav-chevron" aria-hidden="true">›</span>
          </a>
        </nav>

        <NavCanvas open={open} />

        <div className="nav-footer-inner">
          <div className="nav-lang">
            <button className={'nav-lang-btn'+(lang==='es'?' active':'')} data-cursor="hover" onClick={()=>setLang('es')}>ES</button>
            <span className="nav-lang-sep">·</span>
            <button className={'nav-lang-btn'+(lang==='en'?' active':'')} data-cursor="hover" onClick={()=>setLang('en')}>EN</button>
            <span className="nav-lang-sep">·</span>
            <button className={'nav-lang-btn'+(lang==='zh'?' active':'')} data-cursor="hover" onClick={()=>setLang('zh')}>中文</button>
          </div>
          <div className="nav-copy">© Lisa 2025</div>
        </div>
      </div>

      {/* floating pill bar — only the menu button toggles now (bar-wide onClick
          fired on incidental taps while trying to scroll on mobile). */}
      <header className={'nav-bar'+(open?' open':'')}>
        <a className="nav-bar-logo logo-mark" data-cursor="hover" onClick={onLogo} href="#home">
          <span className="lm-box">YT</span>
          <span>LISA</span>
        </a>
        <div className="nav-bar-center" ref={centerRef} aria-hidden="true">{centerText}</div>
        <button className={'nav-bar-menu'+(open?' is-open':'')} data-cursor="hover"
                aria-expanded={open} aria-controls="nav-panel"
                aria-label={open?closeWord:menuWord}
                onClick={toggleMenu}>
          <MenuIcon/>
        </button>
      </header>
    </React.Fragment>
  );
}

/* curtain controlled by app — phase: 'in' | 'out' | null */
function Curtain({ phase }){
  if (!phase) return null;
  return <div className={'curtain '+phase}></div>;
}

/* marquee mantra strip */
function MarqueeMantra({ text }){
  const items = Array.from({length:6});
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {items.map((_,i)=>(<span key={i}>{text}<i className="marquee-dot">◆</i></span>))}
      </div>
    </div>
  );
}

Object.assign(window, { Header: NavBar, NavBar, LiveStatus, Curtain, MarqueeMantra });
