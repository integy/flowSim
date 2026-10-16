import test from 'node:test';
import assert from 'node:assert/strict';
import { Fluid } from '../solver.js';
import { simulationParameters } from '../physics.js';

test('pressure projection reduces a deterministic divergent velocity field', () => {
  const f = new Fluid(48, 24, { shape: 'none', inlet: 0 });
  for (let y=1;y<f.ny-1;y++) for(let x=1;x<f.nx;x++) f.u[f.ui(x,y)] = Math.sin(x*0.3)*Math.sin(y*0.2);
  const before=f.divergenceRMS();
  f.project(0.01, 160);
  assert.ok(f.divergenceRMS() < before*0.45, `${before} -> ${f.divergenceRMS()}`);
});
