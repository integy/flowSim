// Three-dimensional MAC (face-staggered) incompressible display solver.
export class Fluid3D {
  constructor(nx = 40, ny = 24, nz = 24) {
    Object.assign(this, {
      nx,
      ny,
      nz,
      n: nx * ny * nz,
      h: 1 / (ny - 2),
      time: 0,
      inlet: 0.67,
    });
    for (const k of ["u", "v", "w", "p", "q", "div", "a", "b", "c"])
      this[k] = new Float32Array(this.n);
    this.solid = new Uint8Array(this.n);
    this.solidCount = 0;
    this.reset();
  }
  idx(x, y, z) {
    return x + this.nx * (y + this.ny * z);
  }
  each(fn) {
    for (let z = 1; z < this.nz - 1; z++)
      for (let y = 1; y < this.ny - 1; y++)
        for (let x = 1; x < this.nx - 1; x++) fn(this.idx(x, y, z), x, y, z);
  }
  setObstacle(fn) {
    this.solid.fill(0);
    this.solidCount = 0;
    this.each((i, x, y, z) => {
      if (
        fn(
          (x - 0.5) / (this.nx - 2),
          (y - 0.5) / (this.ny - 2),
          (z - 0.5) / (this.nz - 2),
        )
      ) {
        this.solid[i] = 1;
        this.solidCount++;
      }
    });
    this.reset();
  }
  reset() {
    this.u.fill(this.inlet);
    this.v.fill(0);
    this.w.fill(0);
    this.p.fill(0);
    this.time = 0;
    this.boundaries();
  }
  boundaries() {
    const { nx, ny, nz, solid: s, u, v, w } = this;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const i = this.idx(x, y, z);
          if (x === 0 || x === nx - 2) u[i] = this.inlet;
          if (y === 0 || y >= ny - 2) v[i] = 0;
          if (z === 0 || z >= nz - 2) w[i] = 0;
          if (x >= nx - 1) u[i] = this.inlet;
          if (s[i] || (x < nx - 1 && s[i + 1])) u[i] = 0;
          if (s[i] || (y < ny - 1 && s[i + nx])) v[i] = 0;
          if (s[i] || (z < nz - 1 && s[i + nx * ny])) w[i] = 0;
        }
  }
  divergence() {
    let sum = 0,
      n = 0;
    this.each((i) => {
      if (!this.solid[i]) {
        const d =
          (this.u[i] -
            this.u[i - 1] +
            this.v[i] -
            this.v[i - this.nx] +
            this.w[i] -
            this.w[i - this.nx * this.ny]) /
          this.h;
        sum += d * d;
        n++;
      }
    });
    return Math.sqrt(sum / Math.max(n, 1));
  }
  project(iterations = 28) {
    const { nx, ny, h, solid: s } = this,
      offsets = [-1, 1, -nx, nx, -nx * ny, nx * ny];
    this.p.fill(0);
    this.q.fill(0);
    this.each((i) => {
      this.div[i] =
        (this.u[i] -
          this.u[i - 1] +
          this.v[i] -
          this.v[i - nx] +
          this.w[i] -
          this.w[i - nx * ny]) *
        h;
    });
    for (let k = 0; k < iterations; k++) {
      const p = this.p,
        q = this.q;
      this.each((i, x, y, z) => {
        if (s[i]) return;
        let sum = 0,
          count = 0;
        for (let j = 0; j < 6; j++) {
          if (
            (j === 0 && x === 1) ||
            (j === 1 && x === this.nx - 2) ||
            (j === 2 && y === 1) ||
            (j === 3 && y === this.ny - 2) ||
            (j === 4 && z === 1) ||
            (j === 5 && z === this.nz - 2)
          )
            continue;
          const n = i + offsets[j];
          if (!s[n]) {
            sum += p[n];
            count++;
          }
        }
        q[i] = count ? (sum - this.div[i]) / count : 0;
      });
      this.p = q;
      this.q = p;
    }
    this.each((i, x, y, z) => {
      if (s[i]) return;
      const p = this.p;
      if (x < this.nx - 2 && !s[i + 1]) this.u[i] -= (p[i + 1] - p[i]) / h;
      if (y < this.ny - 2 && !s[i + nx]) this.v[i] -= (p[i + nx] - p[i]) / h;
      if (z < this.nz - 2 && !s[i + nx * ny])
        this.w[i] -= (p[i + nx * ny] - p[i]) / h;
    });
    this.boundaries();
  }
  interpolate(a, x, y, z) {
    x = Math.max(0.001, Math.min(this.nx - 1.001, x));
    y = Math.max(0.001, Math.min(this.ny - 1.001, y));
    z = Math.max(0.001, Math.min(this.nz - 1.001, z));
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z),
      fx = x - ix,
      fy = y - iy,
      fz = z - iz;
    let result = 0;
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++)
          result +=
            a[this.idx(ix + i, iy + j, iz + k)] *
            (i ? fx : 1 - fx) *
            (j ? fy : 1 - fy) *
            (k ? fz : 1 - fz);
    return result;
  }
  sample(x, y, z) {
    const gx = x * (this.nx - 2) + 0.5,
      gy = y * (this.ny - 2) + 0.5,
      gz = z * (this.nz - 2) + 0.5;
    return [
      this.interpolate(this.u, gx - 0.5, gy, gz),
      this.interpolate(this.v, gx, gy - 0.5, gz),
      this.interpolate(this.w, gx, gy, gz - 0.5),
    ];
  }
  isSolid(x, y, z) {
    if (x < 0 || x > 1 || y < 0 || y > 1 || z < 0 || z > 1) return false;
    return !!this.solid[
      this.idx(
        Math.min(this.nx - 2, Math.max(1, Math.floor(x * (this.nx - 2) + 1))),
        Math.min(this.ny - 2, Math.max(1, Math.floor(y * (this.ny - 2) + 1))),
        Math.min(this.nz - 2, Math.max(1, Math.floor(z * (this.nz - 2) + 1))),
      )
    ];
  }
  step(dt = 0.025, { inlet = this.inlet, viscosity = 0.0004 } = {}) {
    this.inlet = Math.max(0, Math.min(1.8, inlet));
    dt = Math.min(0.04, Math.max(0.001, dt));
    this.boundaries();
    const src = [this.u, this.v, this.w],
      dst = [this.a, this.b, this.c],
      nh = this.nx * this.ny;
    // Backtrace each staggered component through the full 3-vector field.
    for (let c = 0; c < 3; c++) {
      const a = src[c],
        b = dst[c];
      b.set(a);
      this.each((i, x, y, z) => {
        if (this.solid[i]) {
          b[i] = 0;
          return;
        }
        const px = x + (c === 0 ? 0.5 : 0),
          py = y + (c === 1 ? 0.5 : 0),
          pz = z + (c === 2 ? 0.5 : 0);
        const u = this.interpolate(src[0], px - 0.5, py, pz),
          v = this.interpolate(src[1], px, py - 0.5, pz),
          w = this.interpolate(src[2], px, py, pz - 0.5);
        b[i] = this.interpolate(
          a,
          x - (dt * u) / this.h,
          y - (dt * v) / this.h,
          z - (dt * w) / this.h,
        );
      });
    }
    [this.u, this.a] = [this.a, this.u];
    [this.v, this.b] = [this.b, this.v];
    [this.w, this.c] = [this.c, this.w];
    // Explicit diffusion with a bounded six-neighbor stability coefficient.
    const alpha = Math.min(
      1 / 6,
      (Math.max(0, viscosity) * dt) / (this.h * this.h),
    );
    for (const [field, tmp] of [
      [this.u, this.a],
      [this.v, this.b],
      [this.w, this.c],
    ]) {
      tmp.set(field);
      this.each((i) => {
        field[i] = Math.max(
          -3,
          Math.min(
            3,
            tmp[i] +
              alpha *
                (tmp[i - 1] +
                  tmp[i + 1] +
                  tmp[i - this.nx] +
                  tmp[i + this.nx] +
                  tmp[i - nh] +
                  tmp[i + nh] -
                  6 * tmp[i]),
          ),
        );
      });
    }
    this.boundaries();
    this.project();
    this.time += dt;
  }
}
