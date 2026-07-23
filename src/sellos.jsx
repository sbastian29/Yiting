/* ===================================================================
   sellos.jsx — banda "tragaperras" de sellos por proyecto
   Cuando un proyecto pasa al frente de la órbita (o se abre),
   los 7 carretes barajan TODOS los sellos del estudio antes de
   fijarse, uno a uno de izquierda a derecha, en los del proyecto.
   =================================================================== */
const PROJECT_SELLOS = {
  'vitrum':               ['MAYA','SUBSTANCE','UE5','HARD-SURFACE','WEAPONS','1º UCM ★','2025'],
  'elemental-odyssey':    ['BLENDER','SUBSTANCE','UNITY','LIGHTING','MODELING','1º HACKJAM ★','2024'],
  'bankinter-vp':         ['UE5','VIRTUAL PROD','LED WALL','REALTIME','3D ARTIST','BROADCAST','2024'],
  'sigurds-fate':         ['BLENDER','3D COAT','STYLISED','PROPS','TEXTURE','NÓRDICO','2024'],
  'stylised-environment': ['MAYA','MARMOSET','STYLISED','ENVIRONMENT','LIGHTING','SOLO','2024'],
  'ice-axe':              ['BLENDER','SUBSTANCE','STYLISED','HARD-SURFACE','PROP','SOLO','2024'],
  'urban-jam':            ['BLENDER','SUBSTANCE','URBANO','TEXTURE','MODELING','2º HACKJAM ★','2023'],
  'mapping-me':           ['TOUCHDESIGNER','AFTER FX','MAPPING','VISUALES','FESTIVAL','PROYECCIÓN','2024'],
};
const ALL_SELLOS = [...new Set(Object.values(PROJECT_SELLOS).flat())];

function SelloSlot({ final, delay, spinKey }){
  const [txt, setTxt] = useState(final);
  const [mode, setMode] = useState('idle'); // idle | spin | lock
  useEffect(()=>{
    if (!spinKey){ setTxt(final); return; }
    setMode('spin');
    let i = (Math.random()*ALL_SELLOS.length)|0;
    const iv = setInterval(()=>{
      i = (i + 1 + ((Math.random()*3)|0)) % ALL_SELLOS.length;
      setTxt(ALL_SELLOS[i]);
    }, 62);
    const lockT = setTimeout(()=>{ clearInterval(iv); setTxt(final); setMode('lock'); }, 430 + delay);
    const idleT = setTimeout(()=>setMode('idle'), 430 + delay + 480);
    return ()=>{ clearInterval(iv); clearTimeout(lockT); clearTimeout(idleT); };
  }, [spinKey, final]);
  return (
    <div className={'sello '+mode+(final.includes('★')?' star':'')}>
      <span>{txt}</span>
    </div>
  );
}

function SelloBand({ project }){
  const [spinKey, setSpinKey] = useState(0);
  const [current, setCurrent] = useState(project);
  const tmr = useRef(null);
  const pid = project ? project.id : null;
  useEffect(()=>{
    if (!project) return;
    clearTimeout(tmr.current);
    // debounce: la órbita gira sola — solo barajamos cuando el frente se asienta
    tmr.current = setTimeout(()=>{
      setCurrent(project);
      setSpinKey(k=>k+1);
    }, 340);
    return ()=>clearTimeout(tmr.current);
  }, [pid]);
  if (!current) return null;
  const sellos = PROJECT_SELLOS[current.slug] || [];
  return (
    <div className="sello-band" aria-label={'sellos · '+current.title}>
      <div className="sello-who">
        <span className="sello-id mono-tag">{current.id}</span>
        <span className="sello-name">{current.title}</span>
      </div>
      <div className="sello-row">
        {sellos.map((s,i)=>(
          <SelloSlot key={current.slug+'-'+i} final={s} delay={i*95} spinKey={spinKey}/>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SelloBand, PROJECT_SELLOS });
