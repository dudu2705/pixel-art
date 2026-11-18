// weather.js — rain, snow, petals, ash, bubbles, fireflies, sand.
// The original drew these as streaks on the windshield in 2D. Here they are real
// particles around the camera, so they hold up from any camera angle.

import * as THREE from './vendor/three.module.js';

const KIND = {                        // [colour, fallSpeed, length, drift, size]
  rain:     { col: [130, 150, 200], fall: 34, len: 2.4, drift: 1.2, w: 0.045, n: 1400 },
  monsoon:  { col: [150, 180, 200], fall: 44, len: 4.0, drift: 2.6, w: 0.06,  n: 2000 },
  snow:     { col: [230, 240, 255], fall: 3.2, len: 0.22, drift: 1.8, w: 0.20, n: 900 },
  petals:   { col: [255, 170, 210], fall: 2.6, len: 0.3, drift: 2.6, w: 0.26, n: 700 },
  ash:      { col: [170, 120, 95],  fall: 4.0, len: 0.26, drift: 1.4, w: 0.20, n: 900 },
  bubbles:  { col: [170, 230, 255], fall: -4.5, len: 0.3, drift: 0.8, w: 0.22, n: 700 },
  fireflies:{ col: [200, 255, 120], fall: 0.2, len: 0.25, drift: 0.7, w: 0.20, n: 420 },
  sand:     { col: [230, 160, 90],  fall: 1.2, len: 1.6, drift: 14,  w: 0.09, n: 1300 },
  fog:      { col: [200, 210, 230], fall: 0.4, len: 0.3, drift: 0.9, w: 0.30, n: 300 },
  clear:    { col: [255, 255, 255], fall: 0, len: 0, drift: 0, w: 0, n: 0 },
};

const VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec2 iSize;      // width, length
  attribute float iSeed;
  varying float vSeed; varying vec2 vUv; varying vec3 vWorld;
  void main() {
    vSeed = iSeed; vUv = uv;
    // billboard each streak toward the camera, keeping it vertical
    vec3 toCam = normalize(cameraPosition - iPos);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 p = iPos + right * position.x * iSize.x + vec3(0.0, 1.0, 0.0) * position.y * iSize.y;
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying float vSeed; varying vec2 vUv; varying vec3 vWorld;
  uniform vec3 uCol, uFog, uCam;
  uniform float uFogNear, uFogFar, uTime, uAlpha, uTwinkle;
  void main() {
    float a = uAlpha;
    if (uTwinkle > 0.5) a *= 0.35 + 0.65 * abs(sin(uTime * 3.0 + vSeed * 6.2));
    float d = distance(vWorld, uCam);
    a *= 1.0 - smoothstep(uFogNear, uFogFar, d);
    a *= smoothstep(0.0, 3.0, d);                 // nothing right on the lens
    gl_FragColor = vec4(uCol, a);
  }
`;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.kind = 'clear';
    this.mesh = null;
    this.uniforms = {
      uCol: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color() },
      uCam: { value: new THREE.Vector3() }, uFogNear: { value: 40 }, uFogFar: { value: 900 },
      uTime: { value: 0 }, uAlpha: { value: 0.35 }, uTwinkle: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.R = 46;                                   // radius of the live volume
    this.build(2000);
  }

  build(max) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.uv = base.attributes.uv;
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.iSeed = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.iPos);
    g.setAttribute('iSize', this.iSize);
    g.setAttribute('iSeed', this.iSeed);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.scene.add(this.mesh);
    this.max = max;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ x: 0, y: 0, z: 0, seed: Math.random(), live: false });
  }

  setKind(k) {
    if (k === this.kind) return;
    this.kind = KIND[k] ? k : 'clear';
    for (const q of this.p) q.live = false;
  }

  update(camPos, dt, time, fogCol, fogFar) {
    const K = KIND[this.kind];
    this.uniforms.uTime.value = time;
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uFog.value.copy(fogCol);
    this.uniforms.uFogFar.value = Math.min(fogFar, 600);
    if (!K || !K.n) { this.mesh.geometry.instanceCount = 0; return; }

    this.uniforms.uCol.value.setRGB(K.col[0] / 255, K.col[1] / 255, K.col[2] / 255);
    this.uniforms.uAlpha.value = this.kind === 'rain' || this.kind === 'monsoon' ? 0.3
      : this.kind === 'fog' ? 0.1 : 0.8;
    this.uniforms.uTwinkle.value = this.kind === 'fireflies' ? 1 : 0;

    const R = this.R, n = Math.min(K.n, this.max);
    const pa = this.iPos.array, sa = this.iSize.array, se = this.iSeed.array;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const q = this.p[i];
      if (!q.live) {
        q.x = camPos.x + (Math.random() * 2 - 1) * R;
        q.y = camPos.y + (K.fall >= 0 ? R * 0.7 : -R * 0.5) * (0.4 + Math.random() * 0.8);
        q.z = camPos.z + (Math.random() * 2 - 1) * R;
        q.live = true;
      }
      q.y -= K.fall * dt;
      q.x += Math.sin(time * 0.7 + q.seed * 9) * K.drift * dt;
      q.z += Math.cos(time * 0.5 + q.seed * 7) * K.drift * dt;
      const dx = q.x - camPos.x, dy = q.y - camPos.y, dz = q.z - camPos.z;
      if (Math.abs(dx) > R || Math.abs(dz) > R || dy < -R * 0.6 || dy > R) { q.live = false; continue; }
      pa[k * 3] = q.x; pa[k * 3 + 1] = q.y; pa[k * 3 + 2] = q.z;
      sa[k * 2] = K.w; sa[k * 2 + 1] = K.len;
      se[k] = q.seed;
      k++;
    }
    this.mesh.geometry.instanceCount = k;
    this.iPos.needsUpdate = this.iSize.needsUpdate = this.iSeed.needsUpdate = true;
  }
}
