/*
 * 开发用的模拟后端：真实后端还没好时，前端照常开发和演示。
 * 按 docs/editor-api.md 实现，数据写在 apps/editor/.mock-data/（已被 git 忽略），重启不丢。
 *
 * 只在开发服务器里运行，不会进生产包。配了 VITE_API_BASE 就不启用（见 vite.config.ts）。
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.mock-data')

interface Project {
  id: string
  name: string
  coverUrl: string | null
  createdAt: string
  updatedAt: string
}

interface Asset {
  id: string
  name: string
  assetType: string
  mimeType: string
  size: number
  sha256: string
  lastModified: number
  createdAt: string
}

interface SceneRecord {
  revision: number
  updatedAt: string
  document: Record<string, unknown>
  lastSaveId: string
}

interface Reply {
  status: number
  code: number
  msg: string
  data: unknown
}

const ok = (data: unknown, status = 200): Reply => ({ status, code: 0, msg: 'ok', data })
const fail = (status: number, code: number, msg: string, data: unknown = null): Reply => ({ status, code, msg, data })

function file(...parts: string[]): string {
  const path = join(DATA_DIR, ...parts)
  mkdirSync(dirname(path), { recursive: true })
  return path
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback
}

const projectsFile = () => file('projects.json')
const assetsFile = () => file('assets.json')
const sceneFile = (id: string) => file('scenes', `${id}.json`)
const coverFile = (id: string) => file('covers', `${id}.jpg`)
const contentFile = (id: string) => file('files', id)

function readProjects(): Project[] {
  return readJson<Project[]>(projectsFile(), [])
}

function writeProjects(projects: Project[]): void {
  writeFileSync(projectsFile(), JSON.stringify(projects, null, 2))
}

function readAssets(): Asset[] {
  return readJson<Asset[]>(assetsFile(), [])
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

/** 这个资源被哪些项目的场景引用。 */
function usagesOf(assetId: string): Array<{ id: string; name: string }> {
  return readProjects().filter(project => {
    const scene = readJson<SceneRecord | null>(sceneFile(project.id), null)
    const nodes = (scene?.document.nodes ?? []) as Array<{ kind: string; model?: { assetId: string } }>
    return nodes.some(node => node.kind === 'model' && node.model?.assetId === assetId)
  })
}

async function handleProjects(request: IncomingMessage, parts: string[]): Promise<Reply> {
  const [id, section] = parts
  const projects = readProjects()
  if (!id) {
    if (request.method === 'GET') return ok(projects)
    if (request.method === 'POST') {
      const { name } = JSON.parse((await readBody(request)).toString()) as { name?: string }
      if (!name?.trim()) return fail(400, 40000, '项目名称不能为空')
      const now = new Date().toISOString()
      const project: Project = {
        id: `p_${randomUUID()}`,
        name: name.trim(),
        coverUrl: null,
        createdAt: now,
        updatedAt: now,
      }
      writeProjects([...projects, project])
      return ok(project, 201)
    }
  }
  const project = projects.find(item => item.id === id)
  if (!project) return fail(404, 40400, '项目不存在')
  if (section === 'scene') return handleScene(request, project, projects)
  if (section === 'cover') {
    if (request.method !== 'PUT') return fail(405, 40000, '不支持的请求方法')
    writeFileSync(coverFile(project.id), await readBody(request))
    // 封面变化不算修改项目，updatedAt 不动。
    project.coverUrl = `/api/v1/projects/${project.id}/cover?v=${Date.now()}`
    writeProjects(projects)
    return ok({ coverUrl: project.coverUrl })
  }
  if (request.method === 'GET') return ok(project)
  if (request.method === 'PATCH') {
    const { name } = JSON.parse((await readBody(request)).toString()) as { name?: string }
    if (!name?.trim()) return fail(400, 40000, '项目名称不能为空')
    project.name = name.trim()
    project.updatedAt = new Date().toISOString()
    writeProjects(projects)
    return ok(project)
  }
  if (request.method === 'DELETE') {
    rmSync(sceneFile(project.id), { force: true })
    rmSync(coverFile(project.id), { force: true })
    writeProjects(projects.filter(item => item.id !== project.id))
    return ok(null)
  }
  return fail(405, 40000, '不支持的请求方法')
}

async function handleScene(request: IncomingMessage, project: Project, projects: Project[]): Promise<Reply> {
  const path = sceneFile(project.id)
  const current = readJson<SceneRecord | null>(path, null)
  if (request.method === 'GET') {
    return ok({
      revision: current?.revision ?? 0,
      updatedAt: current?.updatedAt ?? null,
      document: current?.document ?? null,
    })
  }
  if (request.method !== 'PUT') return fail(405, 40000, '不支持的请求方法')
  const raw = await readBody(request)
  if (raw.length > 8 * 1024 ** 2) return fail(413, 41300, '场景超过 8 MiB 限制')
  const { baseRevision, saveId, document } = JSON.parse(raw.toString()) as {
    baseRevision: number
    saveId: string
    document: Record<string, unknown>
  }
  if (document?.projectId !== project.id) return fail(400, 40000, '场景的 projectId 和路径不一致')
  if (!Number.isInteger(document.version) || (document.version as number) < 1)
    return fail(400, 40000, '场景缺少有效的版本号')
  // 网络重试：同一个 saveId 返回上次的结果，不算冲突。
  if (current && current.lastSaveId === saveId) return ok({ revision: current.revision, updatedAt: current.updatedAt })
  if ((current?.revision ?? 0) !== baseRevision) {
    return fail(409, 40901, '场景已被其他人修改', {
      currentRevision: current?.revision ?? 0,
      updatedAt: current?.updatedAt ?? null,
      updatedBy: { id: 'u_other', displayName: '其他用户' },
    })
  }
  const updatedAt = new Date().toISOString()
  const revision = baseRevision + 1
  writeFileSync(path, JSON.stringify({ revision, updatedAt, document, lastSaveId: saveId } satisfies SceneRecord))
  project.updatedAt = updatedAt
  writeProjects(projects)
  return ok({ revision, updatedAt })
}

async function handleAssets(
  request: IncomingMessage,
  parts: string[],
  query: URLSearchParams,
): Promise<Reply | Buffer> {
  const [id, section] = parts
  const assets = readAssets()
  if (!id) {
    if (request.method === 'GET') return ok([...assets].reverse())
    if (request.method === 'POST') {
      const contentType = request.headers['content-type'] ?? ''
      const body = new Uint8Array(await readBody(request))
      const form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
      const upload = form.get('file')
      const assetType = String(form.get('assetType') ?? 'model')
      if (!(upload instanceof File)) return fail(400, 40000, '缺少文件')
      const bytes = Buffer.from(await upload.arrayBuffer())
      if (bytes.length > 128 * 1024 ** 2) return fail(413, 41300, '文件超过 128 MiB 限制')
      // GLB 文件头是 glTF。
      if (assetType === 'model' && bytes.subarray(0, 4).toString() !== 'glTF')
        return fail(422, 42201, `${upload.name} 不是有效的 GLB 文件`)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const existing = assets.find(item => item.assetType === assetType && item.sha256 === sha256)
      if (existing) return ok({ isNew: false, asset: existing })
      const asset: Asset = {
        id: `asset_${randomUUID()}`,
        name: upload.name,
        assetType,
        mimeType: assetType === 'model' ? 'model/gltf-binary' : 'image/vnd.radiance',
        size: bytes.length,
        sha256,
        lastModified: Number(form.get('lastModified') ?? 0),
        createdAt: new Date().toISOString(),
      }
      writeFileSync(contentFile(asset.id), bytes)
      writeFileSync(assetsFile(), JSON.stringify([...assets, asset], null, 2))
      return ok({ isNew: true, asset }, 201)
    }
    return fail(405, 40000, '不支持的请求方法')
  }
  const asset = assets.find(item => item.id === id)
  if (!asset) return fail(404, 40400, '资源不存在')
  if (section === 'content') return readFileSync(contentFile(asset.id))
  if (section === 'usages') return ok({ projects: usagesOf(asset.id), components: [], versionCount: 0 })
  if (request.method === 'GET') return ok(asset)
  if (request.method === 'DELETE') {
    const projects = usagesOf(asset.id)
    if (projects.length && query.get('force') !== 'true')
      return fail(409, 40902, '资源正在被使用', { projects, components: [], versionCount: 0 })
    rmSync(contentFile(asset.id), { force: true })
    writeFileSync(
      assetsFile(),
      JSON.stringify(
        assets.filter(item => item.id !== asset.id),
        null,
        2,
      ),
    )
    return ok(null)
  }
  return fail(405, 40000, '不支持的请求方法')
}

function sendJson(response: ServerResponse, reply: Reply): void {
  response.statusCode = reply.status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify({ code: reply.code, msg: reply.msg, data: reply.data }))
}

export function mockApi(): Plugin {
  return {
    name: 'twin-studio-mock-api',
    configureServer(server) {
      server.middlewares.use('/api/v1', (request, response) => {
        void (async () => {
          const url = new URL(request.url ?? '/', 'http://mock')
          const [resource, ...parts] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
          try {
            // 封面是图片，直接返回文件。
            if (resource === 'projects' && parts[1] === 'cover' && request.method === 'GET') {
              const path = coverFile(parts[0]!)
              if (!existsSync(path)) return sendJson(response, fail(404, 40400, '没有封面'))
              response.setHeader('Content-Type', 'image/jpeg')
              return response.end(readFileSync(path))
            }
            if (resource === 'projects') return sendJson(response, await handleProjects(request, parts))
            if (resource === 'assets') {
              const reply = await handleAssets(request, parts, url.searchParams)
              if (!Buffer.isBuffer(reply)) return sendJson(response, reply)
              response.setHeader('Content-Type', 'application/octet-stream')
              response.setHeader('Content-Length', reply.length)
              response.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
              return response.end(reply)
            }
            sendJson(response, fail(404, 40400, '接口不存在'))
          } catch (error) {
            sendJson(response, fail(500, 50000, error instanceof Error ? error.message : '服务器错误'))
          }
        })()
      })
    },
  }
}
