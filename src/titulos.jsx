/* ===================================================================
   titulos.jsx — Títulos / credentials grid (standalone page).

   Structure mirrors the reference portfolio (a clean, simple card grid)
   rather than the archive page's carousel:

     nav → page header (h1 + lede + 3 stats) → search + filter chips
     → results counter + reset → card grid → empty state → footer

   Filtering is AND across groups, OR within a group, plus a free-text
   match on title / issuer / description. All client-side over the array
   loaded from data/titulos.json → window.TITULOS_DATA.

   Design system is Lisa's (tokens.css): dark surface, Syne headings,
   DM Sans body, Martian Mono labels, per-category accent tints.
   =================================================================== */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

const prefersReduce = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
};

/* ---- category taxonomy: label + accent, single source of truth ---- */
const CATEGORIES = [
  { key: 'premio',         label: 'Premio',         accent: 'var(--warm)' },
  { key: 'beca',           label: 'Beca',           accent: 'var(--accent)' },
  { key: 'certificacion',  label: 'Certificación',  accent: 'var(--cold)' },
  { key: 'reconocimiento', label: 'Reconocimiento', accent: 'var(--green)' },
];
const catLabel = (k) => (CATEGORIES.find(c => c.key === k) || {}).label || k;

/* ============================== NAV ================================== */
/* Same floating pill nav as the archive page so both surfaces share the
   site's language. Duplicated rather than imported — these are standalone
   pages with no shared bundle. */
function SiteNav() {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const firstRun = useRef(true);

  const items = [
    { key: 'work',    label: 'Work',    href: 'index.html' },
    { key: 'titulos', label: 'Títulos', href: 'titulos.html', active: true },
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
      if (window.lockBodyScroll) window.lockBodyScroll();
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
      g.fromTo(panel, { clipPath: 'inset(0 0 100% 0)', autoAlpha: 1 },
        { clipPath: 'inset(0 0 0% 0)', duration: 0.45, ease: 'power3.out' });
      g.fromTo(linkEls, { y: 16, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, stagger: 0.06, duration: 0.35, ease: 'power2.out', delay: 0.2 });
      if (foot) g.fromTo(foot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, delay: 0.5 });
    } else {
      if (window.unlockBodyScroll) window.unlockBodyScroll();
      if (!g || reduce) {
        if (g) { g.set(overlay, { autoAlpha: 0 }); g.set(panel, { clipPath: 'inset(0 0 100% 0)' }); }
        return;
      }
      g.killTweensOf([overlay, panel, ...linkEls, foot]);
      g.to([...linkEls, foot].filter(Boolean), { autoAlpha: 0, y: -8, stagger: 0.03, duration: 0.2 });
      g.to(panel, { clipPath: 'inset(0 0 100% 0)', duration: 0.35, ease: 'power3.in', delay: 0.15 });
      g.to(overlay, { autoAlpha: 0, duration: 0.3, delay: 0.2 });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
              <span className="arc-nav-item-name">{it.label}</span>
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
          // {open ? 'elige tu destino' : 'tú estás en · títulos'}
        </div>
        <button className={'arc-nav-menu' + (open ? ' is-open' : '')}
                onClick={() => setOpen(o => !o)}
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

/* ============================== CARD ================================== */
function TituloCard({ item }) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = item.image && !imgErr;
  return (
    <article className={'tt-card' + (item.featured ? ' is-featured' : '')}
             data-category={item.category}>
      <div className="tt-card-media">
        {item.featured && <span className="tt-card-flag">Destacado</span>}
        {showImg
          ? <img src={item.image} alt="" loading="lazy" draggable="false"
                 onError={() => setImgErr(true)} />
          : <span className="tt-card-ph" aria-hidden="true">{catLabel(item.category)}</span>}
      </div>

      <div className="tt-card-body">
        <span className="tt-card-badge">{catLabel(item.category)}</span>
        <h3 className="tt-card-title">{item.title}</h3>
        <p className="tt-card-issuer">{item.issuer}</p>
        {item.description && <p className="tt-card-desc">{item.description}</p>}

        {item.skills && item.skills.length > 0 && (
          <div className="tt-card-skills">
            {item.skills.map(s => <span key={s} className="tt-skill">{s}</span>)}
          </div>
        )}

        <div className="tt-card-foot">
          <span className="tt-card-date">{item.date}</span>
          {item.credentialUrl && (
            <a className="tt-card-link" href={item.credentialUrl}
               target="_blank" rel="noopener noreferrer">
              Verificar <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/* ============================== PAGE ================================== */
function TitulosPage() {
  const [items] = useState(() => window.TITULOS_DATA || []);
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState([]);      // active category keys (OR within group)
  const [issuers, setIssuers] = useState([]); // active issuer names

  /* Only offer chips for categories/issuers that actually occur, so the
     filter bar never shows a control that can only ever return zero. */
  const presentCats = useMemo(
    () => CATEGORIES.filter(c => items.some(i => i.category === c.key)),
    [items]
  );
  const presentIssuers = useMemo(
    () => Array.from(new Set(items.map(i => i.issuer).filter(Boolean))).sort(),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i => {
      if (cats.length && !cats.includes(i.category)) return false;
      if (issuers.length && !issuers.includes(i.issuer)) return false;
      if (!q) return true;
      return [i.title, i.issuer, i.description, ...(i.skills || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [items, query, cats, issuers]);

  const stats = useMemo(() => ([
    { n: items.length,                                          l: 'Títulos' },
    { n: new Set(items.map(i => i.issuer).filter(Boolean)).size, l: 'Emisores' },
    { n: new Set(items.map(i => i.category).filter(Boolean)).size, l: 'Tipos' },
  ]), [items]);

  const toggle = useCallback((list, setList) => (value) => {
    setList(cur => cur.includes(value) ? cur.filter(v => v !== value) : cur.concat(value));
  }, []);
  const toggleCat = toggle(cats, setCats);
  const toggleIssuer = toggle(issuers, setIssuers);

  const dirty = query !== '' || cats.length > 0 || issuers.length > 0;
  const reset = () => { setQuery(''); setCats([]); setIssuers([]); };

  /* global.css hides the native cursor on fine pointers, so the custom one
     must be mounted here or the page ends up with no visible pointer. */
  const Cursor = window.CustomCursor;

  return (
    <div className="tt-page">
      {Cursor && <Cursor />}
      <SiteNav />

      <main className="tt-main">
        {/* ---- header + stats ---- */}
        <header className="tt-header">
          <span className="tt-eyebrow">// credenciales</span>
          <h1 className="tt-h1">Títulos</h1>
          <p className="tt-lede">
            Premios, becas, certificaciones y reconocimientos que jalonan
            el recorrido como artista 3D.
          </p>
          <div className="tt-stats">
            {stats.map(s => (
              <div className="tt-stat" key={s.l}>
                <div className="tt-stat-n">{s.n}</div>
                <div className="tt-stat-l">{s.l}</div>
              </div>
            ))}
          </div>
        </header>

        {/* ---- search + chips ---- */}
        <section className="tt-filters" aria-label="Filtrar títulos">
          <div className="tt-search">
            <svg className="tt-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.5" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              className="tt-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, emisor o skill…"
              aria-label="Buscar títulos"
            />
            {query && (
              <button type="button" className="tt-search-clear"
                      onClick={() => setQuery('')}>Limpiar</button>
            )}
          </div>

          {presentCats.length > 1 && (
            <div className="tt-group">
              <span className="tt-group-label">Por tipo</span>
              <div className="tt-chips">
                {presentCats.map(c => (
                  <button key={c.key} type="button"
                          className={'tt-chip' + (cats.includes(c.key) ? ' is-on' : '')}
                          data-category={c.key}
                          aria-pressed={cats.includes(c.key)}
                          onClick={() => toggleCat(c.key)}>
                    <span className="tt-chip-dot" aria-hidden="true"></span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {presentIssuers.length > 1 && (
            <div className="tt-group">
              <span className="tt-group-label">Por emisor</span>
              <div className="tt-chips">
                {presentIssuers.map(name => (
                  <button key={name} type="button"
                          className={'tt-chip' + (issuers.includes(name) ? ' is-on' : '')}
                          aria-pressed={issuers.includes(name)}
                          onClick={() => toggleIssuer(name)}>
                    <span className="tt-chip-dot" aria-hidden="true"></span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="tt-actions">
            <span className="tt-counter" role="status" aria-live="polite">
              Mostrando <strong>{filtered.length}</strong> de <strong>{items.length}</strong> títulos
            </span>
            <button type="button" className="tt-reset" onClick={reset} disabled={!dirty}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   aria-hidden="true">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Reset
            </button>
          </div>
        </section>

        {/* ---- grid ---- */}
        {filtered.length > 0 ? (
          <div className="tt-grid">
            {filtered.map(i => <TituloCard key={i.id} item={i} />)}
          </div>
        ) : (
          <div className="tt-empty">
            <h2>No se encontraron títulos</h2>
            <p>Prueba a ajustar los filtros o el término de búsqueda.</p>
            {dirty && <button type="button" className="tt-reset" onClick={reset}>Quitar filtros</button>}
          </div>
        )}
      </main>

      <footer className="tt-footer">
        <a className="tt-footer-link" href="index.html">Work</a>
        <a className="tt-footer-link" href="titulos.html">Títulos</a>
        <a className="tt-footer-link" href="mailto:lisayitingyang@gmail.com">Contacto</a>
        <span className="tt-footer-copy">© Yi-Ting Yang Tang 2025</span>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------
   Bootstrap : load data, then mount.
   ------------------------------------------------------------------- */
(async function bootstrap() {
  try {
    const r = await fetch('data/titulos.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
    window.TITULOS_DATA = await r.json();
  } catch (e) {
    console.warn('[titulos] data load failed:', e.message);
    window.TITULOS_DATA = [];
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<TitulosPage />);
})();
