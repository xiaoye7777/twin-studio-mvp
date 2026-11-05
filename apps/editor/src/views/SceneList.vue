<script setup lang="ts">
/** 「3D场景」页面：场景卡片，新建、打开、改信息、删除。 */
import { ElMessage } from 'element-plus'
import { Box, Plus } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ProjectInfo } from '@/api/adapter'
import ProjectCard from '@/components/project/ProjectCard.vue'
import ProjectDialog from '@/components/project/ProjectDialog.vue'
import { confirmAction } from '@/components/ui/confirm'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()
/** 对话框：新建时 project 是 null，编辑信息时是那个场景。 */
const dialog = ref<{ project: ProjectInfo | null } | null>(null)
const dialogOpen = computed({
  get: () => !!dialog.value,
  set: value => {
    if (!value) dialog.value = null
  },
})
const submitting = ref(false)

onMounted(() => void store.refresh())

function report(error: unknown, fallback: string): void {
  ElMessage.error(error instanceof Error ? error.message : fallback)
}

function open(project: ProjectInfo): void {
  void router.push({ name: 'editor', params: { projectId: project.id } })
}

async function submit(value: { name: string; description: string }): Promise<void> {
  const editing = dialog.value?.project
  submitting.value = true
  try {
    if (editing) await store.update(editing.id, value)
    else open(await store.create(value.name, value.description))
    dialog.value = null
  } catch (error) {
    report(error, editing ? '保存失败' : '创建失败')
  } finally {
    submitting.value = false
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
</script>

<template>
  <section class="projects">
    <header class="projects__head">
      <div>
        <h1>3D场景</h1>
        <p>搭建三维场景，配置设备数据，交给数据大屏</p>
      </div>
      <button class="s-btn s-btn--primary" data-testid="new-project" @click="dialog = { project: null }">
        <Plus :size="14" />新建场景
      </button>
    </header>

    <p v-if="store.error" class="projects__error">{{ store.error }}</p>
    <div v-if="store.projects.length" class="projects__grid">
      <ProjectCard
        v-for="project in [...store.projects].reverse()"
        :key="project.id"
        :project="project"
        @edit="open"
        @rename="dialog = { project: $event }"
        @remove="remove"
      />
    </div>
    <div v-else-if="!store.loading && !store.error" class="projects__empty">
      <Box :size="28" />
      <p>还没有场景</p>
    </div>

    <ProjectDialog
      v-model="dialogOpen"
      :title="dialog?.project ? '编辑场景信息' : '新建场景'"
      :confirm-text="dialog?.project ? '保存' : '创建并打开'"
      :initial="dialog?.project"
      :busy="submitting"
      @submit="submit"
    />
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
