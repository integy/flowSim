import test from 'node:test';
import assert from 'node:assert/strict';
import { Fluid3D } from '../fluid3d.js';
import * as fields from '../fields.js';

test('derived fields are finite, uniform inlet is undisturbed, obstacles create deviation', () => {
  const s = new Fluid3D(18,14,14);
  const grid = new fields.DerivedField(s);
  grid.update('disturbance');
  assert.ok(grid.values.every(v => Number.isFinite(v) && v < 1e-6));
  grid.update('speed');
  assert.ok(Math.abs(grid.sample(.3,.4,.5) - s.inlet) < 1e-6);
  s.setObstacle((x,y,z) => (x-.4)**2+(y-.5)**2+(z-.5)**2 < .03);
  for(let k=0;k<6;k++) s.step();
  grid.update('disturbance');
  let peak=0;
  s.each(i => {if (!s.solid[i]) peak=Math.max(peak,grid.values[i]);});
  assert.ok(peak > .1, `obstacle peak ${peak}`);
  for(const mode of ['speed','disturbance','vorticity']) {
    grid.update(mode);
    assert.ok(grid.values.every(Number.isFinite));
    assert.ok(Number.isFinite(grid.sample(.45,.52,.53)));
  }
  s.inlet=0; s.reset(); grid.update('disturbance');
  assert.ok(grid.values.every(Number.isFinite));
});

test('3D curl uses physical grid spacing and every component; solid-body rotation has known curl', () => {
  const s = new Fluid3D(14,12,12), a=1.3, b=.7, c=.4;
  for(let z=0;z<s.nz;z++) for(let y=0;y<s.ny;y++) for(let x=0;x<s.nx;x++) {
    const i=s.idx(x,y,z);
    s.u[i]=(-a*y + c*z)*s.h;
    s.v[i]=(a*x - b*z)*s.h;
    s.w[i]=(b*y - c*x)*s.h;
  }
  const grid = new fields.DerivedField(s); grid.update('vorticity');
  const expected=2*Math.hypot(a,b,c);
  assert.ok(Math.abs(grid.values[s.idx(6,5,5)]-expected)<1e-5);
  assert.ok(Math.abs(grid.sample(.5,.5,.5)-expected)<1e-5);
});

test('seven-stop speed palette is warm at rest and cool at high speed; diagnostics reverse it', () => {
  assert.equal(fields.SPEED_PALETTE.length, 7);
  assert.deepEqual(fields.colorRGB(0, 1, 'speed'), [1, 59/255, 48/255]);
  assert.deepEqual(fields.colorRGB(1, 1, 'speed'), [139/255, 92/255, 246/255]);
  assert.deepEqual(fields.colorRGB(0, 1, 'disturbance'), fields.colorRGB(1, 1, 'speed'));
  assert.deepEqual(fields.colorRGB(1, 1, 'vorticity'), fields.colorRGB(0, 1, 'speed'));
  assert.deepEqual(fields.colorRGB(2, 1, 'speed'), fields.colorRGB(1, 1, 'speed'));
  for (const mode of ['speed','disturbance','vorticity']) for (const value of [0,.2,1,NaN])
    assert.ok(fields.colorRGB(value, 1, mode).every(Number.isFinite));
});
