import { GltfReader } from '@twin-studio/core'
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

let queue: Promise<unknown> = Promise.resolve()

/** 限制同时解码的模型数；列表复用后端缩略图，仅上传和补旧图时渲染。 */
export function modelThumbnail(load: () => Promise<Blob | null>): Promise<Blob | null> {
  const task = queue.then(async () => {
    const blob = await load()
    return blob ? renderThumbnail(blob) : null
  })
  queue = task.catch(() => null)
  return task
}

async function renderThumbnail(blob: Blob): Promise<Blob | null> {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  const reader = new GltfReader({ renderer })
  const url = URL.createObjectURL(blob)
  const scene = new Scene()
  const room = new RoomEnvironment()
  try {
    renderer.setSize(320, 200, false)
    renderer.toneMapping = ACESFilmicToneMapping
    const { scene: model } = await reader.read(url)
    scene.add(model)
    const bounds = new Box3().setFromObject(model)
    if (bounds.isEmpty()) return null
    const center = bounds.getCenter(new Vector3())
    const size = Math.max(bounds.getSize(new Vector3()).length(), 0.001)
    const camera = new PerspectiveCamera(32, 1.6, size / 100, size * 10)
    camera.position.copy(center).addScaledVector(new Vector3(1, 0.75, 1.15).normalize(), size * 1.65)
    camera.lookAt(center)
    const light = new DirectionalLight(0xffffff, 2)
    light.position.set(3, 5, 4)
    scene.add(light, new HemisphereLight(0xffffff, 0x555566, 1.5))
    const environment = new PMREMGenerator(renderer)
    const target = environment.fromScene(room)
    try {
      scene.environment = target.texture
      renderer.setClearColor(0, 0)
      renderer.render(scene, camera)
      return await new Promise<Blob | null>(resolve => renderer.domElement.toBlob(resolve, 'image/png'))
    } finally {
      target.dispose()
      environment.dispose()
    }
  } finally {
    scene.traverse(node => {
      if (!(node instanceof Mesh)) return
      node.geometry.dispose()
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        for (const value of Object.values(material)) if (value instanceof Texture) value.dispose()
        material.dispose()
      }
    })
    URL.revokeObjectURL(url)
    reader.dispose()
    room.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
