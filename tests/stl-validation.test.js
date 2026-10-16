import test from 'node:test';import assert from 'node:assert/strict';import {parseSTL,transformTriangles,voxelize} from '../stl.js';
import { largeSTL, arrayBuffer } from './large-stl-fixture.js';
const ascii=t=>'solid mesh\n'+t.map(v=>'facet normal 0 0 0\nouter loop\n'+v.map(p=>'vertex '+p.join(' ')).join('\n')+'\nendloop\nendfacet').join('\n')+'\nendsolid';
test('invalid coordinates, truncated binary, zero extent and incomplete ASCII remain rejected; open triangles warned',()=>{assert.throws(()=>parseSTL(new TextEncoder().encode(ascii([[[0,0,0],[NaN,1,0],[0,0,1]]])).buffer),/non-finite/);assert.throws(()=>parseSTL(arrayBuffer(largeSTL(2).subarray(0,-1))));assert.throws(()=>parseSTL(new TextEncoder().encode('solid x\nvertex 0 0 0\nendsolid').buffer),/incomplete/);assert.throws(()=>parseSTL(new TextEncoder().encode(ascii([[[0,0,0],[0,0,0],[0,0,0]]])).buffer),/zero extent/);const m=parseSTL(new TextEncoder().encode(ascii([[[0,0,0],[1,0,0],[0,1,0]]])).buffer);assert.equal(m.openEdges,3);});
test('full binary meshes above both former limits are accepted, not truncated or box-filled',()=>{
 const fixture=largeSTL(); assert.ok(fixture.byteLength>12*1024*1024);
 const m=parseSTL(arrayBuffer(fixture)); assert.equal(m.triangles.length/9,262144); assert.equal(m.openEdges,null);
 assert.deepEqual(Array.from(m.triangles.slice(-9)),[1/256,0,255/256,0,0,1,0,1/256,255/256]);
 const t=transformTriangles(m.triangles,{scale:.6}), mask=voxelize(t,32,24,24), count=mask.reduce((a,b)=>a+b,0);
 assert.ok(count>10 && count<.6**3*30*22*22*.5,`actual tetrahedron interior: ${count}`);
});
test('ASCII mesh over former triangle cap keeps every triangle',()=>{
 const body=ascii([[[0,0,0],[1,0,0],[0,1,0]]]).split('\n').slice(1,-1).join('\n');
 const m=parseSTL(new TextEncoder().encode('solid many\n'+(body+'\n').repeat(60001)+'endsolid').buffer);
 assert.equal(m.triangles.length,60001*9); assert.equal(m.openEdges,null);
});
test('voxelized box volume matches geometric interior and rotated geometry changes actual voxels',()=>{const p=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],faces=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[0,3,7],[0,7,4],[1,5,6],[1,6,2]],m=parseSTL(new TextEncoder().encode(ascii(faces.map(f=>f.map(i=>p[i])))).buffer);assert.equal(m.openEdges,0);const t=transformTriangles(m.triangles,{scale:.5}),mask=voxelize(t,32,24,24),count=mask.reduce((a,b)=>a+b,0);assert.ok(Math.abs(count/(30*22*22)-.125)<.025);const r=voxelize(transformTriangles(m.triangles,{scale:.5,ry:.6}),32,24,24);assert.ok(mask.some((v,i)=>v!==r[i]));});
