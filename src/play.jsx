/* ===================================================================
   play.jsx — "El Laboratorio" : N real shader moments (pinned sequence)
   Data source: data/play.json (loaded into window.DATA.play)
   Adding a new experiment = append an entry to play.json.
   =================================================================== */
const getShaders = () => (window.DATA && Array.isArray(window.DATA.play)) ? window.DATA.play : [];

// shader.title vs legacy shader.name — read either
const shaderName = (s) => s ? (s.title || s.name) : null;

function Moment({ shader, idx, total, onExpand }){
  const t = useT();
  const { lang } = useLang();
  const { log } = useToast();
  const ref = useRef(null);
  const [flipped, setFlipped] = useState(false);
  const frozen = (window.getViewport && window.getViewport().reduceMotion) || false;
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const io = new IntersectionObserver(e=>{ if(e[0].isIntersecting){ log('// shader '+shader.id+' initialized'); io.disconnect(); } }, { threshold:0.4 });
    io.observe(el); return ()=>io.disconnect();
  }, []);

  // Entrance/crossfade is now owned by <MomentSequence> (pinned stage).
  // Moment is purely presentational — no scroll animation of its own.
  const tools = shader.tools || [];
  return (
    <div ref={ref} className={'moment'+(shader.wide?' wide':'')}>
      <div className="moment-head">
        <div>
          <div className="m-id">EXPERIMENT {shader.id}/{String(total).padStart(2,'0')}</div>
          <h2>{tr(shaderName(shader), lang)}</h2>
        </div>
        <p>{tr(shader.hint, lang)} · <span style={{color:'var(--page-accent)'}}>{t('play.expand')}</span></p>
      </div>
      <div className={'moment-canvas flip-card'+(flipped?' flipped':'')}>
        <div className="flip-inner">
          <div className="flip-face flip-front" onClick={()=>{ if(!flipped) onExpand(shader); }}>
            {shader.media
              ? <MediaSlot slot={shader.media} className="moment-media" label={'render · '+tr(shaderName(shader), lang)}/>
              : <ShaderCanvas frag={shader.frag} accent="#4ade80" label={'SHADER '+shader.id} variant={parseInt(shader.id)} frozen={frozen} onExpand={()=>onExpand(shader)}/>}
            <button className="flip-toggle" data-cursor="hover" aria-label="details"
              onClick={(e)=>{ e.stopPropagation(); setFlipped(true); }}>ⓘ</button>
          </div>
          <div className="flip-face flip-back">
            <div className="fb-head">
              <span className="fb-id mono-tag">EXP {shader.id} · {shader.year}</span>
              <button className="flip-toggle" data-cursor="hover" aria-label="back"
                onClick={()=>setFlipped(false)}>✕</button>
            </div>
            <h3 className="fb-title">{tr(shaderName(shader), lang)}</h3>
            <p className="fb-desc">{tr(shader.description, lang)}</p>
            <div className="fb-foot">
              <div className="fb-tools">{tools.map(tl => <span key={tl} className="fb-pill mono-tag">{tl}</span>)}</div>
              {shader.award && <div className="fb-award mono-tag">★ {shader.award}</div>}
              <button className="fb-expand mono-tag" data-cursor="hover" onClick={()=>onExpand(shader)}>{t('play.expand')} ⤢</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MomentSequence({ shaders, total, onExpand }) {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const N = shaders.length;
  const bp = useBreakpoint();
  const vp = useViewport();
  const disablePin = vp.reduceMotion || bp === 'mobile';
  const [active, setActive] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;
    const gsap = window.gsap;
    const momentEls = Array.from(stage.querySelectorAll('.moment-slide'));

    // NON-PINNED (reduced-motion or mobile): normal vertical flow. The active
    // dot is derived from ONE IntersectionObserver — same source of truth as
    // what is on screen, so dots + counter can never disagree.
    if (disablePin || !gsap || !window.ScrollTrigger) {
      if (gsap) gsap.set(momentEls, { clearProps: 'all' });
      momentEls.forEach(el => { el.style.position = 'relative'; el.style.opacity = '1'; });
      stage.style.height = 'auto';
      wrap.style.height = 'auto';
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const i = momentEls.indexOf(e.target);
            if (i >= 0) setActive(i);
          }
        });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      momentEls.forEach(el => io.observe(el));
      return () => io.disconnect();
    }

    // PINNED crossfade sequence. Active dot tracks the dominant moment.
    const st = window.ScrollTrigger.create({
      trigger: wrap, start: 'top top', end: 'bottom bottom',
      pin: stage, pinSpacing: false, anticipatePin: 1,
    });
    const triggers = momentEls.map((el, i) => {
      gsap.set(el, { opacity: i === 0 ? 1 : 0, scale: i === 0 ? 1 : 0.96, pointerEvents: i === 0 ? 'auto' : 'none' });
      return window.ScrollTrigger.create({
        trigger: wrap,
        start: () => `top+=${(i / N) * wrap.offsetHeight} top`,
        end:   () => `top+=${((i + 1) / N) * wrap.offsetHeight} top`,
        onUpdate: (self) => {
          const p = self.progress;
          const fadeZone = 0.18;
          let op;
          if (p < fadeZone) op = p / fadeZone;
          else if (p > 1 - fadeZone) op = (1 - p) / fadeZone;
          else op = 1;
          gsap.set(el, { opacity: op, scale: 0.96 + op * 0.04, pointerEvents: op > 0.5 ? 'auto' : 'none' });
          if (op > 0.5) setActive(i);
        }
      });
    });
    requestAnimationFrame(() => window.ScrollTrigger.refresh());
    return () => { st.kill(); triggers.forEach(t => t.kill()); };
  }, [N, disablePin]);

  const goTo = (i) => {
    const wrap = wrapRef.current, stage = stageRef.current;
    if (!wrap || !stage) return;
    if (disablePin) {
      const slide = stage.querySelectorAll('.moment-slide')[i];
      if (!slide) return;
      const y = slide.getBoundingClientRect().top + window.scrollY - 40;
      if (window.__lenis) window.__lenis.scrollTo(y); else window.scrollTo({ top: y });
    } else {
      const wrapTop = wrap.getBoundingClientRect().top + window.scrollY;
      const scrollable = Math.max(1, wrap.offsetHeight - window.innerHeight);
      const y = wrapTop + ((i + 0.5) / N) * scrollable;
      if (window.__lenis) window.__lenis.scrollTo(y); else window.scrollTo({ top: y });
    }
  };

  const isMobile = bp === 'mobile';
  const dotsStyle = isMobile
    ? { position:'fixed', left:0, right:0, bottom:12, display:'flex', gap:6, justifyContent:'center', alignItems:'center', flexWrap:'wrap', padding:'8px 12px', zIndex:40 }
    : { position:'fixed', right:20, top:'50%', transform:'translateY(-50%)', display:'flex', flexDirection:'column', gap:10, alignItems:'center', zIndex:40 };

  return (
    <div ref={wrapRef} className="moment-sequence-wrap" style={{ height: disablePin ? 'auto' : `${N * 180}vh` }}>
      <div ref={stageRef} className="moment-sequence-stage">
        {shaders.map((s, i) => (
          <div key={s.id} className="moment-slide">
            <Moment shader={s} idx={i} total={total} onExpand={onExpand} />
          </div>
        ))}
      </div>
      <div className="play-dots" role="tablist" aria-label="experiments" style={dotsStyle}>
        {shaders.map((s, i) => (
          <button key={s.id} type="button" role="tab" aria-selected={i === active}
            aria-label={'Experiment ' + (i + 1)} onClick={() => goTo(i)}
            style={{ width: i === active ? 12 : 8, height: i === active ? 12 : 8, borderRadius: '50%',
                     border: '1px solid var(--page-accent,#4ade80)',
                     background: i === active ? 'var(--page-accent,#4ade80)' : 'transparent',
                     padding: 0, cursor: 'pointer', transition: 'all .25s', flex: '0 0 auto' }}/>
        ))}
        <span className="mono-tag" style={{ marginLeft: isMobile ? 8 : 0, marginTop: isMobile ? 0 : 8, fontSize: 11, color: 'var(--page-accent,#4ade80)' }}>
          {String(active + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

function ShaderFullscreen({ shader, total, onClose }){
  const { lang } = useLang();
  const [src, setSrc] = useState(false);
  const frozen = (window.getViewport && window.getViewport().reduceMotion) || false;
  useEffect(()=>{ const onKey=(e)=>{ if(e.key==='Escape')onClose(); }; window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey); }, []);
  if(!shader) return null;
  const name = tr(shaderName(shader), lang);
  return (
    <div className="shader-fs" data-lenis-prevent>
      <div className="fs-canvas"><ShaderCanvas frag={shader.frag} accent="#4ade80" label={name} variant={parseInt(shader.id)} frozen={frozen}/></div>
      {shader.description && (
        <div className="fs-desc">
          <div className="fs-desc-tag mono-tag">EXP {shader.id} · DESCRIPTION</div>
          <p>{tr(shader.description, lang)}</p>
          {shader.controls && shader.controls.length>0 && (
            <div className="fs-desc-controls">
              {shader.controls.map(c => <span key={c} className="fs-pill mono-tag">{c}</span>)}
            </div>
          )}
        </div>
      )}
      <div className={'fs-src'+(src?' show':'')}>{shader.frag}</div>
      <div className="fs-bar">
        <span>EXPERIMENT {shader.id}/{String(total).padStart(2,'0')} · {name}</span>
        <div style={{display:'flex',gap:18}}>
          <button data-cursor="hover" onClick={()=>setSrc(s=>!s)} style={{color:src?'var(--page-accent)':'var(--text-mid)'}}>{src?'▾ hide source':'▸ view shader source'}</button>
          <button data-cursor="hover" onClick={onClose} style={{color:'var(--text)'}}>esc · close ✕</button>
        </div>
      </div>
    </div>
  );
}

const CORRIDOR_VARIANTS_REMOVED = true;

function PlayFinal({ navigate, total }){
  const t = useT();
  return (
    <section className="play-final" data-screen-label="Play / Final">
      <div className="blob" data-cursor="hover"></div>
      <div>
        <div className="eyebrow" style={{marginBottom:18}}>EXPERIMENTS VISITED · {total}/{total}</div>
        <h2 className="play-title" style={{fontSize:'clamp(36px,8vw,90px)'}}>{t('play.enter')}</h2>
        <a className="cta-btn" style={{marginTop:30,display:'inline-flex'}} data-cursor="hover" href="#contact" onClick={(e)=>{e.preventDefault();navigate('contact');}}>{t('play.enter')} →</a>
      </div>
    </section>
  );
}

function Play({ navigate }){
  const t = useT();
  const { log } = useToast();
  const fxRef = useScrollFX([]);
  const [title] = useScramble('PLAYGROUND', { auto:true, duration:1100 });
  const [fps, setFps] = useState(60);
  const [fs, setFs] = useState(null);
  const SHADERS = getShaders();
  const total = SHADERS.length;
  useEffect(()=>{ log('// entering the lab... ' + total + ' experiments loaded'); let f=0,last=performance.now(),raf;
    const loop=(n)=>{ f++; if(n-last>1000){ setFps(f); f=0; last=n; } raf=requestAnimationFrame(loop); }; raf=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(raf); }, [total]);
  // Re-measure ScrollTrigger after the pinned sequence mounts.
  useEffect(()=>{
    if (window.ScrollTrigger) requestAnimationFrame(()=>window.ScrollTrigger.refresh());
  }, [total]);
  return (
    <div className="page play" ref={fxRef} data-screen-label="Play">
      <section className="play-intro" data-screen-label="Play / Intro">
        <div>
          <div className="eyebrow" style={{marginBottom:20}}>{t('play.eyebrow')}</div>
          <h1 className="play-title">{title}</h1>
          <div className="play-hud">
            <span>EXPERIMENT <b>00/{String(total).padStart(2,'0')}</b></span><span>MODE: <b>EXPLORE</b></span><span>FPS: <b>{fps}</b></span>
          </div>
          <p>{t('play.intro')}</p>
        </div>
      </section>

      <MomentSequence shaders={SHADERS} total={total} onExpand={setFs}/>

      <PlayFinal navigate={navigate} total={total}/>

      <ShaderFullscreen shader={fs} total={total} onClose={()=>setFs(null)}/>
    </div>
  );
}

Object.assign(window, { Play, getShaders });
