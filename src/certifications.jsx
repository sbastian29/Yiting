/* ===================================================================
   certifications.jsx — Global Certification Archive (standalone page).

   Layout (>900px):
     [ 34% sidebar filters + heading | 1fr dual-column vertical infinite carousel | 44px vertical labels ]
   Overlay: 62/38 grid with cert visual + metadata + description toggle.

   Interactions:
     • Auto-scrolling dual-track carousel (raf-driven) with wheel-accelerated velocity.
     • Filter pills: fade-out → filter change → fade-in.
     • Card click: opens overlay with breadcrumb code, program/emisor/año/validation
       + collapsible description.
     • ESC or backdrop closes overlay; body scroll locked while open.

   Mobile (<=900px):
     • Single-column stacked cards, no auto-scroll, right vertical labels hidden.

   Data: fetched once from data/certifications.json → window.CERTS_DATA.
   Nav: shared site-wide floating pill nav (mirrors chrome.jsx / other pages).
   =================================================================== */

const { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } = React;

const prefersReduce = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
};

/* ---- ref-counted body scroll lock (delegates to lib.jsx if present) ---- */
let _lockCount = 0;
function lockBody() {
  if (_lockCount++ === 0) {
    if (typeof window !== 'undefined' && window.lockBodyScroll) window.lockBodyScroll();
    else document.body.style.overflow = 'hidden';
  }
}
function unlockBody() {
  _lockCount = Math.max(0, _lockCount - 1);
  if (_lockCount === 0) {
    if (typeof window !== 'undefined' && window.unlockBodyScroll) window.unlockBodyScroll();
    else document.body.style.overflow = '';
  }
}

/* ---- shared Escape stack: only the topmost overlay closes per keypress ---- */
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

/* ---- category labels (used in filter pills) ---- */
const FILTERS = [
  { key: 'all',            label: 'All Work' },
  { key: 'universidad',    label: 'Universidad' },
  { key: 'curso-online',   label: 'Curso Online' },
  { key: 'idioma',         label: 'Idioma' },
  { key: 'reconocimiento', label: 'Reconocimiento' },
];

/* Deterministic "code" per (issuer, index) — used in card corner + overlay breadcrumb */
const codeFor = (cert, index) => {
  const initials = (cert.issuer || '').split(' ')
    .map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 4) || 'CERT';
  return `CERT/${initials}_${String(index + 1).padStart(2, '0')}`;
};

/* ============================== PILL ================================== */
/* Flip-label filter pill — two stacked spans, top translates up on hover. */
function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      className={'arc-pill' + (active ? ' is-active' : '')}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="arc-pill-flip">
        <span className="arc-pill-a">{children}</span>
        <span className="arc-pill-b" aria-hidden="true">{children}</span>
      </span>
    </button>
  );
}

/* ============================== CARD ================================== */
/* 4:3 tile — hatched placeholder (or image when provided) + eyebrow tag +
   title. Corner code stamp. Data-tag drives color accent per category. */
function ArcCard({ cert, index, onOpen }) {
  const code = codeFor(cert, index);
  const primaryType = (cert.types && cert.types[0]) || 'other';
  return (
    <button
      type="button"
      className="arc-card"
      data-type={primaryType}
      onClick={onOpen}
      aria-label={cert.title}
    >
      <div className="arc-card-media">
        {cert.imageUrl
          ? <img className="arc-card-img" src={cert.imageUrl} alt="" draggable="false" />
          : <span className="arc-card-ph">{cert.program}</span>}
        <span className="arc-card-code" aria-hidden="true">{code}</span>
      </div>
      <div className="arc-card-body">
        <span className="arc-card-tag">{cert.date}</span>
        <h3 className="arc-card-title">{cert.title}</h3>
      </div>
    </button>
  );
}

/* ============================== TRACK ================================= */
/* Dual-column infinite auto-scroll carousel with wheel-accelerated velocity.
   Base speed 0.5 px/frame, wheel adds decaying impulse (×0.94/frame).
   Uses translate3d on the two tracks; the right track is offset by -60px so
   the columns feel staggered.

   Paused when: overlay open, mouse over carousel, viewport <= 900px, or
   prefers-reduced-motion is on. Track height is measured via ResizeObserver
   so the loop point stays accurate through filter changes and layout shifts.
*/
function ArcCarousel({ items, paused, onOpen }) {
  const carouselRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const hoverRef = useRef(false);

  // Base list must be long enough that the doubled loop looks dense —
  // if the filtered set is tiny (1–2 items), pad it before doubling.
  const doubled = useMemo(() => {
    if (!items.length) return [];
    let base = items.slice();
    while (base.length < 6) base = base.concat(items);
    return base.concat(base);
  }, [items]);

  useEffect(() => {
    let raf = 0;
    let yPos = 0;
    let currentSpeed = 0.5;
    let targetSpeed = 0.5;
    let wheelVel = 0;
    let trackHalfH = 0;
    let running = true;

    const measure = () => {
      if (leftRef.current) trackHalfH = leftRef.current.scrollHeight / 2;
    };
    // Wait a frame so the doubled list has laid out.
    const measureTimer = setTimeout(measure, 60);
    const ro = new ResizeObserver(measure);
    if (leftRef.current) ro.observe(leftRef.current);

    const onWheel = (e) => {
      if (paused || hoverRef.current) return;
      if (window.innerWidth <= 900) return;
      wheelVel += e.deltaY * 0.05;
      const max = 0.5 * 10;
      wheelVel = Math.max(-max, Math.min(max, wheelVel));
    };
    const onEnter = () => { hoverRef.current = true; targetSpeed = 0; };
    const onLeave = () => { hoverRef.current = false; if (!paused) targetSpeed = 0.5; };
    window.addEventListener('wheel', onWheel, { passive: true });
    const el = carouselRef.current;
    if (el) {
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
    }

    // Kill velocity + freeze when overlay opens (via `paused` prop)
    targetSpeed = paused ? 0 : 0.5;

    const tick = () => {
      if (!running) return;
      const reduce = prefersReduce();
      const wide = window.innerWidth > 900;
      if (wide && !reduce && trackHalfH > 0 && !paused) {
        currentSpeed += (targetSpeed - currentSpeed) * 0.1;
        wheelVel *= 0.94;
        yPos -= (currentSpeed + wheelVel);
        if (yPos <= -trackHalfH) yPos = 0;
        if (yPos > 0) yPos = -trackHalfH;
        if (leftRef.current)  leftRef.current.style.transform  = `translate3d(0,${yPos}px,0)`;
        if (rightRef.current) rightRef.current.style.transform = `translate3d(0,${yPos - 60}px,0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      clearTimeout(measureTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('wheel', onWheel);
      if (el) {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      }
    };
  }, [doubled.length, paused]);

  return (
    <main className="arc-center" ref={carouselRef}>
      <div className="arc-track arc-track-l" ref={leftRef}>
        {doubled.map((c, i) => (
          <ArcCard key={c.id + '-l-' + i} cert={c} index={i % Math.max(items.length, 1)}
                   onOpen={() => onOpen(c)} />
        ))}
      </div>
      <div className="arc-track arc-track-r" ref={rightRef}>
        {doubled.map((c, i) => (
          <ArcCard key={c.id + '-r-' + i} cert={c} index={i % Math.max(items.length, 1)}
                   onOpen={() => onOpen(c)} />
        ))}
      </div>
    </main>
  );
}

/* ============================== OVERLAY =============================== */
/* Modal with slotted metadata: PROGRAMA / EMISOR / AÑO / VALIDACIÓN +
   description collapsible ("READ MORE" → expands to max-height). ESC or
   backdrop closes; body scroll locked. */
function ArcOverlay({ cert, index, onClose }) {
  const overlayRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const code = codeFor(cert, index);

  useEffect(() => { lockBody(); return () => unlockBody(); }, []);
  useEffect(() => pushEsc(onClose), [onClose]);

  useLayoutEffect(() => {
    const g = window.gsap;
    if (!g || prefersReduce()) return;
    g.fromTo(overlayRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: 'power2.out' });
  }, []);

  const onBackdrop = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const primaryType = (cert.types && cert.types[0]) || 'other';

  return (
    <div className="arc-overlay" ref={overlayRef} role="dialog" aria-modal="true"
         aria-label={cert.title} onClick={onBackdrop}>
      <div className="arc-ov-content">
        <div className="arc-ov-visual">
          <div className="arc-ov-visual-inner" data-type={primaryType}>
            {cert.imageUrl
              ? <img src={cert.imageUrl} alt="" draggable="false" />
              : <span className="arc-ov-visual-label">{cert.program}</span>}
          </div>
        </div>

        <div className="arc-ov-panel">
          <button className="arc-ov-close" onClick={onClose} aria-label="Cerrar">
            <span aria-hidden="true">✕</span>
          </button>

          <div>
            <div className="arc-ov-breadcrumb">WORK — {code}</div>
            <h2 className="arc-ov-title">{cert.title}</h2>
            <div className="arc-ov-code">{code}</div>

            <div className="arc-ov-meta">
              <MetaRow k="PROGRAMA"   v={cert.program} />
              <MetaRow k="EMISOR"     v={cert.issuer} />
              <MetaRow k="AÑO"        v={cert.date} />
              {cert.validation && <MetaRow k="VALIDACIÓN" v={cert.validation} />}
            </div>

            <div className="arc-ov-desc">
              <button className="arc-ov-desc-toggle"
                      onClick={() => setExpanded(e => !e)}
                      aria-expanded={expanded}>
                <span>READ MORE</span>
                <span className="arc-ov-desc-icon" aria-hidden="true">{expanded ? '−' : '+'}</span>
              </button>
              <div className="arc-ov-desc-body" style={{ maxHeight: expanded ? '400px' : '0px' }}>
                <p>{cert.description}</p>
              </div>
            </div>
          </div>

          <div className="arc-ov-actions">
            {cert.credentialUrl && (
              <a className="arc-ov-btn is-primary"
                 href={cert.credentialUrl} target="_blank" rel="noopener noreferrer">
                VERIFICAR CREDENCIAL
              </a>
            )}
            <button className="arc-ov-btn" onClick={onClose}>MENU</button>
            <button className="arc-ov-btn" onClick={onClose}>ALL CASE STUDIES</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function MetaRow({ k, v }) {
  return (
    <div className="arc-ov-meta-row">
      <div className="arc-ov-meta-k">{k}</div>
      <div className="arc-ov-meta-v">{v}</div>
    </div>
  );
}

/* ========================== SHARED SITE NAV =========================== */
/* Floating pill nav — mirrors chrome.jsx so this page shares the same nav
   language as work / about / play / contact. Links to the SPA (index.html#route)
   trigger a full page load — this page lives outside the SPA router. */
const NAV_LABELS = {
  home:    'Inicio',
  about:   'Sobre mí',
  work:    'Trabajos',
  play:    'Juego',
  contact: 'Contacto',
  certs:   'Certificaciones',
};

function SiteNav() {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const firstRun = useRef(true);

  const items = [
    { key: 'home',    href: 'index.html#home' },
    { key: 'about',   href: 'index.html#about' },
    { key: 'work',    href: 'index.html#work' },
    { key: 'play',    href: 'index.html#play' },
    { key: 'contact', href: 'index.html#contact' },
    { key: 'certs',   href: 'certifications.html', active: true },
  ];

  useEffect(() => {
    const overlay = overlayRef.current, panel = panelRef.current;
    if (!overlay || !panel) return;
    const g = window.gsap;
    const reduce = prefersReduce();
    const linkEls = Array.from(panel.querySelectorAll('.arc-nav-item'));
    const foot = panel.querySelector('.arc-nav-foot');

    if (firstRun.current) {
      firstRun.current = false;
      if (g) {
        g.set(overlay, { autoAlpha: 0 });
        g.set(panel, { clipPath: 'inset(0 0 100% 0)', autoAlpha: 1 });
      }
      return;
    }

    if (open) {
      lockBody();
      if (!g || reduce) {
        if (g) {
          g.set(overlay, { autoAlpha: 1 });
          g.set(panel, { clipPath: 'inset(0 0 0% 0)' });
          g.set(linkEls, { y: 0, autoAlpha: 1 });
          if (foot) g.set(foot, { autoAlpha: 1 });
        }
        return;
      }
      g.killTweensOf([overlay, panel, ...linkEls, foot]);
      g.to(overlay, { autoAlpha: 1, duration: 0.3 });
      g.fromTo(panel,
        { clipPath: 'inset(0 0 100% 0)', autoAlpha: 1 },
        { clipPath: 'inset(0 0 0% 0)', duration: 0.45, ease: 'power3.out' });
      g.fromTo(linkEls,
        { y: 16, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, ease: 'power2.out', delay: 0.2 });
      if (foot) g.fromTo(foot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, delay: 0.55 });
    } else {
      unlockBody();
      if (!g || reduce) {
        if (g) {
          g.set(overlay, { autoAlpha: 0 });
          g.set(panel, { clipPath: 'inset(0 0 100% 0)' });
        }
        return;
      }
      g.killTweensOf([overlay, panel, ...linkEls, foot]);
      g.to([...linkEls, foot].filter(Boolean),
        { autoAlpha: 0, y: -8, stagger: 0.03, duration: 0.2 });
      g.to(panel, { clipPath: 'inset(0 0 100% 0)', duration: 0.35, ease: 'power3.in', delay: 0.15 });
      g.to(overlay, { autoAlpha: 0, duration: 0.3, delay: 0.2 });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return pushEsc(() => setOpen(false));
  }, [open]);

  const toggle = () => setOpen(o => !o);

  return (
    <div className="arc-nav">
      <div className={'arc-nav-overlay' + (open ? ' open' : '')}
           ref={overlayRef} onClick={() => setOpen(false)} aria-hidden="true"></div>

      <div className="arc-nav-panel" ref={panelRef} aria-hidden={!open}>
        <nav className="arc-nav-links">
          {items.map((it, i) => (
            <a key={it.key} href={it.href}
               className={'arc-nav-item' + (it.active ? ' is-active' : '')}>
              <span className="arc-nav-item-idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="arc-nav-item-name">{NAV_LABELS[it.key]}</span>
              <span className="arc-nav-item-arrow" aria-hidden="true">›</span>
            </a>
          ))}
        </nav>
        <div className="arc-nav-foot">
          <div className="arc-nav-copy">© Lisa 2025</div>
        </div>
      </div>

      <header className={'arc-nav-bar' + (open ? ' is-open' : '')}>
        <a className="arc-nav-logo" href="index.html">
          <span className="arc-nav-logo-mark">YT</span>
          <span className="arc-nav-logo-word">LISA</span>
        </a>
        <div className="arc-nav-center" aria-hidden="true">
          // {open ? 'elige tu destino' : 'tú estás en · certificaciones'}
        </div>
        <button className={'arc-nav-menu' + (open ? ' is-open' : '')}
                onClick={toggle}
                aria-expanded={open}
                aria-label={open ? 'Cerrar menú' : 'Abrir menú'}>
          <span className="arc-nav-menu-bar b1"></span>
          <span className="arc-nav-menu-bar b2"></span>
          <span className="arc-nav-menu-bar b3"></span>
        </button>
      </header>
    </div>
  );
}

/* ============================== PAGE ================================== */
function CertificationsPage() {
  const [certs, setCerts] = useState(() => window.CERTS_DATA || []);
  const [filter, setFilter] = useState('all');
  const [overlayCert, setOverlayCert] = useState(null);
  const [overlayIdx, setOverlayIdx] = useState(0);
  const centerRef = useRef(null);
  const isFilterAnimating = useRef(false);

  useEffect(() => {
    if (!certs.length && window.CERTS_DATA) setCerts(window.CERTS_DATA);
  }, []);

  const filtered = useMemo(
    () => filter === 'all' ? certs : certs.filter(c => (c.types || []).includes(filter)),
    [certs, filter]
  );

  const statusText = `ARCHIVE STUDIES(${String(filtered.length).padStart(2, '0')})`;

  const changeFilter = useCallback((next) => {
    if (next === filter || isFilterAnimating.current) return;
    const el = centerRef.current;
    isFilterAnimating.current = true;
    if (el) { el.classList.remove('is-in'); el.classList.add('is-out'); }
    setTimeout(() => {
      setFilter(next);
      if (el) {
        el.classList.remove('is-out');
        el.classList.add('is-in');
        setTimeout(() => {
          if (el) el.classList.remove('is-in');
          isFilterAnimating.current = false;
        }, 300);
      } else {
        isFilterAnimating.current = false;
      }
    }, 180);
  }, [filter]);

  const openCert = useCallback((cert) => {
    const idx = certs.indexOf(cert);
    setOverlayCert(cert);
    setOverlayIdx(idx >= 0 ? idx : 0);
  }, [certs]);
  const closeOverlay = useCallback(() => setOverlayCert(null), []);

  return (
    <div className="arc-page">
      <SiteNav />

      <div className="arc-grid">
        {/* ------- LEFT: sidebar (nav pills + heading + status) ------- */}
        <aside className="arc-left">
          <div className="arc-left-top">
            <div className="arc-brandline">
              <span className="arc-brandmark">YT</span>
              <span className="arc-brandword">LISA</span>
            </div>
            <nav className="arc-filters" aria-label="Filter certifications">
              {FILTERS.map(f => (
                <Pill key={f.key}
                      active={filter === f.key}
                      onClick={() => changeFilter(f.key)}>
                  {f.label}
                </Pill>
              ))}
            </nav>
          </div>

          <div className="arc-heading">
            <span className="arc-eyebrow">the archive</span>
            <h1 className="arc-title">Global<br />Certification<br />Archive</h1>
            <p className="arc-lead">
              A curation of degrees, specialized courses, and recognitions
              validating expertise in modern architectural and technical domains.
            </p>
          </div>

          <div className="arc-status">{statusText}</div>
        </aside>

        {/* ------- CENTER: dual-column infinite carousel ------- */}
        <div className="arc-center-wrap" ref={centerRef}>
          {filtered.length > 0 ? (
            <ArcCarousel items={filtered} paused={overlayCert !== null} onOpen={openCert} />
          ) : (
            <div className="arc-empty">No entries in this category.</div>
          )}
        </div>

        {/* ------- RIGHT: vertical labels rail ------- */}
        <aside className="arc-right">
          <span className="arc-vlabel">WORK</span>
          <span className="arc-vlabel">MENU</span>
          <span className="arc-vlabel">ALL PROJECT ARCHIVES</span>
        </aside>
      </div>

      {overlayCert && (
        <ArcOverlay cert={overlayCert} index={overlayIdx} onClose={closeOverlay} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------
   Bootstrap : load data, then mount. Mirrors the SPA's data-before-render
   pattern (app.jsx) but scoped to this standalone page.
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
