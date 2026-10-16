import {test, expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {largeSTL} from '../large-stl-fixture.js';

test('large actual upload above 12 MiB / 60000 triangles stays interactive and rebuilds full geometry under /flowSim/', async ({page}, testInfo) => {
 const errors=[]; page.on('pageerror', e=>errors.push(e.message));
 const workers=[]; page.on('worker',w=>workers.push(w.url()));
 await page.route('**/node_modules/**',r=>r.abort());
 await page.route('**/flowSim/**',async route=>{
   const url=new URL(route.request().url());url.pathname=url.pathname.replace('/flowSim','');
   const response=await route.fetch({url:url.href});await route.fulfill({response});
 });
 await page.goto('/flowSim/');
 await expect.poll(()=>page.evaluate(()=>!!window.flowSim && !window.flowSim.busy)).toBe(true);
 const fixture=largeSTL(); expect(fixture.length).toBeGreaterThan(12*1024*1024);
 const path=testInfo.outputPath('large-tetra.stl'); await writeFile(path,fixture);
 await page.evaluate(()=>{
   window.busyFrames=0;window.interactedWhileBusy=false;
   function monitor(){
     if(window.flowSim.busy){
       window.busyFrames++;
       if(!window.interactedWhileBusy){
         document.getElementById('pause').click();
         document.getElementById('color-max').value='1.2';
         document.getElementById('color-max').dispatchEvent(new Event('input'));
         window.interactedWhileBusy=document.getElementById('status').textContent==='PAUSED' && document.getElementById('legend-range').textContent==='0 → 1.2+';
       }
     }
     window.monitorId=requestAnimationFrame(monitor);
   } monitor();
 });
 await page.locator('#stl-file').setInputFiles(path);
 await expect(page.locator('#upload-status')).toContainText('262144 triangles');
 await expect(page.locator('#upload-status')).toContainText('topology check skipped');
 expect(await page.evaluate(()=>window.busyFrames)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>window.interactedWhileBusy)).toBe(true);
 await page.evaluate(()=>cancelAnimationFrame(window.monitorId));
 expect(workers.some(url=>url.endsWith('/flowSim/stl-worker.bundle.js'))).toBe(true);
 const result=await page.evaluate(()=>({
   uploaded:window.flowSim.uploaded.triangles.length/9,
   rendered:window.flowSim.obstacle.geometry.attributes.position.count/3,
   count:window.flowSim.solver.solidCount,
   mask:Array.from(window.flowSim.solver.solid).join(''),
 }));
 expect(result.uploaded).toBe(262144);expect(result.rendered).toBe(262144);
 expect(result.count).toBeGreaterThan(0);
 expect(result.count).toBeLessThan(.42**3*40*24*24*.5);
 // Invalid replacement leaves the full existing mesh and exact mask untouched.
 await page.locator('#stl-file').setInputFiles({name:'invalid.stl',mimeType:'application/octet-stream',buffer:Buffer.from('invalid')});
 await expect(page.locator('#upload-status')).toContainText('Upload rejected');
 expect(await page.evaluate(()=>window.flowSim.obstacle.geometry.attributes.position.count/3)).toBe(262144);
 expect(await page.evaluate(()=>Array.from(window.flowSim.solver.solid).join(''))).toBe(result.mask);
 await page.locator('#ry').fill('63');await page.locator('#ry').dispatchEvent('change');
 await expect.poll(()=>page.evaluate(()=>!window.flowSim.busy)).toBe(true);
 expect(await page.evaluate(()=>Array.from(window.flowSim.solver.solid).join(''))).not.toBe(result.mask);
 expect(await page.evaluate(()=>window.flowSim.obstacle.geometry.attributes.position.count/3)).toBe(262144);
 // Latest request wins: a shape switch cancels an in-flight mesh rotation.
 await page.evaluate(()=>{
   const ry=document.getElementById('ry');ry.value='80';ry.dispatchEvent(new Event('change'));
   const shape=document.getElementById('shape');shape.value='none';shape.dispatchEvent(new Event('change'));
 });
 await expect.poll(()=>page.evaluate(()=>!window.flowSim.busy)).toBe(true);
 expect(await page.evaluate(()=>window.flowSim.obstacle)).toBeNull();
 expect(await page.evaluate(()=>window.flowSim.solver.solidCount)).toBe(0);
 expect(errors).toEqual([]);
});

test('worker load failure clears busy status and retains previous geometry',async({page})=>{
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>!!window.flowSim?.obstacle && !window.flowSim.busy)).toBe(true);
 const count=await page.evaluate(()=>window.flowSim.solver.solidCount);
 await page.route('**/stl-worker.bundle.js',route=>route.abort());
 await page.locator('#ry').fill('42');await page.locator('#ry').dispatchEvent('change');
 await expect(page.locator('#upload-status')).toContainText('Geometry rebuild failed');
 expect(await page.evaluate(()=>window.flowSim.busy)).toBe(false);
 expect(await page.evaluate(()=>window.flowSim.solver.solidCount)).toBe(count);
 expect(await page.evaluate(()=>!!window.flowSim.obstacle)).toBe(true);
});

test('legend uses shared speed colors, continuous slice and adjustable layer opacity',async({page})=>{
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>!!window.flowSim?.obstacle)).toBe(true);
 const values=await page.evaluate(()=>{
  const f=window.flowSim;
  return { stops:[0,.6,1.2,1.8].map(s=>'#'+f.speedColor(s).getHexString()),palette:f.palette,
    coloredTrails:f.trails.material.vertexColors, slice:f.sliceMesh.isMesh,
    indices:f.sliceMesh.geometry.index.count,trail:Array.from(f.trails.geometry.attributes.color.array.slice(0,3)),particle:Array.from(f.points.geometry.attributes.color.array.slice(0,3)) };
 });
 expect(values.stops).toEqual(values.palette);expect(values.coloredTrails).toBe(true);expect(values.trail).toEqual(values.particle);
 expect(values.slice).toBe(true);expect(values.indices).toBe(39*39*6);
 await page.locator('#color-max').fill('2.5');await expect(page.locator('#legend-range')).toHaveText('0 → 2.5+');
 await page.locator('#obstacle-opacity').fill('0.4');await page.locator('#slice-opacity').fill('0.7');await page.locator('#tracer-opacity').fill('0.8');
 expect(await page.evaluate(()=>[window.flowSim.obstacle.material.opacity,window.flowSim.sliceMesh.material.opacity,window.flowSim.points.material.opacity])).toEqual([.4,.7,.8]);
});
