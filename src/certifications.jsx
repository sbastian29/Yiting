/* ===================================================================
   certifications.jsx — Standalone Certifications page.
   Self-contained: no SPA router, no external lib.jsx dependency.

   Grid layout (ScrollTrigger-driven sticky stage):
     • Fixed-height viewport (CSS sticky) clips a tile grid. ScrollTrigger
       translates the grid upward on page scroll, so tiles slide past
       while filter pills/preview panel/counter stay pinned.
     • Filter pills (TODOS + one per `type`). Clicking triggers a
       decorative overlay wipe (90% base bg + 10% type tint) while
       filter applies synchronously.

   Interactions:
     • Hover (desktop, capable device): dims all other tiles to 0.18;
       right column shows badge + name + blurb preview. Under touch or
       no-hover media query: tiles show name+year caption directly.
     • Click tile: opens full-viewport modal (badge left, metadata
       right). ESC or backdrop closes. ←/→ arrows + buttons navigate
       within the filtered subset. Focus trap active; siblings inert.

   Features:
     • Body scroll lock, ref-counted so nested overlays (modal + nav)
       don't interfere.
     • Reactive matchMedia: hover capability + reduced-motion
       re-evaluate on OS toggle.
     • Loader: 600ms progress counter, skipped on sessionStorage flag
       (repeat visits in same session).
     • Fallback badges: per-type SVG icon (award/scholarship/
       certification/recognition) in type color when image missing.
     • Data: loaded once from data/certifications.json → window.CERTS_DATA.

   =================================================================== */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* Register ScrollTrigger defensively — certifications.html loads gsap.min.js
   then ScrollTrigger.min.js, but registration may not have run yet elsewhere.
   gsap.registerPlugin() is idempotent so calling it again is harmless. */
if (typeof window !== 'undefined' && window.gsap && window.ScrollTrigger) {
  window.gsap.registerPlugin(window.ScrollTrigger);
}

const prefersReduce = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
};
const hoverCapable = () => {
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
  catch (e) { return true; }
};

/* ---- body scroll lock, ref-counted so nested lockers don't clobber
   each other (modal open while nav is also open, etc.) ---- */
let _lockCount = 0;
function lockBody() {
  if (_lockCount === 0) document.body.style.overflow = 'hidden';
  _lockCount++;
}
function unlockBody() {
  _lockCount = Math.max(0, _lockCount - 1);
  if (_lockCount === 0) document.body.style.overflow = '';
}

/* ---- single global Escape listener + per-layer stack, so stacked
   overlays (modal over nav) only close the topmost one per press ---- */
const _escStack = [];
function pushEsc(fn) {
  _escStack.push(fn);
  return () => {
    const i = _escStack.indexOf(fn);
    if (i >= 0) _escStack.splice(i, 1);
  };
}
if (typeof window !== 'undefined' && !window.__certsEscBound) {
  window.__certsEscBound = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = _escStack[_escStack.length - 1];
    if (top) { top(e); e.stopPropagation(); }
  }, { capture: true });
}

/* ---- reactive matchMedia hook, for prefs that can change post-mount
   (OS reduced-motion toggle, mouse plugged into a touch device) ---- */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    try { return window.matchMedia(query).matches; } catch (e) { return false; }
  });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch (e) { return; }
    const on = (e) => setMatches(e.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    setMatches(mq.matches);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, [query]);
  return matches;
}

/* ---- focus trap for modal-like overlays: saves + restores focus,
   moves initial focus in, traps Tab within root, and inerts the
   known page-root siblings while active ---- */
function useFocusTrap(rootRef, isActive) {
  const returnFocusRef = useRef(null);
  useEffect(() => {
    if (!isActive) return;
    const root = rootRef.current;
    if (!root) return;
    returnFocusRef.current = document.activeElement;

    const raf = requestAnimationFrame(() => {
      const first = root.querySelector('[data-autofocus], .cert-modal-close, button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    });

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = root.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    };
    root.addEventListener('keydown', onKey);

    // inert the known page roots (not every body child — the modal itself
    // is a fixed-position sibling of these, not a descendant of them)
    const siblings = Array.from(document.querySelectorAll('.certs-nav, .certs-shell, .certs-curtain'));
    const prev = siblings.map(el => ({ el, inert: el.inert, aria: el.getAttribute('aria-hidden') }));
    siblings.forEach(el => { el.inert = true; el.setAttribute('aria-hidden', 'true'); });

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('keydown', onKey);
      prev.forEach(({ el, inert, aria }) => {
        el.inert = inert;
        if (aria == null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', aria);
      });
      const rf = returnFocusRef.current;
      if (rf && document.contains(rf) && typeof rf.focus === 'function') rf.focus();
    };
  }, [isActive]);
}

/* tiny i18n picker — mirrors the site's {es,en,zh} node shape */
function tr(node, lang) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  return node[lang] ?? node.en ?? '';
}

const UI = {
  eyebrow: { es: 'Las credenciales', en: 'The credentials', zh: '资历凭证' },
  title:   { es: 'Certificaciones', en: 'Certifications', zh: '认证' },
  sub: {
    es: 'Premios, becas y reconocimientos que jalonan el recorrido. Pasa el cursor sobre una pieza para ver su nombre; haz clic para entrar en detalle.',
    en: 'Awards, scholarships and recognitions marking the journey. Hover a piece to reveal its name; click to step into detail.',
    zh: '沿途的奖项、奖学金与荣誉。将光标悬停在卡片上可查看名称；点击进入详情。',
  },
  all:     { es: 'TODOS', en: 'ALL', zh: '全部' },
  counter: { es: 'certificaciones', en: 'certifications', zh: '认证' },
  readMore:{ es: 'Saber más', en: 'Read more', zh: '了解更多' },
  backAll: { es: 'Volver a todas las certificaciones', en: 'Back to all certifications', zh: '返回全部认证' },
  close:   { es: 'Cerrar', en: 'Close', zh: '关闭' },
  others:  { es: 'Otras', en: 'Others', zh: '其他' },
  verify:  { es: 'Verificar credencial', en: 'Verify credential', zh: '验证凭证' },
  issuer:  { es: 'Emisor', en: 'Issuer', zh: '颁发方' },
  date:    { es: 'Fecha', en: 'Date', zh: '日期' },
};

/* category label per `type` value */
const TYPE_LABELS = {
  award:         { es: 'Premio',         en: 'Award',         zh: '奖项' },
  scholarship:   { es: 'Beca',           en: 'Scholarship',   zh: '奖学金' },
  certification: { es: 'Certificación',  en: 'Certification', zh: '认证' },
  recognition:   { es: 'Reconocimiento', en: 'Recognition',   zh: '荣誉' },
};
const typeLabel = (t, lang) => tr(TYPE_LABELS[t] || t, lang);

/* Types with persistent color + icon (intentional exception to the
   hover-only accent rule). All other types render neutral. */
const TYPED = new Set(['award', 'scholarship']);

/* Hex values mirroring the CSS custom properties on .certs-page — used
   only for the JS-driven filter curtain, whose background needs a real
   color value (10% tint of the type over the base bg). */
const TYPE_COLOR_HEX = {
  award:         '#fbbf7a',
  scholarship:   '#c4b5fd',
  certification: '#7dd3fc',
  recognition:   '#94a3b8',
};
const PAGE_ACCENT_HEX = '#7dd3fc';
const BG_HEX = '#060608';

/* Inline SVGs — currentColor so they inherit the per-type color set
   via CSS custom properties on the containing element. 1.5 stroke to
   match the sitewide icon weight. */
function TypeIcon({ type, className }) {
  const cls = className || 'cert-type-ico';
  if (type === 'award') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/>
        <path d="M7 5H4v2a3 3 0 0 0 3 3"/>
        <path d="M17 5h3v2a3 3 0 0 1-3 3"/>
        <path d="M9 20h6"/>
        <path d="M12 12v8"/>
      </svg>
    );
  }
  if (type === 'scholarship') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 9l10-5 10 5-10 5-10-5z"/>
        <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
        <path d="M22 9v5"/>
      </svg>
    );
  }
  if (type === 'certification') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="14" rx="2"/>
        <path d="M7 9h10M7 13h6"/>
        <path d="M15 20l2-2 2 2v-4"/>
      </svg>
    );
  }
  if (type === 'recognition') {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2l2.5 6 6.5.5-5 4.5 1.5 6.5L12 16l-5.5 3.5L8 13l-5-4.5 6.5-.5z"/>
      </svg>
    );
  }
  return null;
}

const codeFor = (i) => 'Y4/CERT_' + String(i + 1).padStart(2, '0');

/* ---- badge with graceful placeholder on missing/broken image ---- */
function Badge({ cert, wrapClass, note }) {
  const [err, setErr] = useState(false);
  const showImg = cert.badge && !err;
  return (
    <div className={wrapClass}>
      {showImg
        ? <img className="cert-badge-img" src={cert.badge} alt=""
               draggable="false" onError={() => setErr(true)} />
        : (
          <div className="cert-badge-ph" data-type={cert.type}>
            <TypeIcon type={cert.type} className="cbp-icon" />
            {note && <span className="cbp-note">{note}</span>}
          </div>
        )}
    </div>
  );
}

/* ---- flip-text label: two stacked spans, top slides up on hover ---- */
function FlipLabel({ text }) {
  return (
    <span className="cf-flip" aria-hidden="false">
      <span className="cf-flip-a">{text}</span>
      <span className="cf-flip-b" aria-hidden="true">{text}</span>
    </span>
  );
}

/* ================== RAIL (image-tile mosaic) + CENTER PREVIEW (State A) ==================
   Scroll model (v3): the entire layout is pinned via sticky. The tile column is a fixed-
   height viewport; the tile grid inside translates upward as page scroll progresses. No
   batch pagination — every filtered item is rendered once, tiles just scroll past.
   ============================================================================ */

function Grid({ certs, lang, onOpen, filter, setFilter, types, hoverEnabled }) {
  const [hovered, setHovered] = useState(null);   // index currently hovered
  const [shownIdx, setShownIdx] = useState(null); // last cert shown in preview (persists during fade-out)
  const wrapRef = useRef(null);                   // tall outer that provides scroll distance
  const viewportRef = useRef(null);               // fixed-height clipping window for tiles
  const scrollerRef = useRef(null);                // <ul> that translates upward

  const shown = useMemo(
    () => certs.map((c, i) => ({ c, i })).filter(x => !filter || x.c.type === filter),
    [certs, filter]
  );

  // scroll distance grows with the number of extra rows past the visible 3
  const rowsShown = Math.ceil(shown.length / 2);
  const extraRows = Math.max(0, rowsShown - 3);
  const canPin = extraRows > 0 && hoverEnabled;
  const trackHeight = (100 + extraRows * 28) + 'vh';

  useEffect(() => { if (hovered !== null) setShownIdx(hovered); }, [hovered]);

  /* Clip-path skew + fade reveal on filter change / mount. Runs against the tiles
     currently in the DOM — pure in-place re-render, no route change. */
  useEffect(() => {
    const g = window.gsap;
    const grid = scrollerRef.current;
    if (!grid) return;
    const tiles = grid.querySelectorAll('.cert-tile');
    if (!tiles.length) return;
    if (!g || prefersReduce()) {
      tiles.forEach(t => {
        t.style.clipPath = 'polygon(0% 100%, 100% 100%, 100% 0%, 0% 0%)';
        t.style.opacity = '1';
      });
      return;
    }
    g.killTweensOf(tiles);
    // per gsap-performance SKILL: will-change only while the tween is
    // actually running — toggled via onStart/onComplete instead of a
    // permanent CSS will-change (see .is-animating in certifications.css).
    const tileList = Array.from(tiles);
    g.fromTo(tiles,
      { clipPath: 'polygon(0% 100%, 100% 100%, 120% 0%, 0% 0%)', opacity: 0 },
      {
        clipPath: 'polygon(0% 100%, 100% 100%, 100% 0%, 0% 0%)',
        opacity: 1,
        duration: 0.5,
        ease: 'power3.out',
        stagger: 0.04,
        overwrite: 'auto',
        onStart: () => tileList.forEach(t => t.classList.add('is-animating')),
        onComplete: () => tileList.forEach(t => t.classList.remove('is-animating')),
      }
    );
  }, [filter]);

  /* pin + scroll-driven translate. Maps window scroll progress across the tall
     wrapper to an upward translate on the tile grid, so items slide past the
     fixed viewport while pills / preview / counter stay put.

     per gsap-scrolltrigger SKILL: standalone ScrollTrigger.create() (no linked
     tween) driving a custom onUpdate, with invalidateOnRefresh so the cached
     overflow measurement is recomputed on resize / font-load reflow instead
     of going stale (avoids the layout-forcing getBoundingClientRect() reads
     that used to run on every scroll/rAF tick). pin: false because
     .certs-pin-sticky already pins via CSS position:sticky — ST only drives
     the scrub math to replace the manual rAF + translate3d. */
  useEffect(() => {
    if (!canPin) return;
    const g = window.gsap;
    const ST = window.ScrollTrigger;
    if (!g || !ST) return; // graceful fallback: no pin, static layout still works
    g.registerPlugin(ST);

    const wrap = wrapRef.current;
    const viewport = viewportRef.current;
    const scroller = scrollerRef.current;
    if (!wrap || !viewport || !scroller) return;

    let overflow = 0;

    const st = ST.create({
      trigger: wrap,
      start: 'top top',
      end: 'bottom bottom',
      pin: false,          // CSS sticky already pins; ST only drives scrub
      scrub: 0.4,           // small smoothing — better than the old 0.05s CSS transition
      invalidateOnRefresh: true,
      onRefresh: () => {
        overflow = Math.max(0, scroller.scrollHeight - viewport.clientHeight);
      },
      onUpdate: (self) => {
        // per gsap-performance SKILL: gsap.set is a fast property setter,
        // avoids the overhead of writing to .style.transform directly
        g.set(scroller, { y: -overflow * self.progress });
      },
      // per gsap-performance SKILL: will-change only while actually pinned /
      // in view — toggled via .is-scrolling (see certifications.css), not a
      // permanent CSS declaration.
      onEnter: () => scroller.classList.add('is-scrolling'),
      onEnterBack: () => scroller.classList.add('is-scrolling'),
      onLeave: () => scroller.classList.remove('is-scrolling'),
      onLeaveBack: () => scroller.classList.remove('is-scrolling'),
    });

    return () => { st.kill(); scroller.classList.remove('is-scrolling'); };
  }, [canPin, shown.length]);

  const previewCert = shownIdx !== null ? certs[shownIdx] : null;
  const previewOn = hoverEnabled && hovered !== null;
  const items = shown;

  /* Filter curtain: rises from below, 90% base + 10% type-color tint. Applies the
     new filter mid-animation while the screen is covered, then retracts upward.
     Under prefers-reduced-motion / no GSAP: just swap instantly. */
  const curtainRef = useRef(null);
  const changeFilter = useCallback((next) => {
    if (next === filter) return;
    setFilter(next); // apply immediately — curtain below is purely decorative
    const g = window.gsap;
    const el = curtainRef.current;
    if (!g || !el || prefersReduce()) return;
    const tint = next ? (TYPE_COLOR_HEX[next] || PAGE_ACCENT_HEX) : PAGE_ACCENT_HEX;
    // 90/10 mix rendered as two stacked layers via a CSS variable
    el.style.setProperty('--curtain-tint', tint);
    g.killTweensOf(el);
    const tl = g.timeline();
    tl.set(el, { yPercent: 100, autoAlpha: 1 })
      .to(el, { yPercent: 0, duration: 0.28, ease: 'power3.inOut' })
      .to(el, { yPercent: -100, duration: 0.32, ease: 'power3.inOut' }, '+=0.05')
      .set(el, { autoAlpha: 0, yPercent: 100 });
  }, [filter, setFilter]);

  const filterPills = (
    <div className="certs-filter" role="group" aria-label="Filter by type">
      <button
        type="button"
        className={'cf-pill' + (filter === null ? ' is-active' : '')}
        aria-pressed={filter === null}
        onClick={() => changeFilter(null)}
      >
        <FlipLabel text={tr(UI.all, lang)} />
      </button>
      {types.map(t => (
        <button
          key={t}
          type="button"
          data-type={TYPED.has(t) ? t : undefined}
          className={'cf-pill' + (filter === t ? ' is-active' : '')}
          aria-pressed={filter === t}
          onClick={() => changeFilter(filter === t ? null : t)}
        >
          <FlipLabel text={typeLabel(t, lang)} />
        </button>
      ))}
    </div>
  );

  const railLayout = (
    <div className="certs-rail-layout">
      {/* left: image-only mosaic of badge tiles, inside a fixed-height viewport
          that clips the tile grid as it translates upward on scroll. */}
      <div
        className="certs-tilewrap"
        onMouseLeave={() => setHovered(null)}
      >
        <div className="certs-tile-viewport" ref={viewportRef}>
          <ul
            className={'certs-tilegrid' + (hovered !== null ? ' is-hovering' : '')}
            ref={scrollerRef}
            onFocus={hoverEnabled ? (e) => {
              const btn = e.target.closest('.cert-tile');
              if (!btn) return;
              const idx = Number(btn.dataset.i);
              if (!Number.isNaN(idx)) setHovered(idx);
              // TODO(a11y-scroll-into-view): compute progress from focused tile Y and
              // window.scrollTo instead of relying on browser auto-scroll into the mask.
            } : undefined}
            onBlur={hoverEnabled ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null);
            } : undefined}
          >
            {items.map(({ c, i }, pos) => {
              const isTyped = TYPED.has(c.type);
              return (
                <li key={i}>
                  <button
                    type="button"
                    data-type={isTyped ? c.type : undefined}
                    data-i={i}
                    className={'cert-tile' + (hovered === i ? ' is-active' : '')}
                    aria-label={tr(c.name, lang)}
                    onMouseEnter={() => hoverEnabled && setHovered(i)}
                    onClick={() => onOpen(pos)}
                  >
                    <span className="cert-tile-panel">
                      <Badge cert={c} wrapClass="cert-tile-badge" note={typeLabel(c.type, lang)} />
                    </span>
                    <span className="cert-tile-num">{String(i + 1).padStart(2, '0')}</span>
                    {isTyped && (
                      <span className="cert-tile-chip" aria-hidden="true">
                        <TypeIcon type={c.type} />
                      </span>
                    )}
                    {!hoverEnabled && (
                      <span className="cert-tile-caption">
                        <span className="ctc-name">{tr(c.name, lang)}</span>
                        <span className="ctc-year">{tr(c.date, lang) || c.year}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <RailLegend lang={lang} />
      </div>

      {/* right: genuinely empty until a tile is hovered */}
      <div className="certs-preview-area" aria-hidden="true">
        <div className={'certs-preview' + (previewOn ? ' is-on' : '')}>
          {previewCert && (
            <React.Fragment>
              <Badge cert={previewCert} wrapClass="certs-preview-badge"
                     note={typeLabel(previewCert.type, lang)} />
              <div className="certs-preview-name">{tr(previewCert.name, lang)}</div>
              <p className="certs-preview-desc">{tr(previewCert.blurb, lang)}</p>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );

  const counter = (
    <div className="certs-counter">
      {tr(UI.counter, lang)} ({String(shown.length).padStart(2, '0')})
    </div>
  );

  const curtain = <div className="certs-curtain" ref={curtainRef} aria-hidden="true"><span/></div>;

  // Pinned: sticky stage that fills the viewport for the whole scroll sequence.
  if (canPin) {
    return (
      <div className="certs-view" key="rail">
        {curtain}
        <div className="certs-pin-wrap" ref={wrapRef} style={{ height: trackHeight, position: 'relative' }}>
          <div
            className="certs-pin-sticky"
            style={{ position: 'sticky', top: 0, height: '100dvh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div className="certs-pin-pills">{filterPills}</div>
            <div className="certs-pin-stage">{railLayout}</div>
            <div className="certs-pin-counter">{counter}</div>
          </div>
        </div>
      </div>
    );
  }

  // Static (short lists / reduced-motion / no-hover): original in-flow layout.
  return (
    <div className="certs-view" key="rail">
      {curtain}
      {filterPills}
      {railLayout}
      {counter}
    </div>
  );
}

/* ---- persistent color+icon legend, lives inside the tile column ---- */
function RailLegend({ lang }) {
  const legendCopy = { es: 'Leyenda', en: 'Legend', zh: '图例' };
  return (
    <div className="certs-legend" role="note" aria-label={tr(legendCopy, lang)}>
      <span className="certs-legend-label">{tr(legendCopy, lang)}</span>
      <span className="certs-legend-item" data-type="award">
        <TypeIcon type="award" className="certs-legend-ico" />
        <span className="certs-legend-txt">{typeLabel('award', lang)}</span>
      </span>
      <span className="certs-legend-item" data-type="scholarship">
        <TypeIcon type="scholarship" className="certs-legend-ico" />
        <span className="certs-legend-txt">{typeLabel('scholarship', lang)}</span>
      </span>
    </div>
  );
}

/* ==================== FULL-SCREEN MODAL (detail view) ==================== */
/* Lightbox-style overlay: big badge on the left, all metadata on the right.
   ESC or backdrop click closes; ← / → step between certifications.
   Renders into document.body via a fixed overlay — no portal needed since
   nothing above it in the tree constrains its stacking context. */
function CertModal({ certs, lang, index, onClose, onNav, filter }) {
  const overlayRef = useRef(null);
  const cardRef = useRef(null);
  const backdropRef = useRef(null);

  useFocusTrap(overlayRef, true);

  // visible subset (respects the active grid filter) + absolute index per
  // item, so nav arrows stay within the filtered set while codeFor() keeps
  // showing each cert's canonical (unfiltered) identity.
  const visibleCerts = useMemo(
    () => certs.map((c, i) => ({ c, i })).filter(x => !filter || x.c.type === filter),
    [certs, filter]
  );
  const item = visibleCerts[index] || visibleCerts[0];
  const c = item.c;
  const absIndex = item.i;

  // mount-only entrance tween — runs once, not on every prev/next
  useEffect(() => {
    const g = window.gsap;
    const o = overlayRef.current, card = cardRef.current;
    if (!o || !card) return;
    if (!g || prefersReduce()) {
      o.style.opacity = '1';
      card.style.opacity = '1';
      card.style.transform = 'none';
      return;
    }
    let safety;
    try {
      g.fromTo(o, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power2.out' });
      g.fromTo(card,
        { autoAlpha: 0, y: 24, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
      );
    } catch (e) {
      o.style.opacity = '1'; card.style.opacity = '1'; card.style.transform = 'none';
    }
    // fallback in case the tween is killed/errors before it ever paints
    safety = setTimeout(() => {
      if (card && getComputedStyle(card).opacity === '0') {
        card.style.opacity = '1';
        card.style.transform = 'none';
      }
    }, 800);
    return () => clearTimeout(safety);
  }, []);

  // on prev/next: cross-fade only the inner media/body, not the whole card
  useEffect(() => {
    const g = window.gsap;
    const card = cardRef.current;
    if (!card || !g || prefersReduce()) return;
    const media = card.querySelector('.cmc-media');
    const body = card.querySelector('.cmc-body');
    if (!media || !body) return;
    g.fromTo([media, body], { autoAlpha: 0.4 }, { autoAlpha: 1, duration: 0.22, ease: 'power2.out' });
  }, [index]);

  // body scroll lock while open (ref-counted — safe alongside nav lock)
  useEffect(() => {
    lockBody();
    return () => unlockBody();
  }, []);

  // Escape via the shared stack (only the topmost overlay closes);
  // ← / → stay as their own listener since they're not ESC.
  useEffect(() => pushEsc(onClose), [onClose]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') onNav((index + 1) % visibleCerts.length);
      else if (e.key === 'ArrowLeft') onNav((index - 1 + visibleCerts.length) % visibleCerts.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, visibleCerts.length, onNav]);

  const isTyped = TYPED.has(c.type);

  const handleRootClick = (e) => {
    if (e.target === overlayRef.current || e.target === backdropRef.current) {
      onClose();
    }
  };

  return (
    <div className="cert-modal" ref={overlayRef} role="dialog" aria-modal="true"
         aria-label={tr(c.name, lang)} data-type={isTyped ? c.type : undefined}
         onClick={handleRootClick}>
      <div className="cert-modal-backdrop" ref={backdropRef} aria-hidden="true"></div>

      {/* TODO: add "press ESC" microcopy near close */}
      <button type="button" className="cert-modal-close" onClick={onClose}
              aria-label={tr(UI.close, lang)}>
        <span aria-hidden="true">✕</span>
        <span className="cmc-label">{tr(UI.close, lang)}</span>
      </button>

      <button type="button" className="cert-modal-nav prev"
              onClick={() => onNav((index - 1 + visibleCerts.length) % visibleCerts.length)}
              aria-label="Previous">‹</button>
      <button type="button" className="cert-modal-nav next"
              onClick={() => onNav((index + 1) % visibleCerts.length)}
              aria-label="Next">›</button>

      <div className="cert-modal-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <div className="cmc-media">
          <Badge cert={c} wrapClass="cmc-badge" note={typeLabel(c.type, lang)} />
          <div className="cmc-code">{codeFor(absIndex)}</div>
        </div>

        <div className="cmc-body">
          <div className="cmc-eyebrow">
            <span className="cmc-typechip" data-type={c.type}>
              {isTyped && <TypeIcon type={c.type} className="cmc-typechip-ico" />}
              <span>{typeLabel(c.type, lang)}</span>
            </span>
            <span className="cmc-year">{tr(c.date, lang) || c.year}</span>
          </div>

          <h2 className="cmc-name">{tr(c.name, lang)}</h2>
          <p className="cmc-blurb">{tr(c.blurb, lang)}</p>

          <div className="cmc-meta">
            <div className="cmc-meta-item">
              <div className="cmi-k">{tr(UI.issuer, lang)}</div>
              <div className="cmi-v">{tr(c.issuer, lang)}</div>
            </div>
            <div className="cmc-meta-item">
              <div className="cmi-k">{tr(UI.date, lang)}</div>
              <div className="cmi-v">{tr(c.date, lang) || c.year}</div>
            </div>
          </div>

          <p className="cmc-desc">{tr(c.description, lang)}</p>

          {c.link && (
            <a className="cmc-verify" href={c.link} target="_blank" rel="noopener noreferrer">
              {tr(UI.verify, lang)} <span className="cb-arrow" aria-hidden="true">↗</span>
            </a>
          )}

          <div className="cmc-counter">
            {String(index + 1).padStart(2, '0')} / {String(visibleCerts.length).padStart(2, '0')}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================================================================
   CertsNav — floating pill NavBar for this standalone page.
   Reuses the sitewide nav classes (styles duplicated into
   certifications.css so this page stays self-contained). Links to
   the SPA (index.html#route) trigger a full page load — deliberate,
   this page lives outside the SPA router.
   ================================================================= */
const NAV_LABELS = {
  home:    { es: 'Inicio',        en: 'Home',           zh: '首页' },
  about:   { es: 'Sobre mí',      en: 'About',          zh: '关于' },
  work:    { es: 'Trabajos',      en: 'Work',           zh: '作品' },
  play:    { es: 'Juego',         en: 'Play',           zh: '实验' },
  contact: { es: 'Contacto',      en: 'Contact',        zh: '联系' },
  certs:   { es: 'Certificaciones', en: 'Certifications', zh: '认证' },
  menu:    { es: 'Menú',          en: 'Menu',           zh: '菜单' },
  close:   { es: 'Cerrar',        en: 'Close',          zh: '关闭' },
  center:  { es: '// tú estás en · certificaciones', en: '// you are on · certifications', zh: '// 你在 · 认证' },
};

/* Two-layer cross-fade of certification badges — visual replacement
   for the THREE particle canvas that lives in chrome.jsx's nav panel.
   Uses window.CERTS_DATA badge URLs, filters to items that actually
   have an image, and rotates every 1.8s while the panel is open. */
function NavGallery({ open }) {
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);

  /* Source pool: certs with either a badge URL that resolves, or a
     medal glyph fallback. We keep the raw cert so the layer can decide
     img-vs-glyph per item and swap to glyph on load error. */
  const items = useMemo(() => {
    const arr = window.CERTS_DATA || [];
    return arr.filter(c => c && (c.badge || c.medal));
  }, []);

  useEffect(() => {
    if (!open || items.length < 2 || prefersReduce()) return;
    const iv = setInterval(() => {
      setIdx(i => (i + 1) % items.length);
      setFlip(f => !f);
    }, 1800);
    return () => clearInterval(iv);
  }, [open, items.length]);

  if (!items.length) return null;
  const prev = (idx - 1 + items.length) % items.length;
  const aItem = flip ? items[prev] : items[idx];
  const bItem = flip ? items[idx] : items[prev];
  return (
    <div className="nav-gallery" aria-hidden="true">
      <NavGalleryLayer item={aItem} on={!flip} />
      <NavGalleryLayer item={bItem} on={ flip} />
    </div>
  );
}
function NavGalleryLayer({ item, on }) {
  const [err, setErr] = useState(false);
  const cls = 'ng-img' + (on ? ' on' : '');
  if (item && item.badge && !err) {
    return <img className={cls} src={item.badge} alt="" draggable="false"
                onError={() => setErr(true)} />;
  }
  return (
    <div className={cls + ' ng-fallback'}>
      <span className="ng-medal">{(item && item.medal) || '★'}</span>
    </div>
  );
}

function CertsNav({ lang, setLang }) {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const firstRun = useRef(true);

  const menuWord  = tr(NAV_LABELS.menu, lang);
  const closeWord = tr(NAV_LABELS.close, lang);
  const centerText = open ? tr({ es: '// elige tu destino', en: '// choose destination', zh: '// 选择目的地' }, lang)
                          : tr(NAV_LABELS.center, lang);

  const items = [
    { key: 'home',    href: 'index.html#home' },
    { key: 'about',   href: 'index.html#about' },
    { key: 'work',    href: 'index.html#work' },
    { key: 'play',    href: 'index.html#play' },
    { key: 'contact', href: 'index.html#contact' },
    { key: 'certs',   href: 'certifications.html', active: true },
  ];

  // open / close choreography — same clip-path drop as chrome.jsx, minus canvas
  useEffect(() => {
    const overlay = overlayRef.current, panel = panelRef.current;
    if (!overlay || !panel) return;
    const g = window.gsap;
    const reduce = prefersReduce();
    const linkEls = Array.from(panel.querySelectorAll('.nav-item'));
    const gallery = panel.querySelector('.nav-gallery');
    const foot = panel.querySelector('.nav-footer-inner');

    if (firstRun.current) {
      firstRun.current = false;
      if (g) { g.set(overlay, { autoAlpha: 0 }); g.set(panel, { clipPath: 'inset(0 0 100% 0)', autoAlpha: 1 }); }
      return;
    }

    if (open) {
      lockBody();
      if (!g || reduce) {
        if (g) { g.set(overlay, { autoAlpha: 1 }); g.set(panel, { clipPath: 'inset(0 0 0% 0)' }); g.set(linkEls, { y: 0, autoAlpha: 1 }); if (gallery) g.set(gallery, { autoAlpha: 1 }); if (foot) g.set(foot, { autoAlpha: 1 }); }
        return;
      }
      g.killTweensOf([overlay, panel, ...linkEls, gallery, foot]);
      g.to(overlay, { autoAlpha: 1, duration: 0.3 });
      g.fromTo(panel, { clipPath: 'inset(0 0 100% 0)', autoAlpha: 1 }, { clipPath: 'inset(0 0 0% 0)', duration: 0.45, ease: 'power3.out' });
      g.fromTo(linkEls, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, ease: 'power2.out', delay: 0.2 });
      if (gallery) g.fromTo(gallery, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, delay: 0.5 });
      if (foot)    g.fromTo(foot,    { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, delay: 0.65 });
    } else {
      unlockBody();
      if (!g || reduce) {
        if (g) { g.set(overlay, { autoAlpha: 0 }); g.set(panel, { clipPath: 'inset(0 0 100% 0)' }); }
        return;
      }
      g.killTweensOf([overlay, panel, ...linkEls, gallery, foot]);
      g.to([...linkEls, gallery, foot].filter(Boolean), { autoAlpha: 0, y: -8, stagger: 0.03, duration: 0.2 });
      g.to(panel, { clipPath: 'inset(0 0 100% 0)', duration: 0.35, ease: 'power3.in', delay: 0.15 });
      g.to(overlay, { autoAlpha: 0, duration: 0.3, delay: 0.2 });
    }
  }, [open]);

  // hamburger → X morph, same as chrome.jsx
  useEffect(() => {
    const g = window.gsap;
    if (!g) return;
    const reduce = prefersReduce();
    if (reduce) {
      g.set('.certs-nav .bar-1', { y: open ? 7 : 0, rotation: open ? 45 : 0 });
      g.set('.certs-nav .bar-2', { autoAlpha: open ? 0 : 1 });
      g.set('.certs-nav .bar-3', { y: open ? -7 : 0, rotation: open ? -45 : 0 });
      return;
    }
    if (open) {
      g.to('.certs-nav .bar-1', { y: 7,  rotation: 45,  transformOrigin: 'center', duration: 0.35, ease: 'power3.inOut' });
      g.to('.certs-nav .bar-2', { autoAlpha: 0, duration: 0.2 });
      g.to('.certs-nav .bar-3', { y: -7, rotation: -45, transformOrigin: 'center', duration: 0.35, ease: 'power3.inOut' });
    } else {
      g.to('.certs-nav .bar-1', { y: 0, rotation: 0, duration: 0.35, ease: 'power3.inOut' });
      g.to('.certs-nav .bar-2', { autoAlpha: 1, duration: 0.3, delay: 0.1 });
      g.to('.certs-nav .bar-3', { y: 0, rotation: 0, duration: 0.35, ease: 'power3.inOut' });
    }
  }, [open]);

  // close on Escape (shared stack — yields to a modal open above it)
  useEffect(() => {
    if (!open) return;
    return pushEsc(() => setOpen(false));
  }, [open]);

  const hoverIn = (e) => {
    if (prefersReduce()) return;
    const g = window.gsap; if (!g) return;
    const nm = e.currentTarget.querySelector('.nav-link-name');
    if (nm) g.to(nm, { x: 6, duration: 0.25, ease: 'power2.out' });
  };
  const hoverOut = (e) => {
    const g = window.gsap; if (!g) return;
    const nm = e.currentTarget.querySelector('.nav-link-name');
    if (nm) g.to(nm, { x: 0, duration: 0.25, ease: 'power2.out' });
  };

  const toggleMenu = () => setOpen(o => !o);

  return (
    <div className="certs-nav">
      <div className={'nav-fl-overlay' + (open ? ' open' : '')} ref={overlayRef}
           onClick={() => setOpen(false)} aria-hidden="true"></div>

      <div className="nav-fl-panel" ref={panelRef} aria-hidden={!open}>
        <nav className="nav-fl-links">
          {items.map((it, i) => (
            <a key={it.key} href={it.href}
               className={'nav-item' + (it.active ? ' active' : '')}
               onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
              <span className="nav-link-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="nav-link-name">{tr(NAV_LABELS[it.key], lang)}</span>
              <span className="nav-chevron" aria-hidden="true">›</span>
            </a>
          ))}
        </nav>

        <NavGallery open={open} />

        <div className="nav-footer-inner">
          <div className="nav-lang">
            <button className={'nav-lang-btn' + (lang === 'es' ? ' active' : '')} onClick={() => setLang('es')}>ES</button>
            <span className="nav-lang-sep">·</span>
            <button className={'nav-lang-btn' + (lang === 'en' ? ' active' : '')} onClick={() => setLang('en')}>EN</button>
            <span className="nav-lang-sep">·</span>
            <button className={'nav-lang-btn' + (lang === 'zh' ? ' active' : '')} onClick={() => setLang('zh')}>中文</button>
          </div>
          <div className="nav-copy">© Lisa 2025</div>
        </div>
      </div>

      <header className={'nav-bar' + (open ? ' open' : '')} onClick={toggleMenu}>
        <a className="nav-bar-logo logo-mark" href="index.html" onClick={(e) => e.stopPropagation()}>
          <span className="lm-box">YT</span>
          <span>LISA</span>
        </a>
        <div className="nav-bar-center" aria-hidden="true">{centerText}</div>
        <button className={'nav-bar-menu' + (open ? ' is-open' : '')}
                aria-expanded={open} aria-label={open ? closeWord : menuWord}
                onClick={(e) => { e.stopPropagation(); toggleMenu(); }}>
          <span className="nbm-icon">
            <svg className="menu-icon" width="24" height="16" viewBox="0 0 24 16" fill="none" aria-hidden="true">
              <rect className="bar bar-1" x="0" y="0"  width="24" height="2" fill="currentColor" rx="1"/>
              <rect className="bar bar-2" x="0" y="7"  width="24" height="2" fill="currentColor" rx="1"/>
              <rect className="bar bar-3" x="0" y="14" width="24" height="2" fill="currentColor" rx="1"/>
            </svg>
          </span>
        </button>
      </header>
    </div>
  );
}

/* =================================================================
   CertsLoader — standalone initial loader.
   Counter 0→100 over ~0.6s, mosaic of badge images faded low behind
   it, vignette for focus. Fades out on completion, then unmounts;
   the underlying page then mounts fresh so its own reveal (nav +
   header + tile clip-path stagger) fires visibly. Skipped entirely
   on repeat visits within the session (see sessionStorage check in
   CertificationsPage).
   ================================================================= */
function CertsLoader({ certs, onDone }) {
  const rootRef = useRef(null);
  const numRef = useRef(null);
  const barRef = useRef(null);

  useEffect(() => {
    lockBody();
    let unlocked = false;
    const unlockOnce = () => { if (!unlocked) { unlocked = true; unlockBody(); } };
    const g = window.gsap;
    const reduce = prefersReduce();
    if (!g || reduce) {
      if (numRef.current) numRef.current.textContent = '100';
      if (barRef.current) barRef.current.style.width = '100%';
      const id = requestAnimationFrame(() => {
        unlockOnce();
        if (onDone) onDone();
      });
      return () => { cancelAnimationFrame(id); unlockOnce(); };
    }
    const counter = { v: 0 };
    const tw = g.to(counter, {
      v: 100,
      duration: 0.6,
      ease: 'power2.inOut',
      onUpdate: () => {
        const nv = Math.round(counter.v);
        if (numRef.current) numRef.current.textContent = String(nv).padStart(3, '0');
        if (barRef.current) barRef.current.style.width = nv + '%';
      },
      onComplete: () => {
        g.to(rootRef.current, {
          autoAlpha: 0,
          duration: 0.6,
          delay: 0.25,
          ease: 'power2.out',
          onComplete: () => {
            unlockOnce();
            if (onDone) onDone();
          },
        });
      },
    });
    return () => { tw.kill(); unlockOnce(); };
  }, []);

  // Mosaic tiles: fill ~48 slots by cycling the badges that exist,
  // graceful placeholder for entries without a badge URL.
  const mosaicItems = useMemo(() => {
    const src = (certs && certs.length) ? certs : [];
    const withBadge = src.filter(c => c && c.badge);
    const target = 48;
    const out = [];
    for (let i = 0; i < target; i++) {
      if (withBadge.length) out.push(withBadge[i % withBadge.length]);
      else out.push(src[i % Math.max(1, src.length)] || null);
    }
    return out;
  }, [certs]);

  return (
    <div className="certs-loader" ref={rootRef}>
      <div className="certs-loader-mosaic" aria-hidden="true">
        {mosaicItems.map((c, i) => (
          <Badge key={i} cert={c || {}} wrapClass="clm-cell" />
        ))}
      </div>
      <div className="certs-loader-vignette" aria-hidden="true"></div>
      <div className="certs-loader-center">
        <div className="certs-loader-label" role="status" aria-live="polite">Y4 / CERT · INDEX — Loading</div>
        <div aria-hidden="true">
          <div className="certs-loader-num"><span ref={numRef}>000</span><span className="cln-pct">%</span></div>
          <div className="certs-loader-bar"><span ref={barRef} style={{ width: '0%' }} /></div>
        </div>
      </div>
    </div>
  );
}

/* ============================== PAGE ================================== */
function CertificationsPage() {
  const certs = (window.CERTS_DATA && window.CERTS_DATA.length) ? window.CERTS_DATA : [];
  const [loading, setLoading] = useState(() => {
    try {
      if (sessionStorage.getItem('certsLoaded')) return false;
    } catch (e) {}
    return true;
  });
  const [lang, setLang] = useState('es');
  const [modalIdx, setModalIdx] = useState(null);   // null → grid only; number → modal open
  const [filter, setFilter] = useState(null);
  const [headIn, setHeadIn] = useState(prefersReduce());
  const hoverEnabled = useMediaQuery('(hover: hover) and (pointer: fine)')
    && !useMediaQuery('(prefers-reduced-motion: reduce)');

  const types = useMemo(() => {
    const seen = [];
    certs.forEach(c => { if (c.type && !seen.includes(c.type)) seen.push(c.type); });
    return seen;
  }, [certs]);

  useEffect(() => {
    if (prefersReduce()) { setHeadIn(true); return; }
    const id = requestAnimationFrame(() => setHeadIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const openCert = useCallback((i) => setModalIdx(i), []);
  const closeCert = useCallback(() => setModalIdx(null), []);
  const navCert = useCallback((i) => setModalIdx(i), []);

  // if the active filter changes while the modal is open, its stored index
  // (a position within the filtered set) can no longer be trusted — close it.
  useEffect(() => { setModalIdx(null); }, [filter]);

  if (loading) {
    const done = () => {
      try { sessionStorage.setItem('certsLoaded', '1'); } catch (e) {}
      setLoading(false);
    };
    return (
      <div className="certs-page is-loading" data-screen-label="Certifications">
        <CertsLoader certs={certs} onDone={done} />
      </div>
    );
  }

  return (
    <div className="certs-page" data-screen-label="Certifications">
      <CertsNav lang={lang} setLang={setLang} />
      <div className="certs-shell">
        <div className={'certs-head certs-fade' + (headIn ? ' in' : '')}>
          <div className="certs-eyebrow">{tr(UI.eyebrow, lang)}</div>
          <h1 className="certs-title">{tr(UI.title, lang)}</h1>
          <p className="certs-sub">{tr(UI.sub, lang)}</p>
        </div>

        {certs.length === 0 ? (
          <p className="certs-sub" style={{ color: 'var(--text-mid)' }}>
            No certification data available.
          </p>
        ) : (
          <Grid
            certs={certs}
            lang={lang}
            onOpen={openCert}
            filter={filter}
            setFilter={setFilter}
            types={types}
            hoverEnabled={hoverEnabled}
          />
        )}
      </div>

      {modalIdx !== null && certs.length > 0 && (
        <CertModal
          certs={certs}
          lang={lang}
          index={modalIdx}
          onClose={closeCert}
          onNav={navCert}
          filter={filter}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------
   Bootstrap : load certifications.json, then mount. Mirrors the SPA's
   data-before-render pattern (app.jsx) but scoped to this one page.
   ------------------------------------------------------------------- */
(async function bootstrap() {
  try {
    const r = await fetch('data/certifications.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    window.CERTS_DATA = await r.json();
  } catch (e) {
    console.warn('[certifications] data load failed:', e.message);
    window.CERTS_DATA = [];
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<CertificationsPage />);
})();
