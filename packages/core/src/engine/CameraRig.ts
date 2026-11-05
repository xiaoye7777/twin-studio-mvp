/*
 * 相机：轨道控制（旋转、平移、缩放），以及脚本控制的移动——飞到视角、聚焦对象、导览、镜头范围限制。
 */
import CameraControls from 'camera-controls'
import {
  Box3,
  MathUtils,
  Matrix4,
  type PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three'

CameraControls.install({
  THREE: { Box3, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4 },
})

export type Vec3 = [number, number, number]

export interface CameraView {
  position: Vec3
  target: Vec3
  fov?: number
  /**
   * Width / height of the viewport the view was composed in. On narrower screens the camera backs off so
   * the composed width stays in frame; on wider screens it keeps the height and simply shows more.
   */
  aspect?: number
}

export interface FlyOptions {
  /** Seconds; 0 jumps. */
  duration?: number
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

interface Flight {
  fromPosition: Vector3
  fromTarget: Vector3
  toPosition: Vector3
  toTarget: Vector3
  lift: number
  elapsed: number
  duration: number
  resolve: (completed: boolean) => void
}

/** Orbit navigation plus scripted camera moves (bookmarks, focus, tours). */
export class CameraRig {
  readonly controls: CameraControls
  private flight: Flight | null = null
  /** Degrees per second; 0 disables idle rotation. */
  autoRotateSpeed = 0
  private readonly position = new Vector3()
  private readonly target = new Vector3()

  constructor(
    readonly camera: PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.controls = new CameraControls(camera, dom)
    this.controls.dollyToCursor = true
    this.controls.smoothTime = 0.2
    this.controls.draggingSmoothTime = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.minDistance = 0.5
    this.controls.maxDistance = 8000
    this.controls.addEventListener('controlstart', () => this.cancelFlight())
  }

  /**
   * Restricts navigation: the orbit centre stays inside `boundary`, the distance within range and the camera
   * at least `minElevation` degrees above the horizon. null restores free navigation.
   */
  setLimits(
    limits: { boundary: Box3 | null; minDistance: number; maxDistance: number; minElevation: number } | null,
  ): void {
    const controls = this.controls
    controls.setBoundary(limits?.boundary ?? undefined)
    controls.minDistance = limits?.minDistance ?? 0.5
    controls.maxDistance = limits?.maxDistance ?? 8000
    controls.maxPolarAngle = limits
      ? Math.min(Math.PI * 0.495, Math.PI / 2 - MathUtils.degToRad(limits.minElevation))
      : Math.PI * 0.495
  }

  get enabled(): boolean {
    return this.controls.enabled
  }
  set enabled(value: boolean) {
    this.controls.enabled = value
  }

  get flying(): boolean {
    return this.flight !== null
  }

  /** Advances flights and damping. Returns true when the camera moved. */
  update(delta: number): boolean {
    const flight = this.flight
    if (flight) {
      flight.elapsed += delta
      const t = flight.duration > 0 ? Math.min(1, flight.elapsed / flight.duration) : 1
      const e = easeInOutCubic(t)
      this.position.lerpVectors(flight.fromPosition, flight.toPosition, e)
      this.position.y += flight.lift * Math.sin(Math.PI * e)
      this.target.lerpVectors(flight.fromTarget, flight.toTarget, e)
      void this.controls.setLookAt(
        this.position.x,
        this.position.y,
        this.position.z,
        this.target.x,
        this.target.y,
        this.target.z,
        false,
      )
      if (t >= 1) {
        this.flight = null
        flight.resolve(true)
      }
    } else if (this.autoRotateSpeed && this.controls.enabled) {
      void this.controls.rotate(MathUtils.degToRad(this.autoRotateSpeed) * delta, 0, false)
    }
    return this.controls.update(delta) || flight !== null
  }

  getView(): CameraView {
    const target = this.controls.getTarget(new Vector3())
    const position = this.camera.position
    return {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
      fov: this.camera.fov,
      aspect: this.camera.aspect,
    }
  }

  /** Where `view` should put the camera on the current viewport (see CameraView.aspect). */
  resolveView(view: CameraView): { position: Vector3; target: Vector3 } {
    const position = new Vector3(...view.position)
    const target = new Vector3(...view.target)
    const composed = view.aspect
    const current = this.camera.aspect
    if (composed && current > 0 && current < composed) {
      const offset = position
        .clone()
        .sub(target)
        .multiplyScalar(composed / current)
      position.copy(target).add(offset)
    }
    return { position, target }
  }

  /** Moves to a view; resolves true when it arrives, false if interrupted (user input or another move). */
  flyTo(view: CameraView, options: FlyOptions = {}): Promise<boolean> {
    this.cancelFlight()
    if (view.fov && Math.abs(view.fov - this.camera.fov) > 0.01) {
      this.camera.fov = view.fov
      this.camera.updateProjectionMatrix()
    }
    const { position, target } = this.resolveView(view)
    const duration = options.duration ?? 1.2
    if (duration <= 0) {
      void this.controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false)
      this.controls.update(0)
      return Promise.resolve(true)
    }
    const fromTarget = this.controls.getTarget(new Vector3())
    const fromPosition = this.camera.position.clone()
    const travel = fromPosition.distanceTo(position)
    // Long moves arc upwards so the camera does not skim through buildings on the way.
    const lift = travel > 20 ? Math.min(travel * 0.22, 300) : 0
    return new Promise(resolve => {
      this.flight = {
        fromPosition,
        fromTarget,
        toPosition: position,
        toTarget: target,
        lift,
        elapsed: 0,
        duration,
        resolve,
      }
    })
  }

  cancelFlight(): void {
    const flight = this.flight
    this.flight = null
    flight?.resolve(false)
  }

  /** A view that frames `box`, looking from the current direction unless one is given. */
  viewForBox(box: Box3, options: { padding?: number; direction?: Vector3 } = {}): CameraView {
    const sphere = box.getBoundingSphere(new Sphere())
    const radius = Math.max(sphere.radius, 0.5)
    const vertical = MathUtils.degToRad(this.camera.fov) / 2
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect)
    const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * (options.padding ?? 1.15)
    const direction =
      options.direction?.clone().normalize() ??
      this.camera.position.clone().sub(this.controls.getTarget(new Vector3())).normalize()
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.7, 1).normalize()
    const position = sphere.center.clone().addScaledVector(direction, distance)
    return { position: position.toArray() as Vec3, target: sphere.center.toArray() as Vec3 }
  }

  fitBox(box: Box3, options: FlyOptions & { padding?: number; direction?: Vector3 } = {}): Promise<boolean> {
    if (box.isEmpty()) return Promise.resolve(false)
    return this.flyTo(this.viewForBox(box, options), { duration: options.duration ?? 0.8 })
  }

  dispose(): void {
    this.cancelFlight()
    this.controls.dispose()
  }
}
