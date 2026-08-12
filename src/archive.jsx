/* ===================================================================
   certifications.jsx — Works / CV archive (standalone page).

   Same UI/UX as the previous Certification Archive — only the CONTENT
   changed (certificates → 3D works). Layout, carousel, cards, overlay
   and nav are untouched by design.

   Layout (>900px):
     [ 34% sidebar (own manual scroll) | 1fr dual-column auto-scroll carousel | 44px labels ]

   Sidebar blocks, in order:
     brand → filter pills → SOFTWARES grid → socials row → TRAYECTORIA
     → CERTIFICATES → contact form (#arc-contacto)

   Interactions:
     • Carousel auto-scrolls (raf, 0.5px/frame). Hover stops the drift; the
       wheel scrubs it by hand. Frozen while an overlay is open, <=900px or
       reduced-motion.
     • Sidebar scrolls manually (independent overflow).
     • "Contáctame" is an anchor that smooth-scrolls the sidebar to the form.
     • Card click → overlay with one large hero image + metadata.
     • Certificate SHOW → lightbox with the scan.

   Data:
     data/works.json       → window.WORKS_DATA
     data/softwares.json   → window.SOFTWARES_DATA
     data/trayectoria.json → window.TRAYECTORIA_DATA
     data/titulos.json     → window.TITULOS_DATA  (shared with titulos.html)
   =================================================================== */

const { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } = React;

const prefersReduce = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
};

/* Folder names contain spaces — encode when building a URL, but keep the
   raw path in the JSON so it stays hand-editable. */
const assetUrl = (folder, file) => encodeURI(String(folder) + '/' + String(file));

/* `Mouse` (read by cursor.jsx) now comes from lib.jsx, which this page loads
   for ShaderCanvas / LangContext / ToastProvider. No local shim needed. */

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

/* ---- category filters ---- */
const FILTERS = [
  { key: 'all',         label: 'All Work' },
  { key: 'props',       label: '3D Props' },
  { key: 'environment', label: '3D Environment' },
  { key: 'weapons',     label: '3D Weapons' },
];
const CATEGORY_LABEL = {
  props:       '3D Props',
  environment: '3D Environment',
  weapons:     '3D Weapons',
};

/* Certificate taxonomy — mirrors CATEGORIES in titulos.jsx, which reads the
   same data/titulos.json. Kept in sync by hand: these are standalone pages
   with no shared bundle. */
const CERT_CATEGORY_LABEL = {
  premio:         'Premio',
  beca:           'Beca',
  certificacion:  'Certificación',
  reconocimiento: 'Reconocimiento',
};

/* ---- social links ---- */
const SOCIALS = [
  { key: 'contacto',   label: 'Contáctame', href: '#arc-contacto',                                            anchor: true },
  { key: 'artstation', label: 'ArtStation', href: 'https://www.artstation.com/yinix' },
  { key: 'linkedin',   label: 'LinkedIn',   href: 'https://www.linkedin.com/in/yi-ting-yang-tang-b7ab43278/' },
];

/* Deterministic code stamp per work — shown on the card corner + overlay. */
const codeFor = (work, index) => {
  const initials = String(work.title || '')
    .replace(/^3D\s+Stylised\s+/i, '')
    .split(/[\s-]+/).map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 4) || 'WORK';
  return `WORK/${initials}_${String(index + 1).padStart(2, '0')}`;
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
/* 4:3 tile — Icono.png (or hatched placeholder if it fails) + category
   eyebrow + title. Corner code stamp. data-type drives the accent tint. */
function ArcCard({ work, index, onOpen }) {
  const [err, setErr] = useState(false);
  const code = codeFor(work, index);
  const src = work.icon ? assetUrl(work.folder, work.icon) : null;
  return (
    <button
      type="button"
      className="arc-card"
      data-type={work.category}
      onClick={onOpen}
      aria-label={work.title}
    >
      <div className="arc-card-media">
        {src && !err
          ? <img className="arc-card-img" src={src} alt="" draggable="false"
                 loading="lazy" onError={() => setErr(true)} />
          : <span className="arc-card-ph">{CATEGORY_LABEL[work.category] || work.category}</span>}
        <span className="arc-card-code" aria-hidden="true">{code}</span>
      </div>
      <div className="arc-card-body">
        <span className="arc-card-tag">{CATEGORY_LABEL[work.category] || work.category}</span>
        <h3 className="arc-card-title">{work.title}</h3>
      </div>
    </button>
  );
}

/* ============================== TRACK ================================= */
/* Dual-column infinite auto-scroll carousel with wheel-accelerated velocity.
   Base speed 0.5 px/frame, wheel adds decaying impulse (×0.94/frame).
   Uses translate3d on the two tracks; the right track is offset by -60px and
   its list is rotated by half, so the columns feel staggered and never show
   the same card twice at the same height.

   Auto-drift paused when: overlay open, mouse over carousel, viewport <= 900px, or
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
  const base = useMemo(() => {
    if (!items.length) return [];
    let list = items.slice();
    while (list.length < 6) list = list.concat(items);
    return list;
  }, [items]);

  // The right column is the same list rotated, so the two columns never show
  // the same card side by side. Rotating keeps the same set of cards, so both
  // tracks stay exactly the same height and the loop point below still holds.
  //
  // The offset counts UNIQUE items, not `base` length: padding repeats the
  // list, making `base` periodic with period items.length, so rotating by half
  // of `base` can land back on a multiple of the period and change nothing
  // (5 weapons pad to 10 — a rotation of 5 is a no-op). Any offset strictly
  // between 0 and items.length avoids that. Below 2 items there is only one
  // project to show, so the columns necessarily match.
  const doubledL = useMemo(() => base.concat(base), [base]);
  const doubledR = useMemo(() => {
    if (!base.length) return [];
    const k = Math.ceil(items.length / 2) % base.length;
    const rot = base.slice(k).concat(base.slice(0, k));
    return rot.concat(rot);
  }, [base, items.length]);

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

    // The wheel scrubs the carousel from anywhere on the page — including while
    // hovering it, which is exactly where you reach for the wheel. Hover still
    // kills the automatic drift (targetSpeed = 0); the wheel drives it by hand.
    const onWheel = (e) => {
      if (paused) return;
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
  }, [doubledL.length, paused]);

  return (
    <main className="arc-center" ref={carouselRef}>
      <div className="arc-track arc-track-l" ref={leftRef}>
        {doubledL.map((c, i) => (
          <ArcCard key={c.id + '-l-' + i} work={c} index={i % Math.max(items.length, 1)}
                   onOpen={() => onOpen(c)} />
        ))}
      </div>
      <div className="arc-track arc-track-r" ref={rightRef}>
        {doubledR.map((c, i) => (
          <ArcCard key={c.id + '-r-' + i} work={c} index={i % Math.max(items.length, 1)}
                   onOpen={() => onOpen(c)} />
        ))}
      </div>
    </main>
  );
}

/* ============================== OVERLAY =============================== */
/* One large hero image on the left, metadata on the right. Rows with no
   value are omitted, so the placeholder fields in works.json stay hidden
   until they're filled in. */
function ArcOverlay({ work, index, onClose }) {
  const overlayRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [err, setErr] = useState(false);
  const code = codeFor(work, index);
  const src = work.hero ? assetUrl(work.folder, work.hero) : null;

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

  const categoryLabel = CATEGORY_LABEL[work.category] || work.category;

  return (
    <div className="arc-overlay" ref={overlayRef} role="dialog" aria-modal="true"
         aria-label={work.title} onClick={onBackdrop}>
      <div className="arc-ov-content">
        <div className="arc-ov-visual">
          <div className="arc-ov-visual-inner" data-type={work.category}>
            {src && !err
              ? <img src={src} alt={work.title} draggable="false" onError={() => setErr(true)} />
              : <span className="arc-ov-visual-label">{categoryLabel}</span>}
          </div>
        </div>

        <div className="arc-ov-panel">
          <button className="arc-ov-close" onClick={onClose} aria-label="Cerrar">
            <span aria-hidden="true">✕</span>
          </button>

          <div>
            <div className="arc-ov-breadcrumb">WORK — {code}</div>
            <h2 className="arc-ov-title">{work.title}</h2>
            <div className="arc-ov-code">{code}</div>

            <div className="arc-ov-meta">
              <MetaRow k="CATEGORÍA" v={categoryLabel} />
              <MetaRow k="SOFTWARE"  v={work.software} />
              <MetaRow k="AÑO"       v={work.year} />
            </div>

            {work.description && (
              <div className="arc-ov-desc">
                <button className="arc-ov-desc-toggle"
                        onClick={() => setExpanded(e => !e)}
                        aria-expanded={expanded}>
                  <span>READ MORE</span>
                  <span className="arc-ov-desc-icon" aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
                <div className="arc-ov-desc-body" style={{ maxHeight: expanded ? '400px' : '0px' }}>
                  <p>{work.description}</p>
                </div>
              </div>
            )}
          </div>

          <div className="arc-ov-actions">
            <button className="arc-ov-btn" onClick={onClose}>MENU</button>
            <button className="arc-ov-btn" onClick={onClose}>ALL CASE STUDIES</button>
          </div>
        </div>
      </div>
    </div>
  );
}
function MetaRow({ k, v }) {
  if (!v) return null;   // placeholder fields stay hidden until filled in
  return (
    <div className="arc-ov-meta-row">
      <div className="arc-ov-meta-k">{k}</div>
      <div className="arc-ov-meta-v">{v}</div>
    </div>
  );
}

/* ========================= SIDEBAR: SOFTWARES ========================= */
/* Decorative logo grid — no filtering, tooltip via title/aria-label. */
function SoftwareGrid({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="arc-soft">
      <span className="arc-soft-label">Softwares</span>
      <ul className="arc-soft-grid">
        {items.map(s => (
          <li key={s.id}>
            <span className="arc-soft-cell" title={s.name}>
              <img src={s.logo} alt={s.name} loading="lazy" draggable="false" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ========================== SIDEBAR: SOCIALS ========================== */
/* Three inline links. "Contáctame" is an in-page anchor that scrolls the
   sidebar down to the form; the other two open in a new tab. */
function SocialRow() {
  const goToForm = (e) => {
    e.preventDefault();
    const el = document.getElementById('arc-contacto');
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReduce() ? 'auto' : 'smooth', block: 'start' });
    const input = el.querySelector('input, textarea');
    if (input) setTimeout(() => input.focus({ preventScroll: true }), prefersReduce() ? 0 : 500);
  };
  return (
    <div className="arc-socials">
      {SOCIALS.map(s => (
        <a key={s.key}
           className="arc-social"
           href={s.href}
           onClick={s.anchor ? goToForm : undefined}
           target={s.anchor ? undefined : '_blank'}
           rel={s.anchor ? undefined : 'noopener noreferrer'}>
          {s.label}
        </a>
      ))}
    </div>
  );
}

/* ======================== SIDEBAR: TRAYECTORIA ======================== */
function Trayectoria({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="arc-tray">
      <span className="arc-tray-label">Trayectoria</span>
      <ul className="arc-tray-list">
        {items.map(it => (
          <li key={it.id} className="arc-tray-item">
            <span className="arc-tray-name">{it.title}</span>
            <span className="arc-tray-year">{it.year}</span>
            {it.detail && <span className="arc-tray-detail">{it.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ======================== SIDEBAR: CERTIFICATES =======================
   Reads data/titulos.json — the same file titulos.html uses. Each row is a
   name plus a SHOW button that opens the full entry in a lightbox. The button
   is always offered: the overlay carries the metadata too, so it is worth
   opening before the scans exist. */
function Certificados({ items, onShow }) {
  if (!items || !items.length) return null;
  return (
    <div className="arc-cert">
      <span className="arc-cert-label">Certificates</span>
      <ul className="arc-cert-list">
        {items.map(it => (
          <li key={it.id} className="arc-cert-item">
            <span className="arc-cert-name">
              {it.title}
              {it.issuer && <span className="arc-cert-issuer">{it.issuer}</span>}
            </span>
            <button type="button" className="arc-cert-show" data-cursor="hover"
                    onClick={() => onShow(it)}
                    aria-label={'Ver ' + it.title}>Show</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ========================= CERTIFICATE LIGHTBOX ========================
   Same shape as ArcOverlay — scan on the left, metadata panel on the right —
   so both overlays read as one component. Shares its close plumbing
   (✕ / backdrop / Escape) and its body-scroll lock.

   Every row in titulos.json is currently a placeholder with no `image`, so the
   visual falls back to the category label rather than blocking the overlay:
   the metadata is worth reading before the scans arrive. */
function CertOverlay({ item, onClose }) {
  const overlayRef = useRef(null);
  const [err, setErr] = useState(false);
  // `image` is already a full relative path, so it only needs escaping —
  // assetUrl() is for the folder + file pairs in works.json.
  const src = item.image ? encodeURI(String(item.image)) : null;
  const categoryLabel = CERT_CATEGORY_LABEL[item.category] || item.category;

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

  return (
    <div className="arc-overlay arc-cert-overlay" ref={overlayRef} role="dialog"
         aria-modal="true" aria-label={item.title} onClick={onBackdrop}>
      <div className="arc-ov-content">
        <div className="arc-ov-visual">
          <div className="arc-ov-visual-inner" data-cert={item.category}>
            {src && !err
              ? <img src={src} alt={item.title} draggable="false" onError={() => setErr(true)} />
              : <span className="arc-ov-visual-label">{categoryLabel}</span>}
          </div>
        </div>

        <div className="arc-ov-panel">
          <button className="arc-ov-close" onClick={onClose} aria-label="Cerrar">
            <span aria-hidden="true">✕</span>
          </button>

          <div>
            <div className="arc-ov-breadcrumb">CERTIFICATES — {categoryLabel}</div>
            <h2 className="arc-ov-title">{item.title}</h2>

            <div className="arc-ov-meta">
              <MetaRow k="CATEGORÍA" v={categoryLabel} />
              <MetaRow k="EMISOR"    v={item.issuer} />
              <MetaRow k="FECHA"     v={item.date} />
              <MetaRow k="SKILLS"    v={(item.skills || []).join(' · ')} />
            </div>

            {item.description && (
              <p className="arc-ov-cert-desc">{item.description}</p>
            )}
          </div>

          <div className="arc-ov-actions">
            {item.credentialUrl && (
              <a className="arc-ov-btn" href={item.credentialUrl}
                 target="_blank" rel="noopener noreferrer">VERIFICAR ↗</a>
            )}
            <button className="arc-ov-btn" onClick={onClose}>CERRAR</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================= SIDEBAR: CONTACT FORM =======================
   Mounts contact.jsx's <ContactForm/> verbatim — tilting glass card,
   depth-layered fields that lift on focus, per-field validation and the
   animated success check. An ambient WebGL field (the same AMBIENT_FRAG
   the contact route uses) sits behind it, tinted with the page accent.

   Both come from scripts loaded ahead of this one; we degrade to a plain
   mailto block if either is missing rather than throwing. */
function SidebarContactForm() {
  const Form = window.ContactForm;
  const Shader = window.ShaderCanvas;
  const frag = window.AMBIENT_FRAG;
  const reduce = prefersReduce();

  return (
    <div className="arc-form" id="arc-contacto">
      <span className="arc-form-label">Contáctame</span>

      {Shader && frag && (
        <div className="arc-form-bg" aria-hidden="true">
          <Shader frag={frag} accent="#7dd3fc" plain frozen={reduce} />
        </div>
      )}

      {Form
        ? <Form />
        : (
          <p className="arc-form-fallback">
            Escríbeme a <a href="mailto:lisayitingyang@gmail.com">lisayitingyang@gmail.com</a>
          </p>
        )}

      <a className="arc-form-mail" href="mailto:lisayitingyang@gmail.com">
        lisayitingyang@gmail.com
      </a>
    </div>
  );
}

/* ========================== SHARED SITE NAV =========================== */
/* Floating pill nav — mirrors chrome.jsx so this page shares the same nav
   language as the SPA. Links to the SPA (index.html#route) trigger a full
   page load — this page lives outside the SPA router. */
/* Everything lives on this one page now — the certificates moved into the
   sidebar, so the nav no longer points anywhere else. */
const NAV_LABELS = {
  work: 'Work',
};

function SiteNav() {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const firstRun = useRef(true);

  const items = [
    { key: 'work', href: 'index.html', active: true },
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
          <div className="arc-nav-copy">© Yi-Ting Yang Tang 2025</div>
        </div>
      </div>

      <header className={'arc-nav-bar' + (open ? ' is-open' : '')}>
        <a className="arc-nav-logo" href="index.html">
          <span className="arc-nav-logo-mark">YT</span>
          <span className="arc-nav-logo-word">Yi-Ting Yang Tang</span>
        </a>
        <div className="arc-nav-center" aria-hidden="true">
          // {open ? 'elige tu destino' : 'tú estás en · work'}
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
function WorksPage() {
  const [works] = useState(() => window.WORKS_DATA || []);
  const [softwares] = useState(() => window.SOFTWARES_DATA || []);
  const [trayectoria] = useState(() => window.TRAYECTORIA_DATA || []);
  const [certificados] = useState(() => window.TITULOS_DATA || []);

  /* Name + role come from data/bio.json so there's a single source of truth
     (it already holds first/last/nick and the localized role). */
  const bio = window.BIO_DATA || {};
  const fullName = [bio.name && bio.name.first, bio.name && bio.name.last]
    .filter(Boolean).join(' ') || 'Yi-Ting Yang Tang';
  const role = (bio.role && (bio.role.es || bio.role.en)) || '3D Modeling & Texturing Artist';
  const [filter, setFilter] = useState('all');
  const [overlayWork, setOverlayWork] = useState(null);
  const [overlayIdx, setOverlayIdx] = useState(0);
  /* The certificate lightbox holds the whole entry, not just the src, so the
     caption can show the title + issuer alongside the image. */
  const [certImg, setCertImg] = useState(null);
  const centerRef = useRef(null);
  const isFilterAnimating = useRef(false);

  const filtered = useMemo(
    () => filter === 'all' ? works : works.filter(w => w.category === filter),
    [works, filter]
  );

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

  const openWork = useCallback((work) => {
    const idx = works.indexOf(work);
    setOverlayWork(work);
    setOverlayIdx(idx >= 0 ? idx : 0);
  }, [works]);
  const closeOverlay = useCallback(() => setOverlayWork(null), []);

  const Cursor = window.CustomCursor;

  const page = (
    <div className="arc-page">
      {Cursor && <Cursor />}
      <SiteNav />

      <div className="arc-grid">
        {/* ------- LEFT: sidebar — scrolls manually, independent of the carousel ------- */}
        <aside className="arc-left">
          <div className="arc-left-top">
            <div className="arc-brand">
              <div className="arc-brandline">
                <span className="arc-brandmark">YT</span>
                <h1 className="arc-brandword">{fullName}</h1>
              </div>
              <p className="arc-brandrole">{role}</p>
            </div>
            <nav className="arc-filters" aria-label="Filtrar trabajos">
              {FILTERS.map(f => (
                <Pill key={f.key}
                      active={filter === f.key}
                      onClick={() => changeFilter(f.key)}>
                  {f.label}
                </Pill>
              ))}
            </nav>
          </div>

          <SoftwareGrid items={softwares} />

          <SocialRow />

          <Trayectoria items={trayectoria} />

          <Certificados items={certificados} onShow={setCertImg} />

          <SidebarContactForm />
        </aside>

        {/* ------- CENTER: dual-column infinite carousel ------- */}
        <div className="arc-center-wrap" ref={centerRef}>
          {filtered.length > 0 ? (
            <ArcCarousel items={filtered}
                         paused={overlayWork !== null || certImg !== null}
                         onOpen={openWork} />
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

      {overlayWork && (
        <ArcOverlay work={overlayWork} index={overlayIdx} onClose={closeOverlay} />
      )}

      {certImg && (
        <CertOverlay item={certImg} onClose={() => setCertImg(null)} />
      )}
    </div>
  );

  /* ContactForm calls useLang() + useToast(), so it needs both providers
     above it. They come from lib.jsx; if it ever fails to load we still
     render the page (the form degrades to its mailto fallback). */
  const LangCtx = window.LangContext;
  const Toasts = window.ToastProvider;
  let tree = page;
  if (Toasts) tree = <Toasts>{tree}</Toasts>;
  if (LangCtx) tree = <LangCtx.Provider value={{ lang: 'es', setLang: () => {} }}>{tree}</LangCtx.Provider>;
  return tree;
}

/* -------------------------------------------------------------------
   Bootstrap : load the data files in parallel, then mount.
   ------------------------------------------------------------------- */
(async function bootstrap() {
  const load = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return await r.json();
    } catch (e) {
      console.warn('[works] data load failed:', url, e.message);
      return [];
    }
  };
  const [works, softwares, trayectoria, titulos, bio] = await Promise.all([
    load('data/works.json'),
    load('data/softwares.json'),
    load('data/trayectoria.json'),
    load('data/titulos.json'),
    load('data/bio.json'),
  ]);
  window.WORKS_DATA = works;
  window.SOFTWARES_DATA = softwares;
  window.TRAYECTORIA_DATA = trayectoria;
  window.TITULOS_DATA = titulos;
  window.BIO_DATA = bio;
  ReactDOM.createRoot(document.getElementById('root')).render(<WorksPage />);
})();
