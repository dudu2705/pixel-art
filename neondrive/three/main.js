import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, LEN, RW, SW, CITIES, ZONE_NAMES, LINK_NAMES, LH, LAYER, ELEV,
         zoneAt, district, setTime, D } from './world.js';
import { frameAt } from './road.js';
import { City } from './city.js';
import { Traffic } from './traffic.js';
import { Weather } from './weather.js';
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

// Match the GPU game's art grid and its always-on 2x city detail.
const ART_SHORT_SIDE = 280, CITY_SCALE = 2;
let rt = null;
const quadScene = new THREE.Scene();
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: null }, uGlow: { value: null }, uGlowAmt: { value: 1.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D map;
    uniform sampler2D uGlow;
    uniform float uGlowAmt;
    void main() {
      vec3 c = texture2D(map, vUv).rgb;
      // the light buffer, quantised to six steps before it is added, exactly as
      // addLight() did. The steps are the point: a smooth bloom reads as film.
      vec3 g = floor(texture2D(uGlow, vUv).rgb * uGlowAmt * 6.0) / 6.0;
      gl_FragColor = vec4(c + g, 1.0);
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
  camera.aspect = artWidth / artHeight;
  camera.updateProjectionMatrix();
  if (rt) rt.dispose();
  const pw = artWidth * CITY_SCALE, ph = artHeight * CITY_SCALE;
  rt = new THREE.WebGLRenderTarget(pw, ph, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: true, type: THREE.UnsignedByteType,
  });
  glow.setSize(pw, ph);
  if (reflectRT) reflectRT.dispose();
  reflectRT = new THREE.WebGLRenderTarget(Math.round(pw / 2), Math.round(ph / 2), {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
  });
  city.uniforms.uReflect.value = reflectRT.texture;
  city.uniforms.uRes.value.set(pw, ph);   // gl_FragCoord is in render-target space
}
let reflectRT = null;
const mirrorCam = new THREE.PerspectiveCamera();
const REFL = new THREE.Matrix4();

// mirror the camera about the road plane and draw only the glowing things
function renderReflection(roadY) {
  REFL.set(1, 0, 0, 0,  0, -1, 0, 2 * roadY,  0, 0, 1, 0,  0, 0, 0, 1);
  mirrorCam.copy(camera);
  mirrorCam.matrixAutoUpdate = false;
  mirrorCam.matrixWorld.multiplyMatrices(REFL, camera.matrixWorld);
  mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert();
  mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
  mirrorCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  // the original reflected EVERYTHING above the horizon into the wet road, not
  // just the lights, which is why its streets are half reflection
  mirrorCam.layers.enableAll();
  const pc = renderer.getClearColor(new THREE.Color()), pa = renderer.getClearAlpha();
  renderer.setRenderTarget(reflectRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, mirrorCam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(pc, pa);
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

// headlight cone on the road
const head = new THREE.SpotLight(0xffeedd, 0);
scene.add(head);

// ---------- the light cycle's cockpit, for camera 1 ----------
// The original drew a smoked-glass dome with a glowing ring floating inside and
// no dash. Here it is geometry parented to the camera.
const cockpit = new THREE.Group();
{
  const bar = c => new THREE.MeshBasicMaterial({ color: c });
  const steel = bar(0xb9bec9), dark = bar(0x11151f), neon = bar(0x3fe6ff);

  // handlebar: a centre span with two swept arms and grips
  const span = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.022, 0.022), steel);
  span.position.set(0, -0.145, -0.42);
  cockpit.add(span);
  for (const sd of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.019, 0.019), steel);
    arm.position.set(sd * 0.36, -0.129, -0.44);
    arm.rotation.z = sd * 0.22;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.030, 0.030), dark);
    grip.position.set(sd * 0.50, -0.112, -0.45);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.042, 0.042), steel);
    tip.position.set(sd * 0.575, -0.106, -0.45);
    cockpit.add(arm, grip, tip);
  }

  // the dome rim sweeping up around the view
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.008, 6, 40, Math.PI), steel);
  rim.position.set(0, -0.20, -0.46);
  rim.rotation.z = Math.PI;
  cockpit.add(rim);

  // the ring of light floating inside the dome
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.0075, 6, 28), neon);
  ring.position.set(0, -0.225, -0.44);
  ring.rotation.x = Math.PI / 2.35;
  cockpit.add(ring);

  // a sliver of smoked glass catching the road light
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.10),
    new THREE.MeshBasicMaterial({ color: 0x0a1018, transparent: true, opacity: 0.55 }));
  glass.position.set(0, -0.258, -0.43);
  cockpit.add(glass);

  // the near plane is at 0.5, so the whole rig is built small and scaled out
  // past it; the angular size is unchanged
  cockpit.scale.setScalar(2.6);
  cockpit.renderOrder = 20;
  for (const o of cockpit.children) { o.material.depthTest = false; o.renderOrder = 20; }
}
camera.add(cockpit);
scene.add(camera);

// ---------- world streaming ----------
const city = new City(scene);
const traffic = new Traffic(scene, city.mats);
const weather = new Weather(scene);
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

  weather.setKind(S.fall === 'none' || S.fall === 'off' ? 'clear' : S.fall);
  city.uniforms.uWet.value = Math.max(0, (S.wet - 0.45) / 0.55);
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
  bikeGroup.visible = rig.mode !== 0;
  cockpit.visible = rig.mode === 0;

  sky.position.copy(camera.position);
  mountains.position.set(camera.position.x, 0, camera.position.z);
  city.update(bike.dist, camera.position, T);
  traffic.update(bike.dist, dt, T);
  signals.update(bike.dist);
  weather.update(camera.position, dt, T, city.uniforms.uFog.value, city.uniforms.uFogFar.value);

  if (city.uniforms.uWet.value > 0.02) renderReflection(frameAt(bike.dist, {}).y);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  quadMat.uniforms.map.value = rt.texture;
  quadMat.uniforms.uGlow.value = BLOOM ? glow.render(rt.texture) : null;
  quadMat.uniforms.uGlowAmt.value = BLOOM ? 1.0 : 0.0;
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
