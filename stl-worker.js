import { parseSTL, transformTriangles, voxelize } from './stl.js';

// Every build runs off the UI thread. The caller terminates superseded jobs.
self.onmessage = async ({ data }) => {
  const { id, file, triangles, options, nx, ny, nz, width } = data;
  try {
    const mesh = file ? parseSTL(await file.arrayBuffer()) : null;
    const input = mesh?.triangles || triangles;
    self.postMessage({ id, phase: 'Transforming and voxelizing full mesh…' });
    const t = input ? transformTriangles(input, options) : new Float32Array();
    const solid = voxelize(t, nx, ny, nz);
    const normals = new Float32Array(t.length);
    for (let i = 0; i < t.length; i += 3) {
      t[i] = (t[i] - 0.5) * width;
      t[i + 1] = (t[i + 1] - 0.5) * 2;
      t[i + 2] = (t[i + 2] - 0.5) * 2;
    }
    // Non-indexed face normals, computed here rather than blocking rendering.
    for (let i = 0; i < t.length; i += 9) {
      const ax=t[i+3]-t[i], ay=t[i+4]-t[i+1], az=t[i+5]-t[i+2];
      const bx=t[i+6]-t[i], by=t[i+7]-t[i+1], bz=t[i+8]-t[i+2];
      const x=ay*bz-az*by, y=az*bx-ax*bz, z=ax*by-ay*bx;
      const length=Math.hypot(x,y,z) || 1;
      for(let j=0;j<9;j+=3) { normals[i+j]=x/length; normals[i+j+1]=y/length; normals[i+j+2]=z/length; }
    }
    const transfer = [t.buffer, normals.buffer, solid.buffer];
    if (mesh) transfer.push(mesh.triangles.buffer);
    self.postMessage({ id, vertices:t, normals, solid, mesh }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
