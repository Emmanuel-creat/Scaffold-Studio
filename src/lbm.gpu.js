// Boltzmann sur reseau D3Q19 TRT sur carte graphique (WebGPU), meme schema que lbm.js :
// propagation en lecture (pull), rebond a mi-chemin, force volumique, domaine periodique.

const C = [
  [0, 0, 0],
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0],
  [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1],
  [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1],
];
const OPP = C.map(([x, y, z]) => C.findIndex(([a, b, c]) => a === -x && b === -y && c === -z));
const W = [1 / 3, ...Array(6).fill(1 / 18), ...Array(12).fill(1 / 36)];

const SHADER = `
struct Params { nx: u32, ny: u32, nz: u32, n: u32, wp: f32, wm: f32, tm: f32, pad: f32, F: vec4<f32> };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> fin: array<f32>;
@group(0) @binding(2) var<storage, read_write> fout: array<f32>;
@group(0) @binding(3) var<storage, read> solid: array<u32>;
@group(0) @binding(4) var<storage, read_write> vel: array<vec4<f32>>;

var<private> CX: array<i32, 19> = array<i32, 19>(${C.map((c) => c[0]).join(', ')});
var<private> CY: array<i32, 19> = array<i32, 19>(${C.map((c) => c[1]).join(', ')});
var<private> CZ: array<i32, 19> = array<i32, 19>(${C.map((c) => c[2]).join(', ')});
var<private> OP: array<u32, 19> = array<u32, 19>(${OPP.join('u, ')}u);
var<private> WT: array<f32, 19> = array<f32, 19>(${W.map((w) => w.toFixed(10)).join(', ')});

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let p = gid.x;
  if (p >= P.n) { return; }
  if (solid[p] == 1u) { vel[p] = vec4<f32>(0.0); return; }
  let nx = i32(P.nx); let ny = i32(P.ny); let nz = i32(P.nz);
  let i = i32(p % P.nx); let j = i32((p / P.nx) % P.ny); let k = i32(p / (P.nx * P.ny));
  var f: array<f32, 19>;
  var rho = 0.0; var m = vec3<f32>(0.0);
  for (var q = 0u; q < 19u; q = q + 1u) {
    let si = (i - CX[q] + nx) % nx; let sj = (j - CY[q] + ny) % ny; let sk = (k - CZ[q] + nz) % nz;
    let s = u32(si + sj * nx + sk * nx * ny);
    var v: f32;
    if (solid[s] == 1u) { v = fin[OP[q] * P.n + p]; } else { v = fin[q * P.n + s]; }
    f[q] = v;
    rho = rho + v;
    m = m + v * vec3<f32>(f32(CX[q]), f32(CY[q]), f32(CZ[q]));
  }
  let ue = m / rho + P.tm * P.F.xyz;
  let up = m / rho + 0.5 * P.F.xyz;
  vel[p] = vec4<f32>(up, 0.0);
  let usq = 1.5 * dot(ue, ue);
  var feq: array<f32, 19>;
  for (var q = 0u; q < 19u; q = q + 1u) {
    let cu = 3.0 * (f32(CX[q]) * ue.x + f32(CY[q]) * ue.y + f32(CZ[q]) * ue.z);
    feq[q] = WT[q] * rho * (1.0 + cu + 0.5 * cu * cu - usq);
  }
  for (var q = 0u; q < 19u; q = q + 1u) {
    let o = OP[q];
    let fp = 0.5 * (f[q] + f[o]); let fm = 0.5 * (f[q] - f[o]);
    let ep = 0.5 * (feq[q] + feq[o]); let em = 0.5 * (feq[q] - feq[o]);
    fout[q * P.n + p] = f[q] - P.wp * (fp - ep) - P.wm * (fm - em);
  }
}`;

export async function gpuAvailable() {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : self.navigator;
    if (!nav || !nav.gpu) return false;
    const a = await nav.gpu.requestAdapter();
    return !!a;
  } catch { return false; }
}

export class LBMGPU {
  static async create(solid, nx, ny, nz, opts = {}) {
    const nav = typeof navigator !== 'undefined' ? navigator : self.navigator;
    const adapter = await nav.gpu.requestAdapter();
    const device = await adapter.requestDevice({
      requiredLimits: { maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 2 ** 31 - 1), maxBufferSize: Math.min(adapter.limits.maxBufferSize, 2 ** 31 - 1) },
    });
    const g = new LBMGPU();
    g.init(device, solid, nx, ny, nz, opts);
    return g;
  }

  init(device, solid, nx, ny, nz, { tau = 1, force = 1e-5, dir = 'z', magic = 3 / 16 } = {}) {
    this.device = device;
    this.nx = nx; this.ny = ny; this.nz = nz;
    const N = nx * ny * nz;
    this.N = N;
    this.solid = solid;
    this.tau = tau;
    this.tauMinus = 0.5 + magic / (tau - 0.5);
    this.nu = (tau - 0.5) / 3;
    this.g = force;
    this.axis = { x: 0, y: 1, z: 2 }[dir] ?? 2;
    const F = [0, 0, 0, 0]; F[this.axis] = force;
    const params = new ArrayBuffer(48);
    new Uint32Array(params, 0, 4).set([nx, ny, nz, N]);
    new Float32Array(params, 16, 8).set([1 / tau, 1 / this.tauMinus, this.tauMinus, 0, ...F]);
    const U = GPUBufferUsage;
    this.ubo = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    device.queue.writeBuffer(this.ubo, 0, params);
    const f0 = new Float32Array(N * 19);
    for (let q = 0; q < 19; q++) f0.fill(W[q], q * N, (q + 1) * N);
    this.fa = device.createBuffer({ size: f0.byteLength, usage: U.STORAGE | U.COPY_DST });
    this.fb = device.createBuffer({ size: f0.byteLength, usage: U.STORAGE | U.COPY_DST });
    device.queue.writeBuffer(this.fa, 0, f0);
    device.queue.writeBuffer(this.fb, 0, f0);
    const s32 = new Uint32Array(N); for (let p = 0; p < N; p++) s32[p] = solid[p] ? 1 : 0;
    this.sb = device.createBuffer({ size: s32.byteLength, usage: U.STORAGE | U.COPY_DST });
    device.queue.writeBuffer(this.sb, 0, s32);
    this.vb = device.createBuffer({ size: N * 16, usage: U.STORAGE | U.COPY_SRC });
    this.rb = device.createBuffer({ size: N * 16, usage: U.MAP_READ | U.COPY_DST });
    const module = device.createShaderModule({ code: SHADER });
    this.pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const bg = (a, b) => device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.ubo } }, { binding: 1, resource: { buffer: a } }, { binding: 2, resource: { buffer: b } },
        { binding: 3, resource: { buffer: this.sb } }, { binding: 4, resource: { buffer: this.vb } }],
    });
    this.groups = [bg(this.fa, this.fb), bg(this.fb, this.fa)];
    this.parity = 0;
    this.steps = 0;
    this.meanU = 0;
    this.ux = new Float32Array(N); this.uy = new Float32Array(N); this.uz = new Float32Array(N);
  }

  // n pas de temps puis relecture de la vitesse (une seule synchronisation).
  async step(n = 25) {
    const { device } = this;
    const enc = device.createCommandEncoder();
    const wg = Math.ceil(this.N / 64);
    const X = Math.min(wg, 65535), Y = Math.ceil(wg / 65535);
    if (Y > 1) throw new Error('Domaine trop grand pour la carte graphique');
    for (let s = 0; s < n; s++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.groups[this.parity]);
      pass.dispatchWorkgroups(X);
      pass.end();
      this.parity ^= 1;
    }
    enc.copyBufferToBuffer(this.vb, 0, this.rb, 0, this.N * 16);
    device.queue.submit([enc.finish()]);
    await this.rb.mapAsync(GPUMapMode.READ);
    const v = new Float32Array(this.rb.getMappedRange().slice(0));
    this.rb.unmap();
    let sum = 0;
    const a = this.axis;
    for (let p = 0; p < this.N; p++) {
      this.ux[p] = v[p * 4]; this.uy[p] = v[p * 4 + 1]; this.uz[p] = v[p * 4 + 2];
      sum += v[p * 4 + a];
    }
    this.steps += n;
    this.meanU = sum / this.N;
    return this.meanU;
  }

  permeability() { return (this.nu * this.meanU) / this.g; }

  destroy() { for (const b of [this.fa, this.fb, this.sb, this.vb, this.rb, this.ubo]) b.destroy(); this.device.destroy(); }
}
