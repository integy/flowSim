import test from "node:test";
import assert from "node:assert/strict";
test("3D solver projects all components and respects obstacle", async () => {
  const { Fluid3D } = await import("../fluid3d.js");
  const s = new Fluid3D(20, 14, 14);
  s.setObstacle(
    (x, y, z) => (x - 0.44) ** 2 + (y - 0.5) ** 2 + (z - 0.5) ** 2 < 0.12 ** 2,
  );
  for (let i = 0; i < s.n; i++) {
    s.u[i] = Math.sin(i * 1.3) * 0.2;
    s.v[i] = Math.cos(i * 0.7) * 0.2;
    s.w[i] = Math.sin(i * 0.3) * 0.2;
  }
  s.boundaries();
  const before = s.divergence();
  s.project(100);
  const after = s.divergence();
  assert.ok(after < before * 0.3, `${before} -> ${after}`);
  for (let k = 0; k < 30; k++) s.step(0.035, { inlet: 0.7, viscosity: 0.001 });
  assert.ok(s.u.every(Number.isFinite));
  assert.ok(s.w.every(Number.isFinite));
  assert.ok(Math.max(...s.u.map(Math.abs)) < 4);
  assert.ok(s.solidCount > 0);
  assert.ok(s.divergence() < 1);
});
