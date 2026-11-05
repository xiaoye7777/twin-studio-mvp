import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three'

/** Editor ground grid: fine and major lines that fade with distance, drawn in one quad. */
export class InfiniteGrid extends Mesh<PlaneGeometry, ShaderMaterial> {
  constructor(cell = 1, section = 10, color = new Color('#8a8f98')) {
    super(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          cell: { value: cell },
          section: { value: section },
          color: { value: color },
          fadeDistance: { value: 400 },
        },
        vertexShader: /* glsl */ `
          uniform float fadeDistance;
          varying vec3 vWorld;
          void main() {
            vec3 p = vec3(position.x, 0.0, position.y) * fadeDistance;
            p.xz += cameraPosition.xz;
            vWorld = p;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float cell; uniform float section; uniform vec3 color; uniform float fadeDistance;
          varying vec3 vWorld;
          float line(float size, float width) {
            vec2 coord = vWorld.xz / size;
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
            return 1.0 - min(min(grid.x, grid.y) / width, 1.0);
          }
          void main() {
            float d = distance(cameraPosition.xz, vWorld.xz);
            float fade = 1.0 - smoothstep(fadeDistance * 0.25, fadeDistance, d);
            float minor = line(cell, 1.0) * 0.22;
            float major = line(section, 1.2) * 0.5;
            vec2 axes = abs(vWorld.xz) / fwidth(vWorld.xz);
            float alpha = max(minor, major) * fade;
            vec3 tint = color;
            if (axes.y < 1.2) { tint = vec3(0.82, 0.40, 0.36); alpha = max(alpha, 0.75 * fade); }
            if (axes.x < 1.2) { tint = vec3(0.42, 0.58, 0.81); alpha = max(alpha, 0.75 * fade); }
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(tint, alpha);
          }`,
      }),
    )
    this.name = 'Editor Grid'
    this.frustumCulled = false
    this.renderOrder = -0.5
    this.userData.editorInternal = true
    this.raycast = () => {}
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
