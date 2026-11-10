// Exports pour l'impression, la simulation et le post-traitement : 3MF, VTK, Abaqus, champ de vitesse.

// ---------- ZIP sans compression (suffisant pour le 3MF) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ---------- 3MF (point 51) ----------
export function to3MF(mesh, { name = 'scaffold', material = '' } = {}) {
  const { positions, indices } = mesh;
  const v = [], t = [];
  for (let i = 0; i < positions.length; i += 3) v.push(`<vertex x="${positions[i].toFixed(5)}" y="${positions[i + 1].toFixed(5)}" z="${positions[i + 2].toFixed(5)}"/>`);
  for (let i = 0; i < indices.length; i += 3) t.push(`<triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`);
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">${name}</metadata>
<metadata name="Designer">Scaffold Studio</metadata>
<metadata name="Description">${material}</metadata>
<resources><object id="1" type="model" name="${name}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object></resources>
<build><item objectid="1"/></build>
</model>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: '3D/3dmodel.model', data: model },
  ]);
}

// ---------- VTK binaire (big-endian), surface avec champs par sommet (point 55) ----------
function beFloats(arr) {
  const dv = new DataView(new ArrayBuffer(arr.length * 4));
  for (let i = 0; i < arr.length; i++) dv.setFloat32(i * 4, arr[i], false);
  return new Uint8Array(dv.buffer);
}
function beInts(arr) {
  const dv = new DataView(new ArrayBuffer(arr.length * 4));
  for (let i = 0; i < arr.length; i++) dv.setInt32(i * 4, arr[i], false);
  return new Uint8Array(dv.buffer);
}
export function toVTKSurface(mesh, fields = {}) {
  const { positions, indices } = mesh;
  const nv = positions.length / 3, nt = indices.length / 3;
  const enc = new TextEncoder();
  const parts = [enc.encode(`# vtk DataFile Version 3.0\nScaffold Studio surface\nBINARY\nDATASET POLYDATA\nPOINTS ${nv} float\n`), beFloats(positions)];
  const poly = new Int32Array(nt * 4);
  for (let t = 0; t < nt; t++) { poly[t * 4] = 3; poly[t * 4 + 1] = indices[t * 3]; poly[t * 4 + 2] = indices[t * 3 + 1]; poly[t * 4 + 3] = indices[t * 3 + 2]; }
  parts.push(enc.encode(`\nPOLYGONS ${nt} ${nt * 4}\n`), beInts(poly));
  const names = Object.keys(fields).filter((k) => fields[k] && fields[k].length === nv);
  if (names.length) {
    parts.push(enc.encode(`\nPOINT_DATA ${nv}\n`));
    for (const k of names) parts.push(enc.encode(`SCALARS ${k} float 1\nLOOKUP_TABLE default\n`), beFloats(fields[k]), enc.encode('\n'));
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

// ---------- Champ de vitesse sur grille reguliere (point 57) ----------
export function toVTKVelocity(flow) {
  const { nx, ny, nz, ux, uy, uz, solid, size } = flow;
  const n = nx * ny * nz;
  const vec = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) { vec[p * 3] = ux[p] * flow.scale; vec[p * 3 + 1] = uy[p] * flow.scale; vec[p * 3 + 2] = uz[p] * flow.scale; }
  const s = new Float32Array(n);
  for (let p = 0; p < n; p++) s[p] = solid[p];
  const dx = size[0] / nx, dy = size[1] / ny, dz = size[2] / nz;
  const enc = new TextEncoder();
  return new Blob([
    enc.encode(`# vtk DataFile Version 3.0\nScaffold Studio vitesse (mm/s)\nBINARY\nDATASET STRUCTURED_POINTS\nDIMENSIONS ${nx} ${ny} ${nz}\nORIGIN ${dx / 2} ${dy / 2} ${dz / 2}\nSPACING ${dx} ${dy} ${dz}\nPOINT_DATA ${n}\nVECTORS vitesse float\n`),
    beFloats(vec), enc.encode('\nSCALARS solide float 1\nLOOKUP_TABLE default\n'), beFloats(s), enc.encode('\n'),
  ], { type: 'application/octet-stream' });
}

// ---------- Abaqus : maillage voxel C3D8 et essai de compression (point 56) ----------
// grid : { solid (Uint8Array), nx, ny, nz, h, origin } ; E en MPa.
export function toAbaqus(grid, { E, nu = 0.3, name = 'SCAFFOLD', strain = 0.01 } = {}) {
  const { solid, nx, ny, nz, h, origin } = grid;
  const NX = nx + 1, NY = ny + 1;
  const nodeId = new Int32Array(NX * NY * (nz + 1));
  const lines = [`*Heading\n${name} : maillage voxel exporte par Scaffold Studio, unites mm, N, MPa`, '*Part, name=SCAFFOLD', '*Node'];
  let nid = 0;
  const used = new Uint8Array(nodeId.length);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!solid[i + j * nx + k * nx * ny]) continue;
    for (let c = 0; c < 8; c++) used[(i + (c & 1)) + (j + ((c >> 1) & 1)) * NX + (k + ((c >> 2) & 1)) * NX * NY] = 1;
  }
  const bottom = [], top = [];
  for (let k = 0; k <= nz; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const q = i + j * NX + k * NX * NY;
    if (!used[q]) continue;
    nodeId[q] = ++nid;
    lines.push(`${nid}, ${(origin[0] + i * h).toFixed(5)}, ${(origin[1] + j * h).toFixed(5)}, ${(origin[2] + k * h).toFixed(5)}`);
    if (k === 0) bottom.push(nid);
    if (k === nz) top.push(nid);
  }
  lines.push('*Element, type=C3D8');
  let eid = 0;
  const L = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!solid[i + j * nx + k * nx * ny]) continue;
    lines.push(`${++eid}, ${L.map(([a, b, c]) => nodeId[(i + a) + (j + b) * NX + (k + c) * NX * NY]).join(', ')}`);
  }
  const set = (label, ids) => { lines.push(`*Nset, nset=${label}`); for (let i = 0; i < ids.length; i += 16) lines.push(ids.slice(i, i + 16).join(', ')); };
  lines.push('*Elset, elset=ALL, generate', `1, ${eid}, 1`);
  set('BOTTOM', bottom); set('TOP', top);
  lines.push('*Solid Section, elset=ALL, material=MAT', ',', '*End Part',
    '*Assembly, name=ASSEMBLY', '*Instance, name=S, part=SCAFFOLD', '*End Instance', '*End Assembly',
    '*Material, name=MAT', '*Elastic', `${E}, ${nu}`,
    '*Step, name=COMPRESSION', '*Static', '*Boundary', 'S.BOTTOM, 1, 3, 0', '*Boundary', `S.TOP, 3, 3, ${(-strain * nz * h).toFixed(6)}`,
    '*Output, field', '*Node Output', 'U, RF', '*Element Output', 'S, E', '*Output, history', '*Node Output, nset=S.TOP', 'RF3', '*End Step');
  return { text: lines.join('\n') + '\n', elements: eid, nodes: nid };
}
