import { type Material, Mesh, type Object3D, type Texture } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { GltfReader, type GltfReaderOptions } from './gltfReader'

/**
 * Gives every node of an imported model a stable id. Ids embedded by the exporter win; otherwise the id is
 * the node's child-index path. This is exactly the rule scenes were saved with, so overrides and bindings on
 * model parts keep resolving.
 */
export function normalizeAssetNodeIds(root: Object3D): void {
  const used = new Set<string>()
  const visit = (node: Object3D, path: string, insidePart: boolean): void => {
    const embedded: unknown = node.userData.meteorAssetNodeId ?? node.userData.assetNodeId
    const named = typeof embedded === 'string' && embedded !== ''
    const fallback = path === 'root' ? '__asset_root__' : `legacy:${path}`
    const id = named && !used.has(embedded) ? embedded : fallback
    node.userData.assetNodeId = id
    used.add(id)
    // 文件给节点写了固定 id，它就是部件。它下面文件里没有名字的节点不是部件，只是它的表面：加载器把多材质网格拆成的
    // 子网格、压缩工具为量化插入的包裹节点。选中和点击都应该落在部件上（整扇门，不是门上的标签）。id 规则不变，
    // 已保存场景里的绑定照常解析。
    if (insidePart && !named && node.userData.name === undefined) node.userData.partSurface = true
    node.children.forEach((child, index) => visit(child, `${path}/${index}`, insidePart || named))
  }
  visit(root, 'root', false)
}

/** 是不是部件的表面，而不是部件本身（见 normalizeAssetNodeIds）。 */
export function isPartSurface(object: Object3D): boolean {
  return object.userData.partSurface === true
}

export type ModelLoaderOptions = GltfReaderOptions

/** Loads glTF files once per URL and hands out independent clones that share geometry and materials. */
export class ModelLoader {
  private readonly reader: GltfReader
  private readonly templates = new Map<string, Promise<Object3D>>()
  private disposed = false

  constructor(options: ModelLoaderOptions = {}) {
    this.reader = new GltfReader(options)
  }

  async load(url: string): Promise<Object3D> {
    if (this.disposed) throw new DOMException('Model loading cancelled', 'AbortError')
    let template = this.templates.get(url)
    if (!template) {
      template = this.reader.read(url).then(gltf => {
        const root = gltf.scene
        root.animations = gltf.animations
        normalizeAssetNodeIds(root)
        root.traverse(node => {
          if (node instanceof Mesh) {
            node.castShadow = true
            node.receiveShadow = true
          }
        })
        return root
      })
      this.templates.set(url, template)
      template.catch(() => this.templates.delete(url))
    }
    const source = await template
    if (this.disposed) throw new DOMException('Model loading cancelled', 'AbortError')
    const instance = cloneSkinned(source)
    instance.animations = source.animations
    return instance
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const pending = [...this.templates.values()]
    this.templates.clear()
    // Clones share the templates' GPU resources, so they are freed once, here, after loads settle.
    void Promise.allSettled(pending).then(results => {
      const disposables = new Set<{ dispose(): void }>()
      for (const result of results) {
        if (result.status !== 'fulfilled') continue
        result.value.traverse(node => {
          if (!(node instanceof Mesh)) return
          disposables.add(node.geometry)
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            disposables.add(material as Material)
            for (const value of Object.values(material))
              if (value && typeof value === 'object' && 'isTexture' in value) disposables.add(value as Texture)
          }
        })
      }
      disposables.forEach(item => item.dispose())
    })
    this.reader.dispose()
  }
}
