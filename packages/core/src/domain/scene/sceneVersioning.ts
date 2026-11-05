/*
 * 读取场景文件的唯一入口：查版本号、校验、返回只含 schema 字段的干净副本。
 * 比当前程序更新的文件会报「请升级」，而不是勉强打开。改格式时：加 schema、加迁移、提升版本号。
 *
 * 其他版本编辑器导出的文件可能带着这里不支持的节点类型或字段：字段由 schema 丢掉，
 * 节点在校验前过滤掉（只有分组能当父节点，所以不影响层级），场景照常打开。
 */
import { z } from 'zod'
import { isRecord } from '../schemaHelpers'
import { SCENE_NODE_KINDS, SceneDocumentSchemaV2 } from './sceneSchemaV2'
import type { SceneDocumentV2 } from './sceneTypes'

/** 这个版本读写的场景格式。 */
export const SCENE_DOCUMENT_VERSION = 2

/** 当前的文档结构，跟着 SCENE_DOCUMENT_VERSION 走。 */
export type SceneDocument = SceneDocumentV2

export class SceneDocumentError extends Error {
  constructor(
    message: string,
    /** 可读的问题列表，如 "nodes[3].name：期望 string"。 */
    readonly issues: readonly string[] = [],
  ) {
    super(message)
    this.name = 'SceneDocumentError'
  }
}

/** 文件来自比当前程序更新的编辑器。 */
export class SceneDocumentVersionError extends SceneDocumentError {
  constructor(readonly version: number) {
    super(
      `场景文件格式为 v${version}，当前程序只支持到 v${SCENE_DOCUMENT_VERSION}。` +
        '该项目由更新版本的编辑器导出，请升级 Viewer SDK 或编辑器后再打开。',
    )
    this.name = 'SceneDocumentVersionError'
  }
}

export interface LoadedSceneDocument {
  document: SceneDocument
  /** 打开时过滤掉的、当前版本不支持的内容（给人看的说明）。 */
  dropped: string[]
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key)),
    '',
  )
}

const zhCN = z.locales.zhCN().localeError

export function describeSceneIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => `${formatPath(issue.path) || '场景文件'}：${issue.message}`)
}

/** 去掉当前版本不支持的节点和旧版遗留的 mock 数据接口。 */
function withoutUnsupported(raw: Record<string, unknown>, dropped: string[]): Record<string, unknown> {
  const next = { ...raw }
  if (Array.isArray(raw.nodes)) {
    next.nodes = raw.nodes.filter(node => {
      const kind = isRecord(node) ? node.kind : undefined
      if (typeof kind !== 'string' || SCENE_NODE_KINDS.includes(kind)) return true
      dropped.push(`不支持的节点类型 ${kind}：${String((node as { name?: unknown }).name ?? '')}`)
      return false
    })
  }
  if (Array.isArray(raw.dataSources))
    next.dataSources = raw.dataSources.filter(source => !isRecord(source) || source.type !== 'mock')
  return next
}

export function loadSceneDocument(raw: unknown): LoadedSceneDocument {
  if (!isRecord(raw)) throw new SceneDocumentError('场景文件不是 JSON 对象')
  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SceneDocumentError('场景文件缺少有效的格式版本（version）')
  }
  if (version > SCENE_DOCUMENT_VERSION) throw new SceneDocumentVersionError(version)
  if (version < SCENE_DOCUMENT_VERSION) throw new SceneDocumentError(`不支持的场景格式版本 v${version}`)
  const dropped: string[] = []
  const result = SceneDocumentSchemaV2.safeParse(withoutUnsupported(raw, dropped), { error: zhCN })
  if (result.success) return { document: result.data, dropped }
  const issues = describeSceneIssues(result.error)
  const shown = issues.slice(0, 3).join('；')
  const more = issues.length > 3 ? `（另有 ${issues.length - 3} 处问题）` : ''
  throw new SceneDocumentError(`场景文件校验失败：${shown}${more}`, issues)
}
