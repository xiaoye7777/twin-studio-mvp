/*
 * 对接真实后端的模板：复制成同目录的 adapter.local.ts，再按真实接口改。
 *
 * 只写和接口文档不一样的部分，其余沿用默认实现。下面的路径和字段名都是占位，要换成真实的。
 * adapter.local.ts 只提交到公司分支，不要推到 GitHub。
 */
import { type ApiAdapter, defaultAdapter } from './adapter'

const adapter: ApiAdapter = {
  ...defaultAdapter,

  // 路径不一样时改这里
  scenePath: projectId => `/真实路径/${projectId}/场景`,

  // 字段名不一样时，把真实响应翻译成文档里的结构
  toSceneRead(raw) {
    const value = raw as { 真实版本字段: number; 真实时间字段: string; 真实内容字段: unknown }
    return { revision: value.真实版本字段, updatedAt: value.真实时间字段, document: value.真实内容字段 }
  },
}

export default adapter
