/* ===================================================================
   about.jsx — "Los Fragmentos" : glitch name, pseudocode, horizontal
   sliding-window timeline. All copy / data pulled from JSON.
   Data sources : bio.json · skills.json · certifications.json
                  milestones.json
   =================================================================== */

function GlitchName({ text }){
  const ref = useRef(null);
  const spansRef = useRef(null);
  const fire = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.classList.add('go');
    setTimeout(()=>el.classList.remove('go'), 360);
    const spans = spansRef.current ? Array.from(spansRef.current.children) : [];
    spans.forEach(s => {
      let n=0; const iv=setInterval(()=>{ s.style.transform = `translate(${(Math.random()-.5)*16}px, ${(Math.random()-.5)*8}px)`; if(++n>5){clearInterval(iv); s.style.transform='';} }, 50);
    });
  }, []);
  useEffect(()=>{
    const id = setTimeout(fire, 600);
    const iv = setInterval(()=>{ if(Math.random()<0.35) fire(); }, 11000);
    return ()=>{ clearTimeout(id); clearInterval(iv); };
  }, [fire]);
  return (
    <h1 className="glitch-name" ref={ref} data-text={text} data-cursor="text" onMouseEnter={fire}>
      <span ref={spansRef} style={{display:'inline-flex'}}>
        {text.split('').map((c,i)=><span key={i} style={{display:'inline-block',transition:'transform .05s steps(1)'}}>{c===' '?'\u00A0':c}</span>)}
      </span>
    </h1>
  );
}

function CentrifugalText({ text, mode }){
  const ref = useReveal({ threshold:0.3 });
  // mode: 'letters' (fall from top) | 'words' (from sides)
  const tokens = mode==='letters' ? text.split('') : text.split(' ');
  return (
    <p className="ch-body reveal" ref={ref}>
      {tokens.map((tk,i)=>{
        const st = mode==='letters'
          ? { transitionDelay:(i*0.012)+'s' }
          : { transitionDelay:(i*0.04)+'s' };
        return <span key={i} className={mode==='letters'?'ch-letter':'ch-word'} style={st}>{tk}{mode==='words'?'\u00A0':(tk===' '?'\u00A0':'')}</span>;
      })}
    </p>
  );
}

/* ---------- TIMELINE · sine-wave, one-by-one reveal --------------
   - Nodes ride a visible sine wave (page-accent stroke) fixed to their
     GLOBAL index, so every milestone always sits at the same wave height.
   - Pinned scroll-progress is divided into N segments (one per milestone);
     each segment DWELLS long enough to read (~120–140vh per hito).
   - 3–4 nodes visible at once (viewport-width dependent): the active one,
     1–2 trailing, 1 upcoming. Active is big/crisp with its description;
     others are attenuated on the same wave. Hovering a visible non-active
     node brings it back for a re-read.
   - Same sticky+scroll-progress mechanism as before — cooperates with Lenis.
   ----------------------------------------------------------- */
function HorizontalTimeline(){
  const { lang } = useLang();
  const wrapRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const items = (window.DATA && window.DATA.milestones) || [];
  const N = items.length;

  // stage measurement — the SVG path needs pixel coords (SVG `d` doesn't
  // support percentages), so we mirror the stage's box into React state.
  const stageRef = useRef(null);
  const [stageBox, setStageBox] = useState({ w: 1200, h: 460 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setStageBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // viewport-driven geometry — everything derives from the shared store
  // (BP / useViewport / useBreakpoint merged in lib.jsx). No fixed
  // reference-viewport constants.
  const vp = useViewport();
  const bp = useBreakpoint();
  const reduce = vp.reduceMotion;
  const isMobile = bp === 'mobile';
  const isTablet = bp === 'tablet';

  const VISIBLE   = isTablet ? 3 : 4;        // 3–4 nodes on screen
  const AMP       = isTablet ? 48 : 74;      // sine amplitude (px), lower on tablet
  const PHASE     = 0.9;                      // rad per milestone index
  const WAVE_BASE = 0.35;                     // starting phase

  // ONE shared wave function — both the SVG path and every node transform
  // call this, so the curve and the node lane can never drift apart. Height
  // is anchored to the GLOBAL milestone index (fixed lane per milestone).
  const nodeY = (i, amp) => Math.sin(i * PHASE + WAVE_BASE) * amp;

  // scroll distance scales with milestone count AND viewport height (vh),
  // clamped so the timeline is never absurdly long on very tall screens.
  const perStepVh = isTablet ? 120 : 130;
  const trackHeight = Math.min(100 + N * 140, 100 + Math.max(1, N) * perStepVh) + 'vh';

  // recompute + refresh once after the debounced viewport change
  useEffect(() => {
    if (window.ScrollTrigger) requestAnimationFrame(() => window.ScrollTrigger.refresh());
  }, [vp.w, vp.h, bp]);

  useEffect(() => {
    if (reduce || isMobile || isTablet) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
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
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [N, reduce, isMobile, isTablet]);

  /* --------- REDUCED MOTION / MOBILE / TABLET: readable list, `rise` reveal
     Tablet (768) also gets the static list — the horizontal wave was designed
     for wide viewports and collides with itself at portrait iPad width. */
  if (reduce || isMobile || isTablet) {
    return (
      <div className="hz-tl-wrap hz-tl-static">
        <ol className="hz-tl-list">
          {items.map((it, i) => (
            <li key={i} className={'hz-tl-list-row t-' + (it.type || 'event')} data-fx="rise">
              <span className="hz-year mono-tag">{it.year}</span>
              <div className="hz-tl-list-body">
                <div className="hz-title">{tr(it.title, lang)}</div>
                <div className="hz-org">{it.org}</div>
                {it.description && (
                  <p className="hz-desc">{tr(it.description, lang)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  /* --------- ANIMATED PATH --------- */
  // "virtualPos" = which milestone is currently the active one (float).
  // progress covers N segments; each segment is a full milestone dwell.
  // Segment center is where the active milestone is most "locked". We use
  // p * N so integer values line up with milestone boundaries.
  const rawPos = progress * N;
  // Small ease inside each segment so the active node has a dwell plateau:
  // shape p*N by mapping fractional part through a smooth ease near 0 & 1.
  const idxFloor = Math.min(N - 1, Math.floor(rawPos));
  const frac = Math.max(0, Math.min(1, rawPos - idxFloor));
  // dwellShape: linear near middle (fast between hitos), plateau at edges
  // -> use smoothstep to create ease at both ends of each segment.
  const dwellShape = frac * frac * (3 - 2 * frac); // classic smoothstep
  const virtualPos = idxFloor + dwellShape;
  const activeIdx = Math.round(virtualPos);

  // horizontal layout : the "camera" travels along a virtual strip of length
  // (N-1) slots. We anchor the current virtualPos to a slot near the middle,
  // slightly biased right so upcoming node has room. slotStep is % of stage width.
  const slotStep = isTablet ? 24 : 20;
  const anchorSlot = 1.4;             // which slot the active node lives at
  const stageLeftPad = 14;            // % from left where slot 0 begins

  /* per-node horizontal offset math:
     slotIdx = anchorSlot + (i - virtualPos)
     xPct    = stageLeftPad + slotIdx * slotStep
  */

  // sine wave points (globally-anchored to milestone index) — shared nodeY

  // Build the SVG path in PIXEL space using the measured stage box.
  // The path scrolls with the "camera" (same virtualPos) so the line and
  // the dots share one continuous wave. Over-sample per step for smoothness.
  const SAMPLES_PER_STEP = 8;
  const startI = Math.max(0, Math.floor(virtualPos) - 2);
  const endI   = Math.min(N - 1, Math.ceil(virtualPos) + VISIBLE + 1);
  const pathPts = [];
  for (let s = startI * SAMPLES_PER_STEP; s <= endI * SAMPLES_PER_STEP; s++){
    const gi = s / SAMPLES_PER_STEP;
    const slotIdx = anchorSlot + (gi - virtualPos);
    const xPct = stageLeftPad + slotIdx * slotStep;
    const xPx = (xPct / 100) * stageBox.w;
    const yPx = stageBox.h / 2 + nodeY(gi, AMP);
    pathPts.push([xPx, yPx]);
  }
  const pathD = pathPts.length
    ? 'M ' + pathPts.map(([x,y]) => x.toFixed(2) + ',' + y.toFixed(2)).join(' L ')
    : '';

  return (
    <div className="hz-tl-wrap" ref={wrapRef} style={{height: trackHeight}}>
      <div className="hz-tl-sticky">
        <div className="hz-tl-stage" ref={stageRef}>
          {/* sine axis */}
          <svg className="hz-tl-wave"
               width={stageBox.w}
               height={stageBox.h}
               viewBox={`0 0 ${Math.max(1, stageBox.w)} ${Math.max(1, stageBox.h)}`}
               preserveAspectRatio="none"
               aria-hidden="true">
            <defs>
              <linearGradient id="hzWaveGrad" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%"   stopColor="var(--page-accent)" stopOpacity="0"/>
                <stop offset="12%"  stopColor="var(--page-accent)" stopOpacity="0.38"/>
                <stop offset="50%"  stopColor="var(--page-accent)" stopOpacity="0.7"/>
                <stop offset="88%"  stopColor="var(--page-accent)" stopOpacity="0.38"/>
                <stop offset="100%" stopColor="var(--page-accent)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={pathD} className="hz-tl-wave-path" vectorEffect="non-scaling-stroke"/>
          </svg>

          <div className="hz-tl-track">
            {items.map((it, i) => {
              const slotIdx = anchorSlot + (i - virtualPos);
              const xPct = stageLeftPad + slotIdx * slotStep;
              const yPx = nodeY(i, AMP);

              // visibility band: [anchorSlot - trailing, anchorSlot + leading]
              const trailing = 2;
              const leading  = VISIBLE - 1 - trailing; // ~1
              const minSlot = anchorSlot - trailing - 0.5;
              const maxSlot = anchorSlot + leading + 0.5;
              const outOfBand = slotIdx < minSlot || slotIdx > maxSlot;

              const isActive = i === activeIdx && !outOfBand;
              const isPast   = i < activeIdx;
              const isFuture = i > activeIdx;
              const isHovered = hoverIdx === i && !outOfBand;

              // attenuation for non-active-in-band
              let opacity, scale, blur, zi;
              if (outOfBand) {
                opacity = 0; scale = 0.55; blur = 2; zi = 0;
              } else if (isActive || isHovered) {
                opacity = 1; scale = 1; blur = 0; zi = 6;
              } else {
                opacity = 0.35; scale = 0.7; blur = 1; zi = 2;
              }

              const typeClass = it.type ? (' t-' + it.type) : '';
              const stateClass =
                (isActive ? ' active' : '') +
                (isHovered && !isActive ? ' rehover' : '') +
                (isPast && !isActive ? ' past' : '') +
                (isFuture && !isActive ? ' future' : '') +
                (outOfBand ? ' out' : '');

              return (
                <div key={i}
                     className={'hz-node' + stateClass + typeClass}
                     style={{
                       left: xPct + '%',
                       top: `calc(50% + ${yPx.toFixed(2)}px)`,
                       opacity,
                       transform: `translate(-50%, -50%) scale(${scale})`,
                       filter: blur ? `blur(${blur}px)` : 'none',
                       zIndex: zi,
                       pointerEvents: outOfBand ? 'none' : 'auto',
                     }}
                     onMouseEnter={() => !outOfBand && setHoverIdx(i)}
                     onMouseLeave={() => setHoverIdx(h => h === i ? -1 : h)}>
                  <div className="hz-year mono-tag">{it.year}</div>
                  <div className="hz-dot"><span className="hz-dot-core"></span><span className="hz-dot-ring"></span></div>
                  <div className="hz-title">{tr(it.title, lang)}</div>
                  <div className="hz-org">{it.org}</div>
                  <div className="hz-desc">
                    {(it.description && tr(it.description, lang)) || it.org}
                  </div>
                  <div className="hz-tooltip" role="tooltip">
                    <span className="hz-tt-org mono-tag">{it.org}</span>
                    {(it.description && tr(it.description, lang)) || it.org}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="hz-tl-hud">
          <div className="hz-tl-hud-bar"><span style={{transform:`scaleX(${progress})`}}></span></div>
          <div className="hz-tl-hud-labels">
            <span>{(items[0] && items[0].year) || '—'}</span>
            <span className="hz-tl-hud-counter mono-tag">
              {String(Math.min(N, activeIdx + 1)).padStart(2,'0')} / {String(N).padStart(2,'0')}
            </span>
            <span>{(items[N-1] && items[N-1].year) || '—'}</span>
          </div>
          <div className="hz-tl-hud-hint mono-tag">
            {lang==='zh'?'滚动 · 逐一浮现':lang==='en'?'scroll · one at a time':'desliza · uno a uno'}
          </div>
        </div>
      </div>
    </div>
  );
}

const ChapterCtx = React.createContext(() => {});

/* ---------- PinnedChapter ------------------------------------------------
   Generalized "sticky container + scroll progress" wrapper — same mechanism
   as HorizontalTimeline. Outer .pinned-wrap has a tall track (100vh sticky
   + `travel` vh of pin room); inner .pinned-sticky pins to viewport top and
   exposes a 0→1 progress to children (render-prop). Progress is a pure
   function of scroll — no competing GSAP ScrollTrigger — so it cooperates
   with Lenis inertia the same way the timeline does.

   Reduced-motion / narrow viewport: no pin, static stacked layout.
------------------------------------------------------------------------- */
function PinnedChapter({ travel = 120, children }){
  const wrapRef = useRef(null);
  const [progress, setProgress] = useState(0);
  // Pinning is enabled only at laptop+ and disabled under reduced-motion
  // (uses the shared breakpoint contract; no local matchMedia).
  const bp = useBreakpoint();
  const vp = useViewport();
  const disabled = vp.reduceMotion || bp === 'mobile' || bp === 'tablet';

  useEffect(() => {
    if (disabled) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
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
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [disabled, travel]);

  const render = typeof children === 'function' ? children : (() => children);

  if (disabled) {
    return <div className="pinned-wrap pinned-static">{render(1)}</div>;
  }

  const trackHeight = (100 + Math.max(20, travel)) + 'vh';
  return (
    <div ref={wrapRef} className="pinned-wrap" style={{ height: trackHeight }}>
      <div className="pinned-sticky">
        {render(progress)}
      </div>
    </div>
  );
}

/* ---------- LateralEntrance ---------------------------------------------
   Light, non-pinning sideways drift + fade tied to IntersectionObserver.
   For prose chapters that would look odd fully pinned. Reduced-motion:
   fully visible, no transform.
------------------------------------------------------------------------- */
function LateralEntrance({ from = 'right', children }){
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let r = false;
    try { r = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}
    setReduce(r);
    if (r) { setOn(true); return; }
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { setOn(true); io.disconnect(); }
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const sign = from === 'left' ? -1 : 1;
  const style = reduce ? {} : {
    transform: on ? 'translate3d(0,0,0)' : `translate3d(${sign * 8}%, 0, 0)`,
    opacity: on ? 1 : 0,
    transition: 'transform 1100ms var(--ease-out, cubic-bezier(.16,1,.3,1)), opacity 900ms var(--ease-out, ease)',
    willChange: 'transform, opacity',
  };
  return <div ref={ref} className="lateral-entrance" style={style}>{children}</div>;
}

/* ---------- PinnedTravelSlab -------------------------------------------
   Helper that renders inside PinnedChapter — drives the row/grid content
   horizontally with progress (translateX from +X% at p=0 to 0 at p=1),
   plus a subtle scale/opacity for depth. Content is a pure function of
   progress, so it feels locked to Lenis inertia (same as timeline nodes).
------------------------------------------------------------------------- */
function PinnedTravelSlab({ progress, from = 'right', children }){
  const sign = from === 'left' ? -1 : 1;
  // Ease progress lightly so entry accelerates then settles.
  const eased = 1 - Math.pow(1 - progress, 3);
  const tx = sign * (1 - eased) * 55;                 // % — starts off-screen-ish
  const scale = 0.96 + eased * 0.04;
  const opacity = 0.35 + eased * 0.65;
  return (
    <div className="pinned-travel" style={{
      transform: `translate3d(${tx}%, 0, 0) scale(${scale})`,
      opacity,
    }}>
      {children}
    </div>
  );
}

function Chapter({ tag, title, index, children }){
  const ref = useRef(null);
  const setActive = React.useContext(ChapterCtx);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof index !== 'number') return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach(e => { if (e.isIntersecting) setActive(index); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [index, setActive]);
  return (
    <section className="chapter" ref={ref} data-chapter-index={index}>
      <div data-fx="par" data-par="6">
        <div className="ch-tag" data-fx="rise">{tag}</div>
        <h2 data-fx="split">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ChapterRail({ total, active, chapters }){
  const bp = useBreakpoint();
  const reduce = (() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch(e){ return false; }
  })();
  const list = Array.isArray(chapters) ? chapters : null;
  const count = list ? list.length : total;
  const go = (i) => {
    const node = document.querySelector('[data-chapter-index="' + i + '"]');
    if (!node) return;
    if (window.__lenis && typeof window.__lenis.scrollTo === 'function'){
      window.__lenis.scrollTo(node, { offset: -80 });
    } else {
      const y = node.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    }
  };

  // Mobile: horizontal chip-nav pinned to the top, scrolls the active chip into
  // view. Awwwards judges shouldn't have to scroll blindly through 8 chapters —
  // labels are visible, tappable, and the active state tracks the section.
  const mobileNavRef = useRef(null);
  useEffect(() => {
    if (bp !== 'mobile') return;
    const nav = mobileNavRef.current;
    if (!nav) return;
    const chip = nav.querySelector('.chapter-chip.on');
    if (chip && chip.scrollIntoView) {
      chip.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [active, bp, reduce]);

  if (bp === 'mobile'){
    return (
      <nav className="chapter-chipnav" aria-label="Chapters" ref={mobileNavRef}>
        <div className="chapter-chipnav-inner">
          {Array.from({ length: count }, (_, i) => {
            const label = (list && list[i] && list[i].label) || ('chapter ' + (i + 1));
            return (
              <button
                key={i}
                type="button"
                className={'chapter-chip' + (i === active ? ' on' : '')}
                aria-current={i === active ? 'true' : 'false'}
                onClick={() => go(i)}
              >
                <span className="chapter-chip-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="chapter-chip-label">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  const bars = [];
  for (let i = 0; i < count; i++){
    const label = (list && list[i] && list[i].label) || ('chapter ' + (i + 1));
    bars.push(
      <button
        key={i}
        type="button"
        className={'chr-bar' + (i === active ? ' on' : '')}
        aria-label={'Jump to ' + label}
        aria-current={i === active ? 'true' : 'false'}
        onClick={() => go(i)}
      />
    );
  }
  return <div className={'chapter-rail' + (reduce ? ' reduce' : '')} aria-hidden={false}>{bars}</div>;
}

/* ---------- HARD / SOFT SKILLS chapters --------------------------------
   Idle state: a left column of Syne 800 skill names (no numbers, no icons
   in the row itself). Hovering or focusing a row slides a translucent card
   into place at that row's Y (GSAP 0.4s power3.out), with a curl-noise
   WebGL galaxy bloom behind the card's logo/symbol. Both card and galaxy
   are children of a single .hs-card-anchor so they share one tween.

   Data comes from window.DATA.skills.{hard|soft}; project slugs resolve
   into window.DATA.work for the 3 mini-thumbs. The curl-noise shader is
   built on top of the existing ShaderCanvas + GLSL_PRELUDE (curl / snoise
   / fbm) so no new WebGL engine is introduced. Actual visibility of the
   galaxy is gated by the container's opacity (tweened by GSAP), which
   lets us reuse ShaderCanvas as-is: on hover the container fades in, on
   mouseleave it fades out. Under reduced-motion the shader is frozen to
   a single static frame via ShaderCanvas' `frozen` prop.

   The soft chapter uses a "curtain rise": rows stay hidden until the
   section is 30% into view (IntersectionObserver — not a new scroll
   listener), then release with an 80ms per-row transition delay.
----------------------------------------------------------------------- */
const HS_GALAXY_FRAG = `
void main(){
  vec2 uv = vUv;
  vec2 p  = uv - 0.5;
  float r = length(p);
  vec2 c1 = curl(uv * 2.0 + vec2(uTime * 0.15, uTime * 0.11));
  vec2 c2 = curl(uv * 5.0 + c1 * 0.6 - uTime * 0.08);
  float d1 = fbm(uv * 3.2 + c1 * 0.9 + uTime * 0.05);
  float d2 = fbm(uv * 7.0 + c2 * 0.4 - uTime * 0.04);
  float cloud = smoothstep(0.30, 0.90, d1) * 0.55
              + smoothstep(0.55, 0.98, d2) * 0.45;
  float hot   = smoothstep(0.78, 1.00, d2);
  float mask  = smoothstep(0.55, 0.15, r);
  float a = clamp(cloud * 0.55 + hot * 0.9, 0.0, 0.92) * mask * 0.9;
  a = max(a, 0.08 * mask); // subtle base density so a frozen frame still reads
  gl_FragColor = vec4(uAccent, a);
}`;

function SkillLogoPanel({ skill }){
  const [err, setErr] = useState(false);
  const showImg = skill.logo && !err;
  return (
    <div className="hs-fc-panel">
      {showImg
        ? <img className="hs-fc-img" src={skill.logo} alt="" draggable="false" onError={() => { if (typeof console !== 'undefined') console.warn('[skills] logo failed to load for "' + skill.id + '":', skill.logo); setErr(true); }}/>
        : (skill.symbol
            ? <span className="hs-fc-symbol">{skill.symbol}</span>
            : <span className="hs-fc-letter">{(skill.name || '?').charAt(0)}</span>)}
    </div>
  );
}

function FloatingCardContent({ skill, kind, workBySlug }){
  if (!skill) return null;
  const yearLabel = (skill.years === 1 ? '1 YEAR' : (skill.years + ' YEARS'));
  const thumbs = [0, 1, 2].map((i) => {
    const slug = (skill.projects || [])[i];
    if (!slug) return { empty: true };
    const w = workBySlug[slug];
    if (!w) return { empty: true };
    const media = w.media || {};
    const src = media.hero
      || (Array.isArray(media.breakdown) && media.breakdown[0])
      || null;
    return { slug, title: w.title, src };
  });
  return (
    <React.Fragment>
      <SkillLogoPanel key={skill.id} skill={skill}/>
      <div className="hs-fc-name">{skill.name}</div>
      <div className="hs-fc-years mono-tag">{yearLabel}</div>
      <div className="hs-fc-thumbs">
        {thumbs.map((t, i) => (
          <div key={i}
               className={'hs-fc-thumb' + (t.empty ? ' empty' : '') + (t.src ? '' : ' noimg')}
               title={t.title || ''}>
            {t.empty
              ? <span className="hs-fc-em">—</span>
              : (t.src
                  ? <img src={t.src} alt=""/>
                  : <span className="hs-fc-fallback">{t.title}</span>)}
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

/* SkillsChapter — data-driven asymmetric bento grid. Idle tiles show only
   the skill name (Syne, size laddered to col*row). Tiles drop in from above
   with rotation + stagger (local GSAP ScrollTrigger). Hover/focus lights a
   tile: a curl-noise galaxy blooms inside it (one ShaderCanvas per chapter,
   repositioned via GSAP) and a translucent card follows the cursor with soft
   lag via GSAP quickTo. Everything reads from window.DATA.skills.{kind}. */
function SkillsChapter({ kind, index, kicker, tagline }){
  const skillsAll = (window.DATA && window.DATA.skills) || {};
  const skills = (skillsAll[kind] || []);
  const work = (window.DATA && window.DATA.work) || [];
  const workBySlug = React.useMemo(
    () => { const m = {}; work.forEach(w => { m[w.slug] = w; }); return m; },
    [work]
  );
  const setActive = React.useContext(ChapterCtx);

  const [reduce] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch(e){ return false; }
  });
  const vp = useViewport();
  const bp = useBreakpoint();
  const isTouch  = vp.isTouch;
  const isMobile = bp === 'mobile';
  const isTablet = bp === 'tablet';
  const [hover, setHover] = useState(null);
  const [displayIdx, setDisplayIdx] = useState(null);
  const [galaxyOn, setGalaxyOn] = useState(false);

  const secRef       = useRef(null);
  const bentoRef     = useRef(null);
  const galaxyRef    = useRef(null);
  const cardOuterRef = useRef(null);
  const cardInnerRef = useRef(null);
  const tileRefs     = useRef([]);
  const setTile      = (i, el) => { tileRefs.current[i] = el; };
  const quickRef     = useRef(null);
  const activeRef    = useRef(false);
  const focusModeRef = useRef(false);
  const galaxyOffTimer = useRef(0);

  const CARD_W = 170, CARD_H = 248;
  // gap kept below the fixed floating nav so the card never renders under it
  const NAV_GAP = 14;

  // report active chapter to the rail (same rootMargin the shared Chapter uses)
  useEffect(() => {
    const el = secRef.current; if (!el) return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach(e => { if (e.isIntersecting) setActive(index); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [index, setActive]);

  // DROP-IN entrance — local GSAP ScrollTrigger, killed on cleanup. useScrollFX
  // has no compound drop+rotate kind, so this stays self-contained (scroll.jsx
  // is untouched). Reduced motion => opacity fade only, no transform/stagger.
  useEffect(() => {
    const gsap = window.gsap; if (!gsap) return;
    const ST = window.ScrollTrigger;
    if (ST) gsap.registerPlugin(ST);
    const tiles = tileRefs.current.filter(Boolean);
    if (!tiles.length) return;
    const st = ST ? { trigger: secRef.current, start: 'top 70%', once: true } : undefined;
    let tw;
    if (reduce){
      tw = gsap.fromTo(tiles, { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.5, ease: 'power2.out', scrollTrigger: st });
    } else {
      const stagger = kind === 'soft' ? 0.06 : 0.04;
      tw = gsap.fromTo(tiles,
        { autoAlpha: 0, y: -80, rotate: -6, transformOrigin: '50% 0%' },
        { autoAlpha: 1, y: 0, rotate: 0, duration: 0.7, ease: 'power3.out', stagger, scrollTrigger: st });
    }
    return () => { if (tw && tw.scrollTrigger) tw.scrollTrigger.kill(); if (tw) tw.kill(); };
  }, [reduce, kind]);

  // floating card: pointer tracking with soft lag via GSAP quickTo.
  // Disabled on touch (no hover) — tiles show an always-visible caption instead.
  useEffect(() => {
    if (isTouch) return;
    const outer = cardOuterRef.current;
    const gsap = window.gsap;
    if (!outer || !gsap) return;
    const qx = gsap.quickTo(outer, 'x', { duration: 0.18, ease: 'power3.out' });
    const qy = gsap.quickTo(outer, 'y', { duration: 0.18, ease: 'power3.out' });
    quickRef.current = { qx, qy };
    const onMove = (e) => {
      if (!activeRef.current || focusModeRef.current) return;
      let x = e.clientX + 24, y = e.clientY + 24;
      if (x + CARD_W > window.innerWidth)  x = e.clientX - 24 - CARD_W;
      if (y + CARD_H > window.innerHeight) y = e.clientY - 24 - CARD_H;
      // never let the card sit under the fixed nav bar
      const nav = document.querySelector('.nav-bar');
      if (nav){
        const nr = nav.getBoundingClientRect();
        const overlapsX = x < nr.right && x + CARD_W > nr.left;
        if (overlapsX && y < nr.bottom + NAV_GAP) y = nr.bottom + NAV_GAP;
      }
      if (y < 0) y = 0;
      qx(x); qy(y);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [isTouch]);

  // keep last skill on screen through fade-out; mirror hover into refs
  useEffect(() => { if (hover != null) setDisplayIdx(hover); }, [hover]);
  useEffect(() => { activeRef.current = hover != null; }, [hover]);

  // GALAXY — one ShaderCanvas per chapter, repositioned to the hovered tile.
  // RAF truly pauses: the canvas unmounts shortly after the fade-out and
  // remounts on the next hover. Reduced motion => snap, frozen frame.
  useEffect(() => {
    const gsap = window.gsap;
    const galaxy = galaxyRef.current;
    const bento = bentoRef.current;
    if (!galaxy || !bento) return;

    if (hover == null){
      if (reduce || !gsap){ galaxy.style.opacity = '0'; }
      else gsap.to(galaxy, { opacity: 0, duration: 0.30, ease: 'power3.out', overwrite: 'auto' });
      clearTimeout(galaxyOffTimer.current);
      galaxyOffTimer.current = setTimeout(() => setGalaxyOn(false), reduce ? 0 : 340);
      return;
    }
    clearTimeout(galaxyOffTimer.current);
    setGalaxyOn(true);
    const tile = tileRefs.current[hover];
    if (!tile) return;
    const br = bento.getBoundingClientRect();
    const tr = tile.getBoundingClientRect();
    const box = { left: tr.left - br.left, top: tr.top - br.top, width: tr.width, height: tr.height };
    if (reduce || !gsap){
      galaxy.style.left = box.left + 'px';
      galaxy.style.top = box.top + 'px';
      galaxy.style.width = box.width + 'px';
      galaxy.style.height = box.height + 'px';
      galaxy.style.opacity = '0.85';
    } else {
      gsap.to(galaxy, {
        left: box.left, top: box.top, width: box.width, height: box.height,
        opacity: 0.85, duration: 0.35, ease: 'power3.out', overwrite: 'auto',
      });
    }
  }, [hover, reduce]);

  // FLOATING CARD — fade in / out (+12px on leave) + content crossfade +
  // keyboard-focus anchor (top-right of the focused tile, no cursor).
  useEffect(() => {
    const gsap = window.gsap;
    const outer = cardOuterRef.current;
    const inner = cardInnerRef.current;
    if (!outer || !inner) return;

    if (hover == null){
      if (reduce || !gsap){
        inner.style.opacity = '0';
        outer.style.visibility = 'hidden';
      } else {
        gsap.to(inner, {
          autoAlpha: 0, x: 12, duration: 0.30, ease: 'power3.out', overwrite: 'auto',
          onComplete: () => { outer.style.visibility = 'hidden'; },
        });
      }
      return;
    }
    outer.style.visibility = 'visible';

    if (focusModeRef.current){
      const tile = tileRefs.current[hover];
      if (tile){
        const r = tile.getBoundingClientRect();
        let x = r.right + 12, y = r.top;
        if (x + CARD_W > window.innerWidth)  x = r.left - 12 - CARD_W;
        if (y + CARD_H > window.innerHeight) y = window.innerHeight - CARD_H - 12;
        if (quickRef.current){ quickRef.current.qx(x); quickRef.current.qy(y); }
        else if (gsap){ gsap.set(outer, { x, y }); }
      }
    }

    if (reduce || !gsap){
      inner.style.opacity = '1';
      inner.style.transform = 'none';
    } else {
      gsap.fromTo(inner,
        { autoAlpha: 0.35, x: 0 },
        { autoAlpha: 1, x: 0, duration: 0.22, ease: 'power3.out', overwrite: 'auto' });
    }
  }, [hover, displayIdx, reduce]);

  useEffect(() => () => clearTimeout(galaxyOffTimer.current), []);

  const clearHover = () => { focusModeRef.current = false; setHover(null); };
  const onBentoBlur = () => {
    setTimeout(() => {
      const b = bentoRef.current;
      if (!b) return;
      if (!b.contains(document.activeElement) && focusModeRef.current) setHover(null);
    }, 0);
  };

  const displaySkill = displayIdx != null ? skills[displayIdx] : null;

  return (
    <section
      ref={secRef}
      className={'chapter hs-chapter hs-chapter--' + kind}
      data-chapter-index={index}
      data-screen-label={kind === 'hard' ? 'Hard skills' : 'Soft skills'}>
      <div className="hs-header">
        <div className="hs-kicker mono-tag">{kicker}</div>
        <h2 className="hs-tagline" data-fx="split">{tagline}</h2>
      </div>

      <div
        ref={bentoRef}
        className={'hs-bento hs-bento--' + kind}
        style={isMobile ? { gridTemplateColumns:'1fr' } : (isTablet ? { gridTemplateColumns:'repeat(2,1fr)' } : undefined)}
        onMouseLeave={clearHover}
        onBlur={onBentoBlur}>
        <div ref={galaxyRef} className="hs-galaxy" aria-hidden="true">
          {galaxyOn && !isMobile && (
            <ShaderCanvas frag={HS_GALAXY_FRAG} accent="#7dd3fc" plain frozen={reduce}/>
          )}
        </div>

        {skills.map((s, i) => {
          // col/row from skills.json are a desktop hint only: 2 cols on tablet,
          // 1 on mobile, zero overlap at any size.
          const col = isMobile ? 1 : (isTablet ? Math.min(s.col || 1, 2) : (s.col || 1));
          const row = isMobile ? 1 : (s.row || 1);
          const area = col * row;
          const nameSize = area >= 4 ? 44 : (area === 2 ? 28 : 20);
          const yearLabel = (s.years === 1 ? '1 YEAR' : ((s.years || 0) + ' YEARS'));
          return (
            <button
              key={s.id}
              ref={(el) => setTile(i, el)}
              type="button"
              className={'hs-tile' + (hover === i ? ' is-lit' : '')}
              style={{ '--col': col, '--row': row }}
              data-cursor="hover"
              aria-label={s.name}
              onMouseEnter={() => { if (isTouch) return; focusModeRef.current = false; setHover(i); }}
              onMouseMove={() => { if (isTouch) return; if (hover !== i){ focusModeRef.current = false; setHover(i); } }}
              onFocus={() => { if (isTouch) return; focusModeRef.current = true; setHover(i); }}>
              <span className="hs-tile-name" style={{ fontSize: nameSize + 'px' }}>{s.name}</span>
              {isTouch && <span className="hs-tile-cap mono-tag" style={{ display:'block', marginTop:8, fontSize:11, color:'var(--text-mid,#5c5a6e)' }}>{yearLabel}</span>}
            </button>
          );
        })}
      </div>

      {!isTouch && (
        <div
          ref={cardOuterRef}
          className="hs-floatcard"
          role="dialog"
          aria-live="polite"
          aria-label={displaySkill ? displaySkill.name : ''}>
          <div ref={cardInnerRef} className="hs-floatcard-inner">
            <FloatingCardContent skill={displaySkill} kind={kind} workBySlug={workBySlug}/>
          </div>
        </div>
      )}
    </section>
  );
}

function HardSkills({ index }){
  return (
    <SkillsChapter
      kind="hard"
      index={index}
      kicker="04 · HARD SKILLS"
      tagline={'“The software she trusts.”'}/>
  );
}
function SoftSkills({ index }){
  return (
    <SkillsChapter
      kind="soft"
      index={index}
      kicker="05 · SOFT SKILLS"
      tagline={'“What she brings to the room.”'}/>
  );
}

function CountUp({ to, dur=1400 }){
  const [n, setN] = useState(0);
  const ref = useRef(null);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const io = new IntersectionObserver(es=>{
      if(es[0].isIntersecting){
        io.disconnect();
        const start = performance.now();
        const tick = (now)=>{ const p=Math.min(1,(now-start)/dur); const e=1-Math.pow(1-p,3);
          setN(Math.round(e*to)); if(p<1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
    }, { threshold:0.5 });
    io.observe(el); return ()=>io.disconnect();
  }, [to]);
  return <span ref={ref}>{String(n).padStart(2,'0')}</span>;
}

function StatsGrid(){
  const ref = useReveal({ threshold:0.3 });
  const { lang } = useLang();
  // counts derived from JSON where it makes sense
  const certs = (window.DATA && window.DATA.certifications) || [];
  const langs = (window.DATA && window.DATA.skills && window.DATA.skills.languages) || [];
  const milestones = (window.DATA && window.DATA.milestones) || [];
  const cartoon = milestones.filter(m => /Cartoon/.test(m.org || '')).length;
  const stats = [
    { n: certs.length || 4, label:{es:'premios',en:'awards',zh:'获奖'} },
    { n: langs.length || 3, label:{es:'idiomas',en:'languages',zh:'语言'} },
    { n: cartoon || 2,      label:{es:'años Cartoon Springboard',en:'years Cartoon Springboard',zh:'年 Cartoon Springboard'} },
    { n: 5,                 label:{es:'años creando',en:'years crafting',zh:'年创作'} },
  ];
  return (
    <div ref={ref} className="about-stats reveal">
      {stats.map((s,i)=>(
        <div className="astat" key={i}>
          <div className="astat-num"><CountUp to={s.n}/></div>
          <div className="astat-label" data-fx="split">{tr(s.label,lang)}</div>
        </div>
      ))}
    </div>
  );
}

function LangBars(){
  const { lang } = useLang();
  const ref = useReveal({ threshold:0.4 });
  const [show, setShow] = useState(false);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const io = new IntersectionObserver(e=>{ if(e[0].isIntersecting){ setShow(true); io.disconnect(); } }, { threshold:0.4 });
    io.observe(el); return ()=>io.disconnect();
  }, []);
  const langs = ((window.DATA && window.DATA.skills && window.DATA.skills.languages) || []).map(l => ({
    code: l.code, name: l.name, lvl: l.level, tag: tr(l.tag, lang),
  }));
  return (
    <div ref={ref} className="lang-bars reveal">
      {langs.map(l=>(
        <div className="lang-row" key={l.code}>
          <div className="lang-code">{l.code}</div>
          <div className="lang-name">{l.name}</div>
          <div className="lang-track"><span style={{transform:`scaleX(${show?l.lvl:0})`}}></span></div>
          <div className="lang-tag">{l.tag}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- ABOUT LIQUID MEDALS · aura fragment shader ----------
   A centered radial blob whose radius + opacity breathe via fbm. Wakes up
   (uReveal, set by ShaderCanvas when the row enters the viewport) with a
   burst of turbulence, then settles into a slow resting breath. Hover on
   the row (uHover, bound via hoverRef) stirs the pool a little more.
   SEED varies the pattern per row so no two pools breathe alike. */
function medalFrag(seed){
  return `
uniform float uReveal;
#define SEED ${seed}
void main(){
  vec2 uv = vUv - 0.5;
  float r  = length(uv);
  float t  = uTime*0.55 + SEED;
  float turb = 0.09 + uReveal*0.34 + uHover*0.16;      // rest / wake / hover
  float n = fbm(uv*3.4 + vec2(t*0.5, -t*0.42) + SEED);
  float radius = 0.30 + 0.045*sin(uTime*1.1 + SEED) + n*turb;
  float blob = smoothstep(radius, radius*0.30, r);      // soft-edged pool
  float halo = smoothstep(0.52, 0.0, r);                // outer glow
  float a = clamp(blob*0.52 + halo*0.20, 0.0, 1.0);
  a *= (0.42 + uReveal*0.95 + uHover*0.5);              // asleep until woken
  gl_FragColor = vec4(uAccent, a);
}`;
}

function AwardRow({ a, i }){
  const { lang } = useLang();
  const ref = useReveal({ threshold:0.5 });
  const frozen = (() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
          || window.matchMedia('(max-width:760px)').matches;
    } catch(e){ return false; }
  })();
  const frag = medalFrag((i*1.7 + 0.6).toFixed(2));
  return (
    <div ref={ref} className="award-row reveal" style={{transitionDelay:(i*0.07)+'s'}}>
      <span className="award-medal">
        <span className="award-aura" aria-hidden="true">
          <ShaderCanvas frag={frag} accent="#7dd3fc" variant={i} plain frozen={frozen} hoverRef={ref}/>
        </span>
        {a.medal}
      </span>
      <span className="award-place">{tr(a.place,lang)}</span>
      <span className="award-event">{a.event}</span>
      <span className="award-year">{a.year}</span>
    </div>
  );
}

function AwardsList(){
  const awards = (window.DATA && window.DATA.certifications) || [];
  return (
    <div className="awards-list">
      {awards.map((a,i)=><AwardRow key={i} a={a} i={i}/>)}
    </div>
  );
}

/* ---------- MEJORA 1A · Lenis layered parallax for the About hero ----------
   Three depth planes driven directly off window.__lenis scroll position.
   bg (dot field) drifts slowest, the name block mid, the quote fastest —
   building real parallax depth. Fully bypassed under reduced-motion / no Lenis. */
function useAboutParallax(){
  const bg = useRef(null), mid = useRef(null), front = useRef(null);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.gsap || !window.__lenis) return;
    const lenis = window.__lenis;
    const setters = [];
    const mk = (el, dur) => el ? window.gsap.quickTo(el, 'y', { duration: dur, ease: 'power3.out', overwrite: 'auto' }) : null;
    const qBg = mk(bg.current, 0.9), qMid = mk(mid.current, 0.55), qFront = mk(front.current, 0.4);
    const apply = (e) => {
      const s = (e && typeof e.scroll === 'number') ? e.scroll : (lenis.scroll || 0);
      if (s > window.innerHeight * 1.3) return;   // only animate while hero is on/near screen
      if (qBg) qBg(s * 0.08);
      if (qMid) qMid(s * 0.30);
      if (qFront) qFront(s * 0.60);
    };
    lenis.on('scroll', apply);
    apply({ scroll: lenis.scroll || window.scrollY || 0 });
    return () => { try { lenis.off('scroll', apply); } catch(e){} };
  }, []);
  return { bg, mid, front };
}

function About(){
  const t = useT();
  const { log } = useToast();
  const { lang } = useLang();
  const bp = useBreakpoint();
  const fxRef = useScrollFX([bp]);   // re-process [data-fx] reveals on breakpoint change
  const px = useAboutParallax();
  const bio = (window.DATA && window.DATA.bio) || {};
  const a   = bio.about || {};
  const [activeChapter, setActiveChapter] = useState(0);
  useEffect(()=>{ log('// reassembling fragments...'); }, []);
  // pull bio paragraphs from bio.json with a fallback to legacy STRINGS table
  const quote = (a.quote && tr(a.quote, lang)) || t('about.quote');
  const whoB  = (a.who && tr(a.who, lang))    || t('about.who_b');
  const whoB2 = (a.who_extended && tr(a.who_extended, lang)) || t('about.who_b2');
  const howB  = (a.how && tr(a.how, lang))    || t('about.how_b');
  return (
    <ChapterCtx.Provider value={setActiveChapter}>
    <div className="page about" ref={fxRef} data-screen-label="About">
      <ChapterRail chapters={ABOUT_CHAPTERS} active={activeChapter}/>
      <section className="about-hero">
        <div className="about-hero-bg" ref={px.bg} aria-hidden="true">
          <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="aboutDots" width="36" height="36" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.4" fill="currentColor"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#aboutDots)"/>
          </svg>
        </div>
        <div className="about-hero-stack">
          <div className="about-hero-mid" ref={px.mid}>
            <div className="eyebrow" style={{marginBottom:24}}>{t('about.eyebrow')}</div>
            <GlitchName text="YI-TING"/>
            <GlitchName text="YANG TANG"/>
          </div>
          <p className="about-quote" data-fx="split" ref={px.front}>{quote}</p>
          <ImageSlot id="portrait" className="img-slot-about"/>
        </div>
      </section>

      <div className="about-chapters">
        <Chapter index={0} tag={t('about.who_h')} title={tr({es:'La persona detrás de las superficies',en:'The person behind the surfaces',zh:'表面背后的人'},lang)}>
          <LateralEntrance from="left">
            <CentrifugalText text={whoB} mode="words"/>
            <p className="ch-body" style={{color:'var(--text-mid)',fontSize:'clamp(15px,1.5vw,18px)'}}>{whoB2}</p>
          </LateralEntrance>
        </Chapter>

        {/* sliding-window timeline placed right under the bio per spec */}
        <Chapter index={1} tag={t('about.timeline_h')} title={tr({es:'Línea de tiempo · ventana de 5',en:'Timeline · window of 5',zh:'时间线 · 5 项滑动窗口'},lang)}>
          <HorizontalTimeline/>
        </Chapter>

        <Chapter index={2} tag={t('about.how_h')} title={tr({es:'El oficio al servicio de la historia',en:'Craft in service of story',zh:'让工艺服务于故事'},lang)}>
          <LateralEntrance from="right">
            <CentrifugalText text={howB} mode="words"/>
          </LateralEntrance>
        </Chapter>

        <Chapter index={3} tag={t('about.stats_h')} title={tr({es:'En cifras',en:'By the numbers',zh:'数字一览'},lang)}>
          <PinnedChapter travel={120}>
            {(p) => (
              <PinnedTravelSlab progress={p}>
                <StatsGrid/>
              </PinnedTravelSlab>
            )}
          </PinnedChapter>
        </Chapter>

        <HardSkills index={4}/>

        <SoftSkills index={5}/>

        <Chapter index={6} tag={t('about.langs_h')} title={tr({es:'Trilingüe de nacimiento',en:'Trilingual by nature',zh:'天生三语'},lang)}>
          <PinnedChapter travel={120}>
            {(p) => (
              <PinnedTravelSlab progress={p}>
                <LangBars/>
              </PinnedTravelSlab>
            )}
          </PinnedChapter>
        </Chapter>

        <Chapter index={7} tag={t('about.awards_h')} title={tr({es:'Lo que dicen los jurados',en:'What the juries say',zh:'评审怎么说'},lang)}>
          <PinnedChapter travel={140}>
            {(p) => (
              <PinnedTravelSlab progress={p}>
                <AwardsList/>
              </PinnedTravelSlab>
            )}
          </PinnedChapter>
        </Chapter>
      </div>
    </div>
    </ChapterCtx.Provider>
  );
}

/* -------------------------------------------------------------------
   Chapter rail labels — 8 entries, matching data-chapter-index values.
   Only indices 4 & 5 changed this pass; the rest reflect the pre-existing
   chapters. Referenced by <ChapterRail chapters={ABOUT_CHAPTERS} .../>.
------------------------------------------------------------------- */
const ABOUT_CHAPTERS = [
  { id: 'who',         label: 'Who' },
  { id: 'timeline',    label: 'Timeline' },
  { id: 'how',         label: 'How' },
  { id: 'stats',       label: 'By the numbers' },
  { id: 'hard-skills', label: 'Hard skills' },
  { id: 'soft-skills', label: 'Soft skills' },
  { id: 'languages',   label: 'Languages' },
  { id: 'awards',      label: 'Awards' },
];

Object.assign(window, { About, HardSkills, SoftSkills, HorizontalTimeline, PinnedChapter, LateralEntrance, ABOUT_CHAPTERS });
