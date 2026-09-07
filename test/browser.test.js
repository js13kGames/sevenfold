// browser.test.js — Playwright (chromium + firefox) against the UNZIPPED dist/sevenfold.zip (docs/07 B) and the test
// build dist/test.html (the same sources with the //@test hook lines kept: window.SF, hashState).
//   zip tests   : the shipped file exactly as judges get it — boot, play with the keys, offline, XR enter/exit. No hooks.
//   test tests  : bot replay, budget, verbs, hints, game over, mute, XR events — need window.SF.
// Run: node test/browser.test.js [chromium|firefox] [--xr]      (build both first: npm run build)
import {chromium,firefox} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const THREE='https://play.js13kgames.com/2026/webxr/three.js',PORT=8090;
const only=process.argv.slice(2).filter(a=>!a.startsWith('--'))[0];
const browsers=only?[only]:['chromium','firefox'];
const results=[];let fails=0;

// ---- unzip dist/sevenfold.zip (single entry, raw deflate) into a temp dir and serve it, next to the test build
const zip=readFileSync('dist/sevenfold.zip');
if(zip.readUInt32LE(0)!==0x04034b50)throw new Error('not a zip');
const nameLen=zip.readUInt16LE(26),extraLen=zip.readUInt16LE(28),csize=zip.readUInt32LE(18),method=zip.readUInt16LE(8);
const name=zip.toString('utf8',30,30+nameLen);if(name!=='index.html')throw new Error('zip entry is '+name);
const start=30+nameLen+extraLen,body=zip.subarray(start,start+csize);
const html=method===8?inflateRawSync(body):body;
if(!existsSync('dist/test.html'))throw new Error('missing dist/test.html — run: npm run build (or node build.js --test --level 0)');
const dir=join(tmpdir(),'sevenfold-dist');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'index.html'),html);copyFileSync('dist/test.html',join(dir,'test.html'));
mkdirSync('test-results',{recursive:true});
const srv=spawn(process.execPath,['tools/serve.cjs',String(PORT),dir],{stdio:'ignore',env:{...process.env,NO_REWRITE:'1'}}); // serve the dist byte-for-byte (no dev URL rewrite)
await new Promise(r=>setTimeout(r,500));

// ---- hosted three.js: the host sends no Access-Control-Allow-Origin header, so a cross-origin module import from
// localhost is blocked by CORS in every browser (the entry is same-origin on play.js13kgames.com). Tests therefore
// route that exact URL to the byte-identical local copy (tools/three-hosted-r185.js); the shipped HTML is untouched.
if(!existsSync('tools/three-hosted-r185.js'))throw new Error('missing tools/three-hosted-r185.js — run: node tools/serve.cjs once (it downloads the hosted file)');
console.log('three.js source: local copy of '+THREE+' via page.route (CORS: no ACAO header on the host)');
const replay=JSON.parse(readFileSync('test/replays/w1-2.json','utf8'));
// what each wave must teach (substrings of the hint canvas text)
const HINTS={1:['Both triggers'],2:['colour','Red is your left'],3:['block'],4:['lasso','Tug'],5:['THE HERALD','charge'],6:['Nova','Clap'],7:['grips'],8:['slam','Nova'],9:['whip'],10:['THE SOVEREIGN','colour']};

async function runBrowser(bn){
  const browser=await(bn=='firefox'?firefox:chromium).launch({args:bn=='firefox'?[]:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx=await browser.newContext({viewport:{width:960,height:600}});
  const errors=[];let pass=0;const log=[];
  const attach=p=>{p.on('console',m=>{if(m.type()=='error')errors.push(m.text())});p.on('pageerror',e=>errors.push('PAGEERROR '+e.message));p.route(THREE,r=>r.fulfill({path:'tools/three-hosted-r185.js',contentType:'text/javascript'}))};
  const test=async(name,fn)=>{const e0=errors.length;try{await fn();if(errors.length>e0)throw new Error('console errors: '+errors.slice(e0).join(' | ').slice(0,400));pass++;log.push([name,'ok']);console.log(`  [${bn}] ok   ${name}`)}catch(e){fails++;log.push([name,'FAIL']);console.log(`  [${bn}] FAIL ${name}\n         ${String(e.message).slice(0,600)}`)}};
  const shotOf=(p,n)=>p.screenshot({path:`test-results/${bn}-${n}.png`});
  let webgl=true;

  // =============================== the shipped zip (no hooks) ===============================
  const zp=await ctx.newPage();attach(zp);
  await test('zip boot: title canvas, PLAY ON DESKTOP, no test hooks, zero errors',async()=>{
    await zp.goto(`http://localhost:${PORT}/`);await zp.waitForFunction(()=>document.querySelector('canvas')||document.getElementById('u').textContent,{timeout:20000});
    if(!(await zp.evaluate(()=>!!document.querySelector('canvas')))){webgl=false;throw new Error('no renderer: '+await zp.textContent('#u'))}
    await zp.waitForFunction(()=>document.getElementById('b').textContent,null,{timeout:5000}).catch(()=>{});const b=await zp.textContent('#b');if(b!='PLAY ON DESKTOP')throw new Error('button: '+b);
    if(await zp.evaluate(()=>'SF'in window))throw new Error('window.SF present in the shipped build');
    await zp.waitForTimeout(800);await shotOf(zp,'zip-boot')});
  if(!webgl){console.log(`  [${bn}] WebGL unavailable in headless; remaining tests skipped`);results.push({browser:bn,pass,total:1,log,errors:errors.length});await browser.close();return}
  await test('zip play: trigger starts, 8 s with B / Space / G / N / WASD and mouse look, zero errors',async()=>{
    await zp.click('#b');await zp.waitForTimeout(500);await zp.mouse.click(480,300);await zp.mouse.down();await zp.waitForTimeout(80);await zp.mouse.up();await zp.waitForTimeout(2000);
    if(!await zp.evaluate(()=>document.getElementById('b').hidden))throw new Error('button still shown after PLAY');
    for(const k of['Space','KeyW','KeyG','KeyB','KeyA','KeyN','KeyS','KeyD']){await zp.keyboard.down(k);await zp.waitForTimeout(350);await zp.keyboard.up(k);await zp.mouse.move(480+Math.random()*80,300,{steps:3});await zp.waitForTimeout(450)}
    await zp.mouse.down({button:'right'});await zp.waitForTimeout(500);await zp.mouse.up({button:'right'});await zp.waitForTimeout(1500);await shotOf(zp,'zip-play');
    await zp.setViewportSize({width:700,height:900});await zp.waitForTimeout(200);await zp.setViewportSize({width:960,height:600});await zp.waitForTimeout(300);
    await zp.keyboard.press('KeyM');await zp.keyboard.press('KeyR');await zp.waitForTimeout(800);await zp.keyboard.press('KeyM')});
  await test('zip offline: three.js unreachable → friendly message, no console errors',async()=>{
    const p2=await ctx.newPage();const e2=[];p2.on('pageerror',e=>e2.push(e.message));p2.on('console',m=>{if(m.type()=='error'&&!/net::|Failed to load|NetworkError|CORS|Loading failed|blocked|MIME/i.test(m.text()))e2.push(m.text())});
    await p2.route(THREE,r=>r.abort());await p2.goto(`http://localhost:${PORT}/`);await p2.waitForFunction(()=>document.getElementById('u').textContent.length>10,{timeout:15000});
    const t=await p2.textContent('#u');if(!/Three\.js/.test(t))throw new Error('message: '+t);if(e2.length)throw new Error('errors: '+e2.join('|'));await p2.screenshot({path:`test-results/${bn}-offline.png`});await p2.close()});
  if(bn=='chromium'&&existsSync('test/xr-shim.js')&&process.argv.includes('--xr')){
    await test('zip XR shim: ENTER VR, 300 frames, select, swing, exit → button back, zero errors',async()=>{
      const p3=await ctx.newPage();attach(p3);await p3.addInitScript({path:'test/xr-shim.js'});
      await p3.goto(`http://localhost:${PORT}/`);await p3.waitForFunction(()=>document.getElementById('b').textContent=='ENTER VR',null,{timeout:20000});
      await p3.click('#b');await p3.waitForFunction(()=>document.getElementById('b').hidden,null,{timeout:10000});
      await p3.evaluate(()=>__xr.frames(300));await p3.waitForTimeout(300);
      await p3.evaluate(()=>__xr.press('right','select'));await p3.waitForTimeout(100);await p3.evaluate(()=>__xr.release('right','select'));await p3.waitForTimeout(2200);
      await p3.evaluate(async()=>{await __xr.throw()});await p3.waitForTimeout(2500);await p3.screenshot({path:`test-results/${bn}-zip-xr.png`});
      await p3.evaluate(()=>__xr.end());await p3.waitForFunction(()=>!document.getElementById('b').hidden,null,{timeout:5000});await p3.waitForTimeout(500);await p3.close()});
  }
  await zp.close();

  // =============================== the test build (window.SF hooks) ===============================
  const page=await ctx.newPage();attach(page);
  const state=()=>page.evaluate(()=>SF.state());
  const shot=n=>shotOf(page,n);
  const stepFrames=async(from,to)=>{for(let i=from;i<to;i+=450)await page.evaluate(([fr])=>{for(const f of fr){SF.inject({p:f[0],f:f[1],t:f[2],g:f[3]},{p:f[4],f:f[5],t:f[6],g:f[7]},{p:f[8],f:f[9]});SF.step()}},[replay.frames.slice(i,Math.min(to,i+450))])};
  let maxCalls=0,maxTris=0;

  await test('test build boots: hooks present, title text',async()=>{
    await page.goto(`http://localhost:${PORT}/test.html`);await page.waitForFunction(()=>window.SF,{timeout:20000});
    const s=await state();if(!s.text.includes('SEVENFOLD')||!s.text.includes('Pull a trigger'))throw new Error('title text: '+s.text)});

  await test('desktop play: replay of the perfect bot reaches wave 3, budget within limits',async()=>{
    await page.click('#b');await page.waitForTimeout(500);
    await page.evaluate(s=>{SF.manual=1;SF.newGame(s)},replay.seed);
    const n=replay.frames.length;for(let i=0;i<n;i+=900){await stepFrames(i,Math.min(n,i+900));await page.waitForTimeout(50);const s=await state();maxCalls=Math.max(maxCalls,s.calls);maxTris=Math.max(maxTris,s.tris);if(i==1800)await shot('wave1');if(s.wave>=3)break}
    const s=await state();if(s.wave<3)throw new Error('reached wave '+s.wave+' ws '+s.ws+' light '+s.light);await shot('wave3');
    console.log(`         waves 1-2 replayed: wave ${s.wave}, light ${s.light}, max draw calls ${maxCalls}, max tris ${maxTris}`)});
  await test('render budget: draw calls ≤ 60, triangles < 80k',async()=>{if(!(maxCalls>0&&maxCalls<=60&&maxTris<80000))throw new Error(`calls ${maxCalls} tris ${maxTris}`)});

  await test('hints: every wave shows its lesson (arch, colours, block, lasso, Herald, Nova, sigils, slam, whip, Sovereign); Nova ready',async()=>{
    await page.evaluate(()=>{SF.manual=1;SF.newGame(5)});const bad=[];
    for(let w=1;w<=10;w++){await page.evaluate(w=>SF.wave(w),w);await page.waitForTimeout(120);const t=(await state()).text;
      for(const k of HINTS[w])if(!t.includes(k))bad.push(`wave ${w}: "${t.replace('\n',' | ')}" lacks "${k}"`);if(w==7)await shot('hint-sigils')}
    await page.evaluate(()=>SF.ev('ready'));await page.waitForTimeout(120);const t=(await state()).text;if(!t.includes('Nova ready')||!t.includes('Clap'))bad.push('ready: '+t);
    if(bad.length)throw new Error(bad.join('; '))});

  await test('desktop keys: Space draws a circle sigil (forge, sigil, throw, catch), B holds the arch, G draws a cross (lasso), N slams (Nova when charged)',async()=>{
    await page.evaluate(()=>{SF.manual=0;SF.newGame(11)});await page.waitForTimeout(400);
    await page.mouse.click(480,300);await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();await page.waitForTimeout(2200); // trigger → start, wave 1 begins
    await page.keyboard.press('Space');await page.waitForTimeout(3600);let ev=(await state()).events;
    for(const k of['forge','sigil','throw','turn','catch'])if(!ev.includes(k))throw new Error('missing '+k+' in '+ev.slice(-30));
    await page.keyboard.down('KeyB');await page.waitForTimeout(400);const m=(await state()).mode;await shot('arch');await page.keyboard.up('KeyB');if(m!=1)throw new Error('mode with B held: '+m);await page.waitForTimeout(300);
    await page.keyboard.press('KeyG');await page.waitForTimeout(2600);ev=(await state()).events;
    for(const k of['sigil','lasso'])if(!ev.includes(k))throw new Error('missing '+k+' in '+ev.slice(-30));await shot('lasso');await page.waitForTimeout(3000);
    await page.evaluate(()=>SF.charge());await page.waitForTimeout(300);await page.keyboard.press('KeyN');await page.waitForTimeout(1500);ev=(await state()).events;
    if(!ev.includes('nova'))throw new Error('missing nova in '+ev.slice(-30));await shot('nova')});

  await test('game over: idle until the last colour is gone, text shown; R restarts at wave 1',async()=>{
    await page.evaluate(()=>{SF.manual=1;SF.newGame(3);SF.inject({t:1},null,null);SF.step();SF.inject({t:0},null,null)});
    let s;for(let i=0;i<60&&!(s=await state()).text.includes('colour is gone');i++)await page.evaluate(()=>SF.step(90));
    if(!s.text.includes('The last colour is gone')||s.ws!=3)throw new Error(`ws ${s.ws} light ${s.light} text ${s.text}`);await shot('gameover');
    await page.evaluate(()=>{SF.manual=0});await page.keyboard.press('r');await page.waitForFunction(()=>SF.state().wave==1&&SF.state().ws==1,null,{timeout:10000}).catch(()=>{});s=await state();
    if(s.wave!=1||s.ws!=1)throw new Error(`after R: wave ${s.wave} ws ${s.ws}`)});

  await test('dawn: after the Sovereign the fog lifts, Dawn text, trigger restarts',async()=>{
    await page.evaluate(()=>{SF.manual=0;SF.dawn()});await page.waitForTimeout(1600);let s=await state();
    if(!s.text.includes('Dawn'))throw new Error('text: '+s.text);await shot('dawn');
    await page.mouse.down();await page.waitForTimeout(80);await page.mouse.up();await page.waitForFunction(()=>SF.state().ws==2||SF.state().ws==1,null,{timeout:5000}).catch(()=>{});s=await state();
    if(s.ws!=2&&s.ws!=1)throw new Error(`after trigger: ws ${s.ws}`)});

  await test('mute persists across reload; best score saved',async()=>{
    const m0=(await state()).mute;await page.keyboard.press('m');await page.waitForTimeout(100);const m1=(await state()).mute;if(m1==m0)throw new Error('mute did not toggle');
    const best=await page.evaluate(()=>localStorage.getItem('sevenfold_best'));if(best===null)throw new Error('best score not saved: '+best);
    await page.reload();await page.waitForFunction(()=>window.SF,{timeout:20000});if((await state()).mute!=m1)throw new Error('mute not persisted');await page.keyboard.press('m')});

  if(bn=='chromium'&&existsSync('test/xr-shim.js')&&process.argv.includes('--xr')){
    await test('XR shim (test build): enter immersive-vr, 300 frames, both selects + swing → boomerang thrown and caught, exit',async()=>{
      const p3=await ctx.newPage();attach(p3);await p3.addInitScript({path:'test/xr-shim.js'});
      await p3.goto(`http://localhost:${PORT}/test.html`);await p3.waitForFunction(()=>window.SF,{timeout:20000});
      const b=await p3.textContent('#b');if(b!='ENTER VR')throw new Error('button: '+b);
      await p3.click('#b');await p3.waitForFunction(()=>SF.state().xr,{timeout:10000});
      await p3.evaluate(()=>__xr.frames(300));await p3.waitForTimeout(300);
      await p3.evaluate(()=>__xr.press('right','select'));await p3.waitForTimeout(100);await p3.evaluate(()=>__xr.release('right','select'));await p3.waitForTimeout(2200);
      const r=await p3.evaluate(async()=>{await __xr.throw();return SF.state()});if(!r.events.includes('throw'))throw new Error('no throw after the swing: '+r.events.slice(-20)+' mode '+r.mode);
      await p3.waitForFunction(()=>SF.state().events.includes('catch'),{timeout:6000}).catch(()=>{});const r2=await p3.evaluate(()=>SF.state());if(!r2.events.includes('catch'))throw new Error('boomerang not caught: '+r2.events.slice(-20));
      await p3.screenshot({path:`test-results/${bn}-xr.png`});await p3.evaluate(()=>__xr.end());await p3.waitForFunction(()=>!SF.state().xr,{timeout:5000});
      await p3.waitForTimeout(500);const s=await p3.evaluate(()=>SF.state());if(s.xr)throw new Error('still in XR');await p3.close()});
  }
  results.push({browser:bn,pass,total:log.length,log,errors:errors.length});
  if(errors.length)console.log(`  [${bn}] console errors seen: `+errors.slice(0,5).join(' | ').slice(0,500));
  await browser.close();
}
for(const bn of browsers){try{await runBrowser(bn)}catch(e){fails++;console.log(`  [${bn}] launch/run failed: ${e.message.split('\n')[0]}`);results.push({browser:bn,pass:0,total:0,log:[['launch','FAIL']],errors:0})}}
srv.kill();
console.log('\nbrowser × test');
const names=[...new Set(results.flatMap(r=>r.log.map(l=>l[0])))];
console.log('test'.padEnd(64)+results.map(r=>r.browser.padEnd(10)).join(''));
for(const n of names)console.log(n.slice(0,62).padEnd(64)+results.map(r=>((r.log.find(l=>l[0]==n)||[0,'-'])[1]).padEnd(10)).join(''));
console.log(results.map(r=>`${r.browser}: ${r.pass}/${r.total}`).join('  '));
process.exit(fails?1:0);
