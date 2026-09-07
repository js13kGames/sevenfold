// sim.test.js — Node, no deps. Run: node test/sim.test.js [--quick]
// A1 rope stability · A2 raw forms (whip, arch strike, block, boomerang, lasso, nova) · A3 resonance & colours-as-lives
// A4 waves & bosses via bots (idle / perfect / no-block) · A5 determinism.
import {createSim,DT,N,hd} from '../src/sim.js';
import {runBot,makeBot} from '../test/bot.js';
import {dist,len,sub} from '../src/vec.js';
import {writeFileSync} from 'node:fs';

let pass=0,fail=0;const quick=process.argv.includes('--quick');
const t=(name,f)=>{try{const r=f();if(r===false)throw new Error('returned false');pass++;console.log('ok   '+name)}catch(e){fail++;console.log('FAIL '+name+'\n     '+(e.stack||e).toString().split('\n').slice(0,3).join('\n     '))}};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'')+' expected '+b+' got '+a)};
const ok=(c,m)=>{if(!c)throw new Error(m||'assertion')};
const H={p:[0,1.6,0],f:[0,0,1]};
// fresh sim at wave 1 with the spawn queue emptied (enemies only from _spawn)
const fresh=(seed=1)=>{const S=createSim(seed);const inj=(L,R,lt=0,rt=0,step=1,g=0)=>{S.inject({p:L,f:[0,0,1],t:lt,g},{p:R,f:[0,0,1],t:rt,g},H);S.step(step)};
  const L0=[-.25,1.2,.45],R0=[.25,1.2,.45];inj(L0,R0,1,0);inj(L0,R0,0,0);inj(L0,R0,0,0,150);S._q=[];S._en=[];S.drain();
  const ks=()=>S.drain().map(e=>e.k).filter(k=>k!='bolt'&&k!='spawn');return{S,inj,L0,R0,ks}};
const rest=(S,inj,L0,R0,n)=>{for(let i=0;i<n;i++)inj(L0,R0)};

// ---------- A1 rope stability ----------
t('A1 rope: violent hands (6 m/s walks, teleports, crossing) at 72/90/120 Hz input → no NaN, bounded stretch and speed',()=>{
  for(const hz of[72,90,120]){const S=createSim(3);let L=[-.3,1.2,.3],R=[.3,1.2,.3],r=1;const rnd=()=>(r=r*16807%2147483647)/2147483647;
    let acc=0,steps=0;for(let f=0;f<hz*30;f++){acc+=1/hz;
      if(f%(hz*3)==0){L=[rnd()*2-1,.2+rnd()*1.8,rnd()*2-1];R=[rnd()*2-1,.2+rnd()*1.8,rnd()*2-1]} // teleport
      else{const s=6/hz;L=[L[0]+(rnd()-.5)*s*2,Math.max(.05,L[1]+(rnd()-.5)*s*2),L[2]+(rnd()-.5)*s*2];R=[R[0]+(rnd()-.5)*s*2,Math.max(.05,R[1]+(rnd()-.5)*s*2),R[2]+(rnd()-.5)*s*2]}
      const lt=f%97<40?1:0,rt=f%53<30?1:0;
      while(acc>=DT){S.inject({p:L,f:[0,0,1],t:lt,g:0},{p:R,f:[0,0,1],t:rt,g:0},H);S.step();acc-=DT;steps++;
        for(let i=0;i<=N;i++){const p=S._rp[i];ok(isFinite(p[0]+p[1]+p[2]),'NaN at '+hz);ok(len(S._rv[i])<400,'rope speed '+len(S._rv[i]))}
        if(S._md==0||S._md==2)for(let i=0;i<N;i++)ok(dist(S._rp[i],S._rp[i+1])<.9/N*8+(S._md==2?2:0),'segment stretch '+dist(S._rp[i],S._rp[i+1]))}
      S.drain()}
    ok(steps>hz*25*90/hz,'stepped')}});

// ---------- A2 raw forms ----------
t('A2 whip: slack rope, fast flick → crack event with band at the tip, hit on an enemy in reach, cooldown',()=>{
  const{S,inj,ks}=fresh();const e=S._spawn(0,0,1.2);e._st=3;e._sd=99;
  for(let i=0;i<30;i++)inj([-.2,1,-.2],[.2,1,-.2]);ks();
  for(let i=0;i<120;i++){const tt=i*DT;let z,y;if(tt<.25){const u=tt/.25;z=-.2+.9*u;y=1+.6*Math.sin(u*Math.PI)}else{z=.7;y=1}inj([-.2,y,z],[.2,y,z])}
  const ev=S.drain();const cr=ev.filter(x=>x.k=='crack');ok(cr.length>=1&&cr.length<=3,'cracks '+cr.length);ok(ev.some(x=>x.k=='hit'||x.k=='res'),'hit');ok(e._hp<3,'damaged');
  ok(cr[0].b>=0&&cr[0].b<=6,'band')});
t('A2 arch: both triggers → arc event, rope rigid (bulged), a fast lateral swing through an enemy → hit, no hit when slow',()=>{
  const{S,inj,L0,R0,ks}=fresh();const e=S._spawn(0,0,1);e._st=3;e._sd=99;
  for(let i=0;i<10;i++)inj(L0,R0,1,1);ok(ks().includes('arc'),'arc event');eq(S._md,1,'mode');
  ok(S._rp[N>>1][1]>1.3,'arch bulges up: '+S._rp[N>>1][1]);
  let x=.5;for(let i=0;i<20;i++){x-=5*DT;inj([x-.3,.8,.55],[x+.3,.8,.55],1,1)}ok(ks().some(k=>k=='hit'||k=='res'),'fast swing hits');
  const hp=e._hp;x=.5;for(let i=0;i<100;i++){x-=1*DT;inj([x-.3,.8,.55],[x+.3,.8,.55],1,1)}eq(e._hp,hp,'slow swing no damage')});
t('A2 block: a rearing unicorn is stopped by the arch (block, stagger, no colour lost); without the arch it gores (−1 colour)',()=>{
  const{S,inj,ks}=fresh();const e=S._spawn(0,0,1.3);
  for(let i=0;i<120;i++)inj([-.25,1.1,.5],[.25,1.1,.5],1,1);const k=ks();ok(k.includes('rear')&&k.includes('block'),'block: '+k);eq(S._light,7);eq(e._st,3,'staggered');
  for(let i=0;i<400;i++)inj([-.25,1.1,.5],[.25,1.1,.5]);ok(ks().includes('gore'),'gore');eq(S._light,6,'colour lost')});
t('A2 boomerang: arch + swing + release ≥ 2.5 m/s → throw, flies out, turns, hits on the way out and back, returns to the hand (catch), rope restored',()=>{
  const{S,inj,L0,R0,ks}=fresh();const e=S._spawn(0,0,4);e._st=3;e._sd=99;e._b=3;
  for(let i=0;i<30;i++)inj(L0,R0,1,1);ks();let z=.45;for(let i=0;i<18;i++){z+=5*DT;inj([-.25,1.2,z],[.25,1.2,z],1,1)}inj([-.25,1.2,z+5*DT],[.25,1.2,z+5*DT],0,0);
  eq(S._md,3,'in flight');ok(ks().includes('throw'),'throw event');
  let k=[];for(let i=0;i<200&&S._md==3;i++){inj(L0,R0);k.push(...ks())}
  ok(k.includes('turn')&&k.includes('catch'),'turn+catch: '+k);eq(S._md,0,'rope back');ok(k.filter(x=>x=='hit'||x=='res').length>=1,'hit');ok(e._hp<3,'damaged '+e._hp);
  ok(dist(S._rp[0],L0)<.01&&dist(S._rp[N],R0)<.01,'rope between hands')});
t('A2 boomerang: releasing slowly does not throw; one trigger still held → lasso mode after 0.25 s',()=>{
  const{S,inj,L0,R0,ks}=fresh();for(let i=0;i<30;i++)inj(L0,R0,1,1);ks();inj(L0,R0,0,1);eq(S._md,0,'free after slow release');
  for(let i=0;i<30;i++)inj(L0,R0,0,1);eq(S._md,2,'lasso');ok(ks().includes('rope'),'rope event');eq(S._ls.b,0,'right hand lasso is the red end')});
t('A2 lasso: spin the loop, release → loop flies (lasso), catches an enemy (caught), yank away → yank + damage; timeout frees it',()=>{
  const{S,inj,L0,R0,ks}=fresh();const e=S._spawn(0,0,2.5);e._st=3;e._sd=99;
  for(let i=0;i<40;i++)inj(L0,R0,0,1);eq(S._md,2);let tt=0;const spin=(rt)=>{tt+=DT;const a=tt*12;inj(L0,[Math.sin(a)*.35,1.7+Math.cos(a)*.1,Math.cos(a)*.35],0,rt)};
  for(let i=0;i<90;i++)spin(1);ok(S._tip>3,'tip speed '+S._tip);
  let rel=0;for(let i=0;i<120&&!rel;i++){const v=S._rv[N];if(v[2]>3&&Math.abs(v[0])<v[2]*.4){spin(0);rel=1}else spin(1)}
  ok(rel&&S._ls&&S._ls.out,'thrown');ok(ks().includes('lasso'),'lasso event');
  for(let i=0;i<120&&!(S._ls&&S._ls.e);i++)inj(L0,R0);ok(S._ls&&S._ls.e==e,'caught');eq(e._st,4,'enemy caught state');ok(ks().includes('caught'));
  let z=R0[2];for(let i=0;i<20;i++){z-=5*DT;inj(L0,[.25,1.2,z])}const k=ks();ok(k.includes('yank'),'yank: '+k);ok(e._hp<=0||e._hp<3,'yank damage');eq(S._md,0,'rope back')});
t('A2 lasso: a caught enemy is freed after 4 s (stagger), then resumes',()=>{
  const{S,inj,L0,R0,ks}=fresh();const e=S._spawn(2,0,3);e._st=3;e._sd=99; // brute survives the yank
  for(let i=0;i<40;i++)inj(L0,R0,0,1);let tt=0;const spin=(rt)=>{tt+=DT;const a=tt*12;inj(L0,[Math.sin(a)*.35,1.7+Math.cos(a)*.1,Math.cos(a)*.35],0,rt)};
  for(let i=0;i<90;i++)spin(1);let rel=0;for(let i=0;i<120&&!rel;i++){const v=S._rv[N];if(v[2]>3&&Math.abs(v[0])<v[2]*.4){spin(0);rel=1}else spin(1)}
  for(let i=0;i<120&&!(S._ls&&S._ls.e);i++)inj(L0,R0);ok(S._ls&&S._ls.e==e,'caught');
  for(let i=0;i<4.2*90;i++)inj(L0,R0);eq(S._ls,0,'released');ok(e._st!=4,'freed');ks()});
t('A2 lasso at human speeds: a lazy overhead spin (1.5 rev/s, 20 cm) casts and catches; a forward fling reaches 6 m; a gentle lowering does not cast; a caught unicorn dies to a forward tug or a trigger pull',()=>{
  const lerp=(a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u),sm=u=>u*u*(3-2*u);
  const catchWith=(motion,d)=>{const{S,inj,L0,R0,ks}=fresh();const e=S._spawn(0,0,d);e._st=3;e._sd=99;for(let i=0;i<40;i++)inj(L0,R0,0,1);eq(S._md,2);
    const last=motion(inj,L0);let c=0,cast=0;for(let i=0;i<150&&!c;i++){inj(L0,last);const k=ks();if(k.includes('lasso'))cast=1;if(k.includes('caught'))c=1}return{S,inj,L0,e,c,cast,last,ks}};
  const spin=(inj,L0)=>{let p;for(let i=1;i<=180;i++){const a=i*DT*1.5*2*Math.PI;p=[.3+Math.sin(a)*.2,1.8,.3+Math.cos(a)*.2];inj(L0,p,0,1)}inj(L0,p,0,0);return p};
  const fling=(inj,L0)=>{const a=[.35,1.3,-.15],b=[.3,1.4,.6];for(let i=0;i<=27;i++)inj(L0,lerp(a,b,sm(i/27)),0,1);inj(L0,b,0,0);return b};
  ok(catchWith(spin,3).c,'lazy spin casts and catches');
  const F=catchWith(fling,6);ok(F.cast&&F.c,'fling catches at 6 m');
  {const{S,inj,L0,R0,ks}=fresh();for(let i=0;i<40;i++)inj(L0,R0,0,1);const b=[.25,.8,.45];for(let i=0;i<=72;i++)inj(L0,lerp(R0,b,sm(i/72)),0,1);inj(L0,b,0,0);for(let i=0;i<30;i++)inj(L0,b);ok(!ks().includes('lasso'),'no cast from a gentle lowering');eq(S._md,0,'rope back')}
  {const{S,inj,L0,e,last,ks}=catchWith(fling,3);for(let i=0;i<20;i++)inj(L0,last);inj(L0,last,0,1);inj(L0,last,0,1);const k=ks();ok(k.includes('yank')&&e._st==5,'trigger pull yanks: '+k)}
  {const{S,inj,L0,e,last,ks}=catchWith(fling,3);for(let i=0;i<20;i++)inj(L0,last);for(let i=1;i<=13;i++)inj(L0,lerp(last,[last[0],last[1],last[2]+.5],i/13));const k=ks();ok(k.includes('yank')&&e._st==5,'forward tug yanks: '+k)}});
t('A2 nova: needs 3 charge; arch + clap (hands close fast) → nova, every enemy within 6.5 m takes a resonant 18, slow-mo, charge spent; no nova without charge',()=>{
  const{S,inj,L0,R0,ks}=fresh();for(let i=0;i<5;i++)S._spawn(0,i,3);const far=S._spawn(0,0,12);
  const clap=()=>{for(let i=0;i<20;i++)inj(L0,R0,1,1);let d=.5;for(let i=0;i<10;i++){d-=4*DT;inj([-d/2,1.2,.45],[d/2,1.2,.45],1,1)}};
  clap();ok(!ks().includes('nova'),'no charge → no nova');
  for(let i=0;i<20;i++)inj(L0,R0);S._ch=3;clap();const k=ks();ok(k.includes('nova'),'nova');ok(k.filter(x=>x=='kill').length>=5,'five kills');ok(S._en.filter(e=>e._st==5).length>=5,'placed ones dead');ok(far._st!=5,'far one lives');eq(S._ch,0);ok(S._nv>0,'slow-mo');eq(S._md,4);
  for(let i=0;i<90;i++)inj(L0,R0);eq(S._md,0,'rope re-forms after the hands part')});

// ---------- A2b sigils (both grips) ----------
// draw a sigil with both grips held: fn(u) → [L,R] in arena space around the head at (0,1.6,0) facing +z; released at the end
const draw=(inj,fn,steps=60,hold=1)=>{for(let i=0;i<=steps;i++){const u=i/steps,[l,r]=fn(u);inj(l,r,0,0,1,hold&&i<steps?1:0)}};
const circle=u=>{const a=u*6.6;return[[-.1+Math.sin(a)*.2,1.3+Math.cos(a)*.2,.5],[.1+Math.sin(a)*.2,1.3+Math.cos(a)*.2,.5]]};
const crossS=u=>{const x=-.15+.5*u;return[[x,1.3,.5],[-x,1.3,.5]]}; // arena x is mirrored: right hand at -x
const slam=u=>{const y=1.3+(u<.5?u*2:2-u*2)*.5;return[[-.1,y,.5],[.1,y,.5]]};
t('A2b sigil: circle with both grips → forge, sigil 1, the boomerang launches ahead and returns',()=>{
  const{S,inj,L0,R0,ks}=fresh();const e=S._spawn(0,0,4);e._st=3;e._sd=99;draw(inj,circle);const k=S.drain();
  ok(k.some(x=>x.k=='forge'),'forge');const sg=k.find(x=>x.k=='sigil');ok(sg&&sg.d==1,'sigil 1: '+JSON.stringify(k.map(x=>x.k+(x.d?':'+x.d:''))));ok(k.some(x=>x.k=='throw'),'throw');eq(S._md,3,'in flight');
  let ev=[];for(let i=0;i<220&&S._md==3;i++){inj(L0,R0);ev.push(...ks())}ok(ev.includes('catch'),'returned');ok(ev.some(x=>x=='hit'||x=='res'),'hit the unicorn ahead')});
t('A2b sigil: cross (hands crossed, then apart) → sigil 2, the lasso is cast ahead and catches',()=>{
  const{S,inj,L0,R0,ks}=fresh();const e=S._spawn(0,0,3);e._st=3;e._sd=99;draw(inj,crossS,50);const k=S.drain();const sg=k.find(x=>x.k=='sigil');
  ok(sg&&sg.d==2,'sigil 2: '+JSON.stringify(k.map(x=>x.k+(x.d?':'+x.d:''))));ok(k.some(x=>x.k=='lasso'),'lasso cast');eq(S._md,2);
  let c=0;for(let i=0;i<120&&!c;i++){inj(L0,R0);if(ks().includes('caught'))c=1}ok(c,'caught')});
t('A2b sigil: raise and slam → sigil 3 → Nova when charged; without charge nothing fires',()=>{
  const{S,inj,L0,R0,ks}=fresh();for(let i=0;i<3;i++)S._spawn(0,i-1,3);draw(inj,slam,50);let k=S.drain();ok(k.find(x=>x.k=='sigil'&&x.d==3),'sigil 3');ok(!k.some(x=>x.k=='nova'),'no nova without charge');
  for(let i=0;i<60;i++)inj(L0,R0);S._ch=3;draw(inj,slam,50);k=S.drain();ok(k.some(x=>x.k=='nova'),'nova with charge: '+k.map(x=>x.k));ok(k.filter(x=>x.k=='kill').length>=3,'kills')});
t('A2b sigil: negatives (still hands, a short line, a half circle) → unforge; 2.5 s timeout resolves; 0.5 s cooldown; the world runs at 15 % while drawing',()=>{
  const{S,inj,L0,R0,ks}=fresh();const far=S._spawn(0,0,12);far._st=3;far._sd=99; // keeps the wave alive
  draw(inj,u=>[L0,R0],40);let k=S.drain();ok(k.some(x=>x.k=='unforge')&&!k.some(x=>x.k=='sigil'),'still hands');for(let i=0;i<60;i++)inj(L0,R0);
  draw(inj,u=>[[-.1,1.3,.5+.2*u],[.1,1.3,.5+.2*u]],40);k=S.drain();ok(k.some(x=>x.k=='unforge'),'short line');for(let i=0;i<60;i++)inj(L0,R0);
  draw(inj,u=>circle(u*.45),40);k=S.drain();ok(k.some(x=>x.k=='unforge')&&!k.some(x=>x.k=='sigil'),'half circle');for(let i=0;i<60;i++)inj(L0,R0);
  const e=S._spawn(0,0,8);const z0=e._p[2];for(let i=0;i<90;i++)inj(L0,R0,0,0,1,1);ok(S._fg.on,'forging');const moved=z0-e._p[2];ok(moved<.6&&moved>.1,'slow motion while drawing: moved '+moved.toFixed(2)+' m in 1 s (2.4 m/s normally)');
  for(let i=0;i<150;i++)inj(L0,R0,0,0,1,1);ok(!S._fg.on,'timed out at 2.5 s');ok(S.drain().some(x=>x.k=='unforge'));
  for(let i=0;i<10;i++)inj(L0,R0,0,0,1,1);ok(!S._fg.on,'cooldown: no immediate re-forge');for(let i=0;i<50;i++)inj(L0,R0);for(let i=0;i<5;i++)inj(L0,R0,0,0,1,1);ok(S._fg.on,'forge again after the cooldown')});

// ---------- A3 resonance & colours ----------
t('A3 resonance: matching band ×3 (res event, +1 charge → ready at 3); a lost colour cannot resonate; non-matching is a plain hit',()=>{
  const{S,inj,L0,R0,ks}=fresh();const place=b=>{S._en=[];const e=S._spawn(2,0,4);e._st=3;e._sd=99;e._b=b;return e};
  const throwAt=()=>{for(let i=0;i<30;i++)inj(L0,R0,1,1);let z=.45;for(let i=0;i<18;i++){z+=5*DT;inj([-.25,1.2,z],[.25,1.2,z],1,1)}inj([-.25,1.2,z+5*DT],[.25,1.2,z+5*DT],0,0);const bands=[];for(let i=0;i<200&&S._md==3;i++){inj(L0,R0);for(const x of S.drain())if(x.k=='hit'||x.k=='res')bands.push([x.k,x.b])}return bands};
  let e=place(9);const k1=throwAt();ok(k1.length&&k1.every(x=>x[0]=='hit'),'plain hits: '+JSON.stringify(k1));const hp1=8-e._hp;ok(hp1>0&&hp1%2==0,'plain damage '+hp1);
  const hb=k1[0][1];e=place(hb);S._ch=0;const k2=throwAt();ok(k2.some(x=>x[0]=='res'),'resonant: '+JSON.stringify(k2));ok(8-e._hp>=6,'×3 damage: '+(8-e._hp));ok(S._ch>=1,'charge');
  e=place(hb);S._light=hb;const k3=throwAt();ok(k3.length&&k3.every(x=>x[0]=='hit'),'lost colour cannot resonate: '+JSON.stringify(k3))});
t('A3 colours as lives: 7 colours, each gore removes one, 1.2 s invulnerability, 0 → over; boss kill restores 2 (max 7)',()=>{
  const{S,inj,L0,R0,ks}=fresh();eq(S._light,7);
  for(let n=0;n<7;n++){const e=S._spawn(0,0,1.3);for(let i=0;i<220;i++)inj(L0,R0);e._hp=-1e9;S._en=[]}
  ok(S._light<=1,'colours after seven gores: '+S._light);
  while(S._ws==1){const e=S._spawn(0,0,1.3);for(let i=0;i<220;i++)inj(L0,R0);S._en=[]}eq(S._ws,3,'over');ok(ks().includes('over'));
  const{S:T,inj:ij,L0:l,R0:r}=fresh();T._light=3;const b=T._spawn(3,0,5);b._hp=1;T._ch=3;for(let i=0;i<20;i++)ij(l,r,1,1);let d=.5;for(let i=0;i<10;i++){d-=4*DT;ij([-d/2,1.2,.45],[d/2,1.2,.45],1,1)}eq(T._light,5,'boss reward')});

// ---------- A4 waves & bots ----------
t('A4 idle bot loses all seven colours in waves 1–2 within 60 s',()=>{const r=runBot(1,{idle:1,maxT:120});ok(r.over,'over');ok(r.wave<=2&&r.t<60,'wave '+r.wave+' t '+r.t)});
const seeds=quick?[1,2]:[1,2,3,4,5];
for(const s of seeds)t(`A4 perfect bot seed ${s}: clears waves 1–10 (Herald + Sovereign) to Dawn, normal waves 8–90 s, bosses 10–150 s, ≥ 3 colours left`,()=>{
  const r=runBot(s);ok(r.done,`not done: wave ${r.wave} light ${r.light} t ${r.t} hurt ${JSON.stringify(r.hurt)}`);
  for(const[w,sec]of r.waves){if(w==5)ok(sec>=10&&sec<=150,`boss wave ${w} ${sec}s`);else ok(sec>=8&&sec<=90,`wave ${w} ${sec}s`)}
  ok(r.t<=900,'total time');ok(r.light>=3,'light '+r.light+' hurt '+JSON.stringify(r.hurt));
  console.log(`     seed ${s}: ${r.waves.map(w=>w[0]+':'+w[1].toFixed(0)+'s').join(' ')} sovereign ~${(r.t-r.waves.reduce((a,w)=>a+w[1],0)-30).toFixed(0)}s light ${r.light} throws ${r.thrown} blocks ${r.ev.block|0} novas ${r.ev.nova|0}`);
  if(s==1&&!quick){const rec=runBot(1,{rec:1,stopWave:2});writeFileSync('test/replays/w1-2.json',JSON.stringify({seed:1,frames:rec.rec.slice(0,Math.min(rec.rec.length,90*70))}))}});
t('A4 no-block bot (never raises the arch against a gore or charge) does not reach Dawn',()=>{const r=runBot(1,{noBlock:1});ok(!r.done,'reached dawn without blocking');console.log(`     no-block: died at wave ${r.wave} t ${r.t}`)});

// ---------- A5 determinism ----------
t('A5 determinism: same seed + same input stream → identical hashState every 90 steps across two runs; different seed differs',()=>{
  const run=seed=>{const S=createSim(seed),b=makeBot(S,{rec:1,exact:1});const hs=[];for(let i=0;i<90*40;i++){b.step();S.drain();if(i%90==0)hs.push(S.hashState())}return{hs,rec:b.rec}};
  const a=run(1),b2=run(1);eq(a.hs.join(),b2.hs.join(),'run mismatch');
  const S=createSim(1);const hs=[];a.rec.forEach((f,i)=>{S.inject({p:f[0],f:f[1],t:f[2],g:f[3]},{p:f[4],f:f[5],t:f[6],g:f[7]},{p:f[8],f:f[9]});S.step();S.drain();if(i%90==0)hs.push(S.hashState())});eq(hs.join(),a.hs.join(),'replay mismatch');
  const c=run(2);ok(c.hs.join()!=a.hs.join(),'seed 2 identical to seed 1')});

console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
