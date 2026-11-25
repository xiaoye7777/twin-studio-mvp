/*
 * 文字标签：一块始终面向相机的文字牌，可选一条连到地面的引线。
 */
import { BufferGeometry, Group, Line, LineBasicMaterial, type Object3D, Vector3 } from 'three'
import type { LabelNodeV2 } from '../../../domain/scene'
import { TextSprite } from '../textSprite'

export function createLabelObject(node: LabelNodeV2): Object3D {
  const group = new Group()
  // Labels the user placed outrank automatic ones.
  const sprite = new TextSprite(undefined, 3)
  group.add(sprite)
  updateLabelObject(group, node)
  return group
}

export function updateLabelObject(group: Object3D, node: LabelNodeV2): void {
  const sprite = group.children.find((child): child is TextSprite => child instanceof TextSprite)
  const { text, style, color, background, size, leader } = node.label
  sprite?.setContent({ lines: [text || ' '], style, color, background, size })
  let line = group.children.find((child): child is Line => child instanceof Line)
  if (leader && !line) {
    line = new Line(
      new BufferGeometry().setFromPoints([new Vector3(), new Vector3(0, -1, 0)]),
      new LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    )
    line.raycast = () => {}
    const target = new Vector3()
    const leaderLine = line
    line.onBeforeRender = () => {
      // The leader runs from the label down to the ground, whatever the label's height.
      group.getWorldPosition(target)
      const scaleY = group.getWorldScale(new Vector3()).y || 1
      leaderLine.scale.y = Math.max(0.001, target.y / scaleY)
    }
    group.add(line)
  } else if (!leader && line) {
    line.removeFromParent()
    line.geometry.dispose()
    ;(line.material as LineBasicMaterial).dispose()
  }
  if (line && leader) (line.material as LineBasicMaterial).color.set(color)
}
