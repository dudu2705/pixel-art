// The GPU reference accumulates a stepped radial light for each emitter.
import * as THREE from './vendor/three.module.js';

export const EMITTER_LAYER = 1;

export class Glow {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.geometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setIndex(quad.index);
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uSize: { value: new THREE.Vector2() },
        uRange: { value: new THREE.Vector2() },
        uFogRange: { value: new THREE.Vector2() },
        uDepth: { value: null },
      },
      vertexShader: `
        attribute vec3 iCenter;
        attribute vec4 iLight;
        attribute float iRadius;
        uniform vec2 uSize, uFogRange;
        flat out vec2 vCenter;
        flat out vec4 vLight;
        flat out float vRadius, vDepth;
        void main() {
          vec4 view = viewMatrix * vec4(iCenter, 1.0);
          vDepth = -view.z;
          if (vDepth <= 0.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          vec4 clip = projectionMatrix * view;
          vCenter = floor((clip.xy / clip.w * 0.5 + 0.5) * uSize + 0.5);
          vRadius = clamp(round(iRadius * projectionMatrix[1][1] * uSize.y * 0.5 / vDepth), 4.0, 60.0);
          vLight = vec4(iLight.rgb, iLight.a * (1.0 - smoothstep(uFogRange.x, uFogRange.y, vDepth) * 0.97));
          vec2 p = vCenter + position.xy * vRadius;
          gl_Position = vec4(p / uSize * 2.0 - 1.0, 0.0, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform vec2 uSize, uRange;
        uniform sampler2D uDepth;
        flat in vec2 vCenter;
        flat in vec4 vLight;
        flat in float vRadius, vDepth;
        out vec4 fragColor;
        void main() {
          vec2 centerUV = (vCenter + 0.5) / uSize;
          float depth = texture(uDepth, centerUV).r;
          float visibleDepth = uRange.x * uRange.y / (uRange.y + depth * (uRange.x - uRange.y));
          if (vDepth > visibleDepth + 0.9) discard;
          float f = max(0.0, 1.0 - distance(floor(gl_FragCoord.xy), vCenter) / vRadius);
          fragColor = vec4(vLight.rgb * floor(6.0 * f * f * vLight.a) / 6.0, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false,
    });
    this.sources = [];
    this.allocate(2048);
  }

  allocate(capacity) {
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.light = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.radius = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('iCenter', this.center);
    this.geometry.setAttribute('iLight', this.light);
    this.geometry.setAttribute('iRadius', this.radius);
  }

  setSize(width, height) {
    this.target.setSize(width, height);
    this.material.uniforms.uSize.value.set(width, height);
  }

  render(world, camera, depth, fogNear, fogFar) {
    this.sources.length = 0;
    let capacity = 0;
    world.traverseVisible(mesh => {
      if (!mesh.layers.isEnabled(EMITTER_LAYER) || !mesh.geometry?.isInstancedBufferGeometry) return;
      this.sources.push(mesh);
      capacity += mesh.geometry.instanceCount;
    });
    if (capacity > this.center.count) {
      this.geometry.dispose();
      this.allocate(Math.max(capacity, this.center.count * 2));
    }

    let count = 0;
    for (const mesh of this.sources) {
      const { iPos, iSize, iCol, iMeta } = mesh.geometry.attributes;
      const sign = mesh.material.userData.lightKind === 'sign';
      for (let i = 0; i < mesh.geometry.instanceCount; i++) {
        const height = iSize.getY(i);
        const strength = sign ? 0.36 : iMeta.getY(i);
        if (strength < 1 / 6) continue;
        this.center.setXYZ(count, iPos.getX(i), iPos.getY(i) + height / 2, iPos.getZ(i));
        this.light.setXYZW(count, iCol.getX(i), iCol.getY(i), iCol.getZ(i), strength);
        this.radius.setX(count, sign ? 2.2 : Math.min(3.5, 4 * Math.max(iSize.getX(i), height, iSize.getZ(i))));
        count++;
      }
    }

    this.geometry.instanceCount = count;
    for (const attr of [this.center, this.light, this.radius]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, count * attr.itemSize);
      attr.needsUpdate = true;
    }

    const { uniforms } = this.material;
    uniforms.uRange.value.set(camera.near, camera.far);
    uniforms.uFogRange.value.set(fogNear, fogFar);
    uniforms.uDepth.value = depth;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, camera);
    return this.target.texture;
  }
}
