import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Fluid3D } from "./fluid3d.js";
import { parseSTL, transformTriangles, voxelize, MAX_BYTES } from "./stl.js";
import { MEDIA, physicalMetrics, simulationParameters } from "./physics.js";
const $ = (id) => document.getElementById(id),
  solver = new Fluid3D(),
  aspect = (solver.nx - 2) / (solver.ny - 2),
  width = aspect * 2;
let medium = "air",
  paused = false,
  uploaded = null,
  obstacle = null,
  last = 0,
  frames = 0;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#07111d");
scene.fog = new THREE.FogExp2("#07111d", 0.035);
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
const renderer = new THREE.WebGLRenderer({
  canvas: $("flow"),
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setClearColor("#07111d");
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 16;
function resetCamera() {
  camera.position.set(4, 2.9, 4.9);
  controls.target.set(0, 0, 0);
  controls.update();
}
resetCamera();
scene.add(new THREE.HemisphereLight("#b6e6ff", "#172e3d", 2.7));
const light = new THREE.DirectionalLight("#e6f7ff", 3);
light.position.set(-3, 5, 4);
scene.add(light);
const box = new THREE.BoxGeometry(width, 2, 2);
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(box),
  new THREE.LineBasicMaterial({
    color: "#3a697f",
    transparent: true,
    opacity: 0.6,
  }),
);
scene.add(outline);
box.dispose();
const floor = new THREE.GridHelper(width, 20, "#25495a", "#142c3f");
floor.position.y = -1.01;
scene.add(floor);
const axes = new THREE.AxesHelper(0.45);
axes.position.set(-width / 2, -1, -1);
scene.add(axes);
for (const x of [-width / 2, width / 2]) {
  const geo = new THREE.PlaneGeometry(2, 2),
    mat = new THREE.MeshBasicMaterial({
      color: x < 0 ? "#4acdb1" : "#4c81cc",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
    });
  const p = new THREE.Mesh(geo, mat);
  p.rotation.y = Math.PI / 2;
  p.position.x = x;
  scene.add(p);
}
const arrow = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-width / 2 - 0.15, 0, 0),
  0.7,
  0x78e5c5,
  0.18,
  0.12,
);
scene.add(arrow);
const particleCount = 3600,
  positions = new Float32Array(particleCount * 3),
  colors = new Float32Array(particleCount * 3),
  particles = new Float32Array(particleCount * 3),
  ages = new Float32Array(particleCount);
const pg = new THREE.BufferGeometry();
pg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
pg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
const points = new THREE.Points(
  pg,
  new THREE.PointsMaterial({
    size: 0.023,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  }),
);
scene.add(points);
const trailPositions = new Float32Array(particleCount * 6),
  tg = new THREE.BufferGeometry();
tg.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
const trails = new THREE.LineSegments(
  tg,
  new THREE.LineBasicMaterial({
    color: "#5ecdc6",
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  }),
);
scene.add(trails);
function seed(i, anywhere = false) {
  const o = i * 3;
  let tries = 0;
  do {
    particles[o] = anywhere ? Math.random() : 0.006;
    particles[o + 1] = 0.025 + Math.random() * 0.95;
    particles[o + 2] = 0.025 + Math.random() * 0.95;
  } while (solver.isSolid(...particles.subarray(o, o + 3)) && ++tries < 20);
  ages[i] = Math.random() * 5;
}
function reseed() {
  for (let i = 0; i < particleCount; i++) seed(i, true);
}
const sliceGeo = new THREE.BufferGeometry(),
  sliceN = 40,
  slicePos = new Float32Array(sliceN * sliceN * 3),
  sliceCol = new Float32Array(sliceN * sliceN * 3);
sliceGeo.setAttribute("position", new THREE.BufferAttribute(slicePos, 3));
sliceGeo.setAttribute("color", new THREE.BufferAttribute(sliceCol, 3));
const sliceMesh = new THREE.Points(
  sliceGeo,
  new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.53,
    depthWrite: false,
  }),
);
scene.add(sliceMesh);
const color = new THREE.Color();
function speedColor(s) {
  color.setHSL(
    0.61 - Math.min(1, s / 1.8) * 0.52,
    0.76,
    0.4 + Math.min(1, s / 1.8) * 0.22,
  );
  return color;
}
function renderField(dt) {
  for (let i = 0; i < particleCount; i++) {
    const o = i * 3;
    let x = particles[o],
      y = particles[o + 1],
      z = particles[o + 2];
    const vel = solver.sample(x, y, z);
    const speed = Math.hypot(...vel);
    if (dt) {
      x += (vel[0] * dt) / aspect;
      y += vel[1] * dt;
      z += vel[2] * dt;
      ages[i] += dt;
      if (
        x > 1 ||
        x < 0 ||
        y < 0 ||
        y > 1 ||
        z < 0 ||
        z > 1 ||
        solver.isSolid(x, y, z) ||
        ages[i] > 18
      ) {
        seed(i);
        x = particles[o];
        y = particles[o + 1];
        z = particles[o + 2];
      }
      particles[o] = x;
      particles[o + 1] = y;
      particles[o + 2] = z;
    }
    const px = (x - 0.5) * width,
      py = (y - 0.5) * 2,
      pz = (z - 0.5) * 2;
    positions.set([px, py, pz], o);
    const c = speedColor(speed);
    colors.set([c.r, c.g, c.b], o);
    trailPositions.set(
      [
        px - vel[0] * 0.065,
        py - vel[1] * 0.065,
        pz - vel[2] * 0.065,
        px,
        py,
        pz,
      ],
      i * 6,
    );
  }
  pg.attributes.position.needsUpdate = true;
  pg.attributes.color.needsUpdate = true;
  tg.attributes.position.needsUpdate = true;
  points.visible = trails.visible = $("tracers").checked;
  sliceMesh.visible = $("slice").checked;
  if (sliceMesh.visible) {
    const axis = $("slice-axis").value,
      p = +$("slice-position").value;
    for (let j = 0; j < sliceN; j++)
      for (let i = 0; i < sliceN; i++) {
        const a = (i + 0.5) / sliceN,
          b = (j + 0.5) / sliceN;
        const [x, y, z] =
          axis === "x" ? [p, a, b] : axis === "y" ? [a, p, b] : [a, b, p];
        const o = (i + sliceN * j) * 3;
        slicePos.set([(x - 0.5) * width, (y - 0.5) * 2, (z - 0.5) * 2], o);
        const s = Math.hypot(...solver.sample(x, y, z)),
          c = speedColor(s);
        sliceCol.set(
          solver.isSolid(x, y, z) ? [0.03, 0.05, 0.07] : [c.r, c.g, c.b],
          o,
        );
      }
    sliceGeo.attributes.position.needsUpdate = true;
    sliceGeo.attributes.color.needsUpdate = true;
  }
}
function geometryTriangles(g) {
  const p = g.getAttribute("position"),
    idx = g.index,
    arr = new Float32Array((idx ? idx.count : p.count) * 3);
  for (let i = 0; i < arr.length / 3; i++) {
    const j = idx ? idx.getX(i) : i;
    arr.set([p.getX(j), p.getY(j), p.getZ(j)], i * 3);
  }
  return arr;
}
const sphereGeo = new THREE.SphereGeometry(1, 24, 16),
  boxGeo = new THREE.BoxGeometry(1, 1, 1),
  builtins = {
    sphere: geometryTriangles(sphereGeo),
    box: geometryTriangles(boxGeo),
  };
sphereGeo.dispose();
boxGeo.dispose();
function rebuild() {
  const shape = $("shape").value;
  let triangles = shape === "stl" ? uploaded?.triangles : builtins[shape];
  if (obstacle) {
    scene.remove(obstacle);
    obstacle.geometry.dispose();
    obstacle.material.dispose();
    obstacle = null;
  }
  solver.solid.fill(0);
  if (triangles) {
    const t = transformTriangles(triangles, {
      scale: +$("size").value,
      rx: (+$("rx").value * Math.PI) / 180,
      ry: (+$("ry").value * Math.PI) / 180,
      rz: (+$("rz").value * Math.PI) / 180,
      aspect,
    });
    solver.solid = voxelize(t, solver.nx, solver.ny, solver.nz);
    const vertices = new Float32Array(t.length);
    for (let i = 0; i < t.length; i += 3) {
      vertices[i] = (t[i] - 0.5) * width;
      vertices[i + 1] = (t[i + 1] - 0.5) * 2;
      vertices[i + 2] = (t[i + 2] - 0.5) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    obstacle = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color: "#b7cedb",
        metalness: 0.35,
        roughness: 0.3,
        side: THREE.DoubleSide,
      }),
    );
    scene.add(obstacle);
  }
  solver.solidCount = solver.solid.reduce((a, b) => a + b, 0);
  $("voxel-count").textContent =
    `${solver.solidCount.toLocaleString()} solid voxels · ${triangles ? triangles.length / 9 : 0} triangles${triangles && !solver.solidCount ? " · Too small for this grid!" : ""}`;
  $("solid-metric").textContent = solver.solidCount.toLocaleString();
  solver.reset();
  reseed();
  metrics();
}
function metrics() {
  const speed = +$("speed").value,
    L = +$("length").value,
    m = MEDIA[medium],
    p = physicalMetrics(medium, speed, L);
  $("medium-name").textContent = m.name;
  $("medium-note").textContent = m.note;
  $("density").textContent = `${m.density} kg/m³`;
  $("viscosity").textContent = `${m.viscosity.toExponential(2)} Pa·s`;
  $("reynolds").textContent = Math.round(p.reynolds).toLocaleString();
  $("speed-value").textContent = `${speed.toFixed(1)} m/s`;
  $("length-value").textContent = `${L.toFixed(2)} m`;
  $("size-value").textContent = `${Math.round(+$("size").value * 100)}% H`;
  for (const k of ["rx", "ry", "rz"])
    $(k + "-value").textContent = $(k).value + "°";
  $("sim-time").textContent = solver.time.toFixed(2);
}
for (const button of document.querySelectorAll("[data-medium]"))
  button.onclick = () => {
    medium = button.dataset.medium;
    document
      .querySelectorAll("[data-medium]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    solver.inlet = simulationParameters(medium, +$("speed").value).inlet;
    solver.reset();
    reseed();
    metrics();
  };
$("speed").oninput = () => {
  solver.inlet = simulationParameters(medium, +$("speed").value).inlet;
  solver.reset();
  metrics();
};
$("length").oninput = metrics;
let debounce;
for (const id of ["shape", "size", "rx", "ry", "rz"]) {
  $(id).addEventListener("input", () => {
    metrics();
    clearTimeout(debounce);
    debounce = setTimeout(rebuild, 120);
  });
  $(id).addEventListener("change", () => {
    clearTimeout(debounce);
    rebuild();
  });
}
$("stl-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const old = uploaded;
  try {
    if (file.size > MAX_BYTES) throw Error("STL exceeds 12 MB limit.");
    $("upload-status").textContent = "Reading and voxelizing…";
    uploaded = parseSTL(await file.arrayBuffer());
    $("shape").querySelector("[value=stl]").disabled = false;
    $("shape").value = "stl";
    for (const id of ["rx", "ry", "rz"]) $(id).value = 0;
    rebuild();
    $("upload-status").textContent =
      `${file.name} · ${uploaded.triangles.length / 9} triangles · ${uploaded.openEdges ? `WARNING: ${uploaded.openEdges} open / non-manifold edges; interior may be invalid.` : "Closed mesh · voxelized"}`;
  } catch (err) {
    uploaded = old;
    $("upload-status").textContent = "Upload rejected: " + err.message;
  }
};
$("pause").onclick = () => {
  paused = !paused;
  $("pause").textContent = paused ? "Play" : "Pause";
  $("status").textContent = paused ? "PAUSED" : "RUNNING";
  $("step").disabled = !paused;
};
function tick() {
  solver.step(0.03, simulationParameters(medium, +$("speed").value));
  metrics();
}
$("step").onclick = () => {
  tick();
  renderField(0.03);
};
$("reset").onclick = () => {
  solver.reset();
  reseed();
  metrics();
  renderField(0);
};
$("camera").onclick = resetCamera;
function resize() {
  const r = $("viewport").getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($("viewport"));
resize();
rebuild();
window.flowSim = {
  solver,
  renderer,
  camera,
  scene,
  get obstacle() {
    return obstacle;
  },
  get medium() {
    return medium;
  },
  get uploaded() {
    return uploaded;
  },
};
function animate(now) {
  requestAnimationFrame(animate);
  const elapsed = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    if (!paused) {
      tick();
      renderField(0.03);
    } else renderField(0);
    if (frames++ % 20 === 0)
      $("divergence").textContent = solver.divergence().toExponential(2);
    controls.update();
    renderer.render(scene, camera);
  } catch (e) {
    paused = true;
    $("error").textContent = "Simulation stopped: " + e.message;
    console.error(e);
  }
}
requestAnimationFrame(animate);
