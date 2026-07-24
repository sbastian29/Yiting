/* ===================================================================
   home.jsx — "El Campo de Fuerza"
   Real WebGL particle river + 4-act pinned scroll choreography
   =================================================================== */
const HomeFX = { converge: 0 };

function HomeParticleField(){
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W=0, H=0;
    let N = window.innerWidth < 760 ? 2600 : 5200;
    const pos = new Float32Array(N*2);   // ndc [-1,1]
    const vel = new Float32Array(N*2);
    const seed = new Float32Array(N);
    const tgt = new Float32Array(N*2);   // arrow targets (ndc)
    for (let i=0;i<N;i++){
      pos[i*2]=Math.random()*2-1; pos[i*2+1]=Math.random()*2-1;
      seed[i]=Math.random();
      const r=Math.random(); let tx,ty;
      if(r<0.7){ const s=Math.random(); const side=Math.random()<0.5?-1:1; tx=side*s*0.42; ty=0.34-s*0.6; }
      else { tx=(Math.random()-0.5)*0.06; ty=0.42-Math.random()*0.95; }
      tgt[i*2]=tx+(Math.random()-0.5)*0.03; tgt[i*2+1]=ty+(Math.random()-0.5)*0.03;
    }

    let accent='#c4b5fd', accDim='rgba(150,145,180,0.55)';
    const readAccent=()=>{ const c=getComputedStyle(document.documentElement).getPropertyValue('--page-accent').trim(); if(c) accent=c; };
    readAccent(); const accInt=setInterval(readAccent,700);

    const resize=()=>{ W=canvas.width=innerWidth; H=canvas.height=innerHeight; };
    resize(); window.addEventListener('resize',resize);

    let raf, frame=0;
    const step=()=>{
      raf=requestAnimationFrame(step);
      frame++;
      const sv=(window.__scrollVel||0);
      const aspect=W/H;
      const mx=Mouse.nx*2-1, my=-(Mouse.ny*2-1);
      const conv=HomeFX.converge;
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle=accent;
      for(let i=0;i<N;i++){
        let px=pos[i*2], py=pos[i*2+1];
        let vx=vel[i*2], vy=vel[i*2+1];
        vx += 0.00045 + sv*0.00008;
        vy += Math.sin((px*3.0)+(i*0.5)+frame*0.01)*0.00007;
        const dx=(px-mx)*aspect, dy=py-my;
        const d2=dx*dx+dy*dy;
        if(d2<0.10){ const d=Math.sqrt(d2)+0.0001; const f=(0.32-d)*0.022; vx+=(dx/d)*f; vy+=(dy/d)*f; }
        if(conv>0.001){ vx+=(tgt[i*2]-px)*conv*0.022; vy+=(tgt[i*2+1]-py)*conv*0.022; }
        vx*=0.93; vy*=0.93; px+=vx; py+=vy;
        if(px>1.08){ px=-1.08; py=Math.random()*2-1; vx=0; vy=0; }
        if(px<-1.12) px=1.08;
        if(py>1.1) py=-1.1; if(py<-1.1) py=1.1;
        pos[i*2]=px; pos[i*2+1]=py; vel[i*2]=vx; vel[i*2+1]=vy;
        // draw
        const sx=(px*0.5+0.5)*W, sy=(1-(py*0.5+0.5))*H;
        const sp=Math.min(1, (Math.abs(vx)+Math.abs(vy))*40);
        const sz=0.6 + seed[i]*1.8 + sp*1.6;
        if(seed[i]>0.45){ ctx.globalAlpha=0.35+seed[i]*0.45; ctx.fillStyle=accent; }
        else { ctx.globalAlpha=0.5; ctx.fillStyle=accDim; }
        ctx.fillRect(sx, sy, sz, sz);
      }
      ctx.globalAlpha=1;
    };
    raf=requestAnimationFrame(step);
    return ()=>{ cancelAnimationFrame(raf); clearInterval(accInt); window.removeEventListener('resize',resize); };
  },[]);
  return <canvas ref={ref} className="home-canvas"></canvas>;
}

/* connector line: cursor -> nearest anchor (layer 4) */
function HomeConnectors(){
  const ref=useRef(null);
  useEffect(()=>{
    const svg=ref.current; const line=svg.querySelector('line');
    let raf, life=0;
    const anchors=()=>Array.from(document.querySelectorAll('[data-force-anchor]')).map(el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
    const loop=()=>{ raf=requestAnimationFrame(loop);
      const a=anchors(); if(!a.length){line.style.opacity=0;return;}
      let best=a[0],bd=1e9; for(const p of a){const d=(p.x-Mouse.x)**2+(p.y-Mouse.y)**2; if(d<bd){bd=d;best=p;}}
      if(bd<90000){ line.setAttribute('x1',Mouse.x);line.setAttribute('y1',Mouse.y);line.setAttribute('x2',best.x);line.setAttribute('y2',best.y);line.style.opacity=0.5; }
      else line.style.opacity*=0.9;
    };
    raf=requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(raf);
  },[]);
  return <svg ref={ref} className="home-connectors"><line/></svg>;
}

function GlitchHeroName({ text }){
  const [glitch,setGlitch]=useState(false);
  useEffect(()=>{
    let t; const onMove=()=>{ const sp=Math.abs(Mouse.vx)+Math.abs(Mouse.vy);
      if(sp>55){ setGlitch(true); clearTimeout(t); t=setTimeout(()=>setGlitch(false),120);} };
    window.addEventListener('pointermove',onMove); return ()=>{window.removeEventListener('pointermove',onMove);clearTimeout(t);};
  },[]);
  return <h1 className={'hero-name'+(glitch?' glitching':'')}>
    {text.split('').map((c,i)=><span key={i} className="gl" data-c={c}>{c===' '?'\u00A0':c}</span>)}
  </h1>;
}

function clampLocal(p,a,b){ return Math.max(0,Math.min(1,(p-a)/(b-a))); }
function bump(p,c,h){ return Math.max(0, 1-Math.abs(p-c)/h); }

function Home({ navigate }){
  const t=useT();
  const { toast,log }=useToast();
  const fxRef=useScrollFX([]);
  const journeyRef=useRef(null);
  const [p,setP]=useState(0);
  const loggedRef=useRef({});

  useEffect(()=>{
    let raf;
    const onScroll=()=>{ if(raf)return; raf=requestAnimationFrame(()=>{ raf=0;
      const el=journeyRef.current; if(!el)return;
      const rect=el.getBoundingClientRect();
      const total=el.offsetHeight-window.innerHeight;
      const prog=Math.max(0,Math.min(1,-rect.top/total));
      setP(prog);
      // converge particles during act 4
      HomeFX.converge = bump(prog,0.86,0.2);
      // diegetic logs
      const fire=(k,m)=>{ if(!loggedRef.current[k]){loggedRef.current[k]=1; log(m);} };
      if(prog>0.02) fire('density','// particle density: '+(innerWidth<760?'2.6k':'6k'));
      if(prog>0.46) fire('feat','// loading featured work...');
      if(prog>0.9) fire('conv','// particles converging → ↓');
    }); };
    window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
    return ()=>{window.removeEventListener('scroll',onScroll); HomeFX.converge=0;};
  },[]);

  // overlapping crossfade bumps — no dead frames between acts
  const C=[0.13,0.38,0.62,0.86], HW=0.23;
  const op=C.map(c=>bump(p,c,HW));         // opacity per act (peaks 1 at center)
  const en=C.map(c=>clampLocal(p,c-HW,c)); // entrance progress 0..1
  let act=0; for(let i=1;i<4;i++) if(op[i]>op[act]) act=i;

  const tagWords=[t('home.tagline1'),t('home.tagline2')];
  const wordsFlat=(tagWords[0]+' ||| '+tagWords[1]).split(' ');

  return (
    <div className="page home" ref={fxRef}>
      <HomeParticleField/>
      <HomeConnectors/>

      {/* HERO */}
      <section className="home-hero" data-screen-label="Home / Hero">
        <div className="eyebrow reveal in">Yi-Ting Yang Tang · Lisa</div>
        <GlitchHeroName text="LISA"/>
        <div className="hero-role">
          <span className="role-main shimmer" data-force-anchor>{t('home.role')}</span>
          <span className="role-sub shimmer">{t('home.sub')}</span>
        </div>
        <div className="scroll-hint">
          <span className="sh-line"></span>{t('home.scrollHint')}
        </div>
        <ImageSlot id="portrait" className="img-slot-home"/>
      </section>

      {/* PINNED JOURNEY */}
      <section className="home-journey" ref={journeyRef} style={{height:'460svh'}} data-screen-label="Home / Journey">
        <div className="home-stage">
          <div className="stage-inner">

            {/* ACT 1 — tagline from right */}
            <div style={{position:'absolute',inset:0,display:'grid',alignContent:'center',opacity:op[0],pointerEvents:act===0?'auto':'none'}}>
              <p className="tagline">
                {wordsFlat.map((w,i)=>{
                  if(w==='|||') return <br key={i}/>;
                  const reveal=clampLocal(en[0], i*0.05, i*0.05+0.5);
                  const isAccent = i>=tagWords[0].split(' ').length;
                  return <span key={i} className={'tw'+(isAccent?' accentw':'')} style={{transform:`translateX(${(1-reveal)*70}px)`,opacity:reveal,marginRight:'0.25em'}}>{w}</span>;
                })}
              </p>
              <p className="tagline-foot" style={{opacity:clampLocal(en[0],0.5,1)}}>— {t('home.taglinefoot')}</p>
            </div>

            {/* ACT 2 — stats */}
            <div style={{position:'absolute',inset:0,display:'grid',alignContent:'center',gap:'40px',opacity:op[1],pointerEvents:act===1?'auto':'none'}}>
              <div className="eyebrow" style={{opacity:clampLocal(en[1],0,0.3)}}>{t('home.statsTitle')}</div>
              <div className="home-stats">
                {[['04','s_awards'],['03','s_langs'],['05','s_years'],['02','s_engines']].map(([n,k],i)=>{
                  const lp=clampLocal(en[1], 0.1+i*0.08, 0.6+i*0.08);
                  return <div className="stat-cell" key={k} style={{transform:`translateY(${(1-lp)*40}px)`,opacity:0.25+lp*0.75}}>
                    <div className="stat-num"><em>{n}</em></div>
                    <div className="stat-label" data-force-anchor>{t('home.'+k)}</div>
                  </div>;
                })}
              </div>
            </div>

            {/* ACT 3 — featured cards from opposite sides */}
            <div style={{position:'absolute',inset:0,display:'grid',alignContent:'center',gap:'30px',opacity:op[2],pointerEvents:act===2?'auto':'none'}}>
              <div className="eyebrow" style={{opacity:clampLocal(en[2],0,0.3)}}>{t('home.featured')}</div>
              <div className="home-feat">
                {[['VITRUM','3D Texture · Weapons','🥇 1º UCM',-1],['Elemental Odyssey','Modeler · Lighting','🥇 1º HackJam',1]].map(([title,role,tag,dir],i)=>{
                  const lp=clampLocal(en[2],0.1,0.7);
                  return <a className="feat-card" key={i} data-cursor="project" onClick={(e)=>{e.preventDefault();navigate('work');}} href="#work"
                    style={{transform:`translateX(${(1-lp)*dir*120}px)`,opacity:0.2+lp*0.8}}>
                    <div className="ph" data-label={'render · '+title}></div>
                    <div className="feat-meta"><div><div className="feat-title">{title}</div><div style={{color:'var(--text-mid)',fontSize:13,marginTop:4}}>{role}</div></div><div className="feat-tag">{tag}</div></div>
                  </a>;
                })}
              </div>
              <a className="nav-link active" style={{justifySelf:'start',marginTop:8}} data-cursor="hover" href="#work" onClick={(e)=>{e.preventDefault();navigate('work');}}>{t('home.enterWork')} →</a>
            </div>

            {/* ACT 4 — converge + CTA */}
            <div style={{position:'absolute',inset:0,display:'grid',alignContent:'center',opacity:op[3],pointerEvents:act===3?'auto':'none'}}>
              <div className="home-cta">
                <div className="cta-arrow" style={{transform:`translateY(${(1-clampLocal(en[3],0.2,0.8))*-30}px)`}}>↓</div>
                <a className="cta-btn" data-cursor="hover" href="#work" onClick={(e)=>{e.preventDefault();navigate('work');}}>{t('home.cta')} →</a>
              </div>
            </div>

          </div>
        </div>
      </section>

      <MarqueeMantra text="craftsmanship meets storytelling"/>

      {/* act rail */}
      <div className="act-rail">{[0,1,2,3].map(i=><i key={i} className={act===i?'on':''}></i>)}</div>
    </div>
  );
}

Object.assign(window, { Home, HomeParticleField });
