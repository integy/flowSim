import test from "node:test";
import assert from "node:assert/strict";
export const tetra = [
  0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
  1, 1, 0, 0, 0, 0, 1, 0, 1, 0,
];
export const ascii =
  "solid tetra\n" +
  Array.from(
    { length: 4 },
    (_, i) =>
      "facet normal 0 0 0\nouter loop\n" +
      [0, 1, 2]
        .map(
          (j) =>
            "vertex " + tetra.slice(i * 9 + j * 3, i * 9 + j * 3 + 3).join(" "),
        )
        .join("\n") +
      "\nendloop\nendfacet",
  ).join("\n") +
  "\nendsolid";
test("ASCII and binary STL produce triangle-accurate closed voxel geometry", async () => {
  const { parseSTL, transformTriangles, voxelize } = await import("../stl.js");
  let m = parseSTL(new TextEncoder().encode(ascii).buffer);
  assert.equal(m.triangles.length, 36);
  assert.equal(m.openEdges, 0);
  let b = new ArrayBuffer(84 + 4 * 50),
    v = new DataView(b);
  v.setUint32(80, 4, true);
  tetra.forEach((n, i) =>
    v.setFloat32(84 + Math.floor(i / 9) * 50 + 12 + (i % 9) * 4, n, true),
  );
  assert.deepEqual([...parseSTL(b).triangles], tetra);
  const t = transformTriangles(m.triangles, {
    scale: 0.6,
    rx: 0,
    ry: 0,
    rz: 0,
  });
  const mask = voxelize(t, 32, 24, 24);
  const count = mask.reduce((a, b) => a + b, 0);
  assert.ok(count > 10);
  assert.ok(
    count < 0.6 ** 3 * 30 * 22 * 22 * 0.5,
    `not bounding box: ${count}`,
  );
  assert.throws(() => parseSTL(new ArrayBuffer(20)));
});
