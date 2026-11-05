<script setup lang="ts">
/** 三维视口：画布、左侧编辑快捷栏、顶部固定视角、接收拖进来的模型、放置面板和预览的提示、右键菜单。 */
import { ElMessage } from 'element-plus'
import { Expand, Focus, MousePointer2, Move, Rotate3d, Scaling } from 'lucide-vue-next'
import { computed, inject, ref } from 'vue'
import { ASSET_DRAG_MIME, readAssetDrag } from '@/library/assetDrag'
import { getBuiltinModel, uploadBuiltinModel } from '@/library/builtinModels'
import { SessionKey } from '@/studio/context'
import type { EditorTool } from '@/studio/EditorSession'
import ViewportMenu from './ViewportMenu.vue'

const canvas = ref<HTMLCanvasElement>()
const sessionRef = inject(SessionKey)!
const placing = ref(false)
const dropping = ref(false)
defineExpose({ canvas })

const session = computed(() => sessionRef.value)
const ui = computed(() => sessionRef.value?.ui ?? null)
const editing = computed(() => ui.value?.mode === 'edit')
const tools: Array<{ id: EditorTool; icon: unknown; label: string; key: string }> = [
  { id: 'select', icon: MousePointer2, label: '选择', key: 'Q' },
  { id: 'translate', icon: Move, label: '移动', key: 'W' },
  { id: 'rotate', icon: Rotate3d, label: '旋转', key: 'E' },
  { id: 'scale', icon: Scaling, label: '缩放', key: 'R' },
]
const placingGroup = computed(() => (ui.value?.placing ? session.value?.node(ui.value.placing) : null))

function onDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes(ASSET_DRAG_MIME) || !editing.value) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  dropping.value = true
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  dropping.value = false
  const current = session.value
  const payload = readAssetDrag(event.dataTransfer)
  if (!current?.ui.ready || !payload || !editing.value) return
  const point = current.engine.pointAt(event.clientX, event.clientY)
  placing.value = true
  try {
    if (payload.type === 'asset') {
      current.nodes.addModel(payload.assetId, payload.name, point)
      return
    }
    const model = getBuiltinModel(payload.modelKey)
    if (!model) return
    const asset = await uploadBuiltinModel(model)
    current.nodes.addModel(asset.id, model.name, point, model.scale ?? 1)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '放置模型失败')
  } finally {
    placing.value = false
  }
}
</script>

<template>
  <div
    class="viewport"
    :class="{ 'is-dropping': dropping, 'is-placing': !!ui?.placing }"
    data-testid="viewport"
    @dragover="onDragOver"
    @dragleave="dropping = false"
    @drop="onDrop"
  >
    <canvas ref="canvas" class="viewport__canvas" data-testid="viewport-canvas" aria-label="三维场景" tabindex="-1" />

    <template v-if="session && ui?.ready">
      <!-- 编辑快捷栏 -->
      <div v-if="editing" class="viewport__tools s-float" data-testid="viewport-tools">
        <button
          v-for="tool in tools"
          :key="tool.id"
          class="s-icon-btn"
          :class="{ 'is-active': ui.tool === tool.id }"
          :title="`${tool.label}（${tool.key}）`"
          :data-testid="`tool-${tool.id}`"
          @click="session.setTool(tool.id)"
        >
          <component :is="tool.icon" :size="15" />
        </button>
      </div>

      <!-- 固定视角 -->
      <div class="viewport__views s-float" data-testid="viewport-views">
        <button
          class="viewport__view"
          title="透视（0）"
          data-testid="view-perspective"
          @click="session.viewFrom('perspective')"
        >
          透视
        </button>
        <button class="viewport__view" title="顶视图（7）" data-testid="view-top" @click="session.viewFrom('top')">
          顶
        </button>
        <button class="viewport__view" title="前视图（1）" data-testid="view-front" @click="session.viewFrom('front')">
          前
        </button>
        <button class="viewport__view" title="右视图（3）" data-testid="view-right" @click="session.viewFrom('right')">
          右
        </button>
        <span class="viewport__sep" />
        <button class="s-icon-btn" title="聚焦选中（F）" data-testid="view-focus" @click="session.focusSelection()">
          <Focus :size="14" />
        </button>
        <button class="s-icon-btn" title="全景" data-testid="view-all" @click="session.engine.fitAll()">
          <Expand :size="14" />
        </button>
      </div>

      <div v-if="!editing" class="viewport__badge s-float">
        <span class="s-dot" />预览模式 · 点击对象查看数据 · <span class="s-kbd">Esc</span> 退出
      </div>
      <div v-if="placingGroup" class="viewport__hint s-float" data-testid="placing-hint">
        往「{{ placingGroup.name }}」添加面板：在场景里单击放置 · <span class="s-kbd">Esc</span> 或右键结束
      </div>

      <ViewportMenu />
    </template>

    <div v-if="ui && !ui.ready" role="status" class="viewport__overlay">
      <template v-if="ui.error">
        <strong>场景无法打开</strong>
        <span>{{ ui.error }}</span>
      </template>
      <template v-else><span class="viewport__spinner" />正在加载场景…</template>
    </div>
    <div v-if="placing" role="status" class="viewport__busy"><span class="viewport__spinner" />正在放置模型…</div>
    <div v-if="ui?.warnings.length" role="status" class="viewport__warning">{{ ui.warnings.join('；') }}</div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: var(--s-canvas);
}
.viewport.is-dropping::after {
  position: absolute;
  inset: 8px;
  border: 1.5px dashed var(--s-accent-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--s-accent) 6%, transparent);
  pointer-events: none;
  content: '';
}
.viewport__canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.viewport.is-placing .viewport__canvas {
  cursor: crosshair;
}
.viewport__tools {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}
.viewport__views {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
}
.viewport__sep {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--s-line-2);
}
.viewport__view {
  height: 26px;
  min-width: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: pointer;
}
.viewport__view:hover {
  background: var(--s-hover);
  color: var(--s-fg);
}
.viewport__badge {
  position: absolute;
  top: 12px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  color: var(--s-fg-2);
  transform: translateX(-50%);
}
.viewport__badge .s-dot {
  color: var(--s-ok);
}
.viewport__hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  padding: 7px 14px;
  color: var(--s-fg);
  font-size: 12px;
  transform: translateX(-50%);
  white-space: nowrap;
}
.viewport__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--s-canvas);
  color: var(--s-fg-2);
}
.viewport__overlay strong {
  color: var(--s-danger);
  font-size: 14px;
}
.viewport__busy {
  position: absolute;
  top: 12px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--s-float);
  transform: translateX(-50%);
}
.viewport__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--s-line-2);
  border-top-color: var(--s-accent);
  border-radius: 50%;
  animation: viewport-spin 0.9s linear infinite;
}
@keyframes viewport-spin {
  to {
    transform: rotate(360deg);
  }
}
.viewport__warning {
  position: absolute;
  bottom: 10px;
  left: 10px;
  max-width: 420px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(69, 26, 3, 0.86);
  color: #fde68a;
  font-size: 12px;
}
</style>
