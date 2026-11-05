<script setup lang="ts">
/** 「3D场景」页面：场景卡片，新建、打开、重命名、删除、导出项目包。 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Plus } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ProjectInfo } from '@/api/adapter'
import { downloadProjectPackage } from '@/api/exportPackage'
import ProjectCard from '@/components/project/ProjectCard.vue'
import { confirmAction } from '@/components/ui/confirm'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()
const exportingId = ref('')

onMounted(() => void store.refresh())

const nameRule = {
  inputValidator: (text: string) => (text.trim().length >= 2 && text.trim().length <= 40) || '名称为 2–40 个字符',
  customClass: 'studio-dialog',
  cancelButtonText: '取消',
}

function report(error: unknown, fallback: string): void {
  ElMessage.error(error instanceof Error ? error.message : fallback)
}

function open(project: ProjectInfo): void {
  void router.push({ name: 'editor', params: { projectId: project.id } })
}

async function create(): Promise<void> {
  let name: string
  try {
    name = (await ElMessageBox.prompt('场景名称', '新建场景', { ...nameRule, confirmButtonText: '创建并打开' })).value
  } catch {
    return
  }
  try {
    open(await store.create(name.trim()))
  } catch (error) {
    report(error, '创建失败')
  }
}

async function rename(project: ProjectInfo): Promise<void> {
  let name: string
  try {
    name = (
      await ElMessageBox.prompt('新的名称', '重命名', {
        ...nameRule,
        inputValue: project.name,
        confirmButtonText: '保存',
      })
    ).value
  } catch {
    return
  }
  try {
    await store.rename(project.id, name.trim())
  } catch (error) {
    report(error, '重命名失败')
  }
}

async function remove(project: ProjectInfo): Promise<void> {
  const message = `删除「${project.name}」？场景数据将被移除，此操作不可撤销。`
  if (!(await confirmAction(message, { title: '删除场景', confirm: '删除', danger: true }))) return
  try {
    await store.remove(project.id)
  } catch (error) {
    report(error, '删除失败')
  }
}

async function exportPackage(project: ProjectInfo): Promise<void> {
  if (exportingId.value) return
  exportingId.value = project.id
  try {
    await downloadProjectPackage(project)
    ElMessage.success('项目包已导出（最近保存的版本）')
  } catch (error) {
    report(error, '导出失败')
  } finally {
    exportingId.value = ''
  }
}
</script>

<template>
  <section class="projects">
    <header class="projects__head">
      <div>
        <h1>3D场景</h1>
        <p>搭建三维场景，配置设备数据，导出给数据大屏</p>
      </div>
      <button class="s-btn s-btn--primary" data-testid="new-project" @click="create">
        <Plus :size="14" />新建场景
      </button>
    </header>

    <p v-if="store.error" class="projects__error">{{ store.error }}</p>
    <div v-if="store.projects.length" class="projects__grid">
      <ProjectCard
        v-for="project in [...store.projects].reverse()"
        :key="project.id"
        :project="project"
        :exporting="exportingId === project.id"
        @edit="open"
        @export="exportPackage"
        @rename="rename"
        @remove="remove"
      />
    </div>
    <div v-else-if="!store.loading && !store.error" class="projects__empty">
      <Box :size="28" />
      <p>还没有场景</p>
    </div>
  </section>
</template>

<style scoped>
.projects {
  max-width: 1480px;
}
.projects__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.projects__head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}
.projects__head p {
  margin: 4px 0 0;
  color: var(--s-fg-3);
}
.projects__head .s-btn {
  height: 32px;
  padding: 0 14px;
}
.projects__error {
  margin: 0 0 16px;
  color: var(--s-danger);
}
.projects__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}
.projects__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 80px 20px;
  border: 1px dashed var(--s-line-2);
  border-radius: 12px;
  color: var(--s-fg-3);
}
.projects__empty p {
  margin: 0;
}
</style>
