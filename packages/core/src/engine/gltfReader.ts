import { FileLoader, LoaderUtils, LoadingManager, type WebGLRenderer } from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
/** A made-up directory the decoders are requested from; the loading manager maps it to bundled files. */
const BUNDLED = 'twin-decoders/'

/** The `extensionsUsed` of a .glb (or .gltf JSON) file, read from its header without parsing the rest. */
export function gltfExtensionsUsed(data: ArrayBuffer): string[] {
  try {
    const view = new DataView(data)
    let json: Uint8Array
    if (data.byteLength >= 20 && view.getUint32(0, true) === GLB_MAGIC) {
      if (view.getUint32(16, true) !== JSON_CHUNK) return []
      json = new Uint8Array(data, 20, view.getUint32(12, true))
    } else json = new Uint8Array(data)
    const parsed = JSON.parse(new TextDecoder().decode(json)) as { extensionsUsed?: unknown }
    return Array.isArray(parsed.extensionsUsed)
      ? parsed.extensionsUsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export interface GltfReaderOptions {
  /** Needed for KTX2 textures: the transcoder picks a compressed format the GPU supports. */
  renderer?: WebGLRenderer
  /** Serve the Draco decoder from this directory instead of the bundled copy. */
  dracoDecoderPath?: string
}

/**
 * Reads glTF files with every compression delivery tools produce: Meshopt, Draco and KTX2 (Basis) textures.
 * The decoders ship with the code and are only fetched when a file needs them, so compressed models work
 * offline and uncompressed ones cost nothing extra.
 */
export class GltfReader {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  private readonly manager = new LoadingManager()
  private readonly files = new Map<string, string>()
  private draco: Promise<DRACOLoader> | null = null
  private ktx2: Promise<KTX2Loader> | null = null

  constructor(private readonly options: GltfReaderOptions = {}) {
    this.manager.setURLModifier(url => this.files.get(url) ?? url)
  }

  async read(url: string): Promise<GLTF> {
    const data = (await new FileLoader().setResponseType('arraybuffer').loadAsync(url)) as ArrayBuffer
    const used = gltfExtensionsUsed(data)
    if (used.includes('KHR_draco_mesh_compression')) this.loader.setDRACOLoader(await this.useDraco())
    if (used.includes('KHR_texture_basisu')) this.loader.setKTX2Loader(await this.useKtx2())
    return this.loader.parseAsync(data, LoaderUtils.extractUrlBase(url))
  }

  dispose(): void {
    void this.draco?.then(loader => loader.dispose())
    void this.ktx2?.then(loader => loader.dispose())
    this.draco = this.ktx2 = null
  }

  private useDraco(): Promise<DRACOLoader> {
    this.draco ??= (async () => {
      if (this.options.dracoDecoderPath) return new DRACOLoader().setDecoderPath(this.options.dracoDecoderPath)
      this.register((await import('./decoders/draco')).files)
      return new DRACOLoader(this.manager).setDecoderPath(BUNDLED)
    })()
    this.draco.catch(() => (this.draco = null))
    return this.draco
  }

  private useKtx2(): Promise<KTX2Loader> {
    const { renderer } = this.options
    if (!renderer) return Promise.reject(new Error('KTX2 贴图需要渲染器来选择压缩格式'))
    this.ktx2 ??= (async () => {
      this.register((await import('./decoders/basis')).files)
      return new KTX2Loader(this.manager).setTranscoderPath(BUNDLED).detectSupport(renderer)
    })()
    this.ktx2.catch(() => (this.ktx2 = null))
    return this.ktx2
  }

  private register(files: Record<string, string>): void {
    for (const [name, url] of Object.entries(files)) this.files.set(BUNDLED + name, url)
  }
}
