export const MAX_BYTES = 12 * 1024 * 1024,
  MAX_TRIANGLES = 60000;
export function parseSTL(buffer) {
  if (buffer.byteLength > MAX_BYTES) throw Error("STL exceeds 12 MB limit.");
  let values = [];
  const view = new DataView(buffer);
  const count = buffer.byteLength >= 84 ? view.getUint32(80, true) : 0;
  if (count > 0 && 84 + count * 50 === buffer.byteLength) {
    if (count > MAX_TRIANGLES) throw Error("STL exceeds 60,000 triangles.");
    values = new Float32Array(count * 9);
    for (let i = 0; i < count; i++)
      for (let j = 0; j < 9; j++)
        values[i * 9 + j] = view.getFloat32(84 + i * 50 + 12 + j * 4, true);
  } else {
    const text = new TextDecoder().decode(buffer);
    if (!/^\s*solid\b/i.test(text))
      throw Error("Not a valid binary or ASCII STL.");
    const matches = text.matchAll(
      /\bvertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi,
    );
    for (const m of matches) {
      values.push(Number(m[1]), Number(m[2]), Number(m[3]));
      if (values.length > MAX_TRIANGLES * 9)
        throw Error("STL exceeds 60,000 triangles.");
    }
    if (!values.length || values.length % 9)
      throw Error("STL has incomplete or missing triangles.");
    values = new Float32Array(values);
  }
  if (!values.every(Number.isFinite))
    throw Error("STL contains non-finite coordinates.");
  const bounds = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  values.forEach((v, i) => {
    bounds[0][i % 3] = Math.min(bounds[0][i % 3], v);
    bounds[1][i % 3] = Math.max(bounds[1][i % 3], v);
  });
  const extent = Math.max(...bounds[1].map((v, i) => v - bounds[0][i]));
  if (extent < 1e-12) throw Error("STL has zero extent.");
  const edges = new Map(),
    key = (i) =>
      [0, 1, 2]
        .map((j) => Math.round(((values[i + j] - bounds[0][j]) / extent) * 1e6))
        .join(",");
  for (let i = 0; i < values.length; i += 9)
    for (const [a, b] of [
      [0, 3],
      [3, 6],
      [6, 0],
    ]) {
      const e = [key(i + a), key(i + b)].sort().join("|");
      edges.set(e, (edges.get(e) || 0) + 1);
    }
  return {
    triangles: values,
    openEdges: [...edges.values()].filter((n) => n !== 2).length,
    bounds,
  };
}
export function transformTriangles(
  input,
  { scale = 0.42, rx = 0, ry = 0, rz = 0, aspect = 1 } = {},
) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < input.length; i++) {
    min[i % 3] = Math.min(min[i % 3], input[i]);
    max[i % 3] = Math.max(max[i % 3], input[i]);
  }
  const center = min.map((v, i) => (v + max[i]) / 2),
    factor = scale / Math.max(...max.map((v, i) => v - min[i]));
  const out = new Float32Array(input.length),
    cx = Math.cos(rx),
    sx = Math.sin(rx),
    cy = Math.cos(ry),
    sy = Math.sin(ry),
    cz = Math.cos(rz),
    sz = Math.sin(rz);
  for (let i = 0; i < input.length; i += 3) {
    let x = (input[i] - center[0]) * factor,
      y = (input[i + 1] - center[1]) * factor,
      z = (input[i + 2] - center[2]) * factor;
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    out[i] = 0.44 + x / aspect;
    out[i + 1] = 0.5 + y;
    out[i + 2] = 0.5 + z;
  }
  return out;
}
// Scanline ray parity on actual triangles, not a bounding-box fill. Rays point +X.
// Sub-cell jitter avoids vertex/edge coincidences; shared-face hits are deduplicated.
export function voxelize(t, nx, ny, nz) {
  const rows = Array.from({ length: ny * nz }, () => []);
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i],
      ay = t[i + 1],
      az = t[i + 2],
      bx = t[i + 3],
      by = t[i + 4],
      bz = t[i + 5],
      cx = t[i + 6],
      cy = t[i + 7],
      cz = t[i + 8];
    const denom = (by - cy) * (az - cz) + (cz - bz) * (ay - cy);
    if (Math.abs(denom) < 1e-12) continue;
    const loY = Math.max(1, Math.floor(Math.min(ay, by, cy) * (ny - 2))),
      hiY = Math.min(ny - 2, Math.ceil(Math.max(ay, by, cy) * (ny - 2) + 1));
    const loZ = Math.max(1, Math.floor(Math.min(az, bz, cz) * (nz - 2))),
      hiZ = Math.min(nz - 2, Math.ceil(Math.max(az, bz, cz) * (nz - 2) + 1));
    for (let z = loZ; z <= hiZ; z++)
      for (let y = loY; y <= hiY; y++) {
        const py = (y - 0.5) / (ny - 2) + 1.371e-7,
          pz = (z - 0.5) / (nz - 2) + 2.713e-7;
        const u = ((by - cy) * (pz - cz) + (cz - bz) * (py - cy)) / denom,
          v = ((cy - ay) * (pz - cz) + (az - cz) * (py - cy)) / denom,
          w = 1 - u - v;
        if (u >= 0 && v >= 0 && w >= 0)
          rows[y + ny * z].push(u * ax + v * bx + w * cx);
      }
  }
  const solid = new Uint8Array(nx * ny * nz);
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++) {
      const hits = rows[y + ny * z]
        .sort((a, b) => a - b)
        .filter((v, i, a) => !i || v - a[i - 1] > 1e-7);
      for (let x = 1; x < nx - 1; x++) {
        const px = (x - 0.5) / (nx - 2);
        let crossings = 0;
        for (const hit of hits) if (hit > px) crossings++;
        if (crossings % 2) solid[x + nx * (y + ny * z)] = 1;
      }
    }
  return solid;
}
