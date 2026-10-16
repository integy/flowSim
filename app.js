import { Fluid } from './solver.js';
import { MEDIA, physicalMetrics, simulationParameters } from './physics.js';

const $=id=>document.getElementById(id);
const defaults={medium:'air',speed:2,length:0.2,shape:'circle',size:0.24,view:'dye',tracers:true};
const STORAGE='flowSim:settings:v1';
let storageAvailable=true, settings={...defaults};
try {
  const saved=JSON.parse(localStorage.getItem(STORAGE));
  if(saved && typeof saved==='object') {
    for(const key of ['medium','shape','view']) {
      const choices=key==='medium'?Object.keys(MEDIA):key==='shape'?['circle','square','diamond','foil','none']:['dye','velocity','vorticity'];
      if(choices.includes(saved[key])) settings[key]=saved[key];
    }
    for(const [key,min,max] of [['speed',0.2,8],['length',0.02,1],['size',0.1,0.38]])
      if(typeof saved[key]==='number'&&Number.isFinite(saved[key]))settings[key]=Math.max(min,Math.min(max,saved[key]));
    if(typeof saved.tracers==='boolean')settings.tracers=saved.tracers;
  }
} catch {storageAvailable=false;}
const canvas=$('flow'),ctx=canvas.getContext('2d',{alpha:false});
const fieldCanvas=document.createElement('canvas'),fieldCtx=fieldCanvas.getContext('2d',{alpha:false});
let fluid, image, paused=matchMedia('(prefers-reduced-motion: reduce)').matches, particles=[],stirs=0,frameCount=0;
const dt=1/60;
function save(){
  try {localStorage.setItem(STORAGE,JSON.stringify(settings));storageAvailable=true;}catch{storageAvailable=false;}
  $('storage-status').textContent=storageAvailable?'Settings saved on this device':'Storage unavailable · settings not saved';
}
function scientific(value){return value.toExponential(2).replace('e-','e−').replace('e+','e+');}
function updateUI(){
  const media=MEDIA[settings.medium],metrics=physicalMetrics(settings.medium,settings.speed,settings.length);
  document.documentElement.style.setProperty('--accent',media.color);
  document.documentElement.style.setProperty('--soft',settings.medium==='water'?'#192c3d':settings.medium==='oil'?'#322b1e':'#182a29');
  $('medium-name').textContent=media.name;$('medium-note').textContent=media.note;
  $('density').textContent=String(media.density);$('viscosity').textContent=scientific(media.viscosity);
  $('reynolds').textContent=Math.round(metrics.reynolds).toLocaleString('en-US');$('kinematic').textContent=scientific(metrics.kinematic);
  for(const key of ['speed','length','size','shape'])$(key).value=settings[key];
  $('speed-value').textContent=`${settings.speed.toFixed(1)} m/s`;
  $('length-value').textContent=`${settings.length.toFixed(2)} m`;
  $('size-value').textContent=`${Math.round(settings.size*100)}% H`;
  $('tracers').checked=settings.tracers;
  document.querySelectorAll('[data-medium]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.medium===settings.medium)));
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===settings.view)));
  $('legend-label').textContent=settings.view==='dye'?'Dye concentration':settings.view==='velocity'?'Speed / normalized inlet':'Vorticity · normalized units';
  $('legend-min').textContent=settings.view==='vorticity'?'−20':'0';
  $('legend-max').textContent=settings.view==='dye'?'1':settings.view==='velocity'?'2+':'+20';
  $('legend-gradient').style.background=settings.view==='vorticity'?'linear-gradient(90deg,#649fed,#101923,#f29872)':settings.view==='velocity'?'linear-gradient(90deg,#122e4b,#4ca5a5,#e8cb7d)':`linear-gradient(90deg,#071016,${media.color})`;
  $('size').disabled=settings.shape==='none';
  updatePlayback();
}
function updatePlayback(){
  $('pause').textContent=paused?'Resume':'Pause';$('step').disabled=!paused;
  $('status').textContent=paused?'PAUSED':'RUNNING';$('run-dot').style.opacity=paused?'0.35':'1';
}
function reset(){
  fluid=new Fluid(160,72,{...simulationParameters(settings.medium,settings.speed),shape:settings.shape,size:settings.size});
  fieldCanvas.width=fluid.nx;fieldCanvas.height=fluid.ny;image=fieldCtx.createImageData(fluid.nx,fluid.ny);
  particles=Array.from({length:360},(_,i)=>({x:(i%45)/45*fluid.nx*fluid.h,y:0.055+Math.floor(i/45)*0.125,age:0}));
  // Settle the initial divergence before displaying a new obstacle.
  fluid.project(dt,100);render();
}
function render(){
  if(!ctx || !fieldCtx)return;
  const {nx,ny,h}=fluid;
  const accent=MEDIA[settings.medium].color.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const i=x+nx*y,base=i*4;let r=7,g=16,b=22;
    if(fluid.solid[i]){r=53;g=69;b=80;}
    else if(settings.view==='dye'){
      const d=Math.min(1,fluid.dye[i]);const [u,v]=fluid.velocity((x+0.5)*h,(y+0.5)*h),s=Math.min(1,Math.hypot(u,v)/fluid.inlet)*0.04;
      r+=(accent[0]-7)*(d*0.9+s);g+=(accent[1]-16)*(d*0.9+s);b+=(accent[2]-22)*(d*0.9+s);
    }else if(settings.view==='velocity'){
      const [u,v]=fluid.velocity((x+0.5)*h,(y+0.5)*h),t=Math.min(1,Math.hypot(u,v)/fluid.inlet/2);
      if(t<0.5){r=16+110*t;g=39+245*t;b=64+180*t;}
      else{r=71+310*(t-0.5);g=161+82*(t-0.5);b=154-58*(t-0.5);}
    }else{
      const left=fluid.velocity(Math.max(h,(x-0.5)*h),(y+0.5)*h),right=fluid.velocity(Math.min((nx-1)*h,(x+1.5)*h),(y+0.5)*h);
      const top=fluid.velocity((x+0.5)*h,Math.max(h,(y-0.5)*h)),bottom=fluid.velocity((x+0.5)*h,Math.min((ny-1)*h,(y+1.5)*h));
      const curl=(right[1]-left[1]-bottom[0]+top[0])/(2*h),t=Math.min(1,Math.abs(curl)/20);
      const color=curl>0?[242,152,114]:[100,159,237];
      r=12+(color[0]-12)*t;g=21+(color[1]-21)*t;b=29+(color[2]-29)*t;
    }
    image.data[base]=r;image.data[base+1]=g;image.data[base+2]=b;image.data[base+3]=255;
  }
  fieldCtx.putImageData(image,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(fieldCanvas,0,0,canvas.width,canvas.height);
  // Subtle measurement grid is composited over the actual Eulerian field.
  ctx.strokeStyle='#93b8c00b';ctx.lineWidth=1;
  for(let i=1;i<20;i++){ctx.beginPath();ctx.moveTo(i*canvas.width/20,0);ctx.lineTo(i*canvas.width/20,canvas.height);ctx.stroke();}
  for(let i=1;i<9;i++){ctx.beginPath();ctx.moveTo(0,i*canvas.height/9);ctx.lineTo(canvas.width,i*canvas.height/9);ctx.stroke();}
  const sx=canvas.width/(nx*h),sy=canvas.height;
  if(settings.tracers){
    ctx.strokeStyle=`${MEDIA[settings.medium].color}b0`;ctx.lineWidth=1.25;ctx.beginPath();
    for(const p of particles){
      const [u,v]=fluid.velocity(p.x,p.y);ctx.moveTo(p.x*sx,p.y*sy);ctx.lineTo((p.x-u*0.014)*sx,(p.y-v*0.014)*sy);
    }ctx.stroke();
  }
  // Crisp cell-boundary outline around the same obstacle mask used by physics.
  ctx.strokeStyle='#abc1ca90';ctx.lineWidth=1;ctx.beginPath();
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)if(fluid.solid[x+nx*y]){
    const x0=x/nx*canvas.width,y0=y/ny*canvas.height,w=canvas.width/nx,hc=canvas.height/ny;
    if(!fluid.blocked(x-1,y)){ctx.moveTo(x0,y0);ctx.lineTo(x0,y0+hc);}
    if(!fluid.blocked(x+1,y)){ctx.moveTo(x0+w,y0);ctx.lineTo(x0+w,y0+hc);}
    if(!fluid.blocked(x,y-1)){ctx.moveTo(x0,y0);ctx.lineTo(x0+w,y0);}
    if(!fluid.blocked(x,y+1)){ctx.moveTo(x0,y0+hc);ctx.lineTo(x0+w,y0+hc);}
  }ctx.stroke();
  $('sim-time').textContent=fluid.time.toFixed(2);
  if(frameCount%12===0||paused)$('divergence').textContent=fluid.divergenceRMS().toFixed(3);
}
function advance(){
  fluid.step(dt);
  if(settings.tracers)for(let i=0;i<particles.length;i++){
    const p=particles[i], [u,v]=fluid.velocity(p.x,p.y);p.x+=u*dt;p.y+=v*dt;p.age++;
    if(p.x>=fluid.nx*fluid.h||p.y<0.015||p.y>0.985||fluid.blocked(Math.floor(p.x/fluid.h),Math.floor(p.y/fluid.h))||p.age>900){p.x=fluid.h;p.y=0.04+0.92*((i*0.61803398875)%1);p.age=0;}
  }
  frameCount++;
}
let last=0;
function animate(now){
  // At most one fixed solver tick / frame; slow hardware slows simulated time,
  // rather than taking unstable large steps or blocking on a catch-up spiral.
  if(!paused&&!document.hidden&&now-last>=1000/60-1){advance();render();last=now;}
  requestAnimationFrame(animate);
}
document.querySelectorAll('[data-medium]').forEach(button=>button.addEventListener('click',()=>{settings.medium=button.dataset.medium;updateUI();save();reset();}));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{settings.view=button.dataset.view;updateUI();save();render();}));
for(const key of ['speed','length','size'])$(key).addEventListener('input',()=>{
  settings[key]=Number($(key).value);updateUI();save();
  if(key==='size')reset();
  if(key==='speed')Object.assign(fluid,simulationParameters(settings.medium,settings.speed));
});
$('shape').addEventListener('change',()=>{settings.shape=$('shape').value;updateUI();save();reset();});
$('tracers').addEventListener('change',()=>{settings.tracers=$('tracers').checked;save();render();});
$('pause').addEventListener('click',()=>{paused=!paused;updatePlayback();});
$('step').addEventListener('click',()=>{if(paused){advance();render();}});
$('reset').addEventListener('click',reset);
$('stir').addEventListener('click',()=>{fluid.stir(fluid.nx*fluid.h*0.55,0.5,0,1.7);stirs++;render();});
let pointer=null;
function position(event){const b=canvas.getBoundingClientRect();return {x:(event.clientX-b.left)/b.width*fluid.nx*fluid.h,y:(event.clientY-b.top)/b.height};}
canvas.addEventListener('pointerdown',event=>{pointer=position(event);canvas.setPointerCapture(event.pointerId);fluid.stir(pointer.x,pointer.y,0,0);stirs++;render();});
canvas.addEventListener('pointermove',event=>{if(!pointer)return;const p=position(event);fluid.stir(p.x,p.y,(p.x-pointer.x)*30,(p.y-pointer.y)*30);pointer=p;stirs++;if(paused)render();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{pointer=null;});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('png').addEventListener('click',()=>{render();canvas.toBlob(blob=>{if(blob)download(blob,'flowSim.png');},'image/png');});
$('export').addEventListener('click',()=>download(new Blob([JSON.stringify({schema:'flowSim-settings-v1',...settings,SI:physicalMetrics(settings.medium,settings.speed,settings.length),normalized:simulationParameters(settings.medium,settings.speed),note:'Educational normalized flow; not Reynolds-similar. Water is single-phase, fully submerged.'},null,2)],{type:'application/json'}),'flowSim-settings.json'));
// Read-only diagnostics support automated verification without mutating app state.
Object.defineProperty(window,'flowSim',{get:()=>({time:fluid.time,stirs,medium:settings.medium,view:settings.view,finite:[fluid.u,fluid.v,fluid.dye].every(a=>a.every(Number.isFinite)),residual:fluid.divergenceRMS()})});
updateUI();save();reset();requestAnimationFrame(animate);
