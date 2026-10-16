import test from 'node:test';
import assert from 'node:assert/strict';
import { Fluid3D } from '../fluid3d.js';
import { DerivedField, computeColorRange, colorRGB, normalizedColor } from '../fields.js';

test('auto uses exact finite interior fluid P5/P95, excluding ghosts and solids', () => {
  const s=new Fluid3D(12,4,4), values=new Float32Array(s.n).fill(1e9);
  let n=0;
  for(let z=1;z<s.nz-1;z++) for(let y=1;y<s.ny-1;y++) for(let x=1;x<s.nx-1;x++) {
    const i=s.idx(x,y,z); s.solid[i]=0; values[i]=n++;
  }
  s.solid[s.idx(1,1,1)]=1; values[s.idx(1,1,1)]=-1e9;
  values[s.idx(2,1,1)]=NaN;
  const r=computeColorRange(values,s,{gamma:1});
  assert.equal(r.count,n-2);
  assert.equal(r.actualMin,2); assert.equal(r.actualMax,n-1);
  assert.ok(Math.abs(r.min-(2+(n-3)*.05))<1e-10);
  assert.ok(Math.abs(r.max-(2+(n-3)*.95))<1e-10);
  assert.equal(r.histogram.reduce((a,b)=>a+b,0),r.count);
  assert.ok(r.clippedLow>0 && r.clippedHigh>0);
});

test('gamma changes band occupancy without changing scalars; fixed endpoints clip to nine colors', () => {
  const s=new Fluid3D(12,6,6), values=Float32Array.from({length:s.n},(_,i)=>i/s.n);
  const before=values.slice(), a=computeColorRange(values,s,{auto:false,maximum:1,gamma:1});
  const b=computeColorRange(values,s,{auto:false,maximum:1,gamma:.5});
  assert.deepEqual(values,before); assert.equal(a.min,b.min); assert.equal(a.max,b.max);
  assert.notDeepEqual(a.histogram,b.histogram);
  assert.equal(normalizedColor(.25,b),.5);
  const colors=new Set(Array.from({length:100},(_,i)=>colorRGB(i/99,a).join(',')));
  assert.equal(colors.size,9);
  assert.deepEqual(colorRGB(-1,a),colorRGB(0,a));
  assert.deepEqual(colorRGB(4,a),colorRGB(1,a));
});

test('uniform, near-uniform, empty and sparse-tail ranges stay finite without false variations', () => {
  const s=new Fluid3D(8,6,6), values=new Float32Array(s.n);
  for(const v of [0,.7,5]) {
    values.fill(v); const r=computeColorRange(values,s);
    assert.equal(r.uniform,true);
    assert.equal(r.histogram.filter(n=>n>0).length,1);
    assert.ok(colorRGB(v,r).every(Number.isFinite));
  }
  values[s.idx(2,2,2)]+=.00000001;
  assert.equal(computeColorRange(values,s).uniform,true);
  values.fill(0); values[s.idx(2,2,2)]=4;
  const tails=computeColorRange(values,s);
  assert.equal(tails.uniform,false); assert.equal(tails.max,4);
  values.fill(NaN);
  const empty=computeColorRange(values,s);
  assert.equal(empty.count,0); assert.ok(colorRGB(NaN,empty).every(Number.isFinite));
});

test('real computed obstacle fields occupy multiple actual RGB bands in all modes', () => {
  const s=new Fluid3D(24,16,16), grid=new DerivedField(s);
  s.setObstacle((x,y,z)=>((x-.4)*1.5)**2+(y-.5)**2+(z-.5)**2<.2**2);
  for(let k=0;k<12;k++) s.step();
  for(const mode of ['speed','disturbance','vorticity']) {
    grid.update(mode); const r=computeColorRange(grid.values,s), rgb=new Set();
    for(let z=1;z<s.nz-1;z++) for(let y=1;y<s.ny-1;y++) for(let x=1;x<s.nx-1;x++) {
      const i=s.idx(x,y,z); if(!s.solid[i]) rgb.add(colorRGB(grid.values[i],r,mode).join(','));
    }
    assert.ok(rgb.size>=7,`${mode}: ${rgb.size} actual colors`);
    assert.ok(rgb.size<=9);
  }
});
