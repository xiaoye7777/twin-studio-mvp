/*
 * 前端和后端之间唯一知道「接口长什么样」的地方。
 *
 * 默认实现按 docs/editor-api.md 写。真实后端的路径或字段不一样时不用改这个文件：
 * 在同目录新建 adapter.local.ts（模板见 adapter.local.example.ts），只写不一样的部分，它会自动生效。
 * adapter.local.ts 只放在公司分支上，GitHub 上没有这个文件，合并时不会冲突。
 */
import type { AssetType, SceneDocument } from '@twin-studio/core'

export interface ProjectInfo {
  id: string
  name: string
  /** 描述；没填是空字符串。 */
  description: string
  coverUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AssetInfo {
  id: string
  name: string
  assetType: AssetType
  mimeType: string
  size: number
  lastModified: number
  createdAt: string
}

export interface SceneRead {
  revision: number
  updatedAt: string | null
  /** 项目还没保存过场景时是 null。 */
  document: unknown
}

export interface SceneSaved {
  revision: number
  updatedAt: string
}

export interface SceneConflict {
  currentRevision: number
  updatedAt: string | null
  updatedBy: string | null
}

export interface ApiResult {
  ok: boolean
  /** 业务错误码，见 docs/editor-api.md。 */
  code: number
  msg: string
  data: unknown
}

export interface ApiAdapter {
  /** 接口地址前缀。 */
  base: string

  // 路径
  projectsPath(): string
  projectPath(projectId: string): string
  coverPath(projectId: string): string
  scenePath(projectId: string): string
  assetsPath(): string
  assetPath(assetId: string): string
  assetContentPath(assetId: string): string

  /** 把后端的返回拆成统一的结构。 */
  unwrap(status: number, body: unknown): ApiResult
  /** 这个错误是不是场景版本冲突。 */
  isSceneConflict(result: ApiResult): boolean
  /** 这个错误是不是资源正在被使用。 */
  isAssetInUse(result: ApiResult): boolean

  // 请求：把前端的数据翻译成后端要的结构
  createProjectBody(input: { name: string; description: string }): unknown
  updateProjectBody(input: { name: string; description: string }): unknown
  saveSceneBody(input: { baseRevision: number; saveId: string; document: SceneDocument }): unknown
  uploadAssetForm(file: File, assetType: AssetType): FormData

  // 响应：把后端的数据翻译成前端要的结构
  toProject(raw: unknown): ProjectInfo
  toProjects(raw: unknown): ProjectInfo[]
  toSceneRead(raw: unknown): SceneRead
  toSceneSaved(raw: unknown): SceneSaved
  toSceneConflict(raw: unknown): SceneConflict
  toAsset(raw: unknown): AssetInfo
  toAssets(raw: unknown): AssetInfo[]
  /** 上传的返回。 */
  toUploadedAsset(raw: unknown): AssetInfo
}

/** 后端没返回描述时当作空。 */
function toProjectInfo(raw: unknown): ProjectInfo {
  const project = raw as ProjectInfo
  return { ...project, description: project.description ?? '' }
}

export const defaultAdapter: ApiAdapter = {
  base: import.meta.env.VITE_API_BASE ?? '/api/v1',

  projectsPath: () => '/projects',
  projectPath: projectId => `/projects/${encodeURIComponent(projectId)}`,
  coverPath: projectId => `/projects/${encodeURIComponent(projectId)}/cover`,
  scenePath: projectId => `/projects/${encodeURIComponent(projectId)}/scene`,
  assetsPath: () => '/assets',
  assetPath: assetId => `/assets/${encodeURIComponent(assetId)}`,
  assetContentPath: assetId => `/assets/${encodeURIComponent(assetId)}/content`,

  unwrap(status, body) {
    const value = (body ?? {}) as { code?: number; msg?: string; data?: unknown }
    const code = value.code ?? (status >= 400 ? status * 100 : 0)
    return { ok: status < 400 && code === 0, code, msg: value.msg ?? `请求失败（HTTP ${status}）`, data: value.data }
  },
  isSceneConflict: result => result.code === 40901,
  isAssetInUse: result => result.code === 40902,

  createProjectBody: input => input,
  updateProjectBody: input => input,
  saveSceneBody: input => input,
  uploadAssetForm(file, assetType) {
    const form = new FormData()
    form.append('file', file)
    form.append('assetType', assetType)
    form.append('lastModified', String(file.lastModified))
    return form
  },

  toProject: toProjectInfo,
  toProjects: raw => (raw as unknown[]).map(toProjectInfo),
  toSceneRead: raw => raw as SceneRead,
  toSceneSaved: raw => raw as SceneSaved,
  toSceneConflict(raw) {
    const value = raw as { currentRevision: number; updatedAt?: string; updatedBy?: { displayName?: string } }
    return {
      currentRevision: value.currentRevision,
      updatedAt: value.updatedAt ?? null,
      updatedBy: value.updatedBy?.displayName ?? null,
    }
  },
  toAsset: raw => raw as AssetInfo,
  toAssets: raw => raw as AssetInfo[],
  toUploadedAsset: raw => (raw as { asset: AssetInfo }).asset,
}

// 公司分支上的 adapter.local.ts 存在时用它；import.meta.glob 找不到文件时返回空对象，不会报错。
const local = import.meta.glob<{ default: ApiAdapter }>('./adapter.local.ts', { eager: true })

export const adapter: ApiAdapter = local['./adapter.local.ts']?.default ?? defaultAdapter
