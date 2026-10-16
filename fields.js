// Reconstruct cell-centered velocity from MAC faces, then derive one scalar per cell.
// Curl uses solver.h (tunnel height = 1), not the stretched display coordinates.
export class DerivedField {
  constructor(solver) {
    this.solver = solver;
    this.values = new Float32Array(solver.n);
    this.velocity = [0,1,2].map(() => new Float32Array(solver.n));
  }
  update(mode = 'speed') {
    const s = this.solver, { nx, ny, nz, h } = s, nxy = nx * ny;
    const [u,v,w] = this.velocity, out = this.values;
    for(let z=0;z<nz;z++) for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
      const i=s.idx(x,y,z);
      u[i]=(s.u[i]+s.u[x ? i-1 : i])*.5;
      v[i]=(s.v[i]+s.v[y ? i-nx : i])*.5;
      w[i]=(s.w[i]+s.w[z ? i-nxy : i])*.5;
    }
    const inlet = Math.max(Math.abs(s.inlet), 1e-6);
    for(let z=0;z<nz;z++) for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
      const i=s.idx(x,y,z);
      if(mode === 'vorticity') {
        const l=x ? i-1 : i, r=x<nx-1 ? i+1 : i;
        const b=y ? i-nx : i, t=y<ny-1 ? i+nx : i;
        const back=z ? i-nxy : i, front=z<nz-1 ? i+nxy : i;
        const dx=(r-l)*h, dy=(t-b)/nx*h, dz=(front-back)/nxy*h;
        out[i]=Math.hypot((w[t]-w[b])/dy-(v[front]-v[back])/dz,
          (u[front]-u[back])/dz-(w[r]-w[l])/dx,
          (v[r]-v[l])/dx-(u[t]-u[b])/dy);
      } else out[i]= mode === 'disturbance'
        ? Math.hypot(u[i]-s.inlet,v[i],w[i])/inlet : Math.hypot(u[i],v[i],w[i]);
    }
    return this;
  }
  sample(x,y,z) {
    const s=this.solver;
    return s.interpolate(this.values,x*(s.nx-2)+.5,y*(s.ny-2)+.5,z*(s.nz-2)+.5);
  }
}

// Shared display mapping; RGB interpolation is explicitly in sRGB.
export const SPEED_PALETTE = ['#ff3b30', '#ff922b', '#ffe45c', '#53d769', '#20d9ef', '#438bff', '#8b5cf6'];
export const FIELD_MODES = {
  speed: { title: 'Speed |u|', units: 'normalized velocity', max: 1.8, limit: 4, step: .1, low: 'Slow / stagnation', mid: 'Intermediate speed', high: 'Fast', note: 'Red / orange = slow or near-stagnant fluid, not a true blockage detector. Ivory = solid geometry, not a field value.' },
  disturbance: { title: 'Inlet deviation ‖u − Uin eₓ‖ / Uin', units: 'dimensionless', max: 1, limit: 3, step: .1, low: 'Inlet-like', mid: 'Moderate deviation', high: 'Strong deviation', note: 'Red / orange = larger velocity deviation from the uniform inlet, including slowing and deflection. Not turbulence intensity, pressure or blockage.' },
  vorticity: { title: 'Vorticity |∇ × u|', units: '1 / normalized sim time', max: 8, limit: 40, step: .5, low: 'Low rotation', mid: 'Moderate rotation', high: 'High rotation', note: 'Red / orange = larger curl magnitude from all three velocity components. Coarse-grid rotation / shear indicator, not a turbulence or load prediction.' },
};
export function fieldPalette(mode = 'speed') {
  return mode === 'speed' ? [...SPEED_PALETTE] : [...SPEED_PALETTE].reverse();
}
export function colorRGB(value, maximum, mode = 'speed') {
  const p = Math.max(0, Math.min(1, (Number.isFinite(value) ? value : 0) / Math.max(maximum, 1e-6))) * 6;
  const i = Math.min(5, Math.floor(p)), f = p - i;
  const palette = fieldPalette(mode);
  const a = parseInt(palette[i].slice(1), 16), b = parseInt(palette[i + 1].slice(1), 16);
  return [16, 8, 0].map(shift => (((a >> shift) & 255) * (1-f) + ((b >> shift) & 255) * f) / 255);
}
