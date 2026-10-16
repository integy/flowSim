# flowSim

An interactive browser-based fluid tunnel for exploring flow around obstacles in **air, water and oil**.

**Website: https://integy.github.io/flowSim/**

Conceptually inspired by [GENAir](https://alphalch.github.io/GENAir/). This is an independently written implementation, not a copy of GENAir's code, and is not affiliated with its author.

## Explore

- Switch between air, fresh water and illustrative light oil with different density and viscosity presets.
- Change inlet speed, characteristic length and obstacle size.
- Compare circular, square, diamond and foil-shaped obstacles, or an empty channel.
- Display velocity, vorticity or passive dye, with optional tracer particles.
- Drag in the flow field to stir; pause, advance one step or reset.
- Export the canvas as PNG and download settings as JSON. Settings are remembered locally when browser storage is available.
- Responsive desktop and mobile controls; no account, server or CDN dependencies.

## Model and limitations

This is a **2D educational, single-phase incompressible flow simulation**, not a validated engineering CFD package or a 3D LES solver. It uses a numerical grid, semi-Lagrangian advection, implicit viscous diffusion and iterative pressure projection, with solid obstacle boundaries. Dye and tracer particles visualize the computed velocity field.

Water means **fully submerged flow**: there is no free surface, wave generation, splashing, buoyancy or air–water interface. Oil properties are illustrative; temperature is not simulated. Foil shapes do not imply validated aerodynamic predictions.

The displayed physical Reynolds number is computed as `Re = density × inlet speed × characteristic length / dynamic viscosity`. Representative air/water properties are near 20 °C. To keep the simulation interactive on a small browser grid, inlet speed and kinematic viscosity are deliberately mapped into normalized solver units, including logarithmic viscosity compression. Therefore the displayed SI Reynolds number is contextual, **not the solver's effective Reynolds number**. Density is used for physical metrics, not multiphase dynamics. No quantitative lift/drag or engineering accuracy is claimed.

## Run locally

```sh
python3 -m http.server 8080
```

Open http://localhost:8080/. Use an HTTP server rather than opening the file directly, because the JavaScript uses ES modules.

## Tests

Node.js is required only for development tests, not for serving the website.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Numerical tests check finite bounded flow for all medium/obstacle combinations, solid boundaries, pressure-projection divergence reduction, viscosity damping, dye transport and physical metric calculations. Browser tests exercise desktop/mobile controls, settings persistence, exports, pointer stirring and operation with blocked local storage. These are implementation checks, not experimental validation of CFD accuracy.

## Files

- `index.html`, `style.css`: interface and responsive layout.
- `app.js`: rendering, interaction, exports and persistence.
- `solver.js`: numerical flow solver.
- `physics.js`: media properties, SI metrics and normalized parameter mapping.
- `tests/`: numerical and browser tests.

## Deployment

GitHub Pages serves the `main` branch root. There is no build step; pushing website changes to `main` publishes them after the Pages deployment finishes.

## Rights

No license has been selected for this repository. GENAir is referenced as conceptual inspiration only; its source code and assets are not redistributed here.
