import test from 'node:test';
import assert from 'node:assert/strict';
import { Fluid } from '../solver.js';
import { MEDIA, simulationParameters } from '../physics.js';

for(const medium of Object.keys(MEDIA)) for(const shape of ['circle','square','diamond','foil','none']) {
  test(`${medium}/${shape}: deterministic finite bounded flow and impermeable boundaries`, () => {
    const options={...simulationParameters(medium, 8),shape,size:0.38};
    const a=new Fluid(56,28,options), b=new Fluid(56,28,options);
    for(let t=0;t<90;t++) { if(t===20){a.stir(0.9,0.3,1,-0.4);b.stir(0.9,0.3,1,-0.4);} a.step(1/60);b.step(1/60); }
    assert.deepEqual(a.u,b.u);
    for(const field of [a.u,a.v,a.dye]) for(const value of field) assert.ok(Number.isFinite(value)&&Math.abs(value)<12);
    assert.ok(a.dye.some(x=>x>0.1));
    for(let y=0;y<a.ny;y++) {
      assert.ok(Math.abs(a.u[a.ui(0,y)]-a.inlet)<1e-6);
      for(let x=1;x<a.nx;x++) if(a.blocked(x,y)||a.blocked(x-1,y)) assert.equal(a.u[a.ui(x,y)],0);
    }
    for(let x=0;x<a.nx;x++){assert.equal(a.v[a.vi(x,0)],0);assert.equal(a.v[a.vi(x,a.ny)],0);}
  });
}
test('implicit diffusion damps a high frequency field more at higher viscosity',()=>{
  const low=new Fluid(48,24,{inlet:0,shape:'none',viscosity:0.00001});
  const high=new Fluid(48,24,{inlet:0,shape:'none',viscosity:0.01});
  for(let i=0;i<low.u.length;i++) low.u[i]=high.u[i]=i%2?1:-1;
  low.diffuse(0.05);high.diffuse(0.05);
  const energy=f=>f.u.reduce((s,x)=>s+x*x,0);
  assert.ok(energy(high)<energy(low)*0.5);
});
test('passive dye is transported downstream by the computed velocity',()=>{
  const f=new Fluid(80,30,{inlet:1,shape:'none'});
  for(let i=0;i<60;i++) f.step(1/60);
  const downstream=f.dye.slice(30*80,30*80); // inspect cells, not decorative particles
  let peak=0;for(let y=0;y<f.ny;y++)peak=Math.max(peak,f.dye[25+y*f.nx]);
  assert.ok(peak>0.01);
  assert.ok(f.time>0.9);
});
