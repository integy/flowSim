import { test, expect } from '@playwright/test';
test('field selection recolors all layers with exact legend, units and remembered ranges', async ({page}) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>!!window.flowSim?.obstacle)).toBe(true);
  await page.locator('#pause').click();
  // Endpoint/range regression explicitly uses the legacy fixed linear mode.
  await page.locator('#color-range-mode').selectOption('fixed');
  await page.locator('#color-gamma').fill('1');
  await page.locator('#color-bands').uncheck();
  await page.locator('#field-mode').selectOption('speed');
  await expect(page.locator('#legend-note')).toContainText('not a true blockage detector');
  expect(await page.evaluate(()=> '#'+window.flowSim.speedColor(0).getHexString())).toBe('#b50924');
  const snapshots=[];
  for(const mode of ['speed','disturbance','vorticity']) {
    await page.locator('#field-mode').selectOption(mode);
    await expect.poll(()=>page.evaluate(()=>window.flowSim.fieldMode)).toBe(mode);
    await expect(page.locator('#legend-title')).toContainText(mode==='speed'?'Speed':mode==='disturbance'?'Inlet deviation':'Vorticity');
    if(mode==='vorticity') await expect(page.locator('#legend-units')).toHaveText('1 / normalized sim time');
    await page.waitForTimeout(80);
    const state=await page.evaluate(()=>{
      const f=window.flowSim, p=Array.from(f.points.geometry.attributes.color.array.slice(0,90));
      return {palette:f.activePalette,gradient:document.getElementById('speed-gradient').style.background,
        p,trail:Array.from(f.trails.geometry.attributes.color.array.slice(0,3)),finite:f.field.values.every(Number.isFinite),
        sliceFinite:f.sliceMesh.geometry.attributes.color.array.every(Number.isFinite),
        endpoints:[f.fieldColor(0).getHexString(), f.fieldColor(100).getHexString()]};
    });
    expect(state.finite&&state.sliceFinite).toBe(true); expect(state.trail).toEqual(state.p.slice(0,3));
    expect(state.palette).toHaveLength(9);
    expect(state.endpoints).toEqual(mode==='speed'?['b50924','d75bff']:['d75bff','b50924']);
    expect(state.gradient).toContain(mode==='speed'?'181, 9, 36':'215, 91, 255');
    const sliceError = await page.evaluate(() => {
      const f=window.flowSim, array=f.sliceMesh.geometry.attributes.color.array;
      // First slice vertex is fluid at x=y=0, z=.5; compare the actual GPU buffer
      // with the same scalar-grid sample and shared color function.
      const c=f.fieldColor(f.field.sample(0,0,.5));
      return Math.max(...[c.r,c.g,c.b].map((v,i)=>Math.abs(v-array[i])));
    });
    expect(sliceError).toBeLessThan(1e-6);
    snapshots.push(state.p);
    await page.screenshot({path:`test-results/field-${mode}.png`});
    const beforeRange = state.p;
    await page.locator('#color-max').fill(mode==='vorticity'?'12':'2.5');
    await expect.poll(()=>page.evaluate(()=>Array.from(window.flowSim.points.geometry.attributes.color.array.slice(0,90)))).not.toEqual(beforeRange);
    await expect(page.locator('#legend-high')).toContainText(mode==='vorticity'?'12 ·':'2.5 ·');
  }
  expect(snapshots[0]).not.toEqual(snapshots[1]); expect(snapshots[1]).not.toEqual(snapshots[2]);
  await page.locator('#field-mode').selectOption('speed');
  await expect(page.locator('#color-max')).toHaveValue('2.5');
  expect(errors).toEqual([]);
});
