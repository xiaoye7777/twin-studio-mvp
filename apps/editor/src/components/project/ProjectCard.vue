<script setup lang="ts">
import { Box, MoreHorizontal, PenLine, Trash2, Type } from 'lucide-vue-next'
import { computed } from 'vue'
import type { ProjectInfo } from '@/api/adapter'
import type { MenuSections } from '@/components/ui/menu'
import UiDropdown from '@/components/ui/UiDropdown.vue'

const props = defineProps<{ project: ProjectInfo }>()
const emit = defineEmits<{
  edit: [project: ProjectInfo]
  rename: [project: ProjectInfo]
  remove: [project: ProjectInfo]
}>()
const updated = computed(() =>
  new Date(props.project.updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
)
const menu = computed<MenuSections>(() => [
  [{ label: '编辑信息', icon: Type, action: () => emit('rename', props.project) }],
  [{ label: '删除场景', icon: Trash2, danger: true, action: () => emit('remove', props.project) }],
])
</script>

<template>
  <article class="card" :data-testid="`project-card-${project.name}`">
    <button class="card__cover" :title="`编辑 ${project.name}`" @click="emit('edit', project)">
      <img v-if="project.coverUrl" :src="project.coverUrl" alt="" />
      <span v-else class="card__placeholder"><Box :size="28" /></span>
      <span class="card__open"><PenLine :size="14" />进入编辑器</span>
    </button>
    <div class="card__body">
      <div class="card__text">
        <h3 :title="project.name">{{ project.name }}</h3>
        <p v-if="project.description" class="card__description" :title="project.description">
          {{ project.description }}
        </p>
        <p>更新于 {{ updated }}</p>
      </div>
      <UiDropdown :sections="menu" align="end" :width="160">
        <template #default="{ toggle }">
          <button class="s-icon-btn" title="更多" @click="toggle"><MoreHorizontal :size="15" /></button>
        </template>
      </UiDropdown>
    </div>
  </article>
</template>

<style scoped>
.card {
  overflow: hidden;
  border: 1px solid var(--s-line);
  border-radius: 10px;
  background: var(--s-wash), var(--s-panel);
}
.card__cover {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: var(--s-panel-2);
  cursor: pointer;
}
.card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card__placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--s-fg-3);
}
.card__open {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  opacity: 0;
  transition: opacity 120ms ease;
}
.card__cover:hover .card__open {
  opacity: 1;
}
.card__body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 14px;
}
.card__text {
  min-width: 0;
  flex: 1;
}
.card__text h3 {
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card__text p {
  margin: 2px 0 0;
  color: var(--s-fg-3);
  font-size: 11.5px;
}
.card__text p.card__description {
  overflow: hidden;
  color: var(--s-fg-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
