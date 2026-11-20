/* QR Game v0.2.0. Universo continuo e aberto. */
:root{
  --obs:#090A0F;--surf:#11141D;--cream:#F4F1EA;--yel:#FFD23F;--org:#FF5A36;--grn:#2EE59D;--cya:#38BDF8;--red:#FF4D4D;
  --dim:rgba(244,241,234,.68);--faint:rgba(244,241,234,.3);--line:rgba(244,241,234,.16);
  --display:'Bricolage Grotesque',system-ui,sans-serif;--pixel:'Silkscreen',ui-monospace,monospace;
  --body:'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;
  --c:var(--yel);--pad:clamp(20px,5vw,56px)
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--obs);color:var(--cream);font:400 1.0625rem/1.6 var(--body);overflow-x:hidden}
body.lock{overflow:hidden}
body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:
  radial-gradient(60vmax 44vmax at 88% 6%,rgba(255,90,54,.13),transparent 62%),
  radial-gradient(54vmax 42vmax at 4% 48%,rgba(56,189,248,.10),transparent 62%),
  radial-gradient(60vmax 40vmax at 80% 92%,rgba(46,229,157,.07),transparent 60%)}
#stars{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
main,header,footer{position:relative;z-index:1}
a{color:var(--cya)}
b{font-weight:700}
.wrap{width:min(1120px,100% - 2*var(--pad));margin-inline:auto}
:focus-visible{outline:3px solid var(--yel);outline-offset:4px}
.kick{margin:0 0 12px;font:700 .8rem/1.4 var(--pixel);letter-spacing:.16em;color:var(--yel);text-transform:uppercase}

/* ---------- ABERTURA ---------- */
.hero{min-height:100vh;min-height:100svh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(12px,2.2svh,22px);padding:clamp(64px,10svh,96px) var(--pad) 28px}
.hero-top{position:absolute;top:max(18px,env(safe-area-inset-top));left:var(--pad);right:var(--pad);display:flex;justify-content:space-between;font:700 .72rem var(--pixel);letter-spacing:.14em;color:var(--dim)}
.hero-top .ver{color:var(--yel)}
.hero-copy{display:grid;gap:clamp(12px,2svh,20px);max-width:640px}
.hero-title{margin:0;font:800 clamp(2rem,5.6vw,4.1rem)/1 var(--display);letter-spacing:-.025em}
.hero-title .hot{color:var(--yel);display:block}
.hero-sub{margin:0;max-width:34em;color:var(--dim);font-size:clamp(.98rem,1.9vw,1.12rem)}
.hero-meta{margin:0;font:400 .78rem/1.6 var(--pixel);letter-spacing:.06em;color:var(--dim);text-transform:uppercase}
.hero-meta b{color:var(--yel);font-weight:700}
.hero-meta i{font-style:normal;color:var(--faint);margin:0 .5em}
.cue{justify-self:start;color:var(--cream);text-decoration:none;font:700 .95rem var(--display);border-bottom:2px solid var(--org);padding-bottom:2px}
.cue span{display:inline-block;animation:bob 1.4s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(4px)}}
.orb{position:relative;aspect-ratio:1;width:100%;max-width:440px}
.orb-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1;cursor:pointer;touch-action:manipulation}
.hero-orb{width:min(92vw,42svh,560px);max-width:none}
@media (min-width:900px){
  .hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);align-items:center;column-gap:clamp(24px,5vw,72px);max-width:1280px;margin-inline:auto;width:100%}
  .hero-orb{width:min(100%,64svh,600px);justify-self:center}
}

/* ---------- SECOES ---------- */
.sec-head{padding:clamp(48px,9vw,96px) 0 0}
.sec-title{margin:0;font:800 clamp(2.2rem,6.4vw,4rem)/1 var(--display);letter-spacing:-.02em}
.sec-sub{margin:16px 0 0;max-width:40em;color:var(--dim)}
.rv .reveal{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s ease}
.rv .reveal.in{opacity:1;transform:none}

/* ---------- MUNDOS (sem cards) ---------- */
.world{position:relative;display:grid;gap:clamp(24px,5vw,72px);align-items:center;padding:clamp(48px,9vw,110px) 0;grid-template-columns:minmax(0,1fr)}
.world-num{position:absolute;top:clamp(8px,3vw,36px);left:-.04em;z-index:-1;font:700 clamp(8rem,26vw,19rem)/.8 var(--pixel);color:transparent;-webkit-text-stroke:1px rgba(244,241,234,.1);user-select:none;pointer-events:none}
.world-visual{position:relative;display:grid;gap:6px;justify-items:center}
.world-body{display:grid;gap:clamp(12px,2vw,20px);align-content:start;min-width:0}
.meta{margin:0;display:flex;flex-wrap:wrap;gap:4px 18px;align-items:baseline;color:var(--dim);font-size:.95rem}
.meta b{color:var(--cream)}
.code{font:700 .9rem var(--pixel);letter-spacing:.08em;color:var(--c)}
.logo{display:block;width:min(100%,360px);height:auto;filter:drop-shadow(0 0 22px color-mix(in srgb,var(--c) 40%,transparent))}
.desc{margin:0;max-width:34em;color:var(--dim)}
.demo{position:relative;width:100%;max-width:560px;padding:10px}
.demo::before,.demo::after{content:"";position:absolute;width:26px;height:26px;border:0 solid var(--c);pointer-events:none}
.demo::before{top:0;left:0;border-width:3px 0 0 3px}
.demo::after{right:0;bottom:0;border-width:0 3px 3px 0}
.demo-canvas{display:block;width:100%;aspect-ratio:5/4;background:radial-gradient(120% 100% at 50% 0,rgba(17,20,29,.9),rgba(17,20,29,0) 80%)}
.steps{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px clamp(14px,3vw,26px);font:800 clamp(1.05rem,3.2vw,1.5rem)/1 var(--display);letter-spacing:-.01em;text-transform:uppercase}
.steps li{position:relative;display:flex;align-items:baseline;gap:8px;padding-bottom:7px;color:var(--faint);transition:color .25s ease}
.steps li::before{content:attr(data-n) ".";font:400 .5em var(--pixel);letter-spacing:.06em}
.steps li::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--c);transform:scaleX(0);transform-origin:left;transition:transform .35s ease}
.steps li.on{color:var(--cream)}
.steps li.on::after{transform:scaleX(1)}
.steps:not([data-sync]).n4 li{animation:lit4 8s linear infinite;animation-delay:calc(var(--i)*2s)}
.steps:not([data-sync]).n4 li::after{animation:bar4 8s linear infinite;animation-delay:calc(var(--i)*2s)}
.steps:not([data-sync]).n3 li{animation:lit3 7.5s linear infinite;animation-delay:calc(var(--i)*2.5s)}
.steps:not([data-sync]).n3 li::after{animation:bar3 7.5s linear infinite;animation-delay:calc(var(--i)*2.5s)}
@keyframes lit4{0%,24.9%{color:var(--cream)}25%,100%{color:var(--faint)}}
@keyframes bar4{0%{transform:scaleX(0)}22%,24.9%{transform:scaleX(1)}25%,100%{transform:scaleX(0)}}
@keyframes lit3{0%,33.2%{color:var(--cream)}33.3%,100%{color:var(--faint)}}
@keyframes bar3{0%{transform:scaleX(0)}30%,33.2%{transform:scaleX(1)}33.3%,100%{transform:scaleX(0)}}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px 16px;margin-top:6px}
.seal{position:absolute;top:8%;right:4%;z-index:3;padding:3px 0;border-block:2px solid var(--grn);color:var(--grn);font:700 .72rem var(--pixel);letter-spacing:.16em;transform:rotate(14deg) scale(1.8);opacity:0;pointer-events:none;transition:opacity .35s ease,transform .35s cubic-bezier(.2,1.4,.4,1)}
.seal.on{opacity:.95;transform:rotate(-10deg) scale(1)}

/* botao orbital: Conhecer planeta */
.orbit-btn{display:inline-flex;align-items:center;gap:10px;padding:10px 4px;border:0;background:none;cursor:pointer;color:var(--c);font:700 .76rem var(--pixel);letter-spacing:.12em;text-transform:uppercase;touch-action:manipulation}
.orbit-btn:hover{color:var(--cream)}
.dot{position:relative;width:14px;height:14px;display:inline-grid;place-items:center;font-size:.85rem;line-height:1}
.dot::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--c);animation:ping 1.8s ease-out infinite}
@keyframes ping{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.3);opacity:0}}

/* ---------- BOTOES (blocos pixelados, sem pilula) ---------- */
.btn{--k:6px;display:inline-flex;align-items:center;justify-content:center;gap:.6em;min-height:50px;padding:0 24px;border:0;cursor:pointer;font:800 .98rem var(--display);letter-spacing:.04em;text-transform:uppercase;text-decoration:none;touch-action:manipulation;
  clip-path:polygon(var(--k) 0,calc(100% - var(--k)) 0,calc(100% - var(--k)) var(--k),100% var(--k),100% calc(100% - var(--k)),calc(100% - var(--k)) calc(100% - var(--k)),calc(100% - var(--k)) 100%,var(--k) 100%,var(--k) calc(100% - var(--k)),0 calc(100% - var(--k)),0 var(--k),var(--k) var(--k))}
.btn .ico{font:700 .85em var(--pixel);letter-spacing:0}
.btn-play{background:var(--yel);color:var(--obs)}
.btn-play:hover{background:var(--org);color:var(--cream)}
.btn-qr{background:rgba(56,189,248,.16);color:var(--cya)}
.btn-qr:hover{background:var(--cya);color:var(--obs)}
.btn-dos{background:rgba(244,241,234,.1);color:var(--cream)}
.btn-dos:hover,.btn-dos[aria-expanded="true"]{background:var(--cream);color:var(--obs)}
.btn:focus-visible{clip-path:none;outline:3px solid var(--cream);outline-offset:3px}
.fx-wrap{position:relative;display:inline-block}
.btn-fx{position:absolute;left:-26px;top:-90px;width:calc(100% + 52px);height:calc(100% + 116px);pointer-events:none;z-index:2}

/* ---------- DOSSIE (aberto, sem caixas) ---------- */
.dossie{display:grid;grid-template-rows:0fr;transition:grid-template-rows .55s cubic-bezier(.2,.8,.2,1)}
.dossie>div{overflow:hidden;min-height:0}
.dossie.open{grid-template-rows:1fr}
.dos-inner{display:grid;gap:clamp(22px,3vw,34px);padding:20px 0 4px}
.dos{display:grid;gap:10px;border-top:1px solid var(--line);padding-top:14px}
.dos h4{margin:0;font:700 .78rem var(--pixel);letter-spacing:.16em;color:var(--c);text-transform:uppercase}
.dos p{margin:0;color:var(--cream);font-size:.98rem}
.dos p.dim{color:var(--dim)}
.dos pre{margin:0;padding:2px 0 2px 14px;border-left:3px solid var(--c);font:400 .78rem/1.5 var(--mono);color:var(--grn);white-space:pre-wrap;word-break:break-word}
.dos code{font:400 .86em var(--mono);color:var(--yel)}
.zchart{display:grid;gap:10px;margin:6px 0}
.zrow{display:grid;gap:4px}
.zrow>span{font:700 .68rem var(--pixel);letter-spacing:.1em;color:var(--dim);text-transform:uppercase}
.zbar{display:flex;height:34px;margin-left:var(--off,0)}
.zbar i{display:grid;place-items:center;height:100%;font:700 .66rem var(--pixel);font-style:normal;color:var(--obs);letter-spacing:.04em;overflow:hidden;white-space:nowrap}
.zbar i.z0{background:#f67}.zbar i.z1{background:#fd6}.zbar i.z2{background:#5de}.zbar i.z3{background:#6d9}
.swatches{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:10px 22px}
.sw{display:flex;align-items:center;gap:8px;font:400 .8rem var(--mono);color:var(--dim)}
.sw i{display:block;width:22px;height:22px;flex:none}
.sw.ghost i{background:none;outline:1px dashed var(--faint);outline-offset:-1px}
.sw b{color:var(--cream);font-weight:700}
.diary{display:grid;gap:14px}
.diary p{padding-left:14px;border-left:3px solid var(--line)}
.diary strong{color:var(--yel);font-weight:700}
.bounce{width:min(100%,420px);height:auto}

/* ---------- OVERLAYS (QR e historia do planeta) ---------- */
.overlay{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:100;background:rgba(9,10,15,.97);opacity:0;transition:opacity .25s ease;overflow:auto}
.overlay[hidden]{display:none}
.overlay.open{opacity:1}
.overlay::before{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(244,241,234,.035) 0 1px,transparent 1px 4px)}
.qr-modal{display:grid;place-items:center}
.qr-box{position:relative;display:grid;gap:18px;justify-items:center}
.qr-stage{position:relative;width:min(76vmin,560px);aspect-ratio:1;padding:clamp(18px,4vmin,34px)}
.qr-stage img{display:block;width:100%;height:100%;background:#fff;image-rendering:pixelated}
.corner{position:absolute;width:14%;height:14%;border:0 solid var(--yel);animation:snap 1.7s ease-in-out infinite}
.corner.tl{top:0;left:0;border-width:5px 0 0 5px;--x:8px;--y:8px}
.corner.tr{top:0;right:0;border-width:5px 5px 0 0;--x:-8px;--y:8px}
.corner.bl{bottom:0;left:0;border-width:0 0 5px 5px;--x:8px;--y:-8px}
.corner.br{bottom:0;right:0;border-width:0 5px 5px 0;--x:-8px;--y:-8px}
@keyframes snap{50%{transform:translate(var(--x),var(--y))}}
.beam{position:absolute;left:clamp(18px,4vmin,34px);right:clamp(18px,4vmin,34px);top:8%;height:3px;background:var(--grn);box-shadow:0 0 18px 4px rgba(46,229,157,.55);animation:sweepy 2.6s ease-in-out infinite alternate}
@keyframes sweepy{to{top:90%}}
.qr-cap{margin:0;font:400 .85rem var(--pixel);letter-spacing:.1em;color:var(--dim);text-transform:uppercase;text-align:center}
.qr-cap b{color:var(--yel);font-weight:700}
.btn-close{position:fixed;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));background:var(--cream);color:var(--obs);z-index:3}
.btn-close:hover{background:var(--yel)}
.lore-inner{position:relative;width:min(680px,100% - 2*var(--pad));margin:0 auto;padding:clamp(76px,13vh,128px) 0 72px;display:grid;gap:18px}
.lore-et{width:96px;height:96px;image-rendering:pixelated}
.lore-planet{margin:0;font:800 clamp(3rem,13vw,6.5rem)/.9 var(--display);letter-spacing:-.04em;color:var(--lc,var(--yel))}
.lore-meta{margin:0;font:700 .8rem/1.5 var(--pixel);letter-spacing:.14em;color:var(--dim);text-transform:uppercase}
.lore-inner h3{margin:10px 0 0;font:700 .78rem var(--pixel);letter-spacing:.16em;color:var(--lc,var(--yel));text-transform:uppercase}
.lore-inner p{margin:0;font-size:1.08rem;line-height:1.7}

/* ---------- RADAR ---------- */
.radar-head{padding:clamp(40px,7vw,80px) 0 0}
.radar-head h3{margin:0;font:800 clamp(1.6rem,4vw,2.4rem)/1 var(--display)}
.radar-head p{margin:10px 0 0;color:var(--dim);max-width:38em}
.radar{display:flex;flex-wrap:wrap;justify-content:center;gap:clamp(28px,5vw,64px);padding:clamp(32px,6vw,60px) 0 clamp(56px,9vw,110px)}
.blip{position:relative;margin:0;width:clamp(150px,26vw,210px);display:grid;gap:10px;justify-items:center;text-align:center}
.blip .seal{top:2%;right:-6%;font-size:.6rem}
.dish{position:relative;width:100%;aspect-ratio:1;border-radius:50%}
.dish::before,.dish::after{content:"";position:absolute;border-radius:50%;border:2px dashed var(--c);pointer-events:none;z-index:2}
.dish::before{inset:0;opacity:.6}
.dish::after{inset:24%;border-width:1px;opacity:.28}
.sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 290deg,var(--c) 360deg);opacity:.16;animation:spin 6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.dish canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;display:block;cursor:pointer;touch-action:manipulation;z-index:1}
.blip figcaption{display:grid;gap:2px;justify-items:center}
.blip .et{font:800 1.4rem/1.1 var(--display);color:var(--cream)}
.blip .pl{font:700 .72rem var(--pixel);letter-spacing:.12em;color:var(--c);text-transform:uppercase}
.blip .gname{font:400 .82rem var(--mono);color:var(--dim)}

/* ---------- BASTIDORES ---------- */
.bts{padding:clamp(48px,9vw,110px) 0 clamp(48px,9vw,96px);background:linear-gradient(180deg,transparent,rgba(17,20,29,.85) 18%,rgba(17,20,29,.85) 82%,transparent)}
.bts-title{margin:0 0 clamp(20px,3vw,32px);display:grid;gap:clamp(4px,1vw,10px);font-family:var(--display);font-weight:800;text-transform:uppercase}
.bts-title .pre{font-size:clamp(1.3rem,4vw,2.5rem);line-height:1;letter-spacing:.02em}
.bts-title em{font-style:normal;font-size:clamp(6.4rem,32vw,20rem);line-height:.74;letter-spacing:-.05em;color:var(--yel);margin-left:-.04em}
.bts-title .post{font-size:clamp(1.3rem,4.6vw,3.1rem);line-height:1.02;max-width:14em;letter-spacing:-.01em}
.bts-sub{margin:0 0 clamp(36px,6vw,64px);max-width:44em;color:var(--dim);font-size:1.1rem}
.facts{display:grid;gap:clamp(28px,4vw,48px);grid-template-columns:minmax(0,1fr);margin-bottom:clamp(56px,9vw,104px)}
.fact{border-top:1px solid var(--line);padding-top:16px;display:grid;gap:10px;align-content:start}
.fact .n{font:700 .8rem var(--pixel);letter-spacing:.16em;color:var(--org)}
.fact h3{margin:0;font:800 clamp(1.4rem,3vw,1.85rem)/1.08 var(--display);letter-spacing:-.01em}
.fact p{margin:0;color:var(--dim)}
.more{justify-self:start;margin-top:4px;padding:6px 0;border:0;background:none;cursor:pointer;color:var(--yel);font:700 .9rem var(--mono);border-bottom:1px dashed rgba(255,210,63,.55);text-align:left}
.more:hover{color:var(--cream);border-bottom-color:var(--cream)}
.story{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s cubic-bezier(.2,.8,.2,1)}
.story>div{overflow:hidden;min-height:0}
.story p{padding-top:6px;color:var(--cream);font-size:.98rem}
.fact.open .story{grid-template-rows:1fr}
.et-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.et-row canvas{width:36px;height:36px;image-rendering:pixelated}

/* ---------- RAIO-X ---------- */
.xray-head{margin:0 0 20px}
.xray-head h3{margin:0 0 8px;font:800 clamp(1.7rem,4.4vw,2.8rem)/1.02 var(--display);letter-spacing:-.015em;text-transform:uppercase}
.xray-head p{margin:0;color:var(--dim);max-width:40em}
.xray{--pos:50%;position:relative;width:100%;aspect-ratio:16/8;min-height:260px;overflow:hidden;touch-action:pan-y;-webkit-mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent);mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)}
.xr-layer{position:absolute;inset:0}
.xr-code{padding:18px 22px;background:#06070B}
.xr-code pre{margin:0;font:400 .7rem/1.45 var(--mono);color:var(--grn);white-space:pre-wrap;word-break:break-all;overflow:hidden;height:100%}
.xr-qr{display:grid;place-items:center;background:var(--surf);clip-path:inset(0 calc(100% - var(--pos)) 0 0)}
.xr-qr img{height:92%;width:auto;aspect-ratio:1;display:block;image-rendering:pixelated;background:#fff}
.xr-tag{position:absolute;top:10px;z-index:3;font:700 .68rem var(--pixel);letter-spacing:.14em;text-transform:uppercase;padding:4px 8px;background:var(--obs)}
.xr-tag.l{left:12px;color:var(--cya)}
.xr-tag.r{right:12px;color:var(--grn)}
.xr-handle{position:absolute;top:0;bottom:0;left:var(--pos);width:3px;margin-left:-1.5px;background:var(--yel);z-index:3;pointer-events:none}
.xr-handle::after{content:"\21C6";position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;display:grid;place-items:center;background:var(--yel);color:var(--obs);font:800 1.15rem var(--display);clip-path:polygon(25% 0,75% 0,75% 25%,100% 25%,100% 75%,75% 75%,75% 100%,25% 100%,25% 75%,0 75%,0 25%,25% 25%)}
.xr-range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;z-index:4;-webkit-appearance:none;appearance:none;background:none}
.xr-range:focus-visible+.xr-focus{opacity:1}
.xr-focus{position:absolute;inset:0;border:3px solid var(--yel);opacity:0;pointer-events:none;z-index:5}
.xr-foot{display:flex;flex-wrap:wrap;align-items:center;gap:14px 28px;margin-top:18px}
.btn-copy{background:rgba(46,229,157,.14);color:var(--grn);min-height:44px;text-transform:none;font-family:var(--mono);font-weight:700;font-size:.9rem}
.btn-copy:hover{background:var(--grn);color:var(--obs)}
.xr-ratio{margin:0;font:400 .95rem/1.5 var(--body);color:var(--dim);max-width:44em}
.xr-ratio b{color:var(--yel)}

/* ---------- RODAPE ---------- */
.foot{display:grid;gap:12px;justify-items:center;padding:36px var(--pad) calc(40px + env(safe-area-inset-bottom));color:var(--dim);font:400 .85rem var(--mono);text-align:center}
.foot p{margin:0}
.foot a{color:var(--cream)}
.foot .cue{justify-self:center}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:120;padding:10px 20px;background:var(--yel);color:var(--obs);font:800 1rem var(--display);letter-spacing:.08em;animation:pop .35s ease-out}
@keyframes pop{from{transform:translateX(-50%) scale(.7);opacity:0}}
body.turbo .hot{animation:flick .25s steps(2) infinite}
@keyframes flick{50%{color:var(--org)}}

/* ---------- RESPONSIVO ---------- */
@media (min-width:900px){
  .world{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
  .world.rev .world-visual{order:2}
  .facts{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:700px){
  .xray{aspect-ratio:1}
  .hero-meta{font-size:.68rem}
}
@media (max-width:480px){
  .actions .fx-wrap,.actions .fx-wrap .btn,.actions>.btn{width:100%}
  .actions .fx-wrap{display:block}
}
@media (prefers-reduced-motion:reduce){
 html{scroll-behavior:auto}
 *,*::before,*::after{animation:none!important;transition:none!important}
  .steps li{color:var(--cream)!important}
  .steps li::after{transform:scaleX(1)!important}
  .rv .reveal{opacity:1;transform:none}
}
