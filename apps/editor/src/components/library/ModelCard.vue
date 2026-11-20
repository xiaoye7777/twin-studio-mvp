<script setup lang="ts">
import { Box, MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { LibraryModel } from '@/api/repositories'
import UiDropdown from '@/components/ui/UiDropdown.vue'
import type { MenuSections } from '@/components/ui/menu'
import { writeAssetDrag } from '@/library/assetDrag'
import { useAssetStore } from '@/stores/assets'

const props = defineProps<{ model: LibraryModel; compact?: boolean }>()
const emit = defineEmits<{ rename: []; remove: [] }>()
const store = useAssetStore()
const root = ref<HTMLElement>()
let observer: IntersectionObserver | undefined
let visible = false
onMounted(() => {
  if (props.model.thumbnailUrl || !root.value) return
  observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible && !props.model.thumbnailUrl) void store.fillThumbnail(props.model.id, () => visible)
  })
  observer.observe(root.value)
})
onBeforeUnmount(() => {
  visible = false
  observer?.disconnect()
})

const size = computed(() => {
  const bytes = props.model.size
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MiB`
})
const menu: MenuSections = [
  [{ label: '修改标题', icon: Pencil, action: () => emit('rename') }],
  [{ label: '删除模型', icon: Trash2, danger: true, action: () => emit('remove') }],
]
function drag(event: DragEvent): void {
  if (event.dataTransfer && props.compact)
    writeAssetDrag(event.dataTransfer, {
      type: 'asset',
      assetId: props.model.id,
      name: props.model.title,
      scale: props.model.scale,
    })
}
</script>
<template>
  <article
    ref="root"
    class="model-card"
    :class="{ compact }"
    :draggable="!!compact"
    :data-testid="`model-${model.id}`"
    @dragstart="drag"
  >
    <div class="thumb">
      <img
        v-if="model.thumbnailUrl"
        :src="model.thumbnailUrl"
        loading="lazy"
        :alt="model.title"
        draggable="false"
      /><Box v-else :size="24" />
    </div>
    <div class="body">
      <div class="caption">
        <strong :title="model.title">{{ model.title }}</strong
        ><small>{{ size }}</small>
      </div>
      <UiDropdown :sections="menu" align="end" :width="138"
        ><template #default="{ toggle }">
          <button class="s-icon-btn" :aria-label="`${model.title}的更多操作`" title="更多" @click="toggle">
            <MoreHorizontal :size="14" />
          </button> </template
      ></UiDropdown>
    </div>
  </article>
</template>
<style scoped>
.model-card {
  box-shadow: var(--s-card-shadow, none);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--s-line);
  background: var(--s-wash), var(--s-panel);
  min-width: 0;
}
.thumb {
  display: grid;
  place-items: center;
  aspect-ratio: 16/9;
  min-height: 0;
  background: var(--s-panel-2);
  color: var(--s-fg-3);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.body {
  box-shadow: inset 0 1px var(--s-card-divider, transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 7px 8px 8px 10px;
}
.caption {
  min-width: 0;
}
.caption strong,
.caption small {
  display: block;
}
.caption strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}
.caption small {
  margin-top: 2px;
  color: var(--s-fg-3);
  font-size: 11px;
}
.compact {
  width: 105px;
  flex: none;
  cursor: grab;
}
.compact .body {
  padding: 3px 3px 4px 6px;
}
.compact .thumb {
  flex: 1;
}
.compact .caption strong {
  font-size: 11px;
}
.compact .caption small {
  font-size: 10px;
}
</style>
