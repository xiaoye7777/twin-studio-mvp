<script setup lang="ts">
/** 三维视口：画布、接收拖进来的模型、加载和错误提示、预览时的数据面板。 */
import { ElMessage } from 'element-plus'
import { computed, inject, ref } from 'vue'
import { resolvePanel } from '@twin-studio/core'
import { TwinPanelCard } from '@twin-studio/viewer'
import { readAssetDrag } from '@/library/assetDrag'
import { getBuiltinModel, uploadBuiltinModel } from '@/library/builtinModels'
import { SessionKey } from '@/studio/context'

const canvas = ref<HTMLCanvasElement>()
const session = inject(SessionKey)!
const placing = ref(false)
defineExpose({ canvas })

const ui = computed(() => session.value?.ui ?? null)
/** 预览时当前的面板；读 runtimeRevision，数值变了会跟着刷新。 */
const panel = computed(() => {
  const current = session.value
  if (!current?.ui.panelNodeId) return null
  void current.twin.runtimeRevision
  return resolvePanel(current.doc.value, current.twin, current.ui.panelNodeId)
})

async function onDrop(event: DragEvent): Promise<void> {
  const current = session.value
  const payload = readAssetDrag(event.dataTransfer)
  if (!current?.ui.ready || !payload || current.ui.mode !== 'edit') return
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
  <div class="viewport" data-testid="viewport" @dragover.prevent @drop.prevent="onDrop">
    <canvas ref="canvas" class="viewport__canvas" aria-label="三维场景" />
    <div v-if="ui && !ui.ready" role="status" class="viewport__overlay">{{ ui.error || '正在加载场景…' }}</div>
    <div v-if="placing" role="status" class="viewport__note">正在放置模型…</div>
    <div v-if="ui?.warnings.length" role="status" class="viewport__warning">{{ ui.warnings.join('；') }}</div>
    <div v-if="ui?.mode === 'preview'" class="viewport__hint">点击对象查看数据，按 Esc 退出预览</div>
    <TwinPanelCard v-if="panel && ui" :view="panel" :anchor="ui.panelAnchor" @close="session?.closePanel()" />
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: #15181c;
}
.viewport__canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
.viewport__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(14, 16, 19, 0.82);
  color: #e6e4df;
  font-size: 13px;
}
.viewport__note,
.viewport__hint {
  position: absolute;
  top: 10px;
  left: 50%;
  padding: 4px 12px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgba(10, 12, 15, 0.7);
  color: #f4f2ee;
  font-size: 12px;
  pointer-events: none;
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
