// Original staggered (MAC) finite-difference incompressible flow solver.
// Positions / velocity use a normalized tunnel height of 1, not SI units.
export class Fluid {
  constructor(nx=160, ny=72, options={}) {
    this.nx=nx; this.ny=ny; this.h=1/ny;
    this.u=new Float32Array((nx+1)*ny);
    this.v=new Float32Array(nx*(ny+1));
    this.dye=new Float32Array(nx*ny);
    this.solid=new Uint8Array(nx*ny);
    this.inlet=options.inlet ?? 0.7;
    this.viscosity=options.viscosity ?? 0.0004;
    this.shape=options.shape ?? 'circle';
    this.size=options.size ?? 0.24;
    this.time=0;
    this.buildObstacle();
    this.u.fill(this.inlet);
    this.boundaries();
  }
  ui(x,y) { return x+(this.nx+1)*y; }
  vi(x,y) { return x+this.nx*y; }
  blocked(x,y) {
    if(y<0 || y>=this.ny) return true;
    if(x<0 || x>=this.nx) return false;
    return !!this.solid[x+this.nx*y];
  }
  buildObstacle() {
    const cx=this.nx*this.h*0.34, cy=0.5, r=this.size/2;
    for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++) {
      const dx=(x+0.5)*this.h-cx, dy=(y+0.5)*this.h-cy;
      let inside=false;
      if(this.shape==='circle') inside=dx*dx+dy*dy<r*r;
      if(this.shape==='square') inside=Math.abs(dx)<r && Math.abs(dy)<r;
      if(this.shape==='diamond') inside=Math.abs(dx)+Math.abs(dy)<r*1.35;
      if(this.shape==='foil') { const t=(dx+r*1.8)/(r*3.6); inside=t>0 && t<1 && Math.abs(dy)<r*0.65*Math.sin(Math.PI*t)**0.7; }
      this.solid[x+this.nx*y]=inside?1:0;
    }
  }
  boundaries() {
    const {nx,ny,u,v}=this;
    for(let y=0;y<ny;y++) for(let x=0;x<=nx;x++) {
      const i=this.ui(x,y);
      if(this.blocked(x-1,y)||this.blocked(x,y)) u[i]=0;
      else if(x===0) u[i]=this.inlet;
    }
    for(let y=0;y<=ny;y++) for(let x=0;x<nx;x++) {
      if(this.blocked(x,y-1)||this.blocked(x,y)) v[this.vi(x,y)]=0;
    }
  }
  sample(field, x, y, kind='dye') {
    const w=kind==='u'?this.nx+1:this.nx, h=kind==='v'?this.ny+1:this.ny;
    x=x/this.h-(kind==='u'?0:0.5); y=y/this.h-(kind==='v'?0:0.5);
    x=Math.max(0,Math.min(w-1.001,x)); y=Math.max(0,Math.min(h-1.001,y));
    const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
    return (1-fy)*((1-fx)*field[ix+w*iy]+fx*field[ix+1+w*iy])+fy*((1-fx)*field[ix+w*(iy+1)]+fx*field[ix+1+w*(iy+1)]);
  }
  velocity(x,y) { return [this.sample(this.u,x,y,'u'),this.sample(this.v,x,y,'v')]; }
  diffuse(dt) {
    const a=dt*this.viscosity/(this.h*this.h);
    for(const [field,w,h] of [[this.u,this.nx+1,this.ny],[this.v,this.nx,this.ny+1]]) {
      const source=field.slice();
      for(let k=0;k<12;k++) {
        for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
          const i=x+w*y;
          field[i]=(source[i]+a*(field[i-1]+field[i+1]+field[i-w]+field[i+w]))/(1+4*a);
        }
        this.boundaries();
      }
    }
  }
  advect(dt) {
    const oldU=this.u.slice(),oldV=this.v.slice(),oldD=this.dye.slice();
    const backtrace=(x,y)=>{
      const ux=this.sample(oldU,x,y,'u'),vy=this.sample(oldV,x,y,'v');
      const mx=x-0.5*dt*ux,my=y-0.5*dt*vy;
      let bx=x-dt*this.sample(oldU,mx,my,'u'),by=y-dt*this.sample(oldV,mx,my,'v');
      // Clip characteristics before an obstacle: dye must not teleport through it.
      const count=Math.max(1,Math.ceil(Math.hypot(bx-x,by-y)/this.h*2));
      for(let k=1;k<=count;k++) {
        const px=x+(bx-x)*k/count,py=y+(by-y)*k/count;
        if(this.blocked(Math.floor(px/this.h),Math.floor(py/this.h))) {bx=x+(bx-x)*(k-1)/count;by=y+(by-y)*(k-1)/count;break;}
      }
      return [bx,by];
    };
    for(let y=0;y<this.ny;y++) for(let x=0;x<=this.nx;x++) {
      const p=backtrace(x*this.h,(y+0.5)*this.h);
      this.u[this.ui(x,y)]=this.sample(oldU,...p,'u');
    }
    for(let y=0;y<=this.ny;y++) for(let x=0;x<this.nx;x++) {
      const p=backtrace((x+0.5)*this.h,y*this.h);
      this.v[this.vi(x,y)]=this.sample(oldV,...p,'v');
    }
    for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++) {
      const i=x+this.nx*y;
      if(this.solid[i]) {this.dye[i]=0;continue;}
      const p=backtrace((x+0.5)*this.h,(y+0.5)*this.h);
      this.dye[i]=this.sample(oldD,...p)*Math.exp(-dt*0.08);
    }
    this.boundaries();
  }
  stir(x,y,dx,dy) {
    const r=0.065;
    for(let j=Math.max(1,Math.floor((y-r)/this.h));j<Math.min(this.ny-1,(y+r)/this.h);j++)
      for(let i=Math.max(1,Math.floor((x-r)/this.h));i<Math.min(this.nx-1,(x+r)/this.h);i++) {
        if(this.blocked(i,j))continue;
        const d=Math.hypot((i+0.5)*this.h-x,(j+0.5)*this.h-y),w=Math.max(0,1-d/r);
        this.u[this.ui(i,j)]+=Math.max(-2,Math.min(2,dx))*w;
        this.v[this.vi(i,j)]+=Math.max(-2,Math.min(2,dy))*w;
        this.dye[i+this.nx*j]=Math.max(this.dye[i+this.nx*j],w);
      }
    this.boundaries();
  }
  step(dt=1/60) {
    // Fixed bounded timestep: rendering rate never changes numerical dt.
    dt=Math.max(0.001,Math.min(1/30,dt));
    this.diffuse(dt);
    this.advect(dt);
    this.project(dt);
    for(let y=0;y<this.ny;y++) {
      const stream=Math.sin((y+0.5)/this.ny*Math.PI*12);
      this.dye[y*this.nx]=stream>0.80?1:0;
    }
    this.time+=dt;
  }
  divergenceRMS() {
    let s=0,n=0;
    for(let y=0;y<this.ny;y++) for(let x=0;x<this.nx;x++) if(!this.blocked(x,y)) {
      const d=(this.u[this.ui(x+1,y)]-this.u[this.ui(x,y)]+this.v[this.vi(x,y+1)]-this.v[this.vi(x,y)])/this.h;
      s+=d*d; n++;
    }
    return Math.sqrt(s/Math.max(1,n));
  }
  project(dt=1/60, iterations=45) {
    this.boundaries();
    const {nx,ny,u,v}=this;
    // In-place Gauss–Seidel pressure projection. Each scalar correction is a
    // pressure increment; add its gradient to open staggered faces. The inlet
    // is fixed, top/bottom and obstacle faces impermeable, outlet pressure open.
    for(let k=0;k<iterations;k++) for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
      if(this.blocked(x,y)) continue;
      const l=x>0&&!this.blocked(x-1,y)?1:0, r=!this.blocked(x+1,y)?1:0;
      const b=!this.blocked(x,y-1)?1:0, t=!this.blocked(x,y+1)?1:0;
      const n=l+r+b+t; if(!n) continue;
      const d=u[this.ui(x+1,y)]-u[this.ui(x,y)]+v[this.vi(x,y+1)]-v[this.vi(x,y)];
      const correction=-1.7*d/n;
      if(l) u[this.ui(x,y)]-=correction;
      if(r) u[this.ui(x+1,y)]+=correction;
      if(b) v[this.vi(x,y)]-=correction;
      if(t) v[this.vi(x,y+1)]+=correction;
    }
    this.boundaries();
  }
}
