/* ===================================================================
   contact.jsx — "El contacto" : layered-3D contact form
   Three effects working together:
     1) ambient Three/WebGL shader scene (GLSL_PRELUDE + ShaderCanvas)
     2) cursor-following tilt on the glass card (lagged, subtle)
     3) fields raised as their own depth layer, extra lift + glow on focus
   Submission is a CLIENT-SIDE STUB only — see the TODO in onSubmit.
   =================================================================== */
const EMAIL = 'lisa.yangtang@gmail.com';

/* Social links as DATA — URLs live here, never hardcoded in JSX. Swap a
   `soon` → `live` and drop in the real url to publish a channel. */
const SOCIALS = [
  { id:'email',      label:'EMAIL',      url:'mailto:'+EMAIL,  status:'live' },
  { id:'artstation', label:'ARTSTATION', url:'',               status:'soon' },
  { id:'linkedin',   label:'LINKEDIN',   url:'',               status:'soon' },
  { id:'instagram',  label:'INSTAGRAM',  url:'',               status:'soon' },
];

/* ambient background — slow curl/fbm field, low contrast, accent-tinted.
   Reads as atmosphere, not a scene to look at. uMouse tracks the real
   cursor every frame (ShaderCanvas feeds it), so the faint glow drifts. */
const AMBIENT_FRAG = `
void main(){
  vec2 uv = vUv;
  vec2 p  = uv * 1.7;
  vec2 fl = curl(p * 0.6 + uTime * 0.025);
  p += fl * 0.45;
  float n  = fbm(p + uTime * 0.04);
  float n2 = fbm(p * 1.8 - uTime * 0.02);
  float v  = 0.5 + 0.5 * sin(n * 3.14159 + n2 * 1.5);
  float md   = length(uv - uMouse);
  float glow = exp(-md * 2.6) * (0.10 + 0.14 * uHover);
  vec3 base = vec3(0.021, 0.023, 0.030);
  vec3 col  = mix(base, uAccent, v * 0.10 + glow);
  float vig = smoothstep(1.25, 0.15, length(uv - 0.5));
  col *= 0.55 + 0.45 * vig;
  gl_FragColor = vec4(col, 1.0);
}`;

/* useTilt — lagged cursor-driven rotate on a card. Returns a ref to attach
   to the tilting element (which must live inside a `perspective` ancestor).
   `enabled=false` (reduced-motion / touch) → no listeners, no transform. */
function useTilt(enabled){
  const cardRef = useRef(null);
  useEffect(()=>{
    const el = cardRef.current;
    if (!el || !enabled) return;
    const MAX = 6; // degrees — subtle, never cartoonish
    const s = { tx:0, ty:0, cx:0, cy:0, raf:0 };
    const onMove = (e)=>{
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width  - 0.5;
      const py = (e.clientY - r.top)  / r.height - 0.5;
      s.tx = -py * MAX * 2;  // rotateX (invert: cursor up → top tilts back)
      s.ty =  px * MAX * 2;  // rotateY
    };
    const onLeave = ()=>{ s.tx = 0; s.ty = 0; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    const loop = ()=>{
      s.cx += (s.tx - s.cx) * 0.08;  // lerp → lagged easing, not 1:1
      s.cy += (s.ty - s.cy) * 0.08;
      el.style.transform = `rotateX(${s.cx.toFixed(3)}deg) rotateY(${s.cy.toFixed(3)}deg)`;
      s.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);
    return ()=>{
      cancelAnimationFrame(s.raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.style.transform = '';
    };
  }, [enabled]);
  return cardRef;
}

function ContactForm(){
  const { lang } = useLang();
  const { toast } = useToast();
  const tx = (e, en, zh) => lang==='zh' ? zh : (lang==='es' ? e : en);
  const vp = useViewport();
  const tiltEnabled = !vp.reduceMotion && !vp.isTouch;
  const flat = vp.reduceMotion;
  const cardRef = useTilt(tiltEnabled);

  const [form, setForm]     = useState({ name:'', email:'', type:'modeling', message:'' });
  const [errors, setErrors] = useState({});
  const [sent, setSent]     = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const TYPES = [
    { v:'modeling',    l:tx('Modelado / Texturizado 3D','3D modeling / texturing','3D 建模 / 贴图') },
    { v:'virtualprod', l:tx('Producción virtual','Virtual production','虚拟制作') },
    { v:'collab',      l:tx('Colaboración / freelance','Collaboration / freelance','合作 / 自由职业') },
    { v:'other',       l:tx('Otro','Other','其他') },
  ];

  const validate = ()=>{
    const er = {};
    if (!form.name.trim())  er.name = tx('Falta tu nombre','Your name is required','请填写姓名');
    if (!form.email.trim()) er.email = tx('Falta tu email','Your email is required','请填写邮箱');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      er.email = tx('Email no válido','Enter a valid email','邮箱格式无效');
    if (!form.message.trim()) er.message = tx('Cuéntame algo','Tell me a little','请留言');
    return er;
  };

  const onSubmit = (e)=>{
    e.preventDefault();
    const er = validate();
    setErrors(er);
    if (Object.keys(er).length) return;
    // TODO: wire real submission (mailto/Formspree/EmailJS — decided later)
    // This is a client-side-only placeholder: no network call is made.
    setSent(true);
    toast(tx('✓ Mensaje enviado · te respondo en ~24h','✓ Message sent · I reply in ~24h','✓ 消息已发送 · 我会在约 24 小时内回复'));
  };

  const reset = ()=>{ setForm({ name:'', email:'', type:'modeling', message:'' }); setErrors({}); setSent(false); };

  return (
    <div className={'cf-stage'+(flat?' flat':'')}>
      <div className={'cf-card'+(sent?' sent':'')} ref={cardRef}>
        <form className="cf-form" onSubmit={onSubmit} noValidate>
          <div className="cf-head">
            <h2 className="cf-title">{tx('Cuéntame tu proyecto','Tell me about your project','聊聊你的项目')}</h2>
            <p className="cf-sub">{tx('Escríbeme y te respondo en ~24h.','Drop me a line — I reply in ~24h.','给我留言，我会在约 24 小时内回复。')}</p>
          </div>

          <div className="cf-row">
            <label className={'cf-field'+(errors.name?' err':'')} htmlFor="cf-name">
              <span className="cf-label">{tx('Nombre','Name','姓名')}</span>
              <input id="cf-name" className="cf-input" data-cursor="text" type="text"
                     value={form.name} onChange={set('name')}
                     placeholder={tx('Tu nombre','Your name','你的名字')} autoComplete="name"/>
              {errors.name && <span className="cf-error">{errors.name}</span>}
            </label>

            <label className={'cf-field'+(errors.email?' err':'')} htmlFor="cf-email">
              <span className="cf-label">{tx('Email','Email','邮箱')}</span>
              <input id="cf-email" className="cf-input" data-cursor="text" type="email"
                     value={form.email} onChange={set('email')}
                     placeholder="you@studio.com" autoComplete="email"/>
              {errors.email && <span className="cf-error">{errors.email}</span>}
            </label>
          </div>

          <label className="cf-field" htmlFor="cf-type">
            <span className="cf-label">{tx('Tipo de proyecto','Project type','项目类型')}</span>
            <div className="cf-select-wrap">
              <select id="cf-type" className="cf-select" data-cursor="hover"
                      value={form.type} onChange={set('type')}>
                {TYPES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </label>

          <label className={'cf-field'+(errors.message?' err':'')} htmlFor="cf-msg">
            <span className="cf-label">{tx('Mensaje','Message','留言')}</span>
            <textarea id="cf-msg" className="cf-input" data-cursor="text" data-lenis-prevent
                      value={form.message} onChange={set('message')} rows={4}
                      placeholder={tx('Cuéntame en qué estás trabajando…','Tell me what you\u2019re working on…','告诉我你在做什么…')}></textarea>
            {errors.message && <span className="cf-error">{errors.message}</span>}
          </label>

          <div className="cf-submit">
            <button type="submit" className="cf-btn" data-cursor="hover">
              {tx('Enviar mensaje','Send message','发送消息')} <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>

        <div className="cf-success" aria-hidden={!sent}>
          <svg className="cf-check" viewBox="0 0 52 52" aria-hidden="true">
            <circle className="cf-check-c" cx="26" cy="26" r="23" fill="none"/>
            <path className="cf-check-p" d="M15 27 l8 8 l15 -17" fill="none"/>
          </svg>
          <h2 className="cf-title">{tx('¡Mensaje enviado!','Message sent!','消息已发送！')}</h2>
          <p className="cf-sub">{tx('Gracias — te responderé pronto.','Thank you — I\u2019ll get back to you shortly.','谢谢——我会尽快回复你。')}</p>
          <button type="button" className="cf-btn ghost" data-cursor="hover" onClick={reset}>
            {tx('Enviar otro','Send another','再发一条')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Contact({ navigate }){
  const { lang } = useLang();
  const tx = (e, en, zh) => lang==='zh' ? zh : (lang==='es' ? e : en);
  const { log } = useToast();
  const fxRef = useScrollFX([]);
  const vp = useViewport();
  useEffect(()=>{ log('// converging to center...'); }, []);

  return (
    <div className="page contact" ref={fxRef} data-screen-label="Contact">
      <div className="contact-bg" aria-hidden="true">
        <ShaderCanvas frag={AMBIENT_FRAG} accent="#fbbf7a" plain frozen={vp.reduceMotion}/>
      </div>

      <div className="contact-inner">
        <div className="cf-intro">
          <div className="eyebrow" data-fx="clip">{tx('Hablemos','Let\u2019s talk','聊聊')}</div>
        </div>

        <ContactForm/>

        <div className="contact-side">
          <div className="avail-badge"><span className="live-dot"></span>{tx('Disponible para proyectos','Available for work','可接项目')}</div>
          <div className="contact-socials">
            {SOCIALS.map(s => s.status === 'live' ? (
              <a key={s.id} href={s.url} data-cursor="hover"
                 target={s.url.startsWith('http') ? '_blank' : undefined}
                 rel={s.url.startsWith('http') ? 'noopener noreferrer' : undefined}>{s.label}</a>
            ) : (
              <span key={s.id} className="soon" role="link" aria-disabled="true"
                    title={tx('Próximamente','Coming soon','即将推出')}>
                {s.label} <em style={{fontStyle:'normal', opacity:0.6}}>· {tx('pronto','soon','即将')}</em>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Contact });
