import { test, expect } from '@playwright/test';

test('complete desktop experiment: media, solver, controls, persistence and exports',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('See the invisible');
  await expect.poll(()=>page.evaluate(()=>window.flowSim?.time||0)).toBeGreaterThan(0.1);
  for(const medium of ['water','oil','air']) {
    await page.getByRole('button',{name:medium[0].toUpperCase()+medium.slice(1),exact:true}).click();
    await expect(page.locator('#medium-name')).toHaveText(medium==='air'?'Air':medium==='oil'?'Oil':'Water');
    await expect.poll(()=>page.evaluate(()=>window.flowSim.time)).toBeGreaterThan(0.04);
    expect(await page.evaluate(()=>window.flowSim.finite)).toBeTruthy();
  }
  await page.getByLabel('Inlet speed').fill('4');await page.getByLabel('Inlet speed').dispatchEvent('input');
  await page.getByLabel('Characteristic length').fill('0.4');await page.getByLabel('Characteristic length').dispatchEvent('input');
  await expect(page.locator('#reynolds')).toHaveText('106,431');
  for(const shape of ['square','diamond','foil','none','circle']) await page.getByLabel('Obstacle shape').selectOption(shape);
  await page.getByLabel('Obstacle size').fill('0.3');await page.getByLabel('Obstacle size').dispatchEvent('input');
  for(const name of ['Velocity','Vorticity','Dye']) await page.getByRole('button',{name,exact:true}).click();
  await page.getByLabel('Show tracers').uncheck();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const time=await page.evaluate(()=>window.flowSim.time);await page.waitForTimeout(200);
  expect(await page.evaluate(()=>window.flowSim.time)).toBe(time);
  await page.getByRole('button',{name:'Step',exact:true}).click();
  expect(await page.evaluate(()=>window.flowSim.time)).toBeGreaterThan(time);
  const box=await page.locator('canvas#flow').boundingBox();
  await page.mouse.move(box.x+box.width*0.6,box.y+box.height*0.4);await page.mouse.down();
  await page.mouse.move(box.x+box.width*0.65,box.y+box.height*0.6,{steps:5});await page.mouse.up();
  expect(await page.evaluate(()=>window.flowSim.stirs)).toBeGreaterThan(0);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG'}).click();
  expect((await downloadPromise).suggestedFilename()).toBe('flowSim.png');
  const jsonPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export settings'}).click();
  expect((await jsonPromise).suggestedFilename()).toBe('flowSim-settings.json');
  await page.reload();await expect(page.getByLabel('Inlet speed')).toHaveValue('4');await expect(page.getByLabel('Show tracers')).not.toBeChecked();
  await page.getByRole('button',{name:'Reset flow',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.flowSim.time)).toBeLessThan(0.5);
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/desktop.png',fullPage:true});
});

test('mobile layout, touch controls, documentation and storage failure resilience',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();await page.goto('/');
  await page.getByRole('button',{name:'Water',exact:true}).tap();
  await expect(page.locator('#medium-note')).toContainText('fully submerged');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'Vorticity',exact:true}).tap();
  await page.getByRole('button',{name:'Pause',exact:true}).tap();
  await page.getByText('How this model works', {exact:false}).click();
  await expect(page.getByText('No free surface', {exact:false})).toBeVisible();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  await context.close();
  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});});
  const fallback=await blocked.newPage();await fallback.goto('/');
  await expect.poll(()=>fallback.evaluate(()=>window.flowSim?.time||0)).toBeGreaterThan(0.05);await blocked.close();
});
