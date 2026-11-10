// Studio de rendu : formats d'image, rendu realiste (halo, vignettage, multi-echantillonnage, profondeur de champ),
// titres incrustes, rendu haute definition hors ecran et sequences de camera (points 62 a 69).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Rapport largeur / hauteur ; null pour remplir la vue.
export const FORMATS = {
  free: { label: 'Libre', ratio: null },
  '1:1': { label: 'Carré 1:1', ratio: 1 },
  '4:5': { label: 'Portrait 4:5 (fil LinkedIn)', ratio: 4 / 5 },
  '9:16': { label: 'Vertical 9:16 (story, reel)', ratio: 9 / 16 },
  '16:9': { label: 'Paysage 16:9', ratio: 16 / 9 },
};

export const PATHS = {
  orbit: 'Tour complet',
  crane: 'Grue montante',
  dive: 'Plongée vers le coeur',
  keys: 'Vues clés',
};

// Taille du rendu haute definition : grand cote de 3840 px.
export function hiResSize(ratio, aspect, long = 3840) {
  const r = ratio || aspect;
  return r >= 1 ? [long, Math.round(long / r)] : [Math.round(long * r), long];
}

const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

// Position et cible de la camera a l'instant u (0 a 1) d'une sequence.
export function shotPose(path, u, start, keys) {
  const { center, pos } = start;
  const off = pos.clone().sub(center);
  const r0 = off.length();
  const a0 = Math.atan2(off.y, off.x);
  const e0 = Math.asin(THREE.MathUtils.clamp(off.z / r0, -1, 1));
  const at = (a, e, r) => new THREE.Vector3(center.x + r * Math.cos(e) * Math.cos(a), center.y + r * Math.cos(e) * Math.sin(a), center.z + r * Math.sin(e));
  if (path === 'orbit') return { pos: at(a0 + 2 * Math.PI * u, e0, r0), target: center.clone() };
  if (path === 'crane') {
    const v = ease(u);
    return { pos: at(a0 + (Math.PI / 2) * v, THREE.MathUtils.degToRad(-12 + 60 * v), r0 * (1.12 - 0.25 * v)), target: center.clone() };
  }
  if (path === 'dive') {
    const v = ease(u);
    return { pos: center.clone().add(off.clone().multiplyScalar(1 - 0.93 * v)), target: center.clone() };
  }
  if (path === 'keys' && keys && keys.length >= 2) {
    const pc = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
    const tc = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k.target)), false, 'centripetal');
    const v = ease(u);
    return { pos: pc.getPoint(v), target: tc.getPoint(v) };
  }
  return { pos: pos.clone(), target: center.clone() };
}

export class Studio {
  constructor({ renderer, scene, camera, canvas, viewport }) {
    Object.assign(this, { renderer, scene, camera, canvas, viewport });
    this.settings = { format: 'free', realism: false, bloom: 0.25, dof: false, focus: 50, title: '', subtitle: '', titleOn: false, scaleBarOn: false };
    this.composer = null;
    this.overlay = document.createElement('canvas');
    this.ovTex = new THREE.CanvasTexture(this.overlay);
    this.ovTex.colorSpace = THREE.SRGBColorSpace;
    this.ovScene = new THREE.Scene();
    this.ovCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.ovMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.ovTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.ovScene.add(this.ovMesh);
    this.ovKey = '';
    this.mmPerUnit = 1;
  }

  // Dimensions CSS de la toile selon le format choisi, centree dans la vue.
  layout() {
    const r = this.viewport.getBoundingClientRect();
    const ratio = FORMATS[this.settings.format]?.ratio;
    let w = r.width, h = r.height;
    if (ratio) {
      const pad = 16;
      const aw = Math.max(r.width - pad * 2, 50), ah = Math.max(r.height - pad * 2, 50);
      if (aw / ah > ratio) { h = ah; w = ah * ratio; } else { w = aw; h = aw / ratio; }
    }
    Object.assign(this.canvas.style, ratio
      ? { position: 'absolute', width: `${w}px`, height: `${h}px`, left: `${(r.width - w) / 2}px`, top: `${(r.height - h) / 2}px` }
      : { position: '', width: '', height: '', left: '', top: '' });
    this.canvas.classList.toggle('framed', !!ratio);
    this.setSize(w, h);
  }

  setSize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
    this.ovKey = '';
  }

  ensureComposer() {
    const s = this.settings;
    const want = s.realism || s.dof;
    if (!want) { if (this.composer) { this.composer.dispose(); this.composer = null; } return null; }
    const size = this.renderer.getSize(new THREE.Vector2());
    const key = `${s.realism}|${s.dof}`;
    if (this.composer && this.composerKey === key) return this.composer;
    if (this.composer) this.composer.dispose();
    // Cible multi-echantillonnee : l'anticrenelage est conserve malgre le post-traitement.
    const rt = new THREE.WebGLRenderTarget(size.x * this.renderer.getPixelRatio(), size.y * this.renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(this.renderer, rt);
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(size.x, size.y);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (s.dof) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 10, aperture: 0.004, maxblur: 0.008 });
      c.addPass(this.bokeh);
    } else this.bokeh = null;
    if (s.realism) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), s.bloom, 0.35, 0.96);
      c.addPass(this.bloomPass);
    } else this.bloomPass = null;
    c.addPass(new OutputPass());
    if (s.realism) {
      this.vignette = new ShaderPass(VignetteShader);
      this.vignette.uniforms.offset.value = 1.05;
      this.vignette.uniforms.darkness.value = 1.15;
      c.addPass(this.vignette);
    }
    this.composer = c; this.composerKey = key;
    return c;
  }

  // focusDist : distance camera-cible, la mise au point se regle en pourcentage autour.
  render(focusDist = 10) {
    const c = this.ensureComposer();
    if (c) {
      if (this.bloomPass) this.bloomPass.strength = this.settings.bloom;
      if (this.bokeh) {
        const f = focusDist * (0.5 + this.settings.focus / 100);
        this.bokeh.uniforms.focus.value = f;
        this.bokeh.uniforms.aperture.value = 0.0025 / Math.max(f, 1e-3);
      }
      c.render();
    } else this.renderer.render(this.scene, this.camera);
    this.drawOverlay(focusDist);
  }

  // Titres et barre d'echelle, dessines dans une texture puis superposes au rendu (donc captures).
  drawOverlay(focusDist) {
    const s = this.settings;
    if (!s.titleOn && !s.scaleBarOn) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const W = size.x, H = size.y;
    const visH = 2 * focusDist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const pxPerMm = H / Math.max(visH * this.mmPerUnit, 1e-6);
    const key = `${W}|${H}|${s.title}|${s.subtitle}|${s.titleOn}|${s.scaleBarOn}|${Math.round(pxPerMm * 10)}|${this.theme}`;
    if (key !== this.ovKey) {
      this.ovKey = key;
      const o = this.overlay;
      o.width = W; o.height = H;
      const g = o.getContext('2d');
      g.clearRect(0, 0, W, H);
      const u = Math.min(W, H) / 1000;
      const light = this.theme === 'light';
      const ink = light ? '#141821' : '#f2f4f8', sub = light ? 'rgba(20,24,33,.72)' : 'rgba(242,244,248,.78)';
      if (s.titleOn && (s.title || s.subtitle)) {
        const grd = g.createLinearGradient(0, H, 0, H - 260 * u);
        grd.addColorStop(0, light ? 'rgba(255,255,255,.75)' : 'rgba(5,7,11,.72)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(0, H - 260 * u, W, 260 * u);
        const x = 56 * u;
        g.fillStyle = '#78d6c6'; g.fillRect(x, H - 172 * u, 46 * u, 5 * u);
        g.fillStyle = ink; g.font = `600 ${54 * u}px "Segoe UI", system-ui, sans-serif`; g.textBaseline = 'alphabetic';
        g.fillText(s.title, x, H - 104 * u, W - 2 * x);
        if (s.subtitle) { g.fillStyle = sub; g.font = `400 ${30 * u}px "Segoe UI", system-ui, sans-serif`; g.fillText(s.subtitle, x, H - 58 * u, W - 2 * x); }
      }
      if (s.scaleBarOn && Number.isFinite(pxPerMm)) {
        // Longueur ronde la plus proche de 18 % de la largeur.
        const target = (W * 0.18) / pxPerMm;
        const p = 10 ** Math.floor(Math.log10(target));
        const len = [1, 2, 5, 10].map((m) => m * p).reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
        const px = len * pxPerMm, x1 = W - 56 * u, y = s.titleOn ? H - 70 * u : H - 56 * u;
        g.fillStyle = ink; g.fillRect(x1 - px, y, px, 5 * u);
        g.fillRect(x1 - px, y - 10 * u, 3 * u, 15 * u); g.fillRect(x1 - 3 * u, y - 10 * u, 3 * u, 15 * u);
        g.font = `500 ${24 * u}px "Segoe UI", system-ui, sans-serif`; g.textAlign = 'center';
        g.fillText(len >= 1 ? `${len} mm` : `${Math.round(len * 1000)} µm`, x1 - px / 2, y - 16 * u);
        g.textAlign = 'left';
      }
      this.ovTex.needsUpdate = true;
    }
    const r = this.renderer;
    const auto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(null);
    r.clearDepth();
    r.render(this.ovScene, this.ovCam);
    r.autoClear = auto;
  }

  // Rendu hors ecran au grand cote de 3840 px, rendu une seule fois puis restitue.
  async renderHiRes(focusDist, long = 3840) {
    const r = this.renderer;
    const old = r.getSize(new THREE.Vector2()), oldRatio = r.getPixelRatio();
    const [W, H] = hiResSize(FORMATS[this.settings.format]?.ratio, old.x / Math.max(old.y, 1), long);
    r.setPixelRatio(1);
    this.setSize(W, H);
    this.render(focusDist);
    const blob = await new Promise((res) => this.canvas.toBlob(res, 'image/png'));
    r.setPixelRatio(oldRatio);
    this.setSize(old.x, old.y);
    return { blob, W, H };
  }
}
