/*
 * 项目、场景、资源的读写都走这里，界面和编辑器不直接发请求。
 * 全部通过 adapter 取路径和翻译字段，所以换后端只影响 adapter。
 */
import {
  type AssetMetadata,
  type AssetRecord,
  type AssetRepository,
  type AssetType,
  loadSceneDocument,
  type SceneDocument,
  type SceneRepository,
} from '@twin-studio/core'
import { adapter, type AssetInfo, type ProjectInfo, type SceneConflict } from './adapter'
import { ApiError, download, request } from './http'

// ---------------------------------------------------------------- 项目

export const projectApi = {
  async list(): Promise<ProjectInfo[]> {
    return adapter.toProjects(await request(adapter.projectsPath()))
  },
  async get(id: string): Promise<ProjectInfo> {
    return adapter.toProject(await request(adapter.projectPath(id)))
  },
  async create(name: string, description: string): Promise<ProjectInfo> {
    return adapter.toProject(
      await request(adapter.projectsPath(), { method: 'POST', json: adapter.createProjectBody({ name, description }) }),
    )
  },
  async update(id: string, patch: { name: string; description: string }): Promise<ProjectInfo> {
    return adapter.toProject(
      await request(adapter.projectPath(id), { method: 'PATCH', json: adapter.updateProjectBody(patch) }),
    )
  },
  async remove(id: string): Promise<void> {
    await request(adapter.projectPath(id), { method: 'DELETE' })
  },
  /** 上传封面图；不改变项目的修改时间。 */
  async setCover(id: string, cover: Blob): Promise<void> {
    await request(adapter.coverPath(id), { method: 'PUT', headers: { 'Content-Type': cover.type }, body: cover })
  },
}

// ---------------------------------------------------------------- 场景

/** 场景已经被别人改过了，这次保存没有写入。 */
export class SceneConflictError extends Error {
  constructor(readonly conflict: SceneConflict) {
    super('场景已被其他人修改')
    this.name = 'SceneConflictError'
  }
}

/**
 * 记着当前版本号，保存时带上，后端据此发现冲突。
 * 一个打开的场景用一个实例；保存失败重试时 saveId 不变，后端不会把重试当成冲突。
 */
export class HttpSceneRepository implements SceneRepository {
  private revision = 0
  /** 还没成功的那次保存：同一份内容重试时沿用它的 saveId。 */
  private pending: { saveId: string; json: string } | null = null

  async load(projectId: string): Promise<SceneDocument | null> {
    const read = adapter.toSceneRead(await request(adapter.scenePath(projectId)))
    this.revision = read.revision
    this.pending = null
    return read.document ? loadSceneDocument(read.document).document : null
  }

  async save(document: SceneDocument): Promise<void> {
    const json = JSON.stringify(document)
    const saveId = this.pending?.json === json ? this.pending.saveId : crypto.randomUUID()
    this.pending = { saveId, json }
    try {
      const body = adapter.saveSceneBody({ baseRevision: this.revision, saveId, document })
      const saved = adapter.toSceneSaved(
        await request(adapter.scenePath(document.projectId), { method: 'PUT', json: body }),
      )
      this.revision = saved.revision
      this.pending = null
    } catch (error) {
      if (error instanceof ApiError && adapter.isSceneConflict(error.result)) {
        this.pending = null
        throw new SceneConflictError(adapter.toSceneConflict(error.result.data))
      }
      throw error
    }
  }

  /** 选择覆盖别人的修改：把基准版本改成最新的，再保存一次。 */
  async overwrite(document: SceneDocument, currentRevision: number): Promise<void> {
    this.revision = currentRevision
    await this.save(document)
  }
}

// ---------------------------------------------------------------- 资源

function toRecord(info: AssetInfo, blob: Blob): AssetRecord {
  return { ...info, fingerprint: info.id, blob }
}

function toMetadata({ id, name, mimeType, size, createdAt, assetType }: AssetInfo): AssetMetadata {
  return { id, name, mimeType, size, createdAt, assetType }
}

/** 资源文件内容不可变，同一个 id 下载一次就够了。 */
export class HttpAssetRepository implements AssetRepository {
  private readonly cache = new Map<string, Promise<AssetRecord | null>>()

  async saveFile(file: File, assetType: AssetType = 'model'): Promise<AssetRecord> {
    const uploaded = adapter.toUploadedAsset(
      await request(adapter.assetsPath(), { method: 'POST', body: adapter.uploadAssetForm(file, assetType) }),
    )
    const record = toRecord(uploaded, file)
    this.cache.set(uploaded.id, Promise.resolve(record))
    return record
  }

  get(assetId: string): Promise<AssetRecord | null> {
    let pending = this.cache.get(assetId)
    if (!pending) {
      pending = this.fetchRecord(assetId)
      this.cache.set(assetId, pending)
      pending.catch(() => this.cache.delete(assetId))
    }
    return pending
  }

  private async fetchRecord(assetId: string): Promise<AssetRecord | null> {
    try {
      const [raw, blob] = await Promise.all([
        request(adapter.assetPath(assetId)),
        download(adapter.assetContentPath(assetId)),
      ])
      return toRecord(adapter.toAsset(raw), blob)
    } catch (error) {
      if (error instanceof ApiError && error.result.code === 40400) return null
      throw error
    }
  }

  async listMetadata(): Promise<AssetMetadata[]> {
    return adapter.toAssets(await request(adapter.assetsPath())).map(toMetadata)
  }

  /** 删除资源。被场景引用时后端拒绝，force 表示已经确认过，仍然删除。 */
  async remove(assetId: string, force = false): Promise<void> {
    await request(`${adapter.assetPath(assetId)}${force ? '?force=true' : ''}`, { method: 'DELETE' })
    this.cache.delete(assetId)
  }
}

/** 整个应用共用一份资源仓库，下载过的模型不用重复下载。 */
export const assetRepository = new HttpAssetRepository()
