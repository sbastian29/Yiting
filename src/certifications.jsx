/* ===================================================================
   certifications.jsx — standalone Certifications page (v2 rebuild).
   Self-contained: no SPA router, no lib.jsx / scroll.jsx dependency.

   Grid mechanic (adapted from a project-grid interaction):
     • Full-bleed glass panels, badge centered, name+code hidden by
       default (opacity 0 / translateY) and revealed on hover of that
       tile only.
     • Hovering one tile dims + grayscales ALL siblings simultaneously
       (JS-driven active/dimmed state across tiles, not CSS :hover).
     • Category pills (TODOS + one per `type`) filter the grid.

   Click flow:
     A · Grid   → click a tile
     B · Intro  — big badge + name + code + blurb + dimmed side rail
     C · Detail — expands in place: date, issuer, description, verify
   Transitions between states use a clip-path polygon wipe.

   prefers-reduced-motion / no-hover (mobile): drop the hover hide +
   grayscale + wipe — info is always visible, states just crossfade.

   Data: window.CERTS_DATA (loaded before mount).
   =================================================================== */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

const prefersReduce = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
};
const hoverCapable = () => {
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; }
  catch (e) { return true; }
};

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
          <div className="cert-badge-ph">
            <span className="cbp-medal">{cert.medal || '★'}</span>
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

/* ================== RAIL (image-tile mosaic) + CENTER PREVIEW (State A) ================== */
const RAIL_PAGE = 6;   // 2 cols × 3 rows visible at once

function Grid({ certs, lang, onOpen, filter, setFilter, types, hoverEnabled }) {
  const [hovered, setHovered] = useState(null);   // rail index currently hovered
  const [shownIdx, setShownIdx] = useState(null); // last cert shown in preview (persists during fade-out)
  const [batch, setBatch] = useState(0);          // active page of tiles when pinned
  const wrapRef = useRef(null);

  const shown = useMemo(
    () => certs.map((c, i) => ({ c, i })).filter(x => !filter || x.c.type === filter),
    [certs, filter]
  );

  const pageCount = Math.max(1, Math.ceil(shown.length / RAIL_PAGE));
  const canPin = pageCount > 1 && hoverEnabled;   // hoverEnabled already excludes reduced-motion
  const items = canPin ? shown.slice(batch * RAIL_PAGE, batch * RAIL_PAGE + RAIL_PAGE) : shown;

  // outer wrapper tall enough to scroll through every batch — same formula Work uses
  const perStepVh = 90;
  const trackHeight = (100 + pageCount * perStepVh) + 'vh';

  // keep the preview content mounted while it fades back out on mouse-leave
  useEffect(() => { if (hovered !== null) setShownIdx(hovered); }, [hovered]);

  // filtering recomputes the batches against the filtered subset — start at page 0
  useEffect(() => { setBatch(0); }, [filter]);

  // pin + page-through-batches via CSS sticky + manual scroll-progress
  // (the exact mechanism Work's ZigzagReveal / About's timeline use — no ScrollTrigger)
  useEffect(() => {
    if (!canPin) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const r = wrap.getBoundingClientRect();
      const scrollable = Math.max(1, r.height - window.innerHeight);
      const p = Math.max(0, Math.min(1, -r.top / scrollable));
      const idx = Math.min(pageCount - 1, Math.floor(p * pageCount));
      setBatch(prev => (prev === idx ? prev : idx));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canPin, pageCount, filter]);

  const previewCert = shownIdx !== null ? certs[shownIdx] : null;
  const previewOn = hoverEnabled && hovered !== null;

  const filterPills = (
    <div className="certs-filter" role="group" aria-label="Filter by type">
      <button
        type="button"
        className={'cf-pill' + (filter === null ? ' is-active' : '')}
        aria-pressed={filter === null}
        onClick={() => setFilter(null)}
      >
        <FlipLabel text={tr(UI.all, lang)} />
      </button>
      {types.map(t => (
        <button
          key={t}
          type="button"
          className={'cf-pill' + (filter === t ? ' is-active' : '')}
          aria-pressed={filter === t}
          onClick={() => setFilter(filter === t ? null : t)}
        >
          <FlipLabel text={typeLabel(t, lang)} />
        </button>
      ))}
    </div>
  );

  const railLayout = (
    <div className="certs-rail-layout">
      {/* left: image-only mosaic of badge tiles */}
      <div
        className={'certs-tilewrap' + (hoverEnabled ? '' : ' no-hover')}
        onMouseLeave={() => setHovered(null)}
      >
        <ul className="certs-tilegrid" key={'batch-' + batch}>
          {items.map(({ c, i }, pos) => {
            const n = (canPin ? batch * RAIL_PAGE + pos : pos) + 1;
            return (
              <li key={i}>
                <button
                  type="button"
                  className={'cert-tile' + (hovered === i ? ' is-active' : '')}
                  aria-label={tr(c.name, lang)}
                  onMouseEnter={() => hoverEnabled && setHovered(i)}
                  onFocus={() => hoverEnabled && setHovered(i)}
                  onBlur={() => hoverEnabled && setHovered(null)}
                  onClick={() => onOpen(i)}
                >
                  <span className="cert-tile-panel">
                    <Badge cert={c} wrapClass="cert-tile-badge" note={typeLabel(c.type, lang)} />
                  </span>
                  <span className="cert-tile-num">{String(n).padStart(2, '0')}</span>
                </button>
              </li>
            );
          })}
        </ul>
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
      {canPin && <span className="certs-page-ind"> · {String(batch + 1).padStart(2, '0')}/{String(pageCount).padStart(2, '0')}</span>}
    </div>
  );

  // Pinned: sticky stage that fills the viewport for the whole scroll sequence.
  if (canPin) {
    return (
      <div className="certs-view" key={'rail-' + (filter || 'all')}>
        <div className="certs-pin-wrap" ref={wrapRef} style={{ height: trackHeight, position: 'relative' }}>
          <div
            className="certs-pin-sticky"
            style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div className="certs-pin-pills">{filterPills}</div>
            <div className="certs-pin-stage">{railLayout}</div>
            <div className="certs-pin-counter">{counter}</div>
          </div>
        </div>
      </div>
    );
  }

  // Static (single batch or reduced-motion / no-hover): original in-flow layout.
  return (
    <div className="certs-view" key={'rail-' + (filter || 'all')}>
      {filterPills}
      {railLayout}
      {counter}
    </div>
  );
}

/* ==================== INTRO + DETAIL (States B / C) ==================== */
function Detail({ certs, lang, index, expanded, onSelect, onExpand, onClose }) {
  const c = certs[index];
  const moreRef = useRef(null);

  return (
    <div className="certs-view" key={'detail-' + index}>
      <button type="button" className="certs-close" onClick={onClose}>
        <span className="cc-x" aria-hidden="true">✕</span>
        {expanded ? tr(UI.backAll, lang) : tr(UI.close, lang)}
      </button>

      <div className="certs-detail">
        <div className="certs-detail-main">
          <div className="certs-bignum">
            {codeFor(index)}
            <span className="certs-bigtype" data-type={c.type}>{typeLabel(c.type, lang)}</span>
          </div>
          <Badge cert={c} wrapClass="certs-bigbadge" note={typeLabel(c.type, lang)} />
          <h2 className="certs-detail-name">{tr(c.name, lang)}</h2>
          <p className="certs-detail-blurb">{tr(c.blurb, lang)}</p>

          {/* State C — expands in place */}
          <div className={'certs-more' + (expanded ? ' open' : '')}>
            <div className="certs-more-inner" ref={moreRef}>
              <div className="certs-meta">
                <div className="certs-meta-item">
                  <div className="cmi-k">{tr(UI.date, lang)}</div>
                  <div className="cmi-v">{tr(c.date, lang) || c.year}</div>
                </div>
                <div className="certs-meta-item">
                  <div className="cmi-k">{tr(UI.issuer, lang)}</div>
                  <div className="cmi-v">{tr(c.issuer, lang)}</div>
                </div>
              </div>
              <p className="certs-desc">{tr(c.description, lang)}</p>
            </div>
          </div>

          <div className="certs-actions">
            {!expanded && (
              <button type="button" className="certs-btn certs-btn--accent" onClick={onExpand}>
                {tr(UI.readMore, lang)} <span className="cb-arrow" aria-hidden="true">→</span>
              </button>
            )}
            {expanded && c.link && (
              <a className="certs-btn certs-btn--accent" href={c.link}
                 target="_blank" rel="noopener noreferrer">
                {tr(UI.verify, lang)} <span className="cb-arrow" aria-hidden="true">↗</span>
              </a>
            )}
            <button type="button" className="certs-btn" onClick={onClose}>
              {tr(UI.backAll, lang)}
            </button>
          </div>
        </div>

        {/* dimmed side rail — jump directly to another cert's intro */}
        <aside className="certs-rail" aria-label={tr(UI.others, lang)}>
          <div className="certs-rail-label">{tr(UI.others, lang)}</div>
          {certs.map((oc, i) => (
            <button
              key={i}
              type="button"
              className={'cert-mini' + (i === index ? ' is-current' : '')}
              aria-current={i === index ? 'true' : 'false'}
              onClick={() => onSelect(i)}
            >
              <span className="cert-mini-badge"><MiniBadge cert={oc} /></span>
              <span className="cert-mini-txt">
                <span className="cm-name">{tr(oc.name, lang)}</span>
                <span className="cm-year">{tr(oc.date, lang) || oc.year}</span>
              </span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

function MiniBadge({ cert }) {
  const [err, setErr] = useState(false);
  if (cert.badge && !err) {
    return <img src={cert.badge} alt="" draggable="false" onError={() => setErr(true)} />;
  }
  return <span className="cmb-medal">{cert.medal || '★'}</span>;
}

/* ============================== PAGE ================================== */
function CertificationsPage() {
  const certs = (window.CERTS_DATA && window.CERTS_DATA.length) ? window.CERTS_DATA : [];
  const [lang, setLang] = useState('es');
  const [view, setView] = useState('grid');   // 'grid' | 'detail'
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState(null);
  const [headIn, setHeadIn] = useState(prefersReduce());
  const [hoverEnabled] = useState(() => hoverCapable() && !prefersReduce());

  const types = useMemo(() => {
    const seen = [];
    certs.forEach(c => { if (c.type && !seen.includes(c.type)) seen.push(c.type); });
    return seen;
  }, [certs]);

  // reveal header on mount (skipped under reduced motion — already shown)
  useEffect(() => {
    if (prefersReduce()) { setHeadIn(true); return; }
    const id = requestAnimationFrame(() => setHeadIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const openIntro = useCallback((i) => { setIndex(i); setExpanded(false); setView('detail'); }, []);
  const selectOther = useCallback((i) => { setIndex(i); setExpanded(false); }, []);
  const backToGrid = useCallback(() => { setView('grid'); setExpanded(false); }, []);

  // Escape → step back (detail → grid; expanded → intro)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (view === 'detail') { if (expanded) setExpanded(false); else backToGrid(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, expanded, backToGrid]);

  return (
    <div className="certs-page" data-screen-label="Certifications">
      <div className="certs-shell">
        <header className="certs-topbar">
          <a className="certs-home" href="index.html">
            <span className="lm-box">YT</span>
            <span>LISA</span>
          </a>
          <nav className="certs-lang" aria-label="Language">
            {['es', 'en', 'zh'].map((code, i) => (
              <React.Fragment key={code}>
                {i > 0 && <span className="nav-lang-sep" style={{ margin: '0 8px', color: 'var(--text-mid)' }}>·</span>}
                <button
                  type="button"
                  onClick={() => setLang(code)}
                  className="certs-back"
                  style={{ color: lang === code ? 'var(--page-accent)' : undefined }}
                >
                  {code === 'zh' ? '中文' : code.toUpperCase()}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </header>

        <div className={'certs-head certs-fade' + (headIn ? ' in' : '')}>
          <div className="certs-eyebrow">{tr(UI.eyebrow, lang)}</div>
          <h1 className="certs-title">{tr(UI.title, lang)}</h1>
          <p className="certs-sub">{tr(UI.sub, lang)}</p>
        </div>

        {certs.length === 0 ? (
          <p className="certs-sub" style={{ color: 'var(--text-mid)' }}>
            No certification data available.
          </p>
        ) : view === 'grid' ? (
          <Grid
            certs={certs}
            lang={lang}
            onOpen={openIntro}
            filter={filter}
            setFilter={setFilter}
            types={types}
            hoverEnabled={hoverEnabled}
          />
        ) : (
          <Detail
            certs={certs}
            lang={lang}
            index={index}
            expanded={expanded}
            onSelect={selectOther}
            onExpand={() => setExpanded(true)}
            onClose={backToGrid}
          />
        )}
      </div>
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
