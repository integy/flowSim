import { test, expect } from '@playwright/test';

test('auto contrast exposes computed obstacle bands; controls recolor paused buffers and uniform flow stays uniform', async ({page}) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#color-range-mode')).toHaveValue('auto');
  await expect.poll(()=>page.evaluate(()=>!!window.flowSim?.obstacle && window.flowSim.solver.time>.15)).toBe(true);
  await page.locator('#pause').click();
  await expect(page.locator('#field-mode')).toHaveValue('disturbance');
  await expect(page.locator('#color-max')).toBeDisabled();
  await expect(page.locator('#legend-range')).toContainText('P5–P95');
  const state=await page.evaluate(()=>{
    const f=window.flowSim, a=f.points.geometry.attributes.color.array;
    return {range:f.colorRange, colors:new Set(Array.from({length:a.length/3},(_,i)=>Array.from(a.slice(i*3,i*3+3)).join(','))).size};
  });
  expect(state.range.histogram.filter(n=>n>0).length).toBeGreaterThan(4);
  expect(state.colors).toBeGreaterThan(4);
  expect(state.colors).toBeLessThanOrEqual(9);
  expect(state.range.clippedLow+state.range.clippedHigh).toBeGreaterThan(0);
  await expect(page.locator('#legend-clipping')).toContainText('clipped low');
  const before=await page.evaluate(()=>Array.from(window.flowSim.points.geometry.attributes.color.array));
  await page.locator('#color-gamma').fill('2');
  await expect(page.locator('#color-gamma-value')).toContainText('2.00');
  const midpoint=await page.evaluate(()=>{
    const r=window.flowSim.colorRange;
    return {expected:r.min+(r.max-r.min)/2,label:parseFloat(document.getElementById('legend-mid').textContent)};
  });
  expect(midpoint.label).toBeCloseTo(midpoint.expected,4);
  await expect.poll(()=>page.evaluate(()=>Array.from(window.flowSim.points.geometry.attributes.color.array))).not.toEqual(before);
  await page.locator('#color-range-mode').selectOption('fixed');
  await expect(page.locator('#color-max')).toBeEnabled();
  await expect(page.locator('#legend-range')).toContainText('Fixed');
  await page.locator('#color-bands').uncheck();
  await expect.poll(()=>page.evaluate(()=>window.flowSim.colorRange.bands)).toBe(false);
  await page.locator('#color-range-mode').selectOption('auto');
  await page.locator('#color-bands').check();
  await page.locator('#shape').selectOption('none');
  await expect.poll(()=>page.evaluate(()=>!window.flowSim.busy && window.flowSim.solver.solidCount===0)).toBe(true);
  await page.locator('#reset').click();
  await expect(page.locator('#legend-range')).toContainText('Uniform fluid');
  const uniform=await page.evaluate(()=>{
    const f=window.flowSim,a=f.points.geometry.attributes.color.array;
    return {range:f.colorRange,colors:new Set(Array.from({length:a.length/3},(_,i)=>Array.from(a.slice(i*3,i*3+3)).join(','))).size};
  });
  expect(uniform.range.uniform).toBe(true);
  expect(uniform.colors).toBe(1);
  expect(uniform.range.histogram.filter(n=>n>0)).toHaveLength(1);
  await expect(page.locator('#error')).toBeEmpty();
  expect(errors).toEqual([]);
});
