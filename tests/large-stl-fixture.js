// Subdivided closed tetrahedron: real, distinct triangles; no duplicate padding.
export const tetraVertices = [[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
export const tetraFaces = [[0,1,2],[0,3,1],[0,2,3],[1,3,2]];
export function largeSTL(n = 256) {
  const count = 4*n*n;
  const buffer = Buffer.alloc(84 + count*50);
  buffer.write('solid subdivided tetrahedron');
  buffer.writeUInt32LE(count,80);
  let triangle = 0;
  for (const face of tetraFaces) {
    const [a,b,c] = face.map(i=>tetraVertices[i]);
    const point = (i,j) => a.map((v,k)=>v+(b[k]-v)*i/n+(c[k]-v)*j/n);
    const emit = (vertices) => {
      vertices.flat().forEach((v,k)=>buffer.writeFloatLE(v,84+triangle*50+12+k*4));
      triangle++;
    };
    for(let i=0;i<n;i++) for(let j=0;j<n-i;j++) {
      emit([point(i,j),point(i+1,j),point(i,j+1)]);
      if(i+j<n-1) emit([point(i+1,j),point(i+1,j+1),point(i,j+1)]);
    }
  }
  if (triangle !== count) throw Error('fixture count mismatch');
  return buffer;
}
export function arrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset+buffer.byteLength);
}
