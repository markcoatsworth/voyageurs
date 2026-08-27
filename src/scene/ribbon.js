import * as THREE from 'three';

// Builds a flat grid ribbon of `rows` x `cols` cells running along local Z
// from -length/2 to +length/2, where `xAt(z, colFraction)` places each
// vertex's X — this is how the river/banks bend and widen along the curve
// instead of being a straight rectangle.
export function buildCurvedGrid({ length, rows, cols, xAt, yAt = () => 0, uvXRepeat = 1, uvZDensity = 0.2 }) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];
  const rowStride = cols + 1;

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const z = -length / 2 + t * length;
    for (let c = 0; c <= cols; c++) {
      const cf = c / cols;
      positions.push(xAt(z, cf), yAt(z, cf), z);
      uvs.push(cf * uvXRepeat, (z + length / 2) * uvZDensity);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * rowStride + c;
      const b = a + 1;
      const d = (r + 1) * rowStride + c;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
