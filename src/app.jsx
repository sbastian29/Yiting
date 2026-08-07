/* ===================================================================
   app.jsx — router + page-token switcher + curtain + mount
   =================================================================== */
const ROUTES = ['home','work','about','play','contact'];

const DEFAULT_ROUTE = 'work';

function applyTokens(route){
  const tk = PAGE_TOKENS[route] || PAGE_TOKENS[DEFAULT_ROUTE] || PAGE_TOKENS.home;
  document.documentElement.style.setProperty('--page-accent', tk.accent);
  document.documentElement.style.setProperty('--page-glow', tk.glow);
}

// Global boot flag read by heavy loops (e.g. work.jsx Three.js renderer) so
// they don't burn GPU behind the preloader curtain. Flipped true when the
// preloader hands off.
if (typeof window.__booted === 'undefined') window.__booted = false;

function App(){
  const getHash = () => { const h = (location.hash||('#'+DEFAULT_ROUTE)).replace('#',''); return ROUTES.includes(h)?h:DEFAULT_ROUTE; };
  const [route, setRoute] = useState(getHash());
  const [lang, setLang] = useState('es');
  const [trans, setTrans] = useState(null);   // { phase:'in'|'out', variant, x, y }
  const [booted, setBooted] = useState(false);
  const busy = useRef(false);

  useScrollVelocityStore();

  useEffect(()=>{ applyTokens(route); }, []);

  const navigate = useCallback((to) => {
    if (to===route || busy.current) { if(to===route){ if(window.__scrollTop) window.__scrollTop(true); else window.scrollTo({top:0,behavior:'smooth'}); } return; }
    busy.current = true;
    const variant = transitionFor(to);
    const T = TRANSITION_MS[variant];
    // cover with the DESTINATION world's transition, then swap
    setTrans({ phase:'in', variant, x:Mouse.x, y:Mouse.y });
    setTimeout(()=>{
      applyTokens(to);
      setRoute(to);
      if (window.imageflowNotifyRouteChange) window.imageflowNotifyRouteChange(route, to);
      location.hash = '#'+to;
      if(window.__scrollTop) window.__scrollTop(false); else window.scrollTo(0,0);
      if(window.refreshScroll) requestAnimationFrame(window.refreshScroll);
      setTrans(t => t ? { ...t, phase:'out' } : null);
      setTimeout(()=>{ setTrans(null); busy.current=false; }, T.out + 50);
    }, T.in + 30);
  }, [route]);

  // sync back/forward
  useEffect(()=>{
    const onHash = () => { const h=getHash(); if(h!==route){ applyTokens(h); setRoute(h); if(window.__scrollTop) window.__scrollTop(false); else window.scrollTo(0,0); if(window.refreshScroll) requestAnimationFrame(window.refreshScroll); } };
    window.addEventListener('hashchange', onHash);
    return ()=>window.removeEventListener('hashchange', onHash);
  }, [route]);

  const Page = { home:Home, work:Work, about:About, play:Play, contact:Contact }[route];

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <ToastProvider>
        <CustomCursor/>
        <a className="skip-link" href="#main"
           onClick={(e)=>{ e.preventDefault(); const m = document.getElementById('main'); if (m){ m.setAttribute('tabindex','-1'); m.focus({preventScroll:false}); m.scrollIntoView({block:'start'}); } }}>
          Saltar al contenido
        </a>
        <Header route={route} navigate={navigate} lang={lang} setLang={setLang}/>
        <main id="main" key={route} className="route-wrap" tabIndex={-1}>
          <Page navigate={navigate}/>
        </main>
        <ImageFlowLayer/>
        <WorldTransition tr={trans}/>
        {!booted && <Preloader onDone={()=>{ window.__booted = true; setBooted(true); if (window.__relayout) requestAnimationFrame(window.__relayout); }}/>}
      </ToastProvider>
    </LangContext.Provider>
  );
}

/* -------------------------------------------------------------------
   Bootstrap : load all JSON data domains before mounting React.
   Every component reads from window.DATA.<domain>; no hardcoded data.
   ------------------------------------------------------------------- */
(async function bootstrap(){
  const domains = ['bio','milestones','certifications','skills','work','play'];
  const data = {};
  const errs = [];
  await Promise.all(domains.map(async (d) => {
    try {
      const r = await fetch('data/' + d + '.json', { cache:'no-cache' });
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      data[d] = await r.json();
    } catch (e) {
      errs.push(d + ': ' + e.message);
      data[d] = (d === 'work' || d === 'play' || d === 'milestones' || d === 'certifications') ? [] : {};
    }
  }));
  window.DATA = data;
  if (errs.length) console.warn('[DATA] partial load:', errs.join(' · '));
  else console.log('[DATA] loaded', Object.keys(data).map(k => k+':'+(Array.isArray(data[k])?data[k].length:'obj')).join(' · '));
  ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
})();
