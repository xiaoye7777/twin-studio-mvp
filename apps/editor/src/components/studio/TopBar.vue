<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Focus, Move, Play, Redo2, Rotate3d, Save, Scaling, Square, Undo2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSession } from '@/studio/context'

defineProps<{ projectName: string }>()
const router = useRouter()
const session = useSession()
const ui = session.ui
const preview = computed(() => ui.mode === 'preview')
const tools = [
  { id: 'translate', label: '移动（W）', icon: Move },
  { id: 'rotate', label: '旋转（E）', icon: Rotate3d },
  { id: 'scale', label: '缩放（R）', icon: Scaling },
] as const
const saveLabel = computed(
  () => ({ saved: '已保存', unsaved: '保存', saving: '保存中…', error: '重新保存' })[ui.saveState],
)

/** 保存；场景被别人改过时让用户选择。 */
async function save(): Promise<void> {
  if (ui.saveState === 'saving' || !ui.ready) return
  if (await session.save()) return void ElMessage.success('已保存')
  if (!ui.conflict) return void ElMessage.error(ui.saveError || '保存失败')
  const who = ui.conflict.updatedBy ? `${ui.conflict.updatedBy} ` : '其他人'
  try {
    await ElMessageBox.confirm(
      `这个场景已被${who}修改。要用你的内容覆盖，还是放弃你的修改并加载最新版本？`,
      '版本冲突',
      {
        customClass: 'studio-dialog',
        type: 'warning',
        confirmButtonText: '覆盖',
        cancelButtonText: '加载最新',
        distinguishCancelAndClose: true,
      },
    )
    if (await session.overwriteConflict()) ElMessage.success('已保存')
    else ElMessage.error(ui.saveError || '保存失败')
  } catch (action) {
    if (action === 'cancel') await session.reloadLatest()
    else ui.conflict = null
  }
}

defineExpose({ save })
</script>

<template>
  <header class="topbar">
    <button class="s-icon-btn" title="返回场景列表" data-testid="back" @click="router.push('/scenes')">
      <ArrowLeft :size="16" />
    </button>
    <strong class="topbar__name" :title="projectName">{{ projectName }}</strong>

    <template v-if="!preview">
      <span class="topbar__sep" />
      <button class="s-icon-btn" title="撤销（Ctrl+Z）" :disabled="!ui.canUndo" @click="session.undo()">
        <Undo2 :size="15" />
      </button>
      <button class="s-icon-btn" title="重做（Ctrl+Y）" :disabled="!ui.canRedo" @click="session.redo()">
        <Redo2 :size="15" />
      </button>
      <span class="topbar__sep" />
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="s-icon-btn"
        :class="{ 'is-active': ui.tool === tool.id }"
        :title="tool.label"
        :data-testid="`tool-${tool.id}`"
        @click="session.setTool(tool.id)"
      >
        <component :is="tool.icon" :size="15" />
      </button>
      <button class="s-icon-btn" title="聚焦选中（F）" @click="session.focusSelection()"><Focus :size="15" /></button>
    </template>

    <span class="topbar__space" />

    <button v-if="preview" class="s-btn" data-testid="exit-preview" @click="session.exitPreview()">
      <Square :size="13" />退出预览
    </button>
    <template v-else>
      <button class="s-btn" data-testid="enter-preview" :disabled="!ui.ready" @click="session.enterPreview()">
        <Play :size="13" />预览
      </button>
      <button
        class="s-btn s-btn--primary"
        data-testid="save"
        :disabled="ui.saveState === 'saving' || ui.saveState === 'saved'"
        @click="save"
      >
        <Save :size="13" />{{ saveLabel }}
      </button>
    </template>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  border-bottom: 1px solid var(--s-line);
  background: var(--s-wash), var(--s-panel);
}
.topbar__name {
  overflow: hidden;
  max-width: 260px;
  margin: 0 6px;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar__sep {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--s-line);
}
.topbar__space {
  flex: 1;
}
.topbar .s-btn {
  height: 28px;
  margin-left: 6px;
  padding: 0 12px;
}
</style>
