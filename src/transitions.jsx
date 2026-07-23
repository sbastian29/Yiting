/* ===================================================================
   transitions.jsx — per-world page transitions
   work    → shutter metálico   (hard-surface · slats que ruedan)
   about   → ripple de tela     (soft-surface · canvas cloth sweep)
   play    → fold de papel      (lab · panels accordion)
   contact → portal negro       (terminal · iris desde el cursor)
   home    → portal negro       (vuelta a la órbita)
   =================================================================== */
const WORLD_TRANSITIONS = { work:'shutter', about:'fabric', play:'paper', contact:'portal', home:'portal' };
const TRANSITION_MS = {
  shutter:{ in:660, out:680 },
  fabric: { in:700, out:700 },
  paper:  { in:680, out:700 },
  portal: { in:580, out:580 },
  fade:   { in:300, out:300 },
};
function transitionFor(routeTo){
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'fade'; } catch(e){}
  return WORLD_TRANSITIONS[routeTo] || 'fade';
}

/* ---------- WORK · metal shutter (rolls down, retracts up) ---------- */
function ShutterTr({ phase }){
  return (
    <div className={'tr tr-shutter '+phase} aria-hidden="true">
      {[0,1,2,3,4,5].map(i=><div key={i} className="tr-slat" style={{'--i':i,'--ri':5-i}}></div>)}
    </div>
  );
}

/* ---------- PLAY · paper fold (accordion panels) ---------- */
function PaperTr({ phase }){
  return (
    <div className={'tr tr-paper '+phase} aria-hidden="true">
      {[0,1,2,3,4].map(i=><div key={i} className="tr-fold" style={{'--i':i,'--ri':4-i}}></div>)}
    </div>
  );
}

/* ---------- CONTACT / HOME · black portal (iris from cursor) ---------- */
function PortalTr({ phase, x, y }){
  const px = phase==='in' ? (x ?? window.innerWidth/2)+'px'  : '50%';
  const py = phase==='in' ? (y ?? window.innerHeight/2)+'px' : '50%';
  return (
    <div className={'tr tr-portal '+phase} aria-hidden="true" style={{'--px':px,'--py':py}}>
      {phase==='in' && <div className="tr-portal-ring"></div>}
    </div>
  );
}

/* ---------- ABOUT · liquid distortion (WebGL shader sweep) ----------
   A fullscreen WebGL plane (same pattern as ShaderCanvas in lib.jsx:
   fullscreen triangle + GLSL_PRELUDE) whose fragment shader displaces the
   advancing curtain with fbm — an irregular, gelatin-like liquid front —
   plus a cyan (uAccent) sheen at the edge, modulated by curl() so it feels
   fluid. Falls back to the original Canvas2D cloth sweep when WebGL is
   unavailable. uTime resets to 0 on every mount; the WebGL context is
   released on unmount so navigations don't accumulate context loss. */

// midnight-fabric tone of the about world: #0b1019 → #13131a
const FABRIC_FRAG = `
uniform float uProgress;   // eased 0..1 sweep progress
uniform float uMode;       // 0 = in (cover) · 1 = out (reveal)
void main(){
  vec2 uv = vUv;
  vec3 top = vec3(0.043,0.063,0.098);   // #0b1019
  vec3 bot = vec3(0.075,0.075,0.102);   // #13131a
  vec3 base = mix(top, bot, uv.y);

  // liquid displacement of the sweep coordinate (clumps push ahead / lag)
  float d1 = fbm(uv*3.2 + vec2(uTime*0.60, uTime*0.32));
  float d2 = fbm(uv*6.5 - vec2(uTime*0.40, uTime*0.25));
  float disp = d1*0.11 + d2*0.045;

  float front = uProgress*1.30 - 0.15;   // travels fully off both edges
  float coord = uv.x + disp;

  float cover;
  if (uMode < 0.5) {
    cover = smoothstep(front+0.05, front-0.05, coord);   // covered left of front
  } else {
    cover = smoothstep(front-0.05, front+0.05, coord);   // reveal left first
  }

  // fluid sheen riding the liquid front
  float edgeDist = abs(coord - front);
  float fluid    = 0.5 + 0.5*curl(uv*2.2 + uTime*0.5).x;
  float sideFade = smoothstep(0.0,0.22,uv.y) * smoothstep(1.0,0.78,uv.y);
  float sheen    = smoothstep(0.09,0.0,edgeDist) * (0.55 + 0.9*fluid) * sideFade;

  // internal satin ripple over the settled fabric
  float satin = (0.5 + 0.5*sin(uv.y*38.0 + fbm(uv*4.0 + uTime*0.3)*6.28)) * 0.03;

  vec3 col = base + uAccent * (sheen*0.9 + satin*cover);
  gl_FragColor = vec4(col, cover);
}`;

function run2DFabricFallback(cv, phase){
  const ctx = cv.getContext('2d'); if(!ctx) return ()=>{};
  const W = cv.width = window.innerWidth;
  const H = cv.height = window.innerHeight;
  const dur = TRANSITION_MS.fabric[phase==='in'?'in':'out'] - 40;
  const t0 = performance.now();
  let raf;
  const BASE = '#0b1019';
  const SHEEN = 'rgba(125,211,252,';
  const draw = (now)=>{
    const p = Math.min(1, (now - t0)/dur);
    const e = phase==='in' ? 1-Math.pow(1-p,3) : p*p*(3-2*p);
    const time = now/1000;
    const amp = 46 * Math.sin(Math.min(1,p)*Math.PI);
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = BASE;
    for(let y=0; y<H; y+=3){
      const wob = Math.sin(y*0.016 + time*7.5)*amp + Math.sin(y*0.047 - time*4.2)*amp*0.35;
      if (phase==='in'){
        const w = e*(W+160) + wob - 80;
        if (w > 0) ctx.fillRect(0, y, w, 3);
      } else {
        const x0 = e*(W+160) + wob - 80;
        if (x0 < W) ctx.fillRect(Math.max(0,x0), y, W-Math.max(0,x0), 3);
      }
    }
    ctx.globalCompositeOperation = 'source-atop';
    for(let x=0; x<W; x+=26){
      const a = (Math.sin(x*0.04 + time*2.6)+1)*0.5;
      ctx.fillStyle = SHEEN+(a*0.045)+')';
      ctx.fillRect(x, 0, 13, H);
      ctx.fillStyle = 'rgba(0,0,0,'+(a*0.16)+')';
      ctx.fillRect(x+13, 0, 13, H);
    }
    if (p < 1){
      ctx.fillStyle = SHEEN+'0.5)';
      for(let y=0; y<H; y+=3){
        const wob = Math.sin(y*0.016 + time*7.5)*amp + Math.sin(y*0.047 - time*4.2)*amp*0.35;
        const edge = e*(W+160) + wob - 80;
        if (edge>0 && edge<W) ctx.fillRect(edge-2, y, 2, 3);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (p < 1) raf = requestAnimationFrame(draw);
  };
  draw(performance.now());   // primer frame síncrono — nunca hay swap seco
  return ()=>cancelAnimationFrame(raf);
}

function FabricTr({ phase }){
  const ref = useRef(null);
  useEffect(()=>{
    const cv = ref.current; if(!cv) return;
    let gl = null;
    try { gl = cv.getContext('webgl', { antialias:true, alpha:true, premultipliedAlpha:false }) || cv.getContext('experimental-webgl'); } catch(e){ gl=null; }
    if (!gl) return run2DFabricFallback(cv, phase);
    try { gl.getExtension('OES_standard_derivatives'); } catch(e){}

    const dpr = Math.min(window.devicePixelRatio||1, 1.75);
    cv.width  = Math.max(2, window.innerWidth * dpr);
    cv.height = Math.max(2, window.innerHeight * dpr);

    const vs = compile(gl, gl.VERTEX_SHADER, 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv=aPos*0.5+0.5; gl_Position=vec4(aPos,0.0,1.0);}');
    const fs = compile(gl, gl.FRAGMENT_SHADER, GLSL_PRELUDE + FABRIC_FRAG);
    if (!vs || !fs) return run2DFabricFallback(cv, phase);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){ console.error('FabricTr link error', gl.getProgramInfoLog(prog)); return run2DFabricFallback(cv, phase); }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {
      uTime:     gl.getUniformLocation(prog,'uTime'),
      uRes:      gl.getUniformLocation(prog,'uRes'),
      uAccent:   gl.getUniformLocation(prog,'uAccent'),
      uProgress: gl.getUniformLocation(prog,'uProgress'),
      uMode:     gl.getUniformLocation(prog,'uMode'),
    };
    const ac = [125/255, 211/255, 252/255];   // #7dd3fc — about accent

    gl.viewport(0,0,cv.width,cv.height);
    gl.clearColor(0,0,0,0);

    const dur = TRANSITION_MS.fabric[phase==='in'?'in':'out'];
    const t0 = performance.now();
    let raf;
    const render = (now)=>{
      const p = Math.min(1, (now - t0)/dur);
      // in: ease-cinema-ish (strong ease-out settle) · out: ease-out reveal
      const e = phase==='in' ? 1-Math.pow(1-p,3) : 1-Math.pow(1-p,2);
      gl.uniform1f(U.uTime, (now - t0)/1000);   // starts at 0 every mount
      gl.uniform2f(U.uRes, cv.width, cv.height);
      gl.uniform3f(U.uAccent, ac[0], ac[1], ac[2]);
      gl.uniform1f(U.uProgress, e);
      gl.uniform1f(U.uMode, phase==='in' ? 0.0 : 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (p < 1) raf = requestAnimationFrame(render);
    };
    render(performance.now());   // synchronous first frame — no dry swap

    return ()=>{
      cancelAnimationFrame(raf);
      try { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch(e){}
    };
  }, [phase]);
  return <canvas ref={ref} className="tr tr-fabric" aria-hidden="true"></canvas>;
}

/* ---------- dispatcher ---------- */
function WorldTransition({ tr }){
  if (!tr) return null;
  const { phase, variant, x, y } = tr;
  if (variant==='fabric')  return <FabricTr phase={phase}/>;
  if (variant==='shutter') return <ShutterTr phase={phase}/>;
  if (variant==='paper')   return <PaperTr phase={phase}/>;
  if (variant==='portal')  return <PortalTr phase={phase} x={x} y={y}/>;
  return <div className={'tr tr-fade '+phase} aria-hidden="true"></div>;
}

Object.assign(window, { WorldTransition, transitionFor, TRANSITION_MS, WORLD_TRANSITIONS });
