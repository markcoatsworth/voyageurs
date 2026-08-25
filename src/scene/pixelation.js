// Drives the "3D but pixel art" look: the renderer draws at a tiny internal
// resolution and the canvas is stretched up to fill the window with
// image-rendering:pixelated (set in style.css), so every pixel is chunky.
const INTERNAL_HEIGHT = 180;

export class PixelationController {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.renderer.setPixelRatio(1);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const aspect = window.innerWidth / window.innerHeight;
    const height = INTERNAL_HEIGHT;
    const width = Math.round(height * aspect);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
