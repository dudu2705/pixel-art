// The weather and cockpit apply a per-pixel affine transform after the lean.
import * as THREE from './vendor/three.module.js';

export class ArtOverlay {
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.additive?.dispose();
    this.multiplier?.dispose();
    this.additive = this.makeTexture();
    this.multiplier = this.makeTexture();
  }

  makeTexture() {
    return new THREE.DataTexture(new Float32Array(this.width * this.height * 4),
      this.width, this.height, THREE.RGBAFormat, THREE.FloatType);
  }

  clear() {
    this.a = this.additive.image.data;
    this.m = this.multiplier.image.data;
    this.a.fill(0);
    this.m.fill(1);
  }

  offset(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return ((this.height - 1 - y) * this.width + x) * 4;
  }

  add(x, y, color, amount) {
    const i = this.offset(x, y);
    if (i < 0) return;
    for (let c = 0; c < 3; c++) this.a[i + c] += color[c] * amount / 255;
  }

  tint(x, y, color, redGreen, blue = redGreen) {
    const i = this.offset(x, y);
    if (i < 0) return;
    this.m[i] *= redGreen;
    this.m[i + 1] *= redGreen;
    this.m[i + 2] *= blue;
    this.a[i] = this.a[i] * redGreen + color[0] / 255;
    this.a[i + 1] = this.a[i + 1] * redGreen + color[1] / 255;
    this.a[i + 2] = this.a[i + 2] * blue + color[2] / 255;
  }

  upload() {
    this.additive.needsUpdate = true;
    this.multiplier.needsUpdate = true;
  }
}
