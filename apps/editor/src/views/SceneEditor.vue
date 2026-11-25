<script setup lang="ts">
/** 场景编辑器：顶栏、左栏（场景树 / 镜头）、视口、底部资源栏、右栏（属性）。 */
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import type { ProjectInfo } from '@/api/adapter'
import { assetRepository, HttpSceneRepository, projectApi } from '@/api/repositories'
import ResizeHandle from '@/components/studio/ResizeHandle.vue'
import AssetDock from '@/components/studio/AssetDock.vue'
import BatchBindDialog from '@/components/studio/BatchBindDialog.vue'
import DeviceTypeManager from '@/components/studio/DeviceTypeManager.vue'
import InspectorPanel from '@/components/studio/InspectorPanel.vue'
import LeftPanel from '@/components/studio/LeftPanel.vue'
import StudioViewport from '@/components/studio/StudioViewport.vue'
import TopBar from '@/components/studio/TopBar.vue'
import { confirmAction } from '@/components/ui/confirm'
import { SessionKey } from '@/studio/context'
import { EditorSession } from '@/studio/EditorSession'
import { createShellState, ShellKey } from '@/studio/shell'
import { useStudioShortcuts } from '@/studio/useShortcuts'
import '@/studio/studio.css'

const route = useRoute()
const router = useRouter()
const projectId = String(route.params.projectId ?? '')
const project = ref<ProjectInfo | null>(null)
const session = shallowRef<EditorSession | null>(null)
const shell = createShellState()
const viewport = ref<InstanceType<typeof StudioViewport>>()
const topBar = ref<InstanceType<typeof TopBar>>()
provide(SessionKey, session)
provide(ShellKey, shell)
useStudioShortcuts(session, () => void topBar.value?.save())

const leftWidth = ref(264)
const rightWidth = ref(316)
const dockHeight = ref(162)
const preview = computed(() => session.value?.ui.mode === 'preview')
const dirty = () => session.value?.store.isDirty ?? false

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (dirty()) event.preventDefault()
}

onMounted(async () => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  try {
    project.value = await projectApi.get(projectId)
  } catch {
    await router.replace('/scenes')
    return
  }
  const canvas = viewport.value?.canvas
  if (!canvas) return
  const opened = new EditorSession(canvas, {
    projectId,
    projectName: project.value.name,
    assets: assetRepository,
    scenes: new HttpSceneRepository(),
    coverBookmarkId: project.value.coverBookmarkId ?? null,
    hasUploadedCover: project.value.coverSource === 'upload',
    uploadCover: (cover, bookmarkId) => projectApi.setCover(projectId, cover, bookmarkId ? { bookmarkId } : undefined),
  })
  session.value = opened
  if (import.meta.env.DEV) (window as unknown as { __studio?: EditorSession }).__studio = opened
  await opened.open()
  document.title = `${project.value.name} · Twin Studio`
})

onBeforeRouteLeave(async () => {
  if (!dirty()) return true
  return confirmAction('有未保存的修改，离开后会丢失。确定离开？', { title: '未保存', confirm: '离开', danger: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
  session.value?.dispose()
  session.value = null
})
</script>

<template>
  <div class="studio" :class="{ 'is-preview': preview }" data-testid="studio">
    <TopBar v-if="session" ref="topBar" :project-name="project?.name ?? ''" />
    <div v-else class="studio__topbar-placeholder" />
    <div class="studio__body">
      <div v-if="session?.ui.ready && !preview" class="studio__side studio__left" :style="{ width: leftWidth + 'px' }">
        <LeftPanel />
        <ResizeHandle v-model="leftWidth" edge="right" :min="172" :max="520" />
      </div>
      <div class="studio__center">
        <StudioViewport ref="viewport" />
        <div v-if="session?.ui.ready && !preview" class="studio__dock" :style="{ height: dockHeight + 'px' }">
          <ResizeHandle v-model="dockHeight" edge="top" :min="92" :max="650" />
          <AssetDock />
        </div>
      </div>
      <div
        v-if="session?.ui.ready && !preview"
        class="studio__side studio__right"
        :style="{ width: rightWidth + 'px' }"
      >
        <InspectorPanel />
        <ResizeHandle v-model="rightWidth" edge="left" :min="230" :max="600" />
      </div>
    </div>
    <DeviceTypeManager v-if="session?.ui.ready && shell.managingDeviceTypes" />
    <BatchBindDialog v-if="session?.ui.ready" />
  </div>
</template>

<style scoped>
.studio__topbar-placeholder {
  border-bottom: 1px solid var(--s-line);
  background: var(--s-panel);
}
.studio__body {
  display: flex;
  min-height: 0;
}
.studio__side,
.studio__dock {
  position: relative;
  flex: none;
}
.studio__side {
  max-width: 37%;
}
.studio__side > :first-child {
  height: 100%;
}
.studio__dock {
  max-height: 62%;
}
.studio__left {
  max-width: 32%;
  flex: none;
  border-right: 1px solid var(--s-line);
}
.studio__right {
  flex: none;
  border-left: 1px solid var(--s-line);
}
.studio__center {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
</style>
