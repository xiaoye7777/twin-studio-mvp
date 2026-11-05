import { Box3, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { TwinEngine } from '@twin-studio/core'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface GizmoSnap {
  enabled: boolean
  translate: number
  /** Degrees. */
  rotate: number
  scale: number
}

export interface GizmoChange {
  /** World matrices the selected objects should now have, in selection order. */
  worlds: Matrix4[]
}

/**
 * Move / rotate / scale handles for one or many objects. The handles sit on a pivot (the object itself for
 * one, the selection's centre for many); every change is reported as new world matrices so the editor can
 * write them to the document.
 */
export class TransformGizmo {
  readonly controls: TransformControls
  private readonly pivot = new Object3D()
  private objects: Object3D[] = []
  private pivotStart = new Matrix4()
  private starts: Matrix4[] = []
  private moved = false
  /** True from pointer-down on a handle until the pointer-up after it (lets clicks ignore gizmo drags). */
  active = false

  constructor(
    engine: TwinEngine,
    private readonly handlers: {
      onStart(): void
      onChange(change: GizmoChange): void
      onEnd(changed: boolean): void
    },
  ) {
    this.controls = new TransformControls(engine.camera, engine.canvas)
    this.controls.size = 0.85
    this.pivot.name = 'Gizmo Pivot'
    this.pivot.userData.editorInternal = true
    engine.overlay.add(this.pivot)
    const helper = this.controls.getHelper()
    helper.userData.editorInternal = true
    engine.scene.add(helper)
    this.controls.addEventListener('dragging-changed', event => {
      engine.setControlsEnabled(!event.value)
    })
    this.controls.addEventListener('mouseDown', () => {
      this.active = true
      this.moved = false
      this.pivot.updateMatrixWorld(true)
      this.pivotStart.copy(this.pivot.matrixWorld)
      this.starts = this.objects.map(object => {
        object.updateWorldMatrix(true, false)
        return object.matrixWorld.clone()
      })
      this.handlers.onStart()
    })
    this.controls.addEventListener('objectChange', () => {
      if (!this.objects.length) return
      this.moved = true
      this.pivot.updateMatrixWorld(true)
      const delta = this.pivot.matrixWorld.clone().multiply(this.pivotStart.clone().invert())
      this.handlers.onChange({ worlds: this.starts.map(start => delta.clone().multiply(start)) })
    })
    this.controls.addEventListener('mouseUp', () => {
      this.handlers.onEnd(this.moved)
      // Clear after the click event that follows this pointer-up has been ignored.
      setTimeout(() => (this.active = false), 0)
    })
  }

  get dragging(): boolean {
    return this.controls.dragging
  }

  setMode(mode: GizmoMode): void {
    this.controls.setMode(mode)
  }

  setSpace(space: 'world' | 'local'): void {
    this.controls.setSpace(space)
  }

  setSnap(snap: GizmoSnap): void {
    this.controls.setTranslationSnap(snap.enabled ? snap.translate : null)
    this.controls.setRotationSnap(snap.enabled ? (snap.rotate * Math.PI) / 180 : null)
    this.controls.setScaleSnap(snap.enabled ? snap.scale : null)
  }

  /** Puts the handles on these objects (none hides them). Ignored while dragging. */
  attach(objects: readonly Object3D[]): void {
    if (this.controls.dragging) return
    this.objects = [...objects]
    if (!objects.length) {
      this.controls.detach()
      return
    }
    if (objects.length === 1) {
      const object = objects[0]!
      object.updateWorldMatrix(true, false)
      object.matrixWorld.decompose(this.pivot.position, this.pivot.quaternion, new Vector3())
    } else {
      const box = new Box3()
      for (const object of objects) box.expandByObject(object, true)
      box.getCenter(this.pivot.position)
      if (!box.isEmpty()) this.pivot.position.y = box.min.y
      this.pivot.quaternion.copy(new Quaternion())
    }
    this.pivot.scale.set(1, 1, 1)
    this.pivot.updateMatrixWorld(true)
    this.controls.attach(this.pivot)
  }

  setVisible(visible: boolean): void {
    this.controls.enabled = visible
    this.controls.getHelper().visible = visible && this.objects.length > 0
  }

  dispose(): void {
    this.controls.detach()
    this.controls.getHelper().removeFromParent()
    this.controls.dispose()
    this.pivot.removeFromParent()
  }
}
