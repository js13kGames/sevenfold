// audio.js — hand-rolled Web Audio: wind, delayed positional thunder, a choir of horns (every shadow unicorn hums the
// note of its colour from where it stands; the horde is the music), a bass pulse that follows the wave, and event
// sounds pitched on the same seven-note scale. Dawn re-tunes the scale from Phrygian to Lydian.
import {sin,dist,sub,len} from './vec.js';
import {hd} from './sim.js';
let auC,auM,auD,auWind,auWf,auV=new Map,auBeat=0,auLs,auNoise,auRdy=0,auDawn=0;
const SC=[0,1,3,5,7,8,10],SD=[0,2,4,6,7,9,11]; // semitones per band: dark, then dawn
const fq=(b,o=0)=>110*2**(((auDawn?SD:SC)[b%7]+12*o)/12);
const g=(v,to)=>{const x=auC.createGain();x.gain.value=v;x.connect(to||auM);return x};
const osc=(t,f,to)=>{const o=auC.createOscillator();o.type=['sine','sawtooth','triangle','square'][t];o.frequency.value=f;o.connect(to);o.start();return o};
const pos=(x,p,k='position')=>{x[k+'X'].value=p[0];x[k+'Y'].value=p[1];x[k+'Z'].value=p[2]};
const pan=(p,to)=>{const x=auC.createPanner();x.refDistance=1.5;x.rolloffFactor=1.2;pos(x,p);x.connect(to||auM);return x};
// one-shot: type, freq, seconds, gain, glide ratio, optional position
const hit=(t,f,s,v,gl=1,p)=>{const n=auC.currentTime,y=g(v,p&&pan(p)),o=osc(t,f,y);if(gl!=1)o.frequency.exponentialRampToValueAtTime(f*gl,n+s);y.gain.setValueAtTime(v,n);y.gain.exponentialRampToValueAtTime(.001,n+s);o.stop(n+s+.05)};
// noise burst through a sweeping lowpass: seconds, gain, from Hz → to Hz, position, delay
const noise=(s,v,f0,f1,p,d=0)=>{const n=auC.currentTime+d,src=auC.createBufferSource(),fl=auC.createBiquadFilter(),y=g(0,p&&pan(p));src.buffer=auNoise;src.loop=true;fl.frequency.setValueAtTime(f0,n);fl.frequency.exponentialRampToValueAtTime(f1,n+s);
  src.connect(fl);fl.connect(y);y.gain.setValueAtTime(v,n);y.gain.exponentialRampToValueAtTime(.001,n+s);src.start(n);src.stop(n+s+.05)};
// simple event sounds: [type, octave, seconds, gain, glide] → hit at the colour's note; [4, seconds, gain, from Hz, to Hz] → noise
const auE={hit:[[2,2,.09,.16,1]],res:[[4,.25,.1,4000,800]],kill:[[1,1,.5,.14,.25],[4,.35,.18,2500,150]],crack:[[4,.05,.35,6000,900],[3,3,.05,.12,.5]],arc:[[0,3,.12,.08,1.5]],throw:[[4,.5,.25,3000,200]],catch:[[4,.07,.2,1500,300],[0,3,.15,.1,1]],lasso:[[4,.45,.2,2500,300]],caught:[[4,.08,.3,1200,200],[3,2,.2,.1,1.5]],yank:[[4,.3,.4,800,60],[1,0,.4,.2,.4]],block:[[3,4,.05,.15,.6],[4,.1,.25,3000,600]],stagger:[[4,.7,.5,1500,80],[1,-1,.9,.25,.6]],hurt:[[1,0,.9,.35,.45],[4,.5,.5,500,60],[0,2,.8,.15,.5]],rear:[[1,1,.7,.12,1.6]],charge:[[1,-1,1.2,.3,2]],gore:[[4,.3,.4,900,100]],cue:[[0,4,.9,.12,1.06]],forge:[[2,1,.7,.1,2.2]]};
const chord=(b,p,v,s)=>{for(const o of[0,7,12])hit(2,fq(b,2)*2**(o/12),s,v,1,p)};
export function auInit(){if(auC)return;try{
  auC=new AudioContext;auM=auC.createGain();auM.gain.value=.5;auM.connect(auC.destination);
  auD=auC.createDelay();auD.delayTime.value=.27;const fb=g(.32,auD),lp=auC.createBiquadFilter();lp.frequency.value=1800;auD.connect(lp);lp.connect(fb);lp.connect(auC.destination);auM.connect(auD); // feedback echo = the dark space
  auNoise=auC.createBuffer(1,auC.sampleRate*2,auC.sampleRate);const a=auNoise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
  const src=auC.createBufferSource();src.buffer=auNoise;src.loop=true;auWf=auC.createBiquadFilter();auWf.type='bandpass';auWf.Q.value=.7;auWind=g(.06);src.connect(auWf);auWf.connect(auWind);src.start(); // wind
  auLs=auC.listener}catch(e){}}
export function auSync(S,ev,mute){if(!auC)return;auM.gain.value=mute?0:.5;if(auC.state=='suspended')auC.resume();
  const n=auC.currentTime,t=S._t,H=S._H.p,cam=S._H.f;auDawn=S._ws==4;
  // listener follows the head
  if(auLs.positionX){pos(auLs,H);pos(auLs,cam,'forward')}
  auWf.frequency.value=300+200*sin(t*.37);auWind.gain.value=(S._ws==1?.07:.045)+(auDawn?-.03:0);
  // choir of horns: a voice per living unicorn (nearest 10), pitched by colour, brutes an octave down, chargers up
  const live=S._en.filter(e=>e._st!=5).sort((a,b)=>dist(a._p,H)-dist(b._p,H)).slice(0,10);
  for(const[e,v]of auV)if(!live.includes(e)||e._b!=v.b){v.y.gain.setTargetAtTime(0,n,.08);v.o.forEach(o=>o.stop(n+.5));auV.delete(e)}
  for(const e of live){let v=auV.get(e);const p=hd(e);
    if(!v){const pr=pan(p),y=g(0,pr),fl=auC.createBiquadFilter();fl.frequency.value=e._boss?300:700;fl.connect(y);const f=fq(e._b,e._v==2?-1:e._v==1?1:e._boss?-2:0);
      v={b:e._b,y,pr,g:e._boss?.09:.045,o:[osc(1,f,fl),osc(1,f*1.006,fl)]};auV.set(e,v)}
    v.y.gain.setTargetAtTime(v.g*(e._st==4?1.6:1),n,.4);v.o[0].detune.value=e._st==4?sin(t*30)*80:e._rear*40;
    pos(v.pr,p)}
  // bass pulse: root, tempo by wave, faster for bosses
  if(S._ws==1){const bpm=(52+S._wave*7)*(S._en.some(e=>e._boss)?1.5:1);if(t*bpm/60>auBeat){auBeat=Math.floor(t*bpm/60)+1;hit(0,fq(0,-1),.35,.35,.5);if(auBeat%2)noise(.06,.12,900,200)}}
  if(auRdy&&S._ch<3)auRdy=0;
  for(const e of ev){const k=e.k,b=e.b,p=e.p,T=auE[k];
    if(T)for(const c of T)c[0]==4?noise(c[1],c[2],c[3],c[4],p):hit(c[0],fq(b,c[1]),c[2],c[3],c[4],p);
    if(k=='res')chord(b,p,.14,.7);else if(k=='sigil')chord(e.d*2,p,.16,.9);
    else if(k=='ready'){if(!auRdy){auRdy=1;for(let i=0;i<7;i++)setTimeout(()=>hit(0,fq(i,3),.5,.12),i*45)}}
    else if(k=='nova'){for(let i=0;i<7;i++)setTimeout(()=>{chord(i,0,.16,1.6)},i*35);noise(1.4,.6,3000,60);hit(0,55,1.5,.6,.5)}
    else if(k=='charge')for(let i=0;i<8;i++)noise(.04,.25,800,200,p,i*.12/(1+i*.08));
    else if(k=='strike'||k=='bolt'){const d=len(sub(p,H)),v=k=='bolt'?.5:.9;noise(.2,v*.6,7000,2000,p,d/60);noise(2.5,v,900,50,p,d/60+.1);hit(0,45,2,v*.5,.6,p)}
    else if(k=='wave'){hit(0,110,.6,.4,.5);setTimeout(()=>hit(0,82,.7,.4,.5),260);if(e.d==5||e.d==10){hit(1,36,3,.4,1.5);noise(3,.35,300,40)}}
    else if(k=='clear')chord(4,0,.1,.9);
    else if(k=='over'){hit(1,fq(0,-1),4,.4,.5);noise(3,.3,800,40)}
    else if(k=='dawn')for(let i=0;i<7;i++)setTimeout(()=>{hit(0,fq(i,2),6,.14);hit(2,fq(i,1),6,.06)},i*300);
  }
}
