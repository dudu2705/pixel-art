import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, LEN, RW, SW, CITIES, ZONE_NAMES, LINK_NAMES, LH, LAYER, ELEV,
         zoneAt, district, setTime, D } from './world.js';
import { frameAt } from './road.js';
import { City, ROAD_LAYER } from './city.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';
import { ArtOverlay } from './overlay.js';
import { drawCockpit } from './cockpit.js';
import { Signals } from './signals.js';
import { S, update as simUpdate, setAuto, setCruise, cruiseKmh, CARS } from './sim.js';
import { Rig, MODES } from './camera.js';
import { Glow } from './glow.js';

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
// the original wrote 0-255 straight to the framebuffer; keep that, or every
// colour in the palette comes out lifted
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.5, 6000);
camera.layers.enable(ROAD_LAYER);

// Match the GPU game's art grid and its always-on 2x city detail.
const ART_SHORT_SIDE = 280, CITY_SCALE = 2;
const nearest = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
const rt = new THREE.WebGLRenderTarget(1, 1, {
  ...nearest, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
});
const surfaces = new THREE.WebGLRenderTarget(1, 1, nearest);
const overlay = new ArtOverlay();
const quadScene = new THREE.Scene();
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadMat = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    map: { value: rt.texture }, uGlow: { value: null }, uGlowAmt: { value: 1 },
    uSurfaces: { value: surfaces.texture }, uHorizon: { value: 0 },
    uOverlayAdd: { value: null }, uOverlayMultiply: { value: null },
    uView: { value: new THREE.Vector2() }, uRotation: { value: new THREE.Vector2(1, 0) },
    uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: new THREE.Vector3() },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D map, uGlow, uSurfaces, uOverlayAdd, uOverlayMultiply;
    uniform float uGlowAmt;
    uniform int uHorizon;
    uniform vec2 uView, uRotation;
    uniform vec3 uTint, uFlash;
    out vec4 fragColor;
    vec3 finishColor(ivec2 p) {
      vec3 city = texelFetch(map, p, 0).rgb;
      vec3 glow = texelFetch(uGlow, p, 0).rgb * uGlowAmt;
      float beam = texelFetch(uSurfaces, p, 0).g;
      return city * uTint + glow + vec3(190, 215, 255) / 255.0 * beam;
    }
    void main() {
      vec2 p = (vUv - 0.5) * uView;
      ivec2 size = textureSize(map, 0);
      vec2 rotated = vec2(uRotation.x * p.x + uRotation.y * p.y, -uRotation.y * p.x + uRotation.x * p.y);
      ivec2 src = clamp(ivec2(floor(vec2(size) * 0.5 + rotated)), ivec2(0), size - 1);
      vec3 color = finishColor(src);
      int mirrorY = 2 * uHorizon - src.y;
      float reflectivity = texelFetch(uSurfaces, src, 0).r;
      if (src.y < uHorizon && mirrorY < size.y && reflectivity > 0.0) {
        vec3 reflection = finishColor(ivec2(src.x, mirrorY));
        float luma = dot(reflection, vec3(0.3, 0.5, 0.2));
        color = mix(color, reflection, reflectivity * 0.55 * smoothstep(70.0 / 255.0, 190.0 / 255.0, luma));
      }
      vec3 overlayColor = texture(uOverlayAdd, vUv).rgb;
      vec3 transmission = texture(uOverlayMultiply, vUv).rgb;
      fragColor = vec4(color * transmission + overlayColor + uFlash, 1.0);
    }`,
});
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));

let BLOOM = true;
const glow = new Glow(renderer);

function resize() {
  const dpr = devicePixelRatio || 1;
  const pixelWidth = innerWidth * dpr, pixelHeight = innerHeight * dpr;
  const pixelScale = Math.max(CITY_SCALE, Math.round(Math.min(pixelWidth, pixelHeight) / ART_SHORT_SIDE));
  const artWidth = Math.max(1, Math.ceil(pixelWidth / pixelScale));
  const artHeight = Math.max(1, Math.ceil(pixelHeight / pixelScale));
  const outputWidth = artWidth * pixelScale, outputHeight = artHeight * pixelScale;
  renderer.setSize(outputWidth, outputHeight, false);
  canvas.style.width = `${outputWidth / dpr}px`;
  canvas.style.height = `${outputHeight / dpr}px`;
  // Draw enough offscreen city for the widest bank at the current aspect.
  const maxLean = 0.43;
  const margin = across => Math.ceil(across * Math.sin(maxLean) / 2) + 2;
  const width = artWidth * CITY_SCALE, height = artHeight * CITY_SCALE;
  const mx = margin(height), my = margin(width);
  const pw = width + 2 * mx, ph = height + 2 * my;
  camera.setViewOffset(width, height, -mx, -my, pw, ph);
  quadMat.uniforms.uView.value.set(width, height);
  rt.setSize(pw, ph);
  surfaces.setSize(pw, ph);
  overlay.resize(artWidth, artHeight);
  quadMat.uniforms.uOverlayAdd.value = overlay.additive;
  quadMat.uniforms.uOverlayMultiply.value = overlay.multiplier;
  weather.reset();
  glow.setSize(pw, ph);
}
const forward = new THREE.Vector3();
const horizon = new THREE.Vector4();

function renderSurfaces() {
  const cameraLayers = camera.layers.mask;
  camera.layers.set(ROAD_LAYER);
  city.uniforms.uSceneDepth.value = rt.depthTexture;
  city.uniforms.uMaskPass.value = true;
  renderer.setRenderTarget(surfaces);
  renderer.render(scene, camera);
  city.uniforms.uMaskPass.value = false;
  city.uniforms.uSceneDepth.value = null;
  camera.layers.mask = cameraLayers;
}

addEventListener('resize', resize);

// ---------- sky ----------
const skyUniforms = {
  uLow: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() },
  uTime: { value: 0 }, uAurora: { value: 0 }, uStars: { value: 0 }, uShimmer: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(4000, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      precision highp float; varying vec3 vP;
      uniform vec3 uLow, uMid, uHigh;
      uniform float uTime, uAurora, uStars, uShimmer;
      float h21(vec2 p, float s) {
        p = fract(p * vec2(123.34, 456.21) + s * 0.017);
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      void main(){
        // uLow is the horizon glow, uHigh the zenith: bright low, dark up top
        float t = clamp(vP.y / 2200.0, -1.0, 1.0);
        float a = clamp(t, 0.0, 1.0);
        vec3 c = a < 0.5 ? mix(uLow, uMid, a * 2.0) : mix(uMid, uHigh, (a - 0.5) * 2.0);
        if (t < 0.0) c = mix(uLow, uHigh * 0.6, clamp(-t * 1.6, 0.0, 1.0));
        c = mix(c, uLow * 1.2, exp(-abs(vP.y) / 220.0) * 0.6);

        vec3 dir = normalize(vP);
        float az = atan(dir.z, dir.x);

        // stars, thicker the higher you ride
        if (uStars > 0.01 && dir.y > 0.0) {
          vec2 cell = floor(vec2(az * 60.0, dir.y * 140.0));
          float r = h21(cell, 3.0);
          if (r > 0.993) {
            float tw = 0.55 + 0.45 * sin(uTime * 2.0 + r * 90.0);
            c += vec3(0.75, 0.82, 1.0) * tw * uStars * smoothstep(0.0, 0.35, dir.y);
          }
        }

        // aurora: slow curtains hanging above the horizon
        if (uAurora > 0.01) {
          float band = sin(az * 3.0 + uTime * 0.12) * 0.1 + 0.22;
          float d = abs(dir.y - band);
          float curtain = exp(-d * 11.0);
          float ripple = 0.55 + 0.45 * sin(az * 22.0 + uTime * 0.5 + dir.y * 18.0);
          vec3 ac = mix(vec3(0.35, 1.0, 0.65), vec3(0.55, 0.45, 1.0), 0.5 + 0.5 * sin(az * 2.0 + uTime * 0.2));
          c += ac * curtain * ripple * 0.5 * uAurora;
        }

        // heat shimmer over the bazaar
        if (uShimmer > 0.01 && dir.y < 0.12)
          c *= 1.0 + 0.05 * uShimmer * sin(az * 90.0 + uTime * 3.0);

        gl_FragColor = vec4(c, 1.0);
      }`,
  })
);
sky.frustumCulled = false;
scene.add(sky);

// ---------- distant mountains, for the cities that have them ----------
const mtnUniforms = { uCol: { value: new THREE.Color(0.06, 0.08, 0.14) }, uFade: { value: 0 } };
const mountains = (() => {
  const N = 220, R = 3200;
  const pos = [], idx = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    const u = i / N * 40;
    // the original's ridge profile, same noise mix
    const h = 240 * (0.18 + 0.45 * Math.abs(nz(u, 0.5) * 2 - 1) * 0.6 + 0.35 * nz(u * 3, 1.5) * 0.5
            + 0.2 * (1 - Math.abs(nz(u * 0.7, 3) * 2 - 1)));
    pos.push(Math.cos(a) * R, -60, Math.sin(a) * R);
    pos.push(Math.cos(a) * R, h, Math.sin(a) * R);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = ((i + 1) % N) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: mtnUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `precision highp float; varying float vY; uniform vec3 uCol; uniform float uFade;
      void main(){ if (uFade < 0.01) discard; gl_FragColor = vec4(uCol * (0.6 + vY / 500.0), uFade); }`,
  }));
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
})();
function nz(x, y) {   // the generator's value noise, inlined
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const hh = (a, b) => { let h = (a * 374761393 + b * 668265263 + 11 * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const a = hh(ix, iy), b = hh(ix + 1, iy), c = hh(ix, iy + 1), d = hh(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
scene.add(mountains);

// ---------- fireworks over the festival cities ----------
const fw = (() => {
  const CAP = 700;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(CAP * 3), col = new Float32Array(CAP * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    size: 2.6, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: false,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { g, pos, col, parts: [], next: 0, CAP };
})();
function fireworks(dt, time, on, camPos) {
  if (on && time > fw.next && fw.parts.length < fw.CAP - 90) {
    fw.next = time + 0.8 + Math.random() * 2.4;
    const a = Math.random() * Math.PI * 2, R = 260 + Math.random() * 420;
    const ox = camPos.x + Math.cos(a) * R, oz = camPos.z + Math.sin(a) * R;
    const oy = 120 + Math.random() * 180;
    const c = NEONJS[(Math.random() * 6) | 0];
    for (let i = 0; i < 80; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = 14 + Math.random() * 22;
      fw.parts.push({ x: ox, y: oy, z: oz,
        vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp, vz: Math.sin(ph) * Math.sin(th) * sp,
        life: 1.6 + Math.random() * 1.2, age: 0, c });
    }
  }
  let k = 0;
  for (let i = fw.parts.length - 1; i >= 0; i--) {
    const p = fw.parts[i];
    p.age += dt;
    if (p.age > p.life) { fw.parts.splice(i, 1); continue; }
    p.vy -= 16 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vx *= 0.985; p.vz *= 0.985;
  }
  for (const p of fw.parts) {
    if (k >= fw.CAP) break;
    const f = 1 - p.age / p.life;
    fw.pos[k * 3] = p.x; fw.pos[k * 3 + 1] = p.y; fw.pos[k * 3 + 2] = p.z;
    fw.col[k * 3] = p.c[0] / 255 * f; fw.col[k * 3 + 1] = p.c[1] / 255 * f; fw.col[k * 3 + 2] = p.c[2] / 255 * f;
    k++;
  }
  fw.g.setDrawRange(0, k);
  fw.g.attributes.position.needsUpdate = true;
  fw.g.attributes.color.needsUpdate = true;
}
const NEONJS = [[255, 46, 170], [0, 234, 255], [255, 214, 64], [170, 90, 255], [70, 255, 150], [255, 110, 50]];

// ---------- the bike ----------
const bikeGroup = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 2.5),
    new THREE.MeshBasicMaterial({ color: 0x1a2030 }));
  body.position.y = 0.78;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x0d1118 }));
  shell.position.set(0, 1.18, -0.3);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 2.2),
    new THREE.MeshBasicMaterial({ color: 0x00eaff }));
  glow.position.y = 0.52;
  const wheelG = new THREE.CylinderGeometry(0.62, 0.62, 0.22, 14).rotateZ(Math.PI / 2);
  const wheelM = new THREE.MeshBasicMaterial({ color: 0x05070c });
  const w1 = new THREE.Mesh(wheelG, wheelM); w1.position.set(0, 0.62, 1.05);
  const w2 = new THREE.Mesh(wheelG, wheelM); w2.position.set(0, 0.62, -1.05);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.05, 6, 18),
    new THREE.MeshBasicMaterial({ color: 0x00eaff }));
  rim.position.set(0, 0.62, 1.05);
  const rim2 = rim.clone(); rim2.position.z = -1.05;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
  lamp.position.set(0, 1.05, 1.28);
  bikeGroup.add(body, shell, glow, w1, w2, rim, rim2, lamp);
}
scene.add(bikeGroup);

// ---------- world streaming ----------
const city = new City(scene);
const traffic = new Traffic(scene, city.mats);
const weather = new Weather();
const signals = new Signals(scene, city.mats);
const rig = new Rig(camera, canvas);

// ---------- drive ----------
// All of this lives in sim.js now; `bike` is just the view onto it.
const bike = { dist: 0, lat: 1.75, speed: 42, roll: 0, auto: true };
{
  for (let t = 0; t < 200; t++) {
    const n = Math.floor(Math.random() * NSEG), d = district(n);
    if (d !== D.TUNNEL && d !== D.RAMP && d !== D.TUBE) { S.z = n * SEGL; break; }
  }
}

// the original's bindings, unchanged: arrows drive, A autopilot, R/W weather,
// V cruise, L lights, C camera, H hints
const keys = {};
const simKeys = { left: false, right: false, gas: false, brake: false };
const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'gas', ArrowDown: 'brake' };
addEventListener('keydown', e => {
  if (KEYMAP[e.key]) { simKeys[KEYMAP[e.key]] = true; if (S.auto) setAuto(false); e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if (k === 'a') { setAuto(!S.auto); banner2('AUTOPILOT · ' + (S.auto ? 'ON' : 'OFF')); }
  else if (k === 'r' || k === 'w') { S.rainOn = !S.rainOn; banner2('WEATHER · ' + (S.rainOn ? 'ON' : 'OFF')); }
  else if (k === 'v') { setCruise(S.cruise + 1); hud(); banner2('CRUISE · ' + cruiseKmh() + ' KMH' + (S.auto ? '' : ' (AUTOPILOT)')); }
  else if (k === 'l') { lightOn = !lightOn; banner2('HEADLIGHT · ' + (lightOn ? 'ON' : 'OFF')); }
  else if (k === 'c') { rig.setMode((rig.mode + 1) % MODES.length); banner2('CAMERA · ' + MODES[rig.mode]); }
  else if (k === 'h') document.body.classList.toggle('hints');
  else if (k === 'b') { BLOOM = !BLOOM; banner2('GLOW · ' + (BLOOM ? 'ON' : 'OFF')); }
  else if (/^[1-5]$/.test(e.key)) { rig.setMode(+e.key - 1); banner2('CAMERA · ' + MODES[rig.mode]); }
});
addEventListener('keyup', e => { if (KEYMAP[e.key]) simKeys[KEYMAP[e.key]] = false; });
let lightOn = true;
function banner2(text) { S.zoneText = text; S.zoneT = 2.5; }

function drive(dt) {
  simUpdate(dt, simKeys);
  bike.dist = S.z; bike.lat = S.px; bike.speed = S.speed; bike.roll = S.roll; bike.auto = S.auto;
}

// ---------- theme ----------
let themeCity = -1;
function theme(dt) {
  const z = zoneAt(Math.floor(S.z / SEGL) % NSEG);
  // fog, sky and the hour all come from the simulation's blendTheme
  city.setFog(S.FOG, 40 * S.fogK, 1500 * (0.42 + 0.58 * S.fogK));
  skyUniforms.uLow.value.setRGB(S.SKY[2][0] / 255, S.SKY[2][1] / 255, S.SKY[2][2] / 255);
  skyUniforms.uMid.value.setRGB(S.SKY[1][0] / 255, S.SKY[1][1] / 255, S.SKY[1][2] / 255);
  skyUniforms.uHigh.value.setRGB(S.SKY[0][0] / 255, S.SKY[0][1] / 255, S.SKY[0][2] / 255);

  const f2 = frameAt(S.z, {});
  const high = Math.max(0, Math.min(1, (f2.y - 20) / 80));
  skyUniforms.uTime.value = S.T;
  skyUniforms.uStars.value = (0.3 + 0.7 * high) * (0.35 + 0.65 * S.night);
  skyUniforms.uAurora.value += ((S.TH.aurora || 0) - skyUniforms.uAurora.value) * Math.min(1, dt);
  skyUniforms.uShimmer.value += ((S.TH.shimmer || 0) - skyUniforms.uShimmer.value) * Math.min(1, dt);
  mtnUniforms.uFade.value += ((S.TH.mountains || 0) - mtnUniforms.uFade.value) * Math.min(1, dt);
  mtnUniforms.uCol.value.setRGB(S.FOG[0] / 420, S.FOG[1] / 420, S.FOG[2] / 420);
  fireworks(dt, S.T, (S.TH.fireworks || 0) > 0.3, camera.position);

  city.uniforms.uWet.value = S.rainOn ? S.wet : 0;
  city.uniforms.uFlash.value = S.flash;

  if (z[3] !== themeCity) { themeCity = z[3]; hud(); }
  return z;
}

// ---------- HUD ----------
const el = {
  mode: document.getElementById('mode'), place: document.getElementById('place'),
  kmh: document.getElementById('kmh'), fps: document.getElementById('fps'),
};
rig.onMode = () => hud();
function hud() {
  const z = zoneAt(Math.floor(S.z / SEGL) % NSEG);
  el.mode.textContent = MODES[rig.mode]
    + (S.auto ? '  ·  AUTO ' + cruiseKmh() : '  ·  MANUAL') + (S.rainOn ? '' : '  ·  DRY');
  el.place.textContent = CITIES[z[3]].name + '  /  ' + (z[4] ? (LINK_NAMES[z[2]] || 'LINK') : ZONE_NAMES[z[2]]);
}
const banner = document.getElementById('banner');
const lvl = document.getElementById('lvl');

// ---------- loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, T = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;   // never negative: a clock jump must not blow up the damping
  T += dt; setTime(T);

  drive(dt);
  theme(dt);
  rig.update(bike, dt);

  const f = frameAt(bike.dist, {});
  const bx = f.x + f.rx * bike.lat, bz = f.z + f.rz * bike.lat;
  bikeGroup.position.set(bx, f.y, bz);
  bikeGroup.rotation.set(0, f.th, bike.roll);
  const cockpit = rig.mode === 0;
  bikeGroup.visible = !cockpit;
  const lean = cockpit ? bike.roll : 0;
  quadMat.uniforms.uRotation.value.set(Math.cos(lean), Math.sin(lean));

  const crown = THREE.MathUtils.smoothstep(f.elev, LH[1] + 15, LH[2]);
  const dim = 1 - 0.38 * S.night;
  quadMat.uniforms.uTint.value.set(dim * (1 - 0.07 * crown), dim, dim * (1 + 0.08 * crown));
  quadMat.uniforms.uFlash.value.set(1, 0.3, 0.4).multiplyScalar(S.crashFlash * 120 / 255);
  const roadUniforms = city.uniforms;
  roadUniforms.uBike.value.set(bx, bz);
  roadUniforms.uBikeForward.value.set(Math.sin(f.th), Math.cos(f.th));
  roadUniforms.uHeadlight.value = lightOn ? 0.14 + 0.22 * (S.TH.dark || 0) + 0.08 * S.night : 0;

  sky.position.copy(camera.position);
  mountains.position.set(camera.position.x, 0, camera.position.z);
  city.update(bike.dist, camera.position, T);
  traffic.update(bike.dist, dt, T);
  signals.update(bike.dist);
  weather.update(dt, S, overlay, cockpit);

  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderSurfaces();
  camera.getWorldDirection(forward);
  horizon.set(forward.x, 0, forward.z, 0).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  quadMat.uniforms.uHorizon.value = Math.round((horizon.y / horizon.w * 0.5 + 0.5) * rt.height);
  quadMat.uniforms.uGlow.value = glow.render(scene, camera, rt.depthTexture,
    roadUniforms.uFogNear.value, roadUniforms.uFogFar.value);
  quadMat.uniforms.uGlowAmt.value = BLOOM ? (1 + 0.35 * S.night) * (1 - 0.25 * crown) : 0;
  overlay.clear();
  weather.draw(overlay, S, cockpit);
  if (cockpit) drawCockpit(overlay, S);
  overlay.upload();
  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);

  // the announcement board and the level readout
  banner.textContent = S.zoneText;
  banner.style.opacity = S.zoneT > 0 ? Math.min(1, S.zoneT) : 0;
  lvl.textContent = 'L' + ((S.layer ?? 0) + 1) + (S.waitLight ? '  ·  RED' : '');
  lvl.style.color = ['#ff9638', '#00ebff', '#ff3cbe'][S.layer ?? 0];

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    el.fps.textContent = Math.round(fpsN / fpsAcc) + ' FPS';
    el.kmh.textContent = Math.round(S.speed * 3.6) + ' KM/H';
    fpsAcc = 0; fpsN = 0;
  }
  requestAnimationFrame(frame);
}

resize();
hud();
requestAnimationFrame(frame);

// a handle for debugging and for driving the loop by hand from the console
window.__nd = { renderer, scene, camera, city, traffic, weather, rig, bike, S, frame, THREE,
                step: (n = 1, dt = 1 / 60) => {   // advance a virtual clock, so dt is real
                  for (let i = 0; i < n; i++) { last = __clock; __clock += dt * 1000; frame(__clock); }
                } };
let __clock = performance.now();
