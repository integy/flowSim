import { test, expect } from "@playwright/test";
const stl = `solid tetra\n${[
  [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, 0],
    [0, 0, 1],
    [1, 0, 0],
  ],
  [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
]
  .map(
    (t) =>
      "facet normal 0 0 0\nouter loop\n" +
      t.map((v) => "vertex " + v.join(" ")).join("\n") +
      "\nendloop\nendfacet",
  )
  .join("\n")}\nendsolid`;
test("real WebGL 3D flow with uploaded geometry, transforms, all media and slices", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#sim-time")).not.toHaveText("0.00");
  await expect(page.locator("#flow")).toBeVisible();
  expect(
    await page.evaluate(() => window.flowSim.renderer.info.render.calls),
  ).toBeGreaterThan(0);
  await page
    .locator("#stl-file")
    .setInputFiles({
      name: "tetra.stl",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(stl),
    });
  await expect(page.locator("#upload-status")).toContainText("tetra.stl");
  await expect(page.locator("#shape")).toHaveValue("stl");
  const before = await page.evaluate(() =>
    Array.from(window.flowSim.solver.solid).join(""),
  );
  await page.locator("#ry").fill("63");
  await page.locator("#ry").dispatchEvent("change");
  await expect
    .poll(() =>
      page.evaluate(() => Array.from(window.flowSim.solver.solid).join("")),
    )
    .not.toBe(before);
  for (const m of ["water", "oil", "air"]) {
    await page.locator(`[data-medium=${m}]`).click();
    await expect(page.locator("#medium-name")).toHaveText(
      m[0].toUpperCase() + m.slice(1),
    );
  }
  for (const axis of ["x", "y", "z"])
    await page.locator("#slice-axis").selectOption(axis);
  await page.locator("#pause").click();
  await expect(page.locator("#status")).toHaveText("PAUSED");
  const time = await page.locator("#sim-time").innerText();
  await page.locator("#step").click();
  await expect(page.locator("#sim-time")).not.toHaveText(time);
  await page.locator("#reset").click();
  await expect(page.locator("#sim-time")).toHaveText("0.00");
  const camera = await page.evaluate(() =>
    window.flowSim.camera.position.toArray(),
  );
  await page.locator("#flow").hover();
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(580, 460, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.flowSim.camera.position.toArray()),
  ).not.toEqual(camera);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/flow3d-desktop.png" });
});
test("mobile viewport has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#sim-time")).not.toHaveText("0.00");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page.locator("#flow")).toBeVisible();
  await page.screenshot({ path: "test-results/flow3d-mobile.png" });
});
