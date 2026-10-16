import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA, physicalMetrics, simulationParameters } from '../physics.js';

test('SI presets yield correct kinematic viscosity and Reynolds number', () => {
  assert.equal(MEDIA.water.density, 998);
  assert.equal(MEDIA.air.viscosity, 0.0000181);
  assert.equal(physicalMetrics('water', 2, 0.2).reynolds, 998 * 2 * 0.2 / 0.001002);
  assert.ok(simulationParameters('oil', 2).viscosity > simulationParameters('air', 2).viscosity);
  assert.ok(simulationParameters('air', 2).viscosity > simulationParameters('water', 2).viscosity);
  assert.ok(simulationParameters('air', 8).inlet > simulationParameters('air', 1).inlet);
});
