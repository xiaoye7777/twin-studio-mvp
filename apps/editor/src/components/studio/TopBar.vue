<script setup lang="ts">
/** 顶栏：返回、场景名和保存状态、编辑 / 预览、撤销重做、主题、保存。 */
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChevronLeft, Redo2, Save, Undo2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ThemeSwitcher from '@/components/ui/ThemeSwitcher.vue'
import { useSession } from '@/studio/context'

defineProps<{ projectName: string }>()
const router = useRouter()
const session = useSession()
const ui = session.ui
const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'
const saveStateLabel = computed(
  () => ({ saved: '已保存', unsaved: '未保存', saving: '保存中…', error: '保存失败' })[ui.saveState],
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
    <div class="topbar__left">
      <button class="s-icon-btn" title="返回场景列表" data-testid="back" @click="router.push('/scenes')">
        <ChevronLeft :size="16" />
      </button>
      <div class="topbar__brand" aria-hidden="true">T</div>
      <div class="topbar__project">
        <span class="topbar__name" :title="projectName">{{ projectName }}</span>
        <span class="topbar__save" :class="`is-${ui.saveState}`" :title="ui.saveError" data-testid="save-state">
          {{ saveStateLabel }}
        </span>
      </div>
    </div>

    <div class="topbar__mode" role="tablist" aria-label="模式">
      <button
        role="tab"
        :aria-selected="ui.mode === 'edit'"
        :class="{ 'is-active': ui.mode === 'edit' }"
        data-testid="mode-edit"
        @click="session.exitPreview()"
      >
        编辑
      </button>
      <button
        role="tab"
        :aria-selected="ui.mode === 'preview'"
        :class="{ 'is-active': ui.mode === 'preview' }"
        :disabled="!ui.ready"
        data-testid="mode-preview"
        @click="session.enterPreview()"
      >
        预览
      </button>
    </div>

    <div class="topbar__right">
      <template v-if="ui.mode === 'edit'">
        <button
          class="s-icon-btn"
          :disabled="!ui.canUndo"
          :title="`撤销 ${ui.undoLabel}（${mod}Z）`"
          data-testid="undo"
          @click="session.undo()"
        >
          <Undo2 :size="15" />
        </button>
        <button
          class="s-icon-btn"
          :disabled="!ui.canRedo"
          :title="`重做 ${ui.redoLabel}（${mod}⇧Z）`"
          data-testid="redo"
          @click="session.redo()"
        >
          <Redo2 :size="15" />
        </button>
        <span class="topbar__sep" />
      </template>
      <ThemeSwitcher />
      <button
        class="s-btn s-btn--primary"
        data-testid="save"
        :disabled="ui.mode === 'preview' || ui.saveState === 'saving' || ui.saveState === 'saved'"
        @click="save"
      >
        <Save :size="13" />保存
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  border-bottom: 1px solid var(--s-line);
  background: var(--s-wash-bar), var(--s-panel);
}
.topbar__left,
.topbar__right {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
}
.topbar__right {
  justify-content: flex-end;
}
.topbar__brand {
  display: grid;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--s-accent-2), var(--s-accent));
  color: var(--s-on-accent);
  font-size: 12px;
  font-weight: 800;
}
.topbar__project {
  display: flex;
  min-width: 0;
  flex-direction: column;
  margin: 0 6px 0 2px;
  line-height: 1.2;
}
.topbar__name {
  overflow: hidden;
  max-width: 260px;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar__save {
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.topbar__save.is-unsaved,
.topbar__save.is-saving {
  color: var(--s-warn);
}
.topbar__save.is-error {
  color: var(--s-danger);
}
.topbar__mode {
  display: flex;
  padding: 2px;
  border: 1px solid var(--s-line-2);
  border-radius: 6px;
  background: var(--s-field);
}
.topbar__mode button {
  width: 58px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--s-fg-3);
  font-size: 12px;
  cursor: pointer;
}
.topbar__mode button.is-active {
  background: var(--s-active);
  color: var(--s-fg);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
}
.topbar__sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--s-line-2);
}
.topbar .s-btn {
  height: 28px;
  margin-left: 6px;
  padding: 0 12px;
}
</style>
