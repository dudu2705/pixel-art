import * as THREE from './vendor/three.module.js';
import { SEGL, DRAW, NSEG, CITIES, ZONE_NAMES, LINK_NAMES, LH,
         zoneAt, district, setTime, D } from './world.js';
import { frameAt } from './road.js';
import { City, ROAD_LAYER } from './city.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';
import { Sky } from './sky.js';
import { ArtOverlay } from './overlay.js';
import { drawCockpit } from './cockpit.js';
import { makeLightCycle } from './cycle.js';
import { Signals } from './signals.js';
import { S, update as simUpdate, setAuto, setCruise, cruiseKmh } from './sim.js';
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
const sky = new Sky(scene);
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
  sky.resize(pw / CITY_SCALE, ph / CITY_SCALE, artWidth, artHeight);
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

// ---------- world streaming ----------
const city = new City(scene);
const cycle = makeLightCycle(city.uniforms);
scene.add(cycle);
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
  else if (k === 'c') { rig.cycleShot(); banner2('CAMERA · ' + MODES[rig.mode]); }
  else if (k === 'h') document.body.classList.toggle('hints');
  else if (k === 'b') { BLOOM = !BLOOM; banner2('GLOW · ' + (BLOOM ? 'ON' : 'OFF')); }
  else if (/^[1-7]$/.test(e.key)) { rig.setMode(+e.key - 1); banner2('CAMERA · ' + MODES[rig.mode]); }
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
function theme() {
  const z = zoneAt(Math.floor(S.z / SEGL) % NSEG);
  // fog, sky and the hour all come from the simulation's blendTheme
  city.setFog(S.FOG, 50 * S.fogK, DRAW * SEGL * (0.42 + 0.4 * S.fogK));

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
  theme();
  rig.update(bike, dt);

  const f = frameAt(bike.dist, {});
  const bx = f.x + f.rx * bike.lat, bz = f.z + f.rz * bike.lat;
  cycle.position.set(bx, f.y, bz);
  cycle.rotation.set(0, f.th, bike.roll);
  const cockpit = rig.mode === 0;
  cycle.visible = !cockpit;
  const spin = bike.dist / 0.5 % (2 * Math.PI);
  cycle.material.uniforms.uSpin.value.set(Math.cos(spin), Math.sin(spin));
  const [r, g, b] = S.SKY[1].map((value, i) => (value + S.SKY[2][i]) / 510);
  cycle.material.uniforms.uSky.value.setRGB(r, g, b);
  cycle.material.uniforms.uViewportHeight.value = rt.height;
  const lean = cockpit ? bike.roll : 0;
  quadMat.uniforms.uRotation.value.set(Math.cos(lean), Math.sin(lean));

  const crown = THREE.MathUtils.smoothstep(f.elev, LH[1] + 15, LH[2]);
  const dim = 1 - 0.38 * S.night;
  const tint = quadMat.uniforms.uTint.value.set(dim * (1 - 0.07 * crown), dim, dim * (1 + 0.08 * crown));
  const lightGrade = BLOOM ? (1 + 0.35 * S.night) * (1 - 0.25 * crown) : 0;
  quadMat.uniforms.uFlash.value.set(1, 0.3, 0.4).multiplyScalar(S.crashFlash * 120 / 255);
  const roadUniforms = city.uniforms;
  roadUniforms.uBike.value.set(bx, bz);
  roadUniforms.uBikeForward.value.set(Math.sin(f.th), Math.cos(f.th));
  roadUniforms.uHeadlight.value = lightOn && cockpit ? 0.14 + 0.22 * (S.TH.dark || 0) + 0.08 * S.night : 0;

  camera.getWorldDirection(forward);
  horizon.set(forward.x, 0, forward.z, 0).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  const horizonPixel = (horizon.y / horizon.w * 0.5 + 0.5) * rt.height;
  quadMat.uniforms.uHorizon.value = Math.round(horizonPixel);
  const focal = camera.projectionMatrix.elements[5] * rt.height / (2 * CITY_SCALE);
  sky.update(dt, S, Math.atan2(forward.x, forward.z), (rt.height - horizonPixel) / CITY_SCALE,
    focal, f.elev, crown, [lightGrade / tint.x, lightGrade / tint.y, lightGrade / tint.z]);

  city.update(bike.dist, camera.position, T);
  traffic.update(bike.dist, dt, T);
  signals.update(bike.dist);
  weather.update(dt, S, overlay, cockpit);

  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderSurfaces();
  quadMat.uniforms.uGlow.value = glow.render(scene, camera, rt.depthTexture,
    roadUniforms.uFogNear.value, roadUniforms.uFogFar.value);
  quadMat.uniforms.uGlowAmt.value = lightGrade;
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
