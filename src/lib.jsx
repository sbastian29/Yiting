/* ===================================================================
   lib.jsx — shared system: tokens, i18n, hooks, toasts, WebGL engine
   =================================================================== */
const { useState, useEffect, useRef, useCallback, useContext, createContext, useLayoutEffect } = React;

/* ---------- per-route accent tokens ---------- */
const PAGE_TOKENS = {
  home:    { accent: '#c4b5fd', glow: 'rgba(196,181,253,0.18)' },
  work:    { accent: '#fbbf7a', glow: 'rgba(251,191,122,0.14)' },
  about:   { accent: '#7dd3fc', glow: 'rgba(125,211,252,0.13)' },
  play:    { accent: '#4ade80', glow: 'rgba(74,222,128,0.12)'  },
  contact: { accent: '#fbbf7a', glow: 'rgba(251,191,122,0.13)' },
};

/* ===================================================================
   RESPONSIVE FOUNDATION — shared breakpoint contract + viewport store
   Every page derives geometry from these; do not fork per-page copies.
   =================================================================== */
const BP = { mobile: 0, tablet: 768, laptop: 1280, desktop: 1680 };

function bpKey(w){
  if (w >= BP.desktop) return 'desktop';
  if (w >= BP.laptop)  return 'laptop';
  if (w >= BP.tablet)  return 'tablet';
  return 'mobile';
}

/* Single global viewport store: one set of listeners for the whole app.
   Debounced at 150ms, only notifies subscribers when a value actually
   changes, and mirrors real pixel sizes onto :root so 100vh mobile-chrome
   bugs are avoided. Non-React code subscribes via window.subscribeViewport. */
const ViewportStore = (() => {
  const listeners = new Set();
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqTouch  = window.matchMedia('(hover: none), (pointer: coarse)');

  function measure(){
    const vv = window.visualViewport;
    const w = Math.round((vv && vv.width)  || window.innerWidth);
    const h = Math.round((vv && vv.height) || window.innerHeight);
    return {
      w, h,
      dpr: window.devicePixelRatio || 1,
      isTouch: mqTouch.matches,
      reduceMotion: mqReduce.matches,
      bp: bpKey(w),
    };
  }

  function writeRoot(s){
    const root = document.documentElement.style;
    root.setProperty('--vw', s.w + 'px');
    root.setProperty('--vh', s.h + 'px');
    // fluid ratio for clamp()-based sizing — 1.0 at a 1440px reference,
    // clamped so type never collapses on tiny screens or bloats on huge ones.
    const scale = Math.max(0.82, Math.min(1.28, s.w / 1440));
    root.setProperty('--scale', scale.toFixed(4));
  }

  let state = measure();
  writeRoot(state);

  let timer = 0;
  function recompute(){
    const next = measure();
    const changed =
      next.w !== state.w || next.h !== state.h || next.dpr !== state.dpr ||
      next.isTouch !== state.isTouch || next.reduceMotion !== state.reduceMotion;
    state = next;
    writeRoot(state);
    if (changed) listeners.forEach(fn => { try { fn(state); } catch(e){ console.error(e); } });
  }
  function schedule(){ clearTimeout(timer); timer = setTimeout(recompute, 150); }

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule, { passive: true });
  const onMq = () => schedule();
  [mqReduce, mqTouch].forEach(mq => mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq));

  return {
    get(){ return state; },
    subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

/* useViewport — { w, h, dpr, isTouch, reduceMotion, bp }, debounced 150ms,
   updates on resize / orientationchange / visualViewport resize. */
function useViewport(){
  const [vp, setVp] = useState(() => ViewportStore.get());
  useEffect(() => ViewportStore.subscribe(setVp), []);
  return vp;
}

/* useBreakpoint — current key, backed by matchMedia (not resize polling).
   Returns a stable value; re-renders only when the key actually changes.
   matchMedia also fires on browser zoom, so 125% behaves like a smaller vp. */
function useBreakpoint(){
  const compute = () => {
    if (window.matchMedia(`(min-width:${BP.desktop}px)`).matches) return 'desktop';
    if (window.matchMedia(`(min-width:${BP.laptop}px)`).matches)  return 'laptop';
    if (window.matchMedia(`(min-width:${BP.tablet}px)`).matches)  return 'tablet';
    return 'mobile';
  };
  const [bp, setBp] = useState(compute);
  useEffect(() => {
    const mqs = [
      window.matchMedia(`(min-width:${BP.tablet}px)`),
      window.matchMedia(`(min-width:${BP.laptop}px)`),
      window.matchMedia(`(min-width:${BP.desktop}px)`),
    ];
    const onChange = () => setBp(prev => { const n = compute(); return prev === n ? prev : n; });
    mqs.forEach(mq => mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange));
    return () => mqs.forEach(mq => mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange));
  }, []);
  return bp;
}

/* ---------- i18n · ES / EN / 中文 ---------- */
const STRINGS = {
  nav: { work:{es:'Work',en:'Work',zh:'作品'}, about:{es:'About',en:'About',zh:'关于'}, play:{es:'Play',en:'Play',zh:'实验'}, contact:{es:'Contact',en:'Contact',zh:'联系'} },
  home: {
    role:        { es:'3D Modeling & Texturing Artist', en:'3D Modeling & Texturing Artist', zh:'3D 建模与贴图艺术家' },
    sub:         { es:'Animación · Virtual Production · Madrid', en:'Animation · Virtual Production · Madrid', zh:'动画 · 虚拟制作 · 马德里' },
    tagline1:    { es:'El oficio se encuentra', en:'Craftsmanship meets', zh:'当工艺遇见' },
    tagline2:    { es:'con la narrativa', en:'storytelling', zh:'叙事' },
    taglinefoot: { es:'cada superficie cuenta una historia', en:'every surface has a story', zh:'每一个表面都有一个故事' },
    scrollHint:  { es:'desliza para entrar al campo', en:'scroll to enter the field', zh:'滚动进入粒子场' },
    statsTitle:  { es:'En números', en:'By the numbers', zh:'数字一览' },
    s_awards:    { es:'premios ganados', en:'awards won', zh:'获奖' },
    s_langs:     { es:'idiomas', en:'languages', zh:'语言' },
    s_years:     { es:'años creando', en:'years crafting', zh:'创作年数' },
    s_engines:   { es:'motores realtime', en:'realtime engines', zh:'实时引擎' },
    featured:    { es:'Trabajo destacado', en:'Featured work', zh:'精选作品' },
    enterWork:   { es:'Ver todo el trabajo', en:'Enter the gallery', zh:'进入作品集' },
    cta:         { es:'Entra en la órbita', en:'Enter the orbit', zh:'进入轨道' },
  },
  work: {
    eyebrow:  { es:'La órbita', en:'The orbit', zh:'轨道' },
    title:    { es:'Trabajo seleccionado', en:'Selected work', zh:'精选作品' },
    intro:    { es:'Arrastra para girar la galería. La sala está casi a oscuras — solo brilla lo que iluminas.', en:'Drag to spin the gallery. The room is almost dark — only what you light up shines.', zh:'拖动旋转画廊。展厅几乎全暗——只有你点亮的才会发光。' },
    drag:     { es:'arrastra · click para abrir', en:'drag · click to open', zh:'拖动 · 点击打开' },
    all:      { es:'Todos los proyectos', en:'All projects', zh:'全部项目' },
    close:    { es:'cerrar', en:'close', zh:'关闭' },
    role:     { es:'Rol', en:'Role', zh:'职责' },
    year:     { es:'Año', en:'Year', zh:'年份' },
    award:    { es:'Premio', en:'Award', zh:'奖项' },
  },
  about: {
    eyebrow:  { es:'Los fragmentos', en:'The fragments', zh:'碎片' },
    who_h:    { es:'Quién', en:'Who', zh:'是谁' },
    who_b:    { es:'Yi-Ting Yang Tang — Lisa. Artista 3D de modelado y texturizado en Madrid. Trilingüe, formada entre el MIT y Cambridge con la Beca Amancio Ortega. Alumni de Cartoon Springboard 2024 y 2025.', en:'Yi-Ting Yang Tang — Lisa. 3D modeling & texturing artist based in Madrid. Trilingual, trained between MIT and Cambridge on the Amancio Ortega Scholarship. Cartoon Springboard alumni 2024 & 2025.', zh:'Yi-Ting Yang Tang——Lisa。常驻马德里的 3D 建模与贴图艺术家。精通三种语言，凭 Amancio Ortega 奖学金在 MIT 与剑桥求学。Cartoon Springboard 2024 与 2025 校友。' },
    how_h:    { es:'Cómo', en:'How', zh:'如何' },
    how_b:    { es:'Hard y soft surface, estilizado y producción virtual con Unreal Engine 5. El oficio al servicio de la historia.', en:'Hard and soft surface, stylised and virtual production with Unreal Engine 5. Craft in service of the story.', zh:'硬表面与软表面、风格化，以及基于 Unreal Engine 5 的虚拟制作。让工艺服务于故事。' },
    tools_h:  { es:'Herramientas', en:'Tools', zh:'工具' },
    stats_h:  { es:'Trayectoria', en:'Track record', zh:'履历' },
    timeline_h:{ es:'Línea de tiempo', en:'Timeline', zh:'时间线' },
    quote:    { es:'El oficio se encuentra con la narrativa — cada superficie cuenta una historia.', en:'Craftsmanship meets storytelling — every surface has a story.', zh:'当工艺遇见叙事——每一个表面都有一个故事。' },
    who_b2:   { es:'Empecé entendiendo las superficies como materia: cómo la luz se posa en el metal desgastado, cómo la piedra estilizada exagera su silueta. Hoy llevo esa obsesión por el detalle del modelado de hard-surface a la producción virtual en tiempo real.', en:'I started by understanding surfaces as matter: how light settles on worn metal, how stylised stone exaggerates its silhouette. Today I carry that obsession with detail from hard-surface modeling into real-time virtual production.', zh:'我从把表面理解为物质开始：光如何落在磨损的金属上，风格化的石头如何夸张它的轮廓。如今我把这种对细节的执着，从硬表面建模带入实时虚拟制作。' },
    edu_h:    { es:'Formación', en:'Education', zh:'教育' },
    langs_h:  { es:'Idiomas', en:'Languages', zh:'语言' },
    awards_h: { es:'Reconocimientos', en:'Recognition', zh:'荣誉' },
    lang_native: { es:'nativo', en:'native', zh:'母语' },
    lang_fluent: { es:'fluido', en:'fluent', zh:'流利' },
    lang_conv:   { es:'conversacional', en:'conversational', zh:'会话' },
  },
  play: {
    eyebrow:  { es:'El laboratorio', en:'The lab', zh:'实验室' },
    title:    { es:'PLAYGROUND', en:'PLAYGROUND', zh:'PLAYGROUND' },
    intro:    { es:'Seis experimentos de shader. Desliza para recorrer el laboratorio — pasa el cursor sobre cada lienzo para despertarlo.', en:'Six shader experiments. Scroll through the lab — hover each canvas to wake it up.', zh:'六个 shader 实验。滚动穿过实验室——把光标悬停在画布上唤醒它。' },
    enter:    { es:'Sigue explorando', en:'Keep exploring', zh:'继续探索' },
    expand:   { es:'click para pantalla completa', en:'click for fullscreen', zh:'点击全屏' },
  },
  contact: {
    eyebrow:  { es:'La terminal', en:'The terminal', zh:'终端' },
    avail:    { es:'Disponible para proyectos', en:'Available for work', zh:'可接项目' },
    typehelp: { es:"escribe 'help' para empezar", en:"type 'help' to get started", zh:"输入 'help' 开始" },
    reach:    { es:'O simplemente escríbeme', en:'Or just reach out', zh:'或者直接联系我' },
  },
};
function tr(node, lang){ return node ? (node[lang] ?? node.en) : ''; }

const LangContext = createContext({ lang:'es', setLang:()=>{} });
function useLang(){ return useContext(LangContext); }
function useT(){
  const { lang } = useLang();
  return useCallback((path) => {
    const parts = path.split('.');
    let n = STRINGS;
    for (const p of parts) { n = n && n[p]; }
    return tr(n, lang);
  }, [lang]);
}

/* ---------- scroll velocity store (sets --scroll-vel) ---------- */
function useScrollVelocityStore(){
  useEffect(() => {
    let last = window.scrollY, vel = 0, raf;
    const loop = () => {
      const y = window.scrollY;
      const dv = y - last; last = y;
      vel += (dv - vel) * 0.18;
      const clamped = Math.max(-40, Math.min(40, vel));
      document.documentElement.style.setProperty('--scroll-vel', (clamped/12).toFixed(3));
      window.__scrollVel = clamped;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/* ---------- mouse store (normalized + pixel) ---------- */
const Mouse = { x: window.innerWidth/2, y: window.innerHeight/2, nx: 0.5, ny: 0.5, vx:0, vy:0 };
window.addEventListener('pointermove', (e) => {
  Mouse.vx = e.clientX - Mouse.x; Mouse.vy = e.clientY - Mouse.y;
  Mouse.x = e.clientX; Mouse.y = e.clientY;
  Mouse.nx = e.clientX / window.innerWidth; Mouse.ny = e.clientY / window.innerHeight;
});

/* ---------- scramble text hook ---------- */
const SCRAMBLE_CHARS = '!<>-_\\/[]{}—=+*^?#________ABCDEF0123456789';
function useScramble(finalText, { auto=false, duration=900 } = {}){
  const [text, setText] = useState(auto ? '' : finalText);
  const raf = useRef(0);
  const run = useCallback((target = finalText) => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const revealed = Math.floor(p * target.length);
      let out = '';
      for (let i=0;i<target.length;i++){
        if (i < revealed || target[i]===' ') out += target[i];
        else out += SCRAMBLE_CHARS[(Math.random()*SCRAMBLE_CHARS.length)|0];
      }
      setText(out);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setText(target);
    };
    raf.current = requestAnimationFrame(tick);
  }, [finalText, duration]);
  useEffect(() => { if (auto) run(finalText); return () => cancelAnimationFrame(raf.current); }, []);
  return [text, run];
}

/* ---------- reveal on scroll ---------- */
function useReveal(opts = {}){
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting){ el.classList.add('in'); if(opts.once!==false) io.unobserve(el);} });
    }, { threshold: opts.threshold ?? 0.18, rootMargin: opts.rootMargin || '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/* set cursor state from any element via data-cursor attribute handled globally in cursor.jsx */

/* ===================================================================
   TOAST + HUD LOG SYSTEM
   =================================================================== */
const ToastCtx = createContext({ toast:()=>{}, log:()=>{} });
function useToast(){ return useContext(ToastCtx); }

function ToastProvider({ children }){
  const [toasts, setToasts] = useState([]);
  const [logs, setLogs] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((msg, ttl=4000) => {
    const id = ++idRef.current;
    setToasts(t => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts(t => t.map(x => x.id===id ? {...x, leaving:true} : x)), ttl);
    setTimeout(() => setToasts(t => t.filter(x => x.id!==id)), ttl+400);
  }, []);

  const log = useCallback((msg, ttl=2200) => {
    const id = ++idRef.current;
    setLogs(l => [...l.slice(-4), { id, msg }]);
    setTimeout(() => setLogs(l => l.map(x => x.id===id ? {...x, leaving:true} : x)), ttl);
    setTimeout(() => setLogs(l => l.filter(x => x.id!==id)), ttl+450);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast, log }}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => <div key={t.id} className={'toast'+(t.leaving?' leaving':'')}>{t.msg}</div>)}
      </div>
      <div className="hud-log">
        {logs.map(l => <div key={l.id} className={'log-line'+(l.leaving?' leaving':'')}>{l.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ===================================================================
   WEBGL — fullscreen fragment shader runner
   =================================================================== */
const GLSL_PRELUDE = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2  uMouse;
uniform float uHover;
uniform vec2  uRes;
uniform vec3  uAccent;

// --- simplex noise (Ashima) ---
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*snoise(p); p*=2.02; a*=0.5;} return s; }
vec2 curl(vec2 p){ float e=0.1; float n1=snoise(p+vec2(0.,e)); float n2=snoise(p-vec2(0.,e)); float n3=snoise(p+vec2(e,0.)); float n4=snoise(p-vec2(e,0.)); return vec2(n1-n2, n4-n3)/(2.0*e); }
`;

function compile(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    console.error('Shader error:', gl.getShaderInfoLog(s), src);
    return null;
  }
  return s;
}

/* ---- Canvas2D fallback (used when WebGL is unavailable) ---- */
function hexRGB(h){ h=h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function mixHex(c1,c2,a){ a=Math.max(0,Math.min(1,a)); return `rgb(${(c1[0]+(c2[0]-c1[0])*a)|0},${(c1[1]+(c2[1]-c1[1])*a)|0},${(c1[2]+(c2[2]-c1[2])*a)|0})`; }
function pn(x,y){ return (Math.sin(x*1.7+y*0.3)*Math.sin(y*1.3-x*0.7)+Math.sin((x+y)*0.9))*0.5; }

function run2DFallback(canvas, wrap, accent, st, variant){
  const ctx = canvas.getContext('2d'); if(!ctx) return ()=>{};
  const ac = hexRGB(accent); const bg=[6,10,8];
  let W=2,H=2;
  const resize=()=>{ const r=canvas.getBoundingClientRect(); W=canvas.width=Math.max(2,r.width); H=canvas.height=Math.max(2,r.height); };
  resize(); const ro=new ResizeObserver(resize); ro.observe(canvas);
  const enter=()=>{st.targetHover=1;}, leave=()=>{st.targetHover=0;};
  canvas.addEventListener('pointerenter',enter); canvas.addEventListener('pointerleave',leave);
  const io=new IntersectionObserver(e=>{ const was=st.active; st.active=e[0].isIntersecting;
    if(st.active&&!was){ const fl=wrap&&wrap.querySelector('.crt-flash'); if(fl){fl.style.animation='none'; void fl.offsetWidth; fl.style.animation='crtOn 0.5s var(--ease-out)';} } },{threshold:0.12});
  io.observe(canvas);
  let parts=null;
  if(variant===5){ parts=[]; for(let i=0;i<460;i++) parts.push({x:Math.random(),y:Math.random(),s:0.3+Math.random()*0.7}); }
  let raf,last=0,t0=performance.now();
  const loop=(now)=>{ raf=requestAnimationFrame(loop);
    const fps=st.targetHover>0.05?60:30; if(now-last<1000/fps)return; last=now; if(!st.active)return;
    st.hover+=(st.targetHover-st.hover)*0.08; const tm=(now-t0)/1000; const hv=st.hover;
    const r=canvas.getBoundingClientRect(); const mx=(Mouse.x-r.left)/W, my=(Mouse.y-r.top)/H;
    ctx.fillStyle='rgb(6,10,8)'; ctx.fillRect(0,0,W,H);
    if(variant===5){
      for(const p of parts){ const ang=pn(p.x*4+tm*0.3,p.y*4)*6.283; p.x+=Math.cos(ang)*0.0018*p.s; p.y+=Math.sin(ang)*0.0018*p.s;
        const dx=p.x-mx, dy=p.y-my, d=Math.hypot(dx,dy)+1e-4; if(d<0.2){ const f=(0.2-d)*(hv>0.5?-0.03:0.03); p.x+=dx/d*f; p.y+=dy/d*f; }
        if(p.x<0)p.x+=1; if(p.x>1)p.x-=1; if(p.y<0)p.y+=1; if(p.y>1)p.y-=1;
        ctx.fillStyle=mixHex(bg,ac,0.4+p.s*0.5); ctx.fillRect(p.x*W,p.y*H,2,2); }
      if(hv>0.02){ ctx.globalCompositeOperation='lighter'; const g=ctx.createRadialGradient(mx*W,my*H,0,mx*W,my*H,W*0.28); g.addColorStop(0,`rgba(${ac[0]},${ac[1]},${ac[2]},${0.5*hv})`); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); ctx.globalCompositeOperation='source-over'; }
    } else if(variant===4 || variant===6){
      ctx.save(); ctx.translate(W/2,H/2); const u=Math.min(W,H)*0.5;
      if(variant===6){ const R=u*0.62; const off=2+hv*8; ctx.globalCompositeOperation='lighter';
        [['rgba(255,60,60,'],['rgba(80,255,140,'],['rgba(70,130,255,']].forEach((c,k)=>{ ctx.beginPath(); ctx.fillStyle=c[0]+'0.5)'; ctx.arc((k-1)*off,0,R,0,7); ctx.fill(); });
        ctx.globalCompositeOperation='source-over'; const g=ctx.createRadialGradient(-R*0.35,-R*0.35,R*0.1,0,0,R); g.addColorStop(0,mixHex(bg,ac,0.95)); g.addColorStop(1,'rgb(6,10,8)'); ctx.beginPath(); ctx.fillStyle=g; ctx.arc(0,0,R*0.9,0,7); ctx.fill();
      } else { const th=u*0.16, wob=Math.sin(tm*4)*hv*10; ctx.fillStyle=mixHex(bg,ac,0.85);
        ctx.fillRect(-u*0.25+wob,-u*0.5,th,u); ctx.fillRect(-u*0.25+wob,u*0.5-th,u*0.62,th); }
      ctx.restore();
    } else {
      const cell=16;
      for(let gy=0; gy<H; gy+=cell){ for(let gx=0; gx<W; gx+=cell){
        const u=gx/W, v=gy/H; let f;
        if(variant===1){ const d=Math.hypot(u-mx,v-my); f=Math.sin(d*20-tm*4)*Math.exp(-d*5)*hv + pn(u*4+tm*0.4,v*4)*0.4 + 0.3; }
        else if(variant===2){ let md=9; for(let s=0;s<7;s++){ const sx=0.5+0.42*Math.sin(tm*0.5+s*1.3), sy=0.5+0.42*Math.cos(tm*0.4+s*2.1); const dd=(u-sx)*(u-sx)+(v-sy)*(v-sy); if(dd<md)md=dd; } f=Math.sqrt(md)*2; }
        else { const n=(pn(u*4+tm*0.2,v*4)+1)*0.5; f=Math.abs((n*8)%1-0.5)<0.12?1:0.12; }
        ctx.fillStyle=mixHex(bg,ac,Math.max(0,Math.min(1,f))*(0.5+hv*0.5)); ctx.fillRect(gx,gy,cell,cell);
      }}
    }
  };
  raf=requestAnimationFrame(loop);
  return ()=>{ cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); canvas.removeEventListener('pointerenter',enter); canvas.removeEventListener('pointerleave',leave); };
}

function ShaderCanvas({ frag, accent='#4ade80', label, source, onExpand, variant=1, plain=false, hoverRef=null, frozen=false }){
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({ hover:0, targetHover:0, active:false, flash:0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias:true, alpha:true, premultipliedAlpha:false }) || canvas.getContext('experimental-webgl'); } catch(e){ gl=null; }
    if (!gl){ return run2DFallback(canvas, wrapRef.current, accent, stateRef.current, variant); }
    try { gl.getExtension('OES_standard_derivatives'); } catch(e){}

    const vs = compile(gl, gl.VERTEX_SHADER, 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0);}');
    const fs = compile(gl, gl.FRAGMENT_SHADER, GLSL_PRELUDE + frag);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){ console.error('Link error', gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {
      uTime: gl.getUniformLocation(prog,'uTime'),
      uMouse: gl.getUniformLocation(prog,'uMouse'),
      uHover: gl.getUniformLocation(prog,'uHover'),
      uRes: gl.getUniformLocation(prog,'uRes'),
      uAccent: gl.getUniformLocation(prog,'uAccent'),
      uReveal: gl.getUniformLocation(prog,'uReveal'),
    };
    const ac = (() => { const h=accent.replace('#',''); return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255]; })();

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio||1, 1.75);
      canvas.width = Math.max(2, r.width*dpr); canvas.height = Math.max(2, r.height*dpr);
      gl.viewport(0,0,canvas.width,canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    const st = stateRef.current;

    // frozen: reduced-motion / mobile → paint one static frame, no rAF loop
    if (frozen){
      const drawStatic = () => {
        gl.uniform1f(U.uTime, 0.0);
        gl.uniform2f(U.uMouse, 0.5, 0.5);
        gl.uniform1f(U.uHover, 0.0);
        gl.uniform1f(U.uReveal, 0.0);
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform3f(U.uAccent, ac[0], ac[1], ac[2]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      drawStatic();
      const roFrozen = new ResizeObserver(() => { resize(); drawStatic(); });
      roFrozen.observe(canvas);
      return () => { ro.disconnect(); roFrozen.disconnect(); };
    }

    let raf, t0 = performance.now(), lastFrame = 0;
    const render = (now) => {
      raf = requestAnimationFrame(render);
      const fps = st.targetHover > 0.05 ? 60 : 30;
      if (now - lastFrame < 1000/fps) return;
      lastFrame = now;
      if (!st.active) return;
      st.hover += (st.targetHover - st.hover) * 0.08;
      if (st.flash > 0) st.flash -= 0.06;
      const r = canvas.getBoundingClientRect();
      const mx = (Mouse.x - r.left)/r.width;
      const my = 1.0 - (Mouse.y - r.top)/r.height;
      gl.uniform1f(U.uTime, (now - t0)/1000);
      gl.uniform2f(U.uMouse, mx, my);
      gl.uniform1f(U.uHover, st.hover);
      gl.uniform1f(U.uReveal, st.flash);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform3f(U.uAccent, ac[0], ac[1], ac[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(render);

    const io = new IntersectionObserver((e) => {
      const wasActive = st.active;
      st.active = e[0].isIntersecting;
      if (st.active && !wasActive){ st.flash = 1; const fl = wrapRef.current?.querySelector('.crt-flash'); if(fl){ fl.style.animation='none'; void fl.offsetWidth; fl.style.animation='crtOn 0.5s var(--ease-out)'; } }
    }, { threshold: 0.12 });
    io.observe(canvas);

    const enter = () => { st.targetHover = 1; };
    const leave = () => { st.targetHover = 0; };
    const hoverEl = (hoverRef && hoverRef.current) ? hoverRef.current : canvas;
    hoverEl.addEventListener('pointerenter', enter);
    hoverEl.addEventListener('pointerleave', leave);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); hoverEl.removeEventListener('pointerenter',enter); hoverEl.removeEventListener('pointerleave',leave); };
  }, [frag, accent, variant, plain, frozen]);

  return (
    <div className={'shader-wrap'+(plain?' plain':'')} ref={wrapRef}>
      <canvas ref={canvasRef} className="shader-canvas" data-cursor={plain?null:'cell'}></canvas>
      {!plain && <div className="crt-flash"></div>}
      {label && <div className="shader-label mono-tag">{label}</div>}
      {onExpand && <button className="shader-expand" data-cursor="hover" onClick={onExpand}>⤢</button>}
    </div>
  );
}

/* ===================================================================
   BODY SCROLL LOCK — iOS-safe (fixes rubber-band under overlays)
   Chains: multiple simultaneous locks (nav + modal) are ref-counted so
   the first lock captures scrollY and the last unlock restores it.
   Use for: mobile nav open, filter curtain, cert modal, preloader.
   =================================================================== */
let __lockCount = 0;
let __lockScrollY = 0;
function lockBodyScroll(){
  if (__lockCount++ > 0) return;
  __lockScrollY = window.scrollY || window.pageYOffset || 0;
  const body = document.body;
  body.style.top = `-${__lockScrollY}px`;
  body.classList.add('no-scroll');
  if (window.__lenis && window.__lenis.stop) window.__lenis.stop();
}
function unlockBodyScroll(){
  if (__lockCount <= 0) return;
  if (--__lockCount > 0) return;
  const body = document.body;
  body.classList.remove('no-scroll');
  body.style.top = '';
  window.scrollTo(0, __lockScrollY);
  if (window.__lenis && window.__lenis.start) window.__lenis.start();
}

/* Cheap touch device probe. Prefer this over ad-hoc matchMedia calls. */
const IS_TOUCH_DEVICE = (typeof window !== 'undefined') && (
  window.matchMedia('(pointer: coarse)').matches ||
  ('ontouchstart' in window) ||
  (navigator.maxTouchPoints > 0)
);
function isTouchDevice(){ return IS_TOUCH_DEVICE; }

Object.assign(window, {
  PAGE_TOKENS, STRINGS, tr, LangContext, useLang, useT,
  useScrollVelocityStore, Mouse, useScramble, useReveal,
  ToastProvider, useToast, ShaderCanvas, GLSL_PRELUDE,
  BP, useViewport, useBreakpoint,
  subscribeViewport: ViewportStore.subscribe,
  getViewport: ViewportStore.get,
  lockBodyScroll, unlockBodyScroll, isTouchDevice,
});
