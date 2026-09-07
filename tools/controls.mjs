// controls.mjs — audit of every control in desktop mode and in a WebXR session (Meta's IWER runtime, Quest 3 profile).
// Runs the dev page (unminified sources) so sim state can be inspected. Prints a table. Usage: node tools/controls.mjs
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
const srv=spawn(process.execPath,['tools/serve.cjs','8098'],{stdio:'ignore'});await new Promise(r=>setTimeout(r,600));
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const rows=[];let fails=0;
const check=(mode,control,expected,ok,detail='')=>{rows.push([mode,control,expected,ok?'ok':'FAIL',detail]);if(!ok)fails++;console.log(`${ok?'ok  ':'FAIL'} [${mode}] ${control}: ${expected}${detail?' — '+detail:''}`)};
const yawOf=f=>Math.atan2(f[0],f[2]);
const mk=async(xr)=>{const page=await browser.newPage({viewport:{width:900,height:520}});const errors=[];
  page.on('console',m=>{if(m.type()=='error')errors.push(m.text())});page.on('pageerror',e=>errors.push('PAGEERROR '+e.message));
  await page.route('https://play.js13kgames.com/2026/webxr/three.js',r=>r.fulfill({path:'tools/three-hosted-r185.js',contentType:'text/javascript'}));
  if(xr)await page.addInitScript({content:readFileSync('node_modules/iwer/build/iwer.js','utf8')+`;(()=>{const d=new IWER.XRDevice(IWER.metaQuest3);d.installRuntime({forceInstall:true});window.__dev=d;d.position.set(0,1.6,0);d.controllers.left.position.set(-.25,1.2,-.4);d.controllers.right.position.set(.25,1.2,-.4);
    window.__anim=(fn,dur)=>new Promise(res=>{const t0=performance.now();const f=()=>{const u=Math.min(1,(performance.now()-t0)/dur);fn(u);if(u<1)requestAnimationFrame(f);else res()};f()});
    window.__btn=(h,id,v)=>d.controllers[h].updateButtonValue(id,v);window.__pos=(h,x,y,z)=>d.controllers[h].position.set(x,y,z);})();`});
  await page.goto('http://localhost:8098/');await page.waitForFunction(()=>window.SF,{timeout:20000});
  const S=()=>page.evaluate(()=>{const s=SF.sim,f=a=>a.map(x=>+x.toFixed(3));return{ws:s._ws,wave:s._wave,md:s._md,light:s._light,ch:s._ch,L:f(s._L.p),R:f(s._R.p),Lt:s._L.t,Rt:s._R.t,H:f(s._H.p),Hf:[...s._H.f],fg:s._fg.on,ev:SF.state().events.slice(-40),mute:SF.state().mute,xr:SF.state().xr,text:SF.state().text}});
  const mark=()=>page.evaluate(()=>SF.state().events.length);const since=m=>page.evaluate(m=>SF.state().events.slice(m),m);
  const place=(v,b,r,st=3)=>page.evaluate(([v,b,r,st])=>{const s=SF.sim,fw=s._H.f,hy=Math.atan2(fw[0],fw[2]);const e=s._spawn(v,hy+b,r);e._st=st;e._sd=99;e._yaw=Math.atan2(s._H.p[0]-e._p[0],s._H.p[2]-e._p[2]);return e._b},[v,b,r,st]); // bearing relative to the head yaw, facing the player
  const clearEn=()=>page.evaluate(()=>{SF.sim._en=[];SF.sim._q=[];SF.sim._wave=0}); // wave back to 0: each kill row clears its wave, and a walked-up counter would begin a wave 11
  const wait=ms=>page.waitForTimeout(ms);
  const holdUntil=async(key,cond,arg,ms=2500)=>{await page.keyboard.down(key);const ok=await page.waitForFunction(cond,arg,{timeout:ms}).then(()=>true).catch(()=>false);await page.keyboard.up(key);return ok};
  const settle=async()=>{await page.evaluate(()=>{SF.sim._light=7;SF.sim._inv=0});await page.waitForFunction(()=>SF.sim._md==0&&!SF.sim._fg.on,null,{timeout:6000}).catch(()=>{});await wait(400);if(!xr){await page.evaluate(()=>SF.reset());await wait(300)}}; // desktop: hands (and mouse look) back to their defaults deterministically — a key walk at software-render frame rates overshoots
  return{page,errors,S,mark,since,place,clearEn,wait,holdUntil,settle}};

// =============================== DESKTOP ===============================
{const {page,errors,S,mark,since,place,clearEn,wait,holdUntil,settle}=await mk(false);const M='desktop';
  check(M,'boot button','PLAY ON DESKTOP',(await page.textContent('#b'))=='PLAY ON DESKTOP');
  await page.click('#b');await wait(500);check(M,'PLAY ON DESKTOP','title text shown, game waiting for a trigger',(await S()).ws==0&&(await S()).text.includes('SEVENFOLD'));
  await page.mouse.click(450,260);await wait(100);const locked=await page.evaluate(()=>!!document.pointerLockElement);
  await page.mouse.down({button:'left'});await wait(80);let s=await S();check(M,'left mouse button','right hand trigger (R.t=1)',s.Rt==1&&s.Lt==0,`Lt=${s.Lt} Rt=${s.Rt}`);await page.mouse.up({button:'left'});await wait(1500);
  s=await S();check(M,'first trigger pull','starts the game (wave 1 begins)',s.ws>=1&&s.wave>=1,`ws=${s.ws} wave=${s.wave}`);await clearEn();
  await page.mouse.down({button:'right'});await wait(80);s=await S();check(M,'right mouse button','left hand trigger (L.t=1)',s.Lt==1&&s.Rt==0,`Lt=${s.Lt} Rt=${s.Rt}`);await page.mouse.up({button:'right'});await wait(400);
  if(locked){const y0=yawOf((await S()).Hf);await page.mouse.move(650,260,{steps:5});await wait(200);const y1=yawOf((await S()).Hf);check(M,'mouse look','head yaw changes',Math.abs(y1-y0)>.1,`Δyaw=${(y1-y0).toFixed(2)} rad`);await page.mouse.move(450,260,{steps:5});await wait(200)} // and back to yaw 0: the hand-reset walk below assumes it
  else check(M,'mouse look','head yaw changes (needs pointer lock)',false,'pointer lock not granted in headless Chromium; verify by hand');
  for(const[key,axis,sign,name]of[['KeyW',2,1,'W: hands forward (reach clamps at 1 m)'],['KeyS',2,-1,'S: hands back'],['KeyA',0,1,'A: hands left'],['KeyD',0,-1,'D: hands right'],['KeyE',1,1,'E: hands up'],['KeyQ',1,-1,'Q: hands down']]){
    await settle();const a=(await S()).R;await holdUntil(key,([ax,sg,a0])=>(SF.sim._R.p[ax]-a0)*sg>.3,[axis,sign,a[axis]]);
    const b=(await S()).R;const d=(b[axis]-a[axis])*sign;check(M,name,'right hand moves ≥ 0.2 m that way',d>.2,`Δ=${d.toFixed(2)} m`);
    await page.evaluate(()=>SF.reset())}
  // B arch
  await settle();let mB=await mark();await page.keyboard.down('KeyB');await wait(400);s=await S();check(M,'B (hold)','both triggers → arch (mode 1)',s.md==1&&s.Lt==1&&s.Rt==1,`mode=${s.md}`);await page.keyboard.up('KeyB');await wait(300);
  {const st=await S(),nw=await since(mB);check(M,'B (release, hands still)','back to the free rope (mode 0), no throw',st.md==0&&!nw.includes('throw'),`mode=${st.md} new events=${nw}`)}
  // arch strike
  await settle();await clearEn();await place(0,0,1.1);const x0=(await S()).R[0];mB=await mark();await page.keyboard.down('KeyB');await wait(150);await holdUntil('KeyA',x0=>SF.sim._R.p[0]>x0+.7,x0);await holdUntil('KeyD',x0=>SF.sim._R.p[0]<x0-.7,x0);await wait(700);await page.keyboard.up('KeyB');await wait(200);
  {const nw=await since(mB);check(M,'arch strike (B + A/D sweep through a unicorn)','hit or res event',nw.some(k=>k=='hit'||k=='res'),nw.slice(-8).join(','))}
  // block
  await settle();await clearEn();await place(0,0,1.3,0);mB=await mark();await page.keyboard.down('KeyB');await wait(1400);await page.keyboard.up('KeyB');{const nw=await since(mB);check(M,'block (B held while a unicorn rears)','block event, no colour lost',nw.includes('block')&&!nw.includes('gore'),nw.slice(-6).join(','))}
  // sigils
  await settle();await clearEn();await place(0,0,4);let mk1=await mark();await page.keyboard.press('Space');await wait(3800);let nw=await since(mk1);check(M,'Space (circle sigil)','forge, sigil, throw, catch; hits the unicorn ahead',['forge','sigil','throw','catch'].every(k=>nw.includes(k))&&nw.some(k=>k=='hit'||k=='res'),nw.slice(-10).join(','));
  await settle();await clearEn();await place(0,0,3);mk1=await mark();await page.keyboard.press('KeyG');await wait(2600);nw=await since(mk1);check(M,'G (cross sigil)','forge, sigil, lasso cast, caught',['forge','sigil','lasso','caught'].every(k=>nw.includes(k)),nw.slice(-8).join(','));
  await page.keyboard.down('KeyS');await wait(300);await page.keyboard.up('KeyS');await wait(200);nw=await since(mk1);check(M,'yank (S while a unicorn is caught)','yank event, unicorn killed',nw.includes('yank'),nw.slice(-4).join(','));
  await settle();await clearEn();for(let i=0;i<3;i++)await place(0,i-1,3);mk1=await mark();await page.keyboard.press('KeyN');await wait(1500);nw=await since(mk1);check(M,'N (slam sigil, no charge)','sigil 3 recognised, no Nova',nw.includes('sigil')&&!nw.includes('nova'),nw.slice(-6).join(','));
  await settle();await page.evaluate(()=>SF.charge());mk1=await mark();await page.keyboard.press('KeyN');await wait(1500);nw=await since(mk1);check(M,'N (slam sigil, charged)','Nova, every unicorn within 6.5 m killed',nw.includes('nova')&&nw.filter(k=>k=='kill').length>=3,nw.slice(-8).join(','));
  await settle();mk1=await mark();await page.keyboard.down('KeyV');await wait(700);await page.keyboard.up('KeyV');await wait(300);nw=await since(mk1);check(M,'V (both grips) with still hands','forge starts, unrecognised → unforge, nothing fires',nw.includes('forge')&&nw.includes('unforge')&&!nw.includes('sigil'),nw.slice(-4).join(','));
  // the physical verbs behind the sigils
  await settle();await clearEn();await place(0,0,4);await holdUntil('KeyS',()=>SF.sim._R.p[2]<.25);await wait(300);mk1=await mark();await page.keyboard.down('KeyB');await wait(200);await holdUntil('KeyW',()=>SF.sim._R.p[2]>.7);await page.keyboard.up('KeyB');await wait(3000);nw=await since(mk1);check(M,'physical throw (B held, W swing, release B)','arc, throw, catch',['arc','throw','catch'].every(k=>nw.includes(k)),nw.slice(-8).join(','));
  for(let tr=0;tr<2;tr++){await settle();await clearEn();await place(0,0,3);await holdUntil('KeyS',()=>SF.sim._R.p[2]<.25);await wait(300);mk1=await mark();await page.mouse.down({button:'left'});await wait(400);await page.keyboard.down('KeyW');await wait(300);await page.keyboard.up('KeyW');await page.mouse.up({button:'left'});await wait(1500);nw=await since(mk1);if(nw.includes('lasso'))break} // a 300 ms W hold then an immediate release: the rope tip needs ~0.3 s to reach 3 m/s; one retry, the swing is physical and frame-rate sensitive under software rendering
  check(M,'physical lasso (right trigger held, W swing, release)','lasso mode, loop thrown',nw.includes('rope')&&nw.includes('lasso'),nw.slice(-6).join(','));
  // whip
  await settle();await clearEn();await place(0,0,1.2);await holdUntil('KeyS',()=>SF.sim._R.p[2]<.25);await wait(300);mk1=await mark();await holdUntil('KeyW',()=>SF.sim._R.p[2]>.7);await holdUntil('KeyS',()=>SF.sim._R.p[2]<.25);await wait(400);nw=await since(mk1);check(M,'whip (fast W/S flick, no trigger)','crack event',nw.includes('crack'),nw.join(',')||'(no events)');
  // M mute, R restart
  const m0=(await S()).mute;await page.keyboard.press('KeyM');await wait(150);check(M,'M','mute toggles',(await S()).mute!=m0);await page.keyboard.press('KeyM');await wait(150);
  await page.evaluate(()=>{SF.sim._light=3});await page.keyboard.press('KeyR');await page.waitForFunction(()=>SF.sim._wave==1,null,{timeout:8000}).catch(()=>{});s=await S();check(M,'R','restart at wave 1 with 7 colours',s.wave==1&&s.light==7,`wave=${s.wave} light=${s.light}`);
  check(M,'console','zero errors',errors.length==0,errors.slice(0,3).join(' | '));await page.close()}

// =============================== VR (IWER, Quest 3) ===============================
{const {page,errors,S,mark,since,place,clearEn,wait,settle}=await mk(true);const M='VR';
  const dev=(js)=>page.evaluate(js);
  const home=async()=>{await dev('__pos("left",-.25,1.2,-.4);__pos("right",.25,1.2,-.4)');await settle()};
  check(M,'boot button','ENTER VR offered',(await page.textContent('#b'))=='ENTER VR');
  await page.click('#b');await wait(1500);check(M,'ENTER VR','immersive-vr session, game waiting for a trigger',(await S()).xr==1&&(await S()).ws==0);
  await dev('__dev.position.set(.4,1.7,-.3)');await wait(300);let s=await S();
  await dev("__btn('right','trigger',1)");await wait(120);await dev("__btn('right','trigger',0)");await wait(600);s=await S();
  check(M,'first trigger recentres','head at the arena origin after the start (|x,z| < 0.05)',Math.hypot(s.H[0],s.H[2])<.05&&Math.abs(s.H[1]-1.7)<.02,`H=${s.H}`);
  check(M,'trigger starts the game','wave 1 begins',s.ws>=1,`ws=${s.ws}`);await clearEn();
  await dev('__dev.position.set(.9,1.7,-.3)');await wait(300);s=await S();check(M,'head movement','moving the headset 0.5 m moves the head in the sim by 0.5 m',Math.abs(Math.hypot(s.H[0],s.H[2])-.5)<.05,`|H.xz|=${Math.hypot(s.H[0],s.H[2]).toFixed(2)}`);
  await dev('__dev.position.set(.4,1.7,-.3)');const y0=yawOf((await S()).Hf);await dev('__dev.quaternion.set(0,Math.sin(.4),0,Math.cos(.4))');await wait(300);const y1=yawOf((await S()).Hf);check(M,'head rotation','turning the headset 0.8 rad turns the head yaw',Math.abs(Math.abs(y1-y0)-.8)<.1,`Δyaw=${(y1-y0).toFixed(2)}`);await dev('__dev.quaternion.set(0,0,0,1)');await wait(200);
  await home();const l0=(await S()).L,r0=(await S()).R;
  await dev('__pos("left",-.25,1.5,-.4)');await wait(200);let l1=(await S()).L;check(M,'left controller','moves the left hand (handedness mapping)',Math.abs(l1[1]-l0[1]-.3)<.03&&Math.abs((await S()).R[1]-r0[1])<.01,`ΔL.y=${(l1[1]-l0[1]).toFixed(2)}`);
  await dev('__pos("left",-.25,1.2,-.4);__pos("right",.25,1.5,-.4)');await wait(200);let r1=(await S()).R;check(M,'right controller','moves the right hand',Math.abs(r1[1]-r0[1]-.3)<.03,`ΔR.y=${(r1[1]-r0[1]).toFixed(2)}`);await home();
  check(M,'hands sit where the controllers are','0.5 m apart, in front of the head',Math.abs(Math.hypot(...l0.map((v,i)=>v-r0[i]))-.5)<.03,`|L-R|=${Math.hypot(...l0.map((v,i)=>v-r0[i])).toFixed(2)}`);
  await dev("__btn('left','trigger',1)");await wait(80);s=await S();check(M,'left trigger','L.t=1',s.Lt==1&&s.Rt==0);await dev("__btn('left','trigger',0)");await wait(400);
  let mg=await mark();await dev("__btn('right','squeeze',1)");await wait(400);s=await S();check(M,'one grip (squeeze)','not a trigger, no forge on its own',s.Rt==0&&!(await since(mg)).includes('forge'));await dev("__btn('right','squeeze',0)");await wait(300);
  await dev("__btn('left','trigger',1);__btn('right','trigger',1)");await wait(300);s=await S();check(M,'both triggers','arch (mode 1)',s.md==1,`mode=${s.md}`);
  await clearEn();await place(0,0,4);let ms=await mark();await dev(`__anim(u=>{const z=-.4-.9*u*u,y=1.2+.15*Math.sin(u*Math.PI);__pos('left',-.25,y,z);__pos('right',.25,y,z);if(u>=.8){__btn('left','trigger',0);__btn('right','trigger',0)}},260)`);await wait(3500);
  let e=await since(ms);check(M,'swing + release (both triggers)','throw, turn, catch; hits the unicorn',['throw','turn','catch'].every(k=>e.includes(k))&&e.some(k=>k=='hit'||k=='res'),e.slice(-10).join(','));await home();
  await clearEn();ms=await mark();await dev("__btn('left','trigger',1);__btn('right','trigger',1)");await wait(300);await dev(`__anim(u=>{const z=-.4-.9*u*u;__pos('left',-.25,1.2,z);__pos('right',.25,1.2,z)},220)`);await wait(300);await dev("__btn('left','trigger',0);__btn('right','trigger',0)");await wait(400);
  e=await since(ms);check(M,'swing, stop, then release (emulator style)','still throws (0.5 s grace)',e.includes('throw'),e.slice(-5).join(','));await wait(2500);await home();
  ms=await mark();await dev("__btn('left','trigger',1);__btn('right','trigger',1)");await wait(900);await dev("__btn('left','trigger',0);__btn('right','trigger',0)");await wait(300);{const st=await S(),nw=await since(ms);check(M,'release without a swing','no throw, rope returns',!nw.includes('throw')&&st.md==0,`mode=${st.md} new events=${nw}`)}
  // lasso
  await clearEn();await place(0,0,2.5);await dev("__btn('right','trigger',1)");await wait(500);s=await S();check(M,'one trigger held','lasso mode (mode 2)',s.md==2,`mode=${s.md}`);
  ms=await mark();await dev(`__anim(u=>{const a=u*20;__pos('right',Math.sin(a)*.35,1.7+Math.cos(a)*.1,-.2-Math.cos(a)*.35);if(u>=.9)__btn('right','trigger',0)},900)`);await wait(1500);e=await since(ms);check(M,'spin + release','lasso flies and catches the unicorn',e.includes('lasso')&&e.includes('caught'),e.slice(-6).join(',')); // the hand is still fast at the catch: it may yank at once (catch-and-kill in one motion)
  await home();
  // human-speed lasso: a lazy overhead spin (1.5 rev/s, 20 cm) leaves the hand slow at the catch, so the yank is its own motion
  const lazy=async()=>{await clearEn();await place(0,0,2.5);await dev("__btn('right','trigger',1)");await wait(500);ms=await mark();await dev(`__anim(u=>{const a=u*1.5*2*Math.PI*1.5;__pos('right',.25+Math.sin(a)*.2,1.8,-.4-Math.cos(a)*.2);if(u>=.95)__btn('right','trigger',0)},1500)`);await wait(1500);return since(ms)};
  e=await lazy();check(M,'lazy overhead spin + release (1.5 rev/s, 20 cm)','lasso flies and catches the unicorn; no yank yet',e.includes('lasso')&&e.includes('caught')&&!e.includes('yank'),e.slice(-6).join(','));
  ms=await mark();await dev(`__anim(u=>__pos('right',.25,1.2,-.4+.7*u),150)`);await wait(400);e=await since(ms);check(M,'yank (pull the controller back fast)','yank, unicorn killed',e.includes('yank')&&e.includes('kill'),e.slice(-5).join(','));await home();
  e=await lazy();ms=await mark();await dev("__btn('right','trigger',1)");await wait(300);await dev("__btn('right','trigger',0)");await wait(300);e=await since(ms);check(M,'trigger pull while a unicorn is caught','yank, unicorn killed',e.includes('yank')&&e.includes('kill'),e.slice(-5).join(','));await home();
  // block
  await clearEn();await place(0,0,1.3,0);ms=await mark();await dev("__btn('left','trigger',1);__btn('right','trigger',1)");await wait(1400);await dev("__btn('left','trigger',0);__btn('right','trigger',0)");e=await since(ms);check(M,'block (arch held while a unicorn rears)','block event, no colour lost',e.includes('block')&&!e.includes('gore'),e.slice(-6).join(','));
  // nova by clap
  await clearEn();for(let i=0;i<3;i++)await place(0,i-1,3);await page.evaluate(()=>SF.charge());await dev("__pos('left',-.3,1.2,-.4);__pos('right',.3,1.2,-.4);__btn('left','trigger',1);__btn('right','trigger',1)");await wait(300);
  ms=await mark();await dev(`__anim(u=>{const d=.6-.58*u;__pos('left',-d/2,1.2,-.4);__pos('right',d/2,1.2,-.4)},140)`);await wait(800);e=await since(ms);check(M,'clap (charged arch, hands together fast)','nova, three kills',e.includes('nova')&&e.filter(k=>k=='kill').length>=3,e.slice(-8).join(','));
  await dev("__btn('left','trigger',0);__btn('right','trigger',0)");await home();
  // whip
  await clearEn();await place(0,0,1.2);ms=await mark();await dev(`__anim(u=>{__pos('right',.25,1.2+.3*Math.sin(u*Math.PI),-.4-1.1*Math.sin(u*Math.PI))},220)`);await wait(500);e=await since(ms);check(M,'whip (fast flick of one controller, no triggers)','crack event',e.includes('crack'),e.slice(-6).join(','));await home();
  // sigils with both grips
  const drawVR=async(fn,dur)=>{await dev("__btn('left','squeeze',1);__btn('right','squeeze',1)");await wait(120);await dev('__anim(u=>{const[l,r]=('+fn+')(u);__pos("left",...l);__pos("right",...r)},'+dur+')');await wait(100);await dev("__btn('left','squeeze',0);__btn('right','squeeze',0)");await wait(400)};
  await clearEn();await place(0,0,4);ms=await mark();await drawVR("u=>{const a=u*6.6;return[[-.1+Math.sin(a)*.2,1.3+Math.cos(a)*.2,-.5],[.1+Math.sin(a)*.2,1.3+Math.cos(a)*.2,-.5]]}",900);await wait(3200);e=await since(ms);check(M,'both grips + circle','forge, sigil, boomerang launched ahead and caught, hits',['forge','sigil','throw','catch'].every(k=>e.includes(k))&&e.some(k=>k=='hit'||k=='res'),e.slice(-10).join(','));await home();
  await clearEn();await place(0,0,3);ms=await mark();await drawVR("u=>{const x=.15-.5*u;return[[x,1.3,-.5],[-x,1.3,-.5]]}",700);await wait(1800);e=await since(ms);check(M,'both grips + cross','sigil, lasso cast, caught',['sigil','lasso','caught'].every(k=>e.includes(k)),e.slice(-8).join(','));await wait(4000);await home();
  await clearEn();for(let i=0;i<3;i++)await place(0,i-1,3);await page.evaluate(()=>SF.charge());ms=await mark();await drawVR("u=>{const y=1.3+(u<.5?u*2:2-u*2)*.5;return[[-.1,y,-.5],[.1,y,-.5]]}",700);await wait(1200);e=await since(ms);check(M,'both grips + raise and slam (charged)','sigil, Nova',e.includes('sigil')&&e.includes('nova'),e.slice(-8).join(','));await home();
  ms=await mark();await drawVR("u=>[[-.25,1.2,-.4],[.25,1.2,-.4]]",500);e=await since(ms);check(M,'both grips, no drawing','forge then unforge, nothing fires',e.includes('forge')&&e.includes('unforge')&&!e.includes('sigil'),e.slice(-4).join(','));await settle();
  // hand tracking
  await dev("__dev.primaryInputMode='hand';__dev.hands.left.position.set(-.25,1.2,-.4);__dev.hands.right.position.set(.25,1.2,-.4)");await wait(800);
  await dev('__dev.hands.right.updatePinchValue(1)');await wait(500);s=await S();check(M,'hand tracking: right pinch','right trigger → lasso mode',s.Rt==1&&s.md==2,`mode=${s.md}`);
  await dev('__dev.hands.left.updatePinchValue(1)');await wait(300);s=await S();check(M,'hand tracking: both pinches','arch',s.md==1,`mode=${s.md}`);
  await dev("__dev.hands.left.updatePinchValue(0);__dev.hands.right.updatePinchValue(0);__dev.primaryInputMode='controller'");await wait(800);await home();
  {const a=(await S()).R;await dev('__pos("right",.25,1.5,-.4)');await wait(200);const b=(await S()).R;check(M,'controllers back after hand tracking','the right controller drives the right hand again',Math.abs(b[1]-a[1]-.3)<.05,`ΔR.y=${(b[1]-a[1]).toFixed(2)}`);const st=await S();check(M,'no stuck triggers after the switch','both pinches were held at the switch; the controllers start released (L.t=R.t=0)',st.Lt==0&&st.Rt==0,`Lt=${st.Lt} Rt=${st.Rt}`);await home()}
  // keyboard assist inside VR
  const rz=(await S()).R;await page.keyboard.down('KeyW');await wait(220);await page.keyboard.up('KeyW');await wait(60);let r2=(await S()).R;const dz=Math.hypot(r2[0]-rz[0],r2[2]-rz[2]);check(M,'W inside VR','nudges both hands forward (emulator assist)',dz>.3,`Δ=${dz.toFixed(2)} m`);await page.keyboard.down('KeyS');await wait(220);await page.keyboard.up('KeyS');await wait(100);
  await page.keyboard.down('KeyB');await wait(300);check(M,'B inside VR','arch',(await S()).md==1);await page.keyboard.up('KeyB');await settle();
  await clearEn();await place(0,0,4);ms=await mark();await page.keyboard.press('Space');await wait(3800);e=await since(ms);check(M,'Space inside VR','circle sigil around the headset: throw, catch',['sigil','throw','catch'].every(k=>e.includes(k)),e.slice(-8).join(','));await settle();
  await clearEn();await place(0,0,3);ms=await mark();await page.keyboard.press('KeyG');await wait(2600);e=await since(ms);check(M,'G inside VR','cross sigil: lasso, caught',['sigil','lasso','caught'].every(k=>e.includes(k)),e.slice(-6).join(','));await wait(4500);await settle();
  await clearEn();for(let i=0;i<3;i++)await place(0,i-1,3);await page.evaluate(()=>SF.charge());ms=await mark();await page.keyboard.press('KeyN');await wait(1500);e=await since(ms);check(M,'N inside VR','slam sigil: nova',e.includes('nova'),e.slice(-6).join(','));
  await page.keyboard.press('KeyM');await wait(100);check(M,'M inside VR','mute toggles',(await S()).mute==1);await page.keyboard.press('KeyM');
  await page.evaluate(()=>{SF.sim._light=2});await page.keyboard.press('KeyR');await page.waitForFunction(()=>SF.sim._wave==1,null,{timeout:8000}).catch(()=>{});s=await S();check(M,'R inside VR','restart at wave 1 with 7 colours',s.wave==1&&s.light==7,`wave=${s.wave} light=${s.light}`);
  // the hint panel, game over and dawn, each ended by a trigger pull
  s=await S();check(M,'hint panel in the headset','wave 1 lesson visible (both triggers)',s.text.includes('Both triggers'),s.text.replace('\n',' | '));
  await page.evaluate(()=>{SF.sim._light=1;SF.sim._inv=0});await place(0,0,1.3,0); /* no clearEn first: an empty herd between two frames would end the wave, and gores are ignored between waves */await page.waitForFunction(()=>SF.sim._ws==3,null,{timeout:6000}).catch(()=>{});s=await S();check(M,'game over in VR','last colour gored → over, text shown',s.ws==3&&s.light==0&&s.text.includes('colour is gone'),`ws=${s.ws} light=${s.light}`);
  await dev("__btn('right','trigger',1)");await wait(120);await dev("__btn('right','trigger',0)");await wait(300);s=await S();check(M,'trigger during the 3 s lock','ignored (no accidental restart)',s.ws==3,`ws=${s.ws}`);
  await wait(3000);await dev("__btn('right','trigger',1)");await wait(120);await dev("__btn('right','trigger',0)");await page.waitForFunction(()=>SF.sim._wave==1&&SF.sim._ws==1,null,{timeout:6000}).catch(()=>{});s=await S();check(M,'trigger after game over','restart at wave 1 with 7 colours',s.wave==1&&s.light==7&&s.ws==1,`wave=${s.wave} light=${s.light} ws=${s.ws}`);await clearEn();
  await page.evaluate(()=>SF.dawn());await wait(1500);s=await S();check(M,'dawn in VR','Dawn text while the fog lifts, no errors',s.text.includes('Dawn')&&errors.length==0,s.text.replace('\n',' | '));
  await dev("__btn('left','trigger',1)");await wait(120);await dev("__btn('left','trigger',0)");await page.waitForFunction(()=>SF.sim._wave==1&&SF.sim._ws==1,null,{timeout:6000}).catch(()=>{});s=await S();check(M,'trigger after dawn','new game at wave 1 with 7 colours',s.wave==1&&s.ws==1&&s.light==7,`wave=${s.wave} ws=${s.ws}`);await clearEn();await home();
  await dev('__dev.activeSession.end()');await wait(1200);check(M,'session end','desktop mode again, ENTER VR offered',(await S()).xr==0&&(await page.textContent('#b'))=='ENTER VR');
  await page.click('#b');await wait(1500);check(M,'re-enter VR','second session starts',(await S()).xr==1);await dev('__dev.activeSession.end()');await wait(800);
  check(M,'console','zero errors',errors.length==0,errors.slice(0,3).join(' | '));await page.close()}

console.log('\nmode     | control                                           | expected                                              | result');
for(const[m,c,x,r,d]of rows)console.log(`${m.padEnd(8)} | ${c.slice(0,49).padEnd(49)} | ${x.slice(0,53).padEnd(53)} | ${r}${d&&r=='FAIL'?' — '+d.slice(0,120):''}`);
console.log(`\n${rows.length-fails}/${rows.length} checks passed`);
await browser.close();srv.kill();process.exit(fails?1:0);
