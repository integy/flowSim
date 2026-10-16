# flowSim — true 3D fluid laboratory

An original browser-based **three-dimensional** incompressible flow playground for air, water and illustrative light oil. Three.js presents a perspective tunnel, orbit/pan/zoom camera, 3D tracers and selectable XY/XZ/YZ velocity slices.

Website: https://integy.github.io/flowSim/ (deployment is separate from local development).

## Features

- A real **40 × 24 × 24 face-staggered velocity grid**, with three velocity components and a cell pressure field. Semi-Lagrangian advection, stable bounded explicit diffusion and iterative pressure projection evolve the field. Particles follow sampled computed velocity, not scripted stream paths.
- Upload **binary or ASCII STL** files locally. Geometry is centered and normalized; scale and X/Y/Z rotation controls update both the rendered triangle mesh and solver's solid mask.
- Actual triangle-ray intersections and parity determine solid voxels; this is **not a bounding-box obstacle approximation**. Upload status reports triangle count, non-manifold/open edge warnings and solid voxel count. Mesh display is smooth, while its fluid boundary is voxelized.
- Built-in sphere, box and empty tunnel. Medium/speed/geometry changes reset the field. Pause, step, reset flow and reset camera.
- A shared **seven-stop red → orange → yellow → green → cyan → blue → violet speed scale**: red/orange means slow or near-stagnant fluid, cool colors mean fast. This is not a true blockage detector. Particles, trails and the continuous slice share the same selected scalar mapping, range and explicit sRGB interpolation; neutral ivory always identifies solid geometry, not a scalar value. Opacities remain independent.
- Select **speed**, **inlet deviation** or **vorticity**. Each has its own remembered color maximum, low/mid/high numerical and descriptive legend, units and saturation (`+`) labels. Deviation and vorticity use the reversed palette: high values are warm. All values are normalized, not SI flow predictions.

### Color-field definitions

`fields.js` reconstructs cell-centered 3D velocity by averaging adjacent MAC faces. It derives scalar grids once per rendered frame, then trilinearly samples the same grid for particles, trails and slice vertices.

- **Speed:** `|u|`, normalized velocity; default color maximum 1.8 (adjustable 0.1–4). Red is zero speed, violet is the maximum and above.
- **Inlet deviation (disturbance):** `‖u − Uin eₓ‖ / max(|Uin|, 10⁻⁶)`, dimensionless; default maximum 1 (adjustable 0.1–3). Captures slowing, reversal and deflection relative to the uniform inlet. It is not temporal turbulence intensity or a blockage fraction.
- **Vorticity:** `|curl u|`, computed with central differences of all three reconstructed velocity components and actual solver spacing `h = 1/(ny−2)`; one-sided differences at outer grid boundaries. Units are inverse normalized simulation time, not Hz or physical s⁻¹. Default maximum 8 (adjustable 0.5–40). Neighboring solid velocities participate in finite differences; near-voxel-boundary shear is a coarse-grid diagnostic, not a resolved boundary layer or turbulence prediction.

Neither field is pressure, lift, drag or a true blockage measurement. Solid cells are shown in ivory in the slice. Values above the selected color maximum saturate without altering the solver.
- No runtime CDN, server API or node_modules dependency. The committed `app.bundle.js` includes Three.js and OrbitControls; the local `stl-worker.bundle.js` handles geometry. All URLs are relative for `/flowSim/` GitHub Pages hosting.

## Model and limitations

This is **educational normalized single-phase flow**, not validated engineering CFD, LES or a prediction of real turbulence/forces. There is no lift, drag or engineering pressure-load calculation. Approximate impermeable free-slip obstacle boundaries, voxel stair steps, fixed axial inlet/outlet, side walls and 28 Jacobi pressure iterations introduce error; the live RMS divergence exposes projection residual. Coarse resolution, bounded velocities and numerical diffusion prioritize browser stability, not physical accuracy. The simulation clock is normalized and runs with computational steps, not real elapsed physical time. CPU speed affects playback rate.

**Water is fully submerged. There is no water surface**, waves, splashing, buoyancy, gravity, compressibility, cavitation or multiphase interface. Oil is a constant-property illustrative light oil; temperature is not simulated.

SI metrics use representative properties near 20 °C and `Re = ρUL/μ`. Reference length L changes this metric only. Density does not create buoyancy. The display solver uses `inlet = 0.35 + 0.16U` and `ν_display = 0.000035 + 0.00032 log10(1 + ν_SI / 10⁻⁶)`; viscosity ordering is retained but **Reynolds similarity is not**. These are not SI solver speeds or viscosities.

STL uploads have **no fixed byte-size or triangle-count rejection**. Every triangle is retained for rendering and parity voxelization: there is no silent truncation, decimation or bounding-box replacement. Binary size must match its declared triangle count. Coordinates must be finite and have nonzero extent; missing/incomplete triangles remain invalid. Above 60,000 triangles, only the optional memory-intensive open/non-manifold edge diagnostic is skipped, with an explicit **watertightness unknown** warning. Smaller meshes use rounded welded edge positions; even a closed-edge result is not proof of watertightness.

Reading/parsing, transforms, face normals and voxelization run in a Web Worker. Geometry changes are debounced; superseded workers are terminated and stale responses ignored. The previous obstacle and flow remain usable until the new full mesh and mask are ready; status text and `aria-busy` expose background work. Failures retain the previous obstacle. Changing the selected shape cancels pending uploads. **Browser RAM, typed-array allocation and GPU limits still apply**: very large files can exhaust memory or take a long time, and final GPU upload/rendering still occurs on the main thread. This is not unlimited-capacity processing.

Closed, non-self-intersecting manifold meshes work best. Scanline parity handles triangle surfaces and shared-hit deduplication, but self-intersections, nested overlapping shells and unresolved features can yield invalid interiors. Details thinner than a voxel can disappear. The fluid boundary is still limited by the 40 × 24 × 24 grid, independently of retained mesh detail. Uploads never leave the browser.

## Run and build

```sh
# The already-committed bundle works without installing anything:
python3 -m http.server 8080
# Open http://localhost:8080/

# After changing JS source:
npm ci
npm run build
```

Commit both rebuilt `app.bundle.js` and `stl-worker.bundle.js` alongside source changes. GitHub Pages can serve the repository root as static files; no deployment build is required. Do not open via file://. Workers require HTTP(S); the worker URL resolves beside the app bundle, including under `/flowSim/`.

## Verification

```sh
npm test
npm run test:browser
```

Playwright configuration uses local Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; adapt `playwright.config.js` for another OS. Numerical tests cover 3D stability, projection reduction, impermeable face constraints, all medium mappings, actual binary/ASCII STL parsing and a tetrahedral voxel volume smaller than its bounding box. A generated closed subdivided tetrahedron has **262,144 distinct triangles and exceeds 12 MiB**: tests verify full parsing, actual file upload in Chrome, exact rendered triangle count, a non-box voxel interior, frame callbacks and working controls during processing, rotation rebuild and cancellation/latest-request behavior. ASCII parsing above 60,000 triangles is also tested. Browser tests additionally exercise shared palette endpoints, matching particle/trail colors, continuous slices and opacity controls, all three media, camera orbit, playback controls and a 390px mobile layout. Both root and `/flowSim/` worker resolution are tested. Screenshots are written under ignored `test-results/`. Tests are implementation checks, not experimental CFD validation.

## Source

- `fluid3d.js`: three-component MAC velocity solver.
- `stl.js`: full-geometry STL reader, normalization/rotation, optional edge checks and triangle-parity voxelizer.
- `stl-worker.js`, `stl-worker.bundle.js`: background geometry processing and generated local worker module.
- `fields.js`: cell-centered speed, inlet deviation, 3D curl, shared seven-stop palettes and scalar interpolation.
- `app.js`: Three.js scene, 3D particle advection, slices and UI.
- `app.bundle.js`: self-contained production module, generated by esbuild.
- `physics.js`: SI properties and explicit normalized mappings.
- `index.html`, `style.css`: responsive interface and limitations.
- `tests/`: numerical and browser regression tests. `solver.js` and its existing 2D regression tests are retained as legacy references only; the website imports exclusively `fluid3d.js`.

## Rights

Independently written implementation; no GENAir code or assets copied. Conceptual inspiration: [GENAir](https://alphalch.github.io/GENAir/) (not affiliated). Three.js is MIT-licensed; its license is retained in the generated bundle's legal comment and in `THIRD_PARTY_NOTICES.txt`. No license has been selected for this application's original source.
