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

// Nine deliberately separated sRGB stops. Speed is warm at low values;
// deviation and curl reverse the order, not the scalar definition.
export const SPEED_PALETTE = ['#b50924', '#ff6500', '#ffe600', '#9fff00', '#00a65a', '#00e5ff', '#0074ff', '#4020c8', '#d75bff'];
export const FIELD_MODES = {
  speed: { title: 'Speed |u|', units: 'normalized velocity', max: 1.8, limit: 4, step: .1, low: 'Slow / stagnation', mid: 'Intermediate speed', high: 'Fast', note: 'Red / orange = slow or near-stagnant fluid, not a true blockage detector. Ivory = solid geometry, not a field value.' },
  disturbance: { title: 'Inlet deviation ‖u − Uin eₓ‖ / Uin', units: 'dimensionless', max: 1, limit: 3, step: .1, low: 'Inlet-like', mid: 'Moderate deviation', high: 'Strong deviation', note: 'Red / orange = larger velocity deviation from the uniform inlet, including slowing and deflection. Not turbulence intensity, pressure or blockage.' },
  vorticity: { title: 'Vorticity |∇ × u|', units: '1 / normalized sim time', max: 8, limit: 40, step: .5, low: 'Low rotation', mid: 'Moderate rotation', high: 'High rotation', note: 'Red / orange = larger curl magnitude from all three velocity components. Coarse-grid rotation / shear indicator, not a turbulence or load prediction.' },
};
export function fieldPalette(mode = 'speed') {
  return mode === 'speed' ? [...SPEED_PALETTE] : [...SPEED_PALETTE].reverse();
}
export function normalizedColor(value, range) {
  const v = Number.isFinite(value) ? value : range.min;
  // No tiny artificial range / noise amplification for a truly uniform field.
  if (range.uniform) return range.actualMax <= 1e-7 ? 0 : .5;
  const t = Math.max(0, Math.min(1, (v-range.min)/Math.max(range.max-range.min, 1e-12)));
  return t ** (range.gamma ?? 1);
}
export function colorRGB(value, maximum, mode = 'speed') {
  // Numeric maximum preserves the public fixed, continuous, linear mapping API.
  const range = typeof maximum === 'number' ? {min:0, max:maximum, gamma:1, bands:false} : maximum;
  let t = normalizedColor(value, range);
  const palette = fieldPalette(mode), last = palette.length-1;
  if (range.bands) t = Math.min(last, Math.floor(t*palette.length))/last;
  const p=t*last, i=Math.min(last-1, Math.floor(p)), f=p-i;
  const a=parseInt(palette[i].slice(1),16), b=parseInt(palette[i+1].slice(1),16);
  return [16,8,0].map(shift => (((a>>shift)&255)*(1-f)+((b>>shift)&255)*f)/255);
}

// Exact robust quantiles of finite INTERIOR FLUID cells only. Ghost cells and
// obstacle interiors never influence range, clipping counts or histogram.
export function computeColorRange(values, solver, {auto=true, maximum=1.8, gamma=.65, bands=true} = {}) {
  const samples=[];
  for(let z=1;z<solver.nz-1;z++) for(let y=1;y<solver.ny-1;y++) for(let x=1;x<solver.nx-1;x++) {
    const i=solver.idx(x,y,z), v=values[i];
    if(!solver.solid[i] && Number.isFinite(v)) samples.push(v);
  }
  const sorted=Float64Array.from(samples).sort(), count=sorted.length;
  const actualMin=count ? sorted[0] : 0, actualMax=count ? sorted[count-1] : 0;
  const uniform=actualMax-actualMin <= 1e-7*Math.max(1,Math.abs(actualMin),Math.abs(actualMax));
  const quantile=p=> {
    const pos=(count-1)*p, lo=Math.floor(pos), f=pos-lo;
    return sorted[lo]*(1-f)+sorted[Math.min(lo+1,count-1)]*f;
  };
  let min=auto && count ? quantile(.05) : 0, max=auto && count ? quantile(.95) : Math.max(maximum,1e-6);
  // If the central 90% is identical but real tails vary, expose their actual
  // extent rather than treating the whole domain as uniform or dividing by zero.
  if(auto && max-min <= 1e-7*Math.max(1,Math.abs(max))) {min=actualMin; max=actualMax;}
  const range={min,max,actualMin,actualMax,count,uniform:auto && uniform,auto,
    gamma:Math.max(.1,Math.min(4,Number.isFinite(gamma)?gamma:1)),bands,
    clippedLow:0,clippedHigh:0,histogram:Array(9).fill(0)};
  for(const v of sorted) {
    if(v<min) range.clippedLow++;
    if(v>max) range.clippedHigh++;
    range.histogram[Math.min(8,Math.floor(normalizedColor(v,range)*9))]++;
  }
  return range;
}
