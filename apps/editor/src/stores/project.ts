import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ProjectInfo } from '@/api/adapter'
import { projectApi } from '@/api/repositories'

/** 场景列表。数据都在后端，这里只是当前页面的缓存。 */
export const useProjectStore = defineStore('project', () => {
  const projects = ref<ProjectInfo[]>([])
  const loading = ref(false)
  const error = ref('')

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      projects.value = await projectApi.list()
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function create(name: string, description: string): Promise<ProjectInfo> {
    const project = await projectApi.create(name, description)
    projects.value.push(project)
    return project
  }

  async function update(id: string, patch: { name: string; description: string }): Promise<void> {
    const updated = await projectApi.update(id, patch)
    projects.value = projects.value.map(project => (project.id === id ? updated : project))
  }

  async function replaceCover(id: string, image: Blob): Promise<void> {
    const coverUrl = await projectApi.setCover(id, image, { source: 'upload' })
    const project = projects.value.find(item => item.id === id)
    if (project) Object.assign(project, { coverUrl, coverSource: 'upload', coverBookmarkId: null })
  }

  async function remove(id: string): Promise<void> {
    await projectApi.remove(id)
    projects.value = projects.value.filter(project => project.id !== id)
  }

  return { projects, loading, error, refresh, create, update, replaceCover, remove }
})
