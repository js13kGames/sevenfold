// sim.js — PURE game simulation. No DOM, no Three. Fixed DT, seeded, deterministic.
// Arena space: player at origin, y up. The rainbow rope hangs between the hands; its mode is physical:
//   0 free rope (whip)  1 arch: both triggers, rigid, blocks; let go while swinging → 3 boomerang
//   2 lasso: one trigger held, rope hangs from that hand; release while swinging → loop flies where you look, catches; a tug or a trigger kills
//   3 boomerang in flight (hands empty)  4 nova collapse (arch clapped together with a full charge)
// Sigils: hold both grips (squeeze) — time slows and the rainbow turns white — draw with the hands, let go:
//   circle → the boomerang launches ahead, cross → the lasso is cast ahead, raise-and-slam → Nova (if charged).
import {sin,cos,abs,min,max,hypot,PI,atan2,floor,add,sub,mul,dot,len,dist,norm,lerp,clamp} from './vec.js';

export const DT=1/90,N=28,SEG=.9/N;
// variants: hp, speed, scale, gore damage, rear time. 0 stalker 1 charger 2 brute 3 herald 4 sovereign
const VT=[[3,2.4,1,1,.75],[2,7,.8,1,0],[8,1.3,1.6,2,1],[100,3,2.2,1,1.4],[160,3.5,3.4,2,1.3]];
// waves: [interval, spread(deg), stalkers, chargers, brutes] or [boss variant]
const WAVES=[[3,40,4,0,0],[2.5,70,6,0,0],[2.4,100,5,3,0],[2.2,140,4,3,1],[3],[2,180,8,0,2],[1.8,180,4,6,0],[2.2,180,6,3,3],[1.6,180,10,6,2],[4]];
const bpos=(b,r)=>[sin(b)*r,0,cos(b)*r];
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
export const band=s=>clamp(floor(s*7),0,6);
// enemy head point and body centre (arena space)
export const hd=e=>{const s=e._sc;return add(e._p,[sin(e._yaw)*.75*s,1.35*s,cos(e._yaw)*.75*s])};
const bc=e=>[e._p[0],.8*e._sc,e._p[2]];
const edist=(e,q)=>min(dist(q,bc(e))-.5*e._sc,dist(q,hd(e))-.3*e._sc);

export function createSim(seed){
const S={_seed:seed};
const hand=x=>({p:[x,1.2,.3],f:[0,0,1],v:[0,0,0],t:0,g:0,pt:0,pp:[0,0,0],ht:0,n:0});
const rnd=()=>S._rng();
const ev=(k,p,b,d)=>S._ev.push({k,p:p?[...p]:0,b:b|0,d});
const fwd=()=>S._H.f;
const hx=()=>[S._H.p[0],0,S._H.p[2]];
const mid=()=>lerp(S._L.p,S._R.p,.5);
const resetRope=()=>{S._tip=0;for(let i=0;i<=N;i++){S._rp[i]=lerp(S._L.p,S._R.p,i/N);S._rq[i]=[...S._rp[i]]}};

S._init=()=>{
  S._rng=mulberry(S._seed);S._L=hand(-.3);S._R=hand(.3);S._H={p:[0,1.6,0],f:[0,0,1]};
  S._rp=[];S._rq=[];S._rv=[];for(let i=0;i<=N;i++){S._rp.push([0,0,0]);S._rq.push([0,0,0]);S._rv.push([0,0,0])}resetRope();
  S._md=0;S._bm=0;S._ls=0;S._ch=0;S._crk=0;S._nv=0;S._tip=0;S._tipI=N>>1;S._pkt=0;S._pd=[0,0,1];S._tkt=0;S._tv=[0,0,1];S._fg={on:0,cd:0};
  S._light=7;S._inv=0;S._en=[];S._wave=0;S._ws=0;S._wt=0;S._q=[];S._st=0;S._wtime=0;S._front=0;S._log=[];
  S._t=0;S._score=0;S._ev=[];S._bolt=4;S._dawn=0;
};
S._init();

// ---------- player ----------
const hurt=n=>{if(S._inv>0||S._ws!=1)return;S._light=max(0,S._light-n);S._inv=1.2;ev('hurt',S._H.p,S._light);if(S._light<=0){S._ws=3;S._wt=3;ev('over')}};
// ---------- damage ----------
const damage=(e,n,b,p,f)=>{if(e._st==5)return 0;const res=f||b==e._b&&b<S._light;
  if(res){n*=3;ev('res',p,b);if(!f&&S._ch<3&&++S._ch==3)ev('ready',p)}else ev('hit',p,b);
  e._hp-=n;e._fl=.12;if(e._hp<=0)kill(e);return 1};
const kill=e=>{e._st=5;e._tm=0;e._rear=0;S._score+=e._boss?500:10*(1+e._v);ev('kill',hd(e),e._b,e._v);
  if(e._boss){S._light=min(7,S._light+2);for(const x of S._en)if(x!=e&&x._st!=5)kill(x);if(e._v==4){S._ws=4;S._wt=6;ev('dawn')}}};
const near=(p,r)=>{const o=[];for(const e of S._en)if(e._st!=5){const d=edist(e,p);if(d<r)o.push([e,d])}return o.sort((a,b)=>a[1]-b[1])};
// nearest rope/arch point to an enemy: [index, surface distance]
const nearest=(e,P,B)=>{let bi=0,bd=1e9;for(let i=0;i<=N;i++){const d=edist(e,B?add(B.p,B.o[i]):P[i]);if(d<bd){bd=d;bi=i}}return[bi,bd]};
// is the rigid arch between the player and this enemy?
const blocked=e=>{if(S._md!=1)return 0;const H=hx(),d=norm(sub(H,e._p)),l=dist(H,e._p);return S._rp.some(p=>{const q=sub(p,e._p),a=dot(q,d);return a>0&&a<l-.15&&hypot(q[0]-d[0]*a,q[2]-d[2]*a)<.6&&p[1]>.4&&p[1]<2})};
const stag=(e,s)=>{e._st=3;e._tm=0;e._sd=s;e._rear=0};

// ---------- rope ----------
const arch=()=>{const f=fwd(),o=norm([f[0]*.6,1,f[2]*.6]),L=S._L.p,R=S._R.p,A=[];for(let i=0;i<=N;i++){const s=i/N;A.push(add(lerp(L,R,s),mul(o,sin(s*PI)*.3)))}return A};
const rope=()=>{
  const L=S._L.p,R=S._R.p,P=S._rp,Q=S._rq,md=S._md,prev=P.map(p=>[...p]);
  if(md==1){const A=arch();for(let i=0;i<=N;i++){P[i]=A[i];Q[i]=[...A[i]]}}
  else if(md==3){const B=S._bm;for(let i=0;i<=N;i++){P[i]=add(B.p,B.o[i]);Q[i]=[...P[i]]}}
  else if(md==4){const m=mid();for(let i=0;i<=N;i++){P[i]=[...m];Q[i]=[...m]}}
  else{
    let p0=L,pN=R,pin=1,sl=SEG;
    if(md==2){const ls=S._ls;p0=ls.h.p;if(ls.e){pN=hd(ls.e);sl=max(SEG,dist(p0,pN)/N)}else if(ls.out){pN=ls.p;sl=max(SEG,dist(p0,pN)/N)}else pin=0}
    if(dist(p0,P[0])>.5||pin&&dist(pN,P[N])>.5)for(let i=0;i<=N;i++){P[i]=lerp(p0,pin?pN:p0,i/N);Q[i]=[...P[i]];prev[i]=[...P[i]]}
    for(let ss=0;ss<3;ss++){
      for(let i=1;i<=N-pin;i++){const p=P[i],q=Q[i],v=mul(sub(p,q),.985);Q[i]=[...p];p[0]+=v[0];p[1]+=v[1]-7/9*DT*DT;p[2]+=v[2];if(p[1]<.03)p[1]=.03}
      for(let it=0;it<5;it++){P[0]=[...p0];if(pin)P[N]=[...pN];
        for(let i=0;i<N;i++){const a=P[i],b=P[i+1],dv=sub(b,a),l=len(dv)||1e-6,c=mul(dv,(l-sl)/l*.5);if(i>0){a[0]+=c[0];a[1]+=c[1];a[2]+=c[2]}if(i+1<N||!pin){b[0]-=c[0];b[1]-=c[1];b[2]-=c[2]}}}
    }
    P[0]=[...p0];if(pin)P[N]=[...pN];
  }
  let tip=0,ti=N>>1;const a=md==2?N-3:N/3,b=md==2?N:2*N/3;
  for(let i=0;i<=N;i++){const v=S._rv[i]=mul(sub(P[i],prev[i]),1/DT),s=len(v);if(i>=a&&i<=b&&s>tip){tip=s;ti=i}}
  S._tip=min(tip,60);S._tipI=ti;
};

// ---------- modes: arch / throw / lasso / nova ----------
const cast=(p,v)=>{const ls=S._ls||(S._ls={h:S._R,b:0});S._md=2;ls.out=1;ls.t=0;ls.p=p;ls.v=v;S._tkt=0;ev('lasso',p,ls.b)};
const throwB=(P,d,h)=>{const m=mid();S._md=3;S._bm={p:m,o:P.map(p=>sub(p,m)),d,t:0,hit:new Set,ret:0,h};S._pkt=0;ev('throw',m)};
const endLasso=()=>{S._ls=0;S._md=S._L.t&S._R.t;resetRope()};
const nova=()=>{S._ch=0;S._md=4;S._nv=.6;const m=mid();ev('nova',m);for(const e of S._en)if(e._st!=5&&dist(e._p,hx())<6.5)damage(e,6,e._b,hd(e),1)};
const modes=()=>{
  const L=S._L,R=S._R,md=S._md,both=L.t&&R.t;
  for(const h of[L,R])h.ht=h.t?h.ht+DT:0;
  if(md==3)return;
  if(md==4){if(S._nv<=0&&dist(L.p,R.p)>.3){S._md=0;resetRope()}return}
  if(md==2){const ls=S._ls;ls.t+=DT;
    if(ls.e){const e=ls.e,v=ls.h.v;
      if(e._st!=4){endLasso();return}
      if(len(v)>=3||anyT()){ev('yank',hd(e),ls.b);e._st=3;e._sd=1;e._tm=0;damage(e,e._boss?8:5,ls.b,hd(e));endLasso();return}
      if(ls.t>4||both){stag(e,1);endLasso()}return}
    if(ls.out){ls.v[1]-=8*DT;const n=near(ls.p,3)[0];if(n)ls.v=lerp(ls.v,mul(norm(sub(hd(n[0]),ls.p)),len(ls.v)),.12); // aim assist
      ls.p=add(ls.p,mul(ls.v,DT));if(ls.p[1]<.1)ls.p[1]=.1;if(n&&n[1]<.9&&!(n[0]._boss&&n[0]._st==9)){const e=n[0];e._st=4;e._tm=0;e._rear=0;ls.e=e;ls.t=0;ev('caught',hd(e),e._b);return}
      if(ls.t>1.3||len(ls.p)>14)endLasso();return}
    const hv=ls.h.v;if(max(S._tip,len(hv)*1.5)>=2.5){S._tkt=.5;S._tv=hv}else if(S._tkt>0)S._tkt-=DT; // a throw: the rope tip or the hand moving; remembered 0.5 s
    if(!ls.h.t){if(S._tkt>0)cast([...S._rp[N]],mul(norm(add(mul(fwd(),8),S._tv)),10));else endLasso();return} // flies where you look, bent by the throw
    if(both)endLasso();return}
  if(md==1){const v=lerp(L.v,R.v,.5),sp=len(v);if(sp>=2.5&&sp<20){S._pkt=.5;S._pd=norm(v)}else if(S._pkt>0)S._pkt-=DT; // release grace
    if(!both){if(S._pkt>0)throwB(S._rp,S._pd,L.t?L:R);else S._md=0}
    else{const d=dist(L.p,R.p),cl=dot(sub(R.v,L.v),norm(sub(L.p,R.p)));if(S._ch>=3&&d<.15&&cl>=2)nova()}
    return}
  if(both){S._md=1;ev('arc',mid())}
  else{const h=L.t?L:R.t?R:0;if(h&&h.ht>=.25){S._md=2;S._ls={h,b:h==L?6:0,t:0};ev('rope',h.p,S._ls.b)}}
};
// ---------- sigils (both grips held) ----------
// features accumulate while both grips are held: path length and turning of the midpoint in the head's right/up plane,
// rise then drop of the midpoint, hands ever crossed; resolved on release: 1 circle, 2 cross, 3 raise-and-slam
const forge=()=>{const G=S._fg,L=S._L,R=S._R,both=L.g&&R.g,m=mid();
  if(!G.on){if(G.cd>0)G.cd-=DT;else if(both&&S._md<2&&S._ws>0&&S._ws<3){G.on=1;G.t=G.pa=G.tu=G.ri=G.dr=G.cr=G.pv=G.pm=0;G.y0=G.ym=m[1];ev('forge',m)}return}
  const f=fwd(),rt=norm([-f[2],0,f[0]]),D=sub(R.p,L.p),q=[dot(m,rt),m[1],0];G.t+=DT; // rt: the head's right (forward × up)
  if(G.pm){const v=sub(q,G.pm);G.pa+=len(v);if(G.pv)G.tu+=atan2(v[0]*G.pv[1]-v[1]*G.pv[0],v[0]*G.pv[0]+v[1]*G.pv[1]);G.pv=v}G.pm=q;
  if(dot(D,rt)<-.05)G.cr=1;if(m[1]-G.y0>G.ri){G.ri=m[1]-G.y0;G.ym=m[1]}G.dr=max(G.dr,G.ym-m[1]);
  if(both&&G.t<2.5)return;G.on=0;G.cd=.5;const d1=len(D),k=G.cr&&d1>.5?2:abs(G.tu)>4.5&&G.pa>.6?1:G.ri>.3&&G.dr>.3&&d1<.4?3:0;ev(k?'sigil':'unforge',m,0,k);
  if(k==1)throwB(arch(),norm([f[0],0,f[2]]),R);else if(k==2)cast([...R.p],mul(norm([f[0],.3,f[2]]),11));else if(k==3&&S._ch>=3)nova()};
const boom=()=>{const B=S._bm;if(!B)return;B.t+=DT;
  if(!B.ret){B.p=add(B.p,mul(B.d,11*DT));if(B.t>.75||dist(B.p,S._H.p)>9){B.ret=1;B.hit.clear();ev('turn',B.p)}}
  else{const h=B.h.p,d=sub(h,B.p),l=len(d);if(l<.4){S._md=S._L.t&S._R.t;S._bm=0;ev('catch',h);resetRope();return}B.p=add(B.p,mul(d,min(1,13*DT/l)))}
  for(const e of S._en){if(e._st==5||B.hit.has(e))continue;const[i,d]=nearest(e,0,B);if(d<.15){B.hit.add(e);damage(e,2,band(i/N),add(B.p,B.o[i]))}}
};
const strikes=()=>{const md=S._md,P=S._rp;if(S._crk>0)S._crk-=DT;
  if(md==0&&!S._fg.on&&S._tip>=6&&S._crk<=0){const i=S._tipI,p=P[i];S._crk=.25;ev('crack',p,band(i/N));for(const[e]of near(p,.4))damage(e,1,band(i/N),p)}
  if(md==1&&(len(S._L.v)>=3.5||len(S._R.v)>=3.5))for(const e of S._en){if(e._st==5||e._cd>0)continue;const[i,d]=nearest(e,P);if(d<.1){e._cd=.3;damage(e,2,band(i/N),P[i])}}
};

// ---------- enemies ----------
const spawn=(v,b,r)=>{const T=VT[v],e={_v:v,_p:bpos(b,r),_yaw:0,_hp:T[0],_b:floor(rnd()*7),_st:v>2?7:0,_tm:0,_ph:rnd()*6.28,_gal:0,_rear:0,_sc:T[2],_boss:v>2,_cnt:0};S._en.push(e);ev('spawn',e._p,e._b,v);return e};
const summon=e=>{for(let i=0;i<(e._v==4?3:2);i++)spawn(0,atan2(e._p[0],e._p[2])+(i-1)*.5,dist(e._p,hx())+1)};
const boss=(e,w,dl,dir)=>{const st=e._st,T=VT[e._v],H=hx();
  if(e._v==4)e._b=floor(S._t/2)%7;
  if(st==7){const a=atan2(e._p[0]-H[0],e._p[2]-H[2])+w*.35,r=dl+(7-dl)*min(1,w*.6);e._p=add(H,bpos(a,r));e._yaw=a+PI/2;e._gal=.7;if(dl>8)e._tm=0;
    if(e._tm>(e._v==4?3:4)){e._cnt++;e._tm=0;e._yaw=atan2(dir[0],dir[2]);
      if(e._cnt%3==0){e._st=10;e._cue=[...H];ev('cue',H,e._b,.9)}
      else{e._st=8;ev('charge',hd(e),e._b);if(e._cnt%2==1&&S._en.length<9)summon(e)}}}
  else if(st==8){e._yaw=atan2(dir[0],dir[2]);e._rear=min(1,e._tm*1.5);if(e._tm>=T[4]){e._st=9;e._tm=0;e._rear=0;e._dir=dir;e._hitp=0}}
  else if(st==9){e._p=add(e._p,mul(e._dir,8*w));e._gal=1;
    if(!e._hitp&&dot(sub(H,e._p),e._dir)<.9*e._sc){e._hitp=1;if(blocked(e)){stag(e,3.5);ev('stagger',hd(e),e._b)}else{hurt(T[3]);ev('gore',hd(e),e._b)}}
    if(e._tm>2.2){e._st=7;e._tm=0}}
  else if(st==10){e._rear=min(1,e._tm*2);if(e._tm>=.9){e._st=7;e._tm=0;e._rear=0;if(dist(H,e._cue)<.7)hurt(1);ev('strike',e._cue,e._b)}}
};
const enemies=w=>{const H=hx();
  for(const e of S._en){const T=VT[e._v],st=e._st;e._tm+=w;if(e._cd>0)e._cd-=w;if(e._fl>0)e._fl-=w;
    const d=sub(H,e._p),dl=len(d),dir=norm(d);e._gal=0;
    if(st==5){if(e._tm>.35)e._hp=-1e9;continue}
    if(st==3){if(e._tm>e._sd)e._st=e._boss?7:0;continue}
    if(st==4){e._rear=.3+.2*sin(e._tm*20);continue}
    if(e._boss){boss(e,w,dl,dir);continue}
    if(st==0){e._yaw=atan2(dir[0],dir[2]);const sp=T[1];
      if(e._v==1){if(dl<.8){if(blocked(e)){stag(e,2);ev('block',hd(e),e._b)}else{hurt(1);ev('gore',hd(e),e._b);e._st=6;e._tm=0;e._dir=dir}}
        else{e._p=add(e._p,mul(dir,sp*w));e._gal=1;if(!e._cue&&dl<9){e._cue=1;ev('charge',hd(e),e._b)}}}
      else if(dl<=1.4){e._st=1;e._tm=0;ev('rear',hd(e),e._b)}
      else{e._p=add(e._p,add(mul(dir,sp*w),mul([dir[2],0,-dir[0]],cos(S._t*2.5+e._ph)*.9*w)));e._gal=1}}
    else if(st==1){e._yaw=atan2(dir[0],dir[2]);e._rear=min(1,e._tm/T[4]*1.4);
      if(e._tm>=T[4]){e._rear=0;if(blocked(e)){stag(e,e._v==2?1:1.5);ev('block',hd(e),e._b)}else{hurt(T[3]);ev('gore',hd(e),e._b);e._st=2;e._tm=0}}}
    else if(st==2){e._p=add(e._p,mul(dir,-T[1]*.8*w));e._gal=.6;if(e._tm>1.3)e._st=0}
    else if(st==6){e._p=add(e._p,mul(e._dir,7*w));e._gal=1;if(e._tm>2){e._p=bpos(S._front+S._spread*(rnd()*2-1),14);e._st=0;e._cue=0}}
  }
  S._en=S._en.filter(e=>e._hp>-1e8);
};

// ---------- waves ----------
const beginWave=n=>{S._wave=n;S._ws=1;S._wtime=0;S._front=atan2(S._H.f[0],S._H.f[2]);S._q=[];const d=WAVES[n-1];ev('wave',0,0,n);S._spread=(d[1]||180)*PI/180;
  if(d.length==1){const e=spawn(d[0],S._front,15);ev('boss',e._p,e._b,d[0]);return}
  const c=[d[2],d[3],d[4]];for(let more=1;more;){more=0;for(let v=0;v<3;v++)if(c[v]-->0){S._q.push(v);more=1}}
  S._iv=d[0];S._st=1};
const trigEdge=h=>h.t&&!h.pt;
const anyT=()=>trigEdge(S._L)||trigEdge(S._R);
const waves=w=>{const trig=anyT();
  if(S._ws==0){if(trig){S._ws=2;S._wt=1.5;S._wave=0;ev('start')}return}
  if(S._ws==2){S._wt-=w;if(S._wt<=0)beginWave(S._wave+1);return}
  if(S._ws>=3){S._wt-=w;if(S._ws==4)S._dawn=min(1,S._dawn+w/8);if(S._wt<=0&&trig){S._init();S._ws=2;S._wt=1.5;ev('restart')}return}
  S._wtime+=w;
  if(S._q.length){S._st-=w;if(S._st<=0){S._st=S._iv;const v=S._q.shift();spawn(v,S._front+S._spread*(rnd()*2-1),v==1?14:9+rnd()*3)}}
  else if(!S._en.some(e=>e._st!=5)){
    S._log.push([S._wave,S._wtime]); //@test
    S._score+=100*S._wave;S._ws=2;S._wt=3;ev('clear',0,0,S._wave)}
};

// ---------- public API ----------
const cp=(a,b)=>{for(const k in b)if(b[k]!=null)a[k]=b[k]};
S.inject=(L,R,H)=>{L&&cp(S._L,L);R&&cp(S._R,R);H&&cp(S._H,H)}; // hands {p,f,t,g}, head {p,f}: positions and forward vectors in arena space; arrays are never mutated by the sim
S.step=n=>{for(let i=0;i<(n||1);i++){
  S._t+=DT;if(S._nv>0)S._nv-=DT;const w=S._nv>0||S._fg.on?DT*.15:DT;
  // hand velocity per pose update, not per step: a display frame can cover two sim steps (72 Hz vs 90 Hz)
  for(const h of[S._L,S._R]){h.t=h.t?1:0;h.n++;const p=h.p,q=h.pp;if(p[0]!=q[0]||p[1]!=q[1]||p[2]!=q[2]){const r=mul(sub(p,q),1/(DT*h.n));h.v=len(r)>20?[0,0,0]:lerp(h.v,r,.5);h.pp=[...p];h.n=0}else if(h.n>9)h.v=mul(h.v,.7)} // a teleport (reconnect, macro reset) is not a swing
  if(S._inv>0)S._inv-=w;
  S._bolt-=DT;if(S._bolt<=0){S._bolt=6+rnd()*9;ev('bolt',bpos(rnd()*6.28,32),floor(rnd()*7))}
  rope();forge();modes();strikes();boom();enemies(w);waves(w);
  S._L.pt=S._L.t;S._R.pt=S._R.t;
}};
S.hashState=()=>{let h=2166136261;const f=x=>{h=Math.imul(h^(x*1000|0),16777619)}; //@test
  f(S._light);f(S._ch);f(S._score);f(S._wave);f(S._ws);f(S._md);f(S._t);f(S._tip); //@test
  for(const p of S._rp){f(p[0]);f(p[1]);f(p[2])} //@test
  for(const e of S._en){f(e._p[0]);f(e._p[2]);f(e._hp);f(e._st)} //@test
  return h>>>0}; //@test
S.drain=()=>{const e=S._ev;S._ev=[];return e};
S._spawn=spawn; //@test
return S;
}
