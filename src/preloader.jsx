/* ===================================================================
   preloader.jsx — "LISA" letra a letra → morph a silueta 3D (trefoil)
   Presupuesto duro: 2.5s. Click = saltar.
   =================================================================== */
function Preloader({ onDone }){
  const cvRef = useRef(null);
  const statusRef = useRef(null);
  const [gone, setGone] = useState(false);
  const [reduced] = useState(()=>{ try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } });
  const doneRef = useRef(false);
  const goneRef = useRef(()=>{});

  const finish = useCallback(()=>{
    if (doneRef.current) return;
    doneRef.current = true;
    setGone(true);
    setTimeout(onDone, 470);
  }, [onDone]);
  goneRef.current = finish;

  useEffect(()=>{
    document.body.style.overflow = 'hidden';
    const hardStop = setTimeout(()=>goneRef.current(), 2500);
    return ()=>{ document.body.style.overflow = ''; clearTimeout(hardStop); };
  }, []);

  useEffect(()=>{
    if (reduced){ const t = setTimeout(()=>goneRef.current(), 900); return ()=>clearTimeout(t); }
    const cv = cvRef.current; if(!cv) return;
    const ctx = cv.getContext('2d'); if(!ctx){ goneRef.current(); return; }
    const W = cv.width = window.innerWidth;
    const H = cv.height = window.innerHeight;
    const mountT = performance.now();
    let raf, cancelled = false;

    /* timeline (ms desde mount) */
    const T_LETTER = (k)=> 360 + k*190;   // L I S A
    const T_MORPH  = 1340;                 // letras → silueta 3D
    const T_BLEND  = 340;
    const T_OUT    = 1960;                 // dispersión
    const T_END    = 2080;                 // fade del overlay

    const boot = async ()=>{
      try { await Promise.race([ document.fonts.load('800 240px "Syne"'), new Promise(r=>setTimeout(r,330)) ]); } catch(e){}
      if (cancelled) return;

      /* --- muestreo de letras --- */
      const letters = ['L','I','S','A'];
      const oc = document.createElement('canvas');
      const OW = oc.width = 360, OH = oc.height = 320;
      const octx = oc.getContext('2d');
      const pts = letters.map(ch=>{
        octx.clearRect(0,0,OW,OH);
        octx.font = '800 240px "Syne", sans-serif';
        octx.textAlign = 'center'; octx.textBaseline = 'middle';
        octx.fillStyle = '#fff';
        octx.fillText(ch, OW/2, OH/2);
        const d = octx.getImageData(0,0,OW,OH).data;
        const out = [];
        for(let y=0;y<OH;y+=4) for(let x=0;x<OW;x+=4){
          if (d[(y*OW+x)*4+3] > 120) out.push([x-OW/2, y-OH/2]);
        }
        return out;
      });
      const gh = Math.min(H*0.26, 200);            // alto deseado del glifo
      const s = gh/240;
      const spacing = Math.min(W*0.17, 210*s*1.25);
      const cx = W/2, cy = H/2;

      /* --- partículas --- */
      const N = W < 760 ? 850 : 1500;
      const px = new Float32Array(N), py = new Float32Array(N);
      const lk = new Uint8Array(N);                 // letra asignada
      const tx = new Float32Array(N), ty = new Float32Array(N);
      const al = new Float32Array(N);               // alpha
      const dx = new Float32Array(N), dy = new Float32Array(N); // dispersión
      for(let i=0;i<N;i++){
        px[i] = Math.random()*W; py[i] = Math.random()*H;
        const k = lk[i] = i & 3;
        const p = pts[k][(Math.random()*pts[k].length)|0] || [0,0];
        tx[i] = cx + (k-1.5)*spacing + p[0]*s;
        ty[i] = cy + p[1]*s;
        const a = Math.random()*Math.PI*2, sp = 3+Math.random()*6;
        dx[i] = Math.cos(a)*sp; dy[i] = Math.sin(a)*sp;
      }
      /* --- nudo trefoil (silueta de modelo 3D) --- */
      const knot = new Float32Array(N*3);
      for(let i=0;i<N;i++){
        const t = (i/N)*Math.PI*2;
        knot[i*3]   = Math.sin(t) + 2*Math.sin(2*t);
        knot[i*3+1] = Math.cos(t) - 2*Math.cos(2*t);
        knot[i*3+2] = -Math.sin(3*t);
      }
      const ks = Math.min(W,H)*0.115;

      const loop = (now)=>{
        if (cancelled) return;
        raf = requestAnimationFrame(loop);
        const t = now - mountT;
        ctx.clearRect(0,0,W,H);
        const morph = Math.max(0, Math.min(1, (t-T_MORPH)/T_BLEND));
        const out = t > T_OUT;
        const ry = now*0.0016, rx = 0.45;
        const cosY=Math.cos(ry), sinY=Math.sin(ry), cosX=Math.cos(rx), sinX=Math.sin(rx);
        for(let i=0;i<N;i++){
          let gx = tx[i], gy = ty[i];
          if (morph > 0){
            let x=knot[i*3], y=knot[i*3+1], z=knot[i*3+2];
            let x1 = x*cosY + z*sinY, z1 = -x*sinY + z*cosY;
            let y1 = y*cosX - z1*sinX, z2 = y*sinX + z1*cosX;
            const f = 4.4/(4.4 - z2);
            const kx2 = cx + x1*ks*f, ky2 = cy + y1*ks*f;
            gx = gx + (kx2-gx)*morph; gy = gy + (ky2-gy)*morph;
          }
          const active = t > T_LETTER(lk[i]);
          if (out){
            px[i] += dx[i]; py[i] += dy[i];
            al[i] = Math.max(0, al[i]-0.05);
          } else if (active){
            px[i] += (gx-px[i])*0.105;
            py[i] += (gy-py[i])*0.105;
            al[i] = Math.min(1, al[i]+0.07);
          }
          if (al[i] > 0.01){
            ctx.globalAlpha = al[i]*0.9;
            ctx.fillStyle = (i%9===0) ? '#e8e6f0' : '#c4b5fd';
            ctx.fillRect(px[i], py[i], 2, 2);
          }
        }
        ctx.globalAlpha = 1;
        if (statusRef.current){
          const p = Math.min(1, t/T_END);
          statusRef.current.textContent =
            (t < T_MORPH ? 'compilando superficies' : 'proyectando silueta') +
            ' · ' + String(Math.round(p*100)).padStart(3,'0') + '%';
        }
        if (t > T_END) goneRef.current();
      };
      raf = requestAnimationFrame(loop);
    };
    boot();
    return ()=>{ cancelled = true; cancelAnimationFrame(raf); };
  }, [reduced]);

  return (
    <div className={'preloader'+(gone?' gone':'')} onClick={finish} data-cursor="hover">
      {reduced
        ? <div className="pre-reduced">LISA</div>
        : <canvas ref={cvRef}></canvas>}
      <div className="pre-status" ref={statusRef}>compilando superficies · 000%</div>
      <div className="pre-skip">click para saltar</div>
    </div>
  );
}

Object.assign(window, { Preloader });
