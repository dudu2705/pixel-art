// glow.js — the original's light buffer, not a photographic bloom.
//
// addLight() spread each light as (1 - d/R)^2 * I into a float buffer and then
// did `f = Math.floor(f * 6) / 6` before adding it to the picture. That
// quantisation is why neon in the original has visible steps around it instead
// of a smooth photographic halo. UnrealBloom cannot do that, so this is a small
// bright-pass + blur + quantise chain instead.

import * as THREE from './vendor/three.module.js';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform float uThreshold;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = dot(c, vec3(0.3, 0.5, 0.2));
    float k = max(0.0, l - uThreshold) / max(0.0001, 1.0 - uThreshold);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

// a 9-tap blur with a squared falloff, matching (1 - d/R)^2
const BLUR_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uDir;          // texel step, horizontal or vertical
  void main() {
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int i = -8; i <= 8; i++) {
      float fi = float(i);
      float d = abs(fi) / 9.0;
      float w = (1.0 - d) * (1.0 - d);      // the original's falloff
      sum += texture2D(tSrc, vUv + uDir * fi).rgb * w;
      wsum += w;
    }
    gl_FragColor = vec4(sum / wsum, 1.0);
  }
`;

export class Glow {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bright = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG,
      uniforms: { tSrc: { value: null }, uThreshold: { value: 0.42 } },
    });
    this.blur = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
    this.scene.add(this.quad);
    this.a = null; this.b = null;
  }

  setSize(w, h) {
    const gw = Math.max(1, Math.round(w / 2)), gh = Math.max(1, Math.round(h / 2));
    if (this.a) { this.a.dispose(); this.b.dispose(); }
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.a = new THREE.WebGLRenderTarget(gw, gh, opts);
    this.b = new THREE.WebGLRenderTarget(gw, gh, opts);
    this.gw = gw; this.gh = gh;
  }

  // takes the rendered scene, returns a texture holding just the spread light
  render(srcTexture) {
    const r = this.renderer;
    this.quad.material = this.bright;
    this.bright.uniforms.tSrc.value = srcTexture;
    r.setRenderTarget(this.a); r.render(this.scene, this.cam);

    this.quad.material = this.blur;
    this.blur.uniforms.tSrc.value = this.a.texture;
    this.blur.uniforms.uDir.value.set(1.6 / this.gw, 0);
    r.setRenderTarget(this.b); r.render(this.scene, this.cam);

    this.blur.uniforms.tSrc.value = this.b.texture;
    this.blur.uniforms.uDir.value.set(0, 1.6 / this.gh);
    r.setRenderTarget(this.a); r.render(this.scene, this.cam);

    r.setRenderTarget(null);
    return this.a.texture;
  }
}
