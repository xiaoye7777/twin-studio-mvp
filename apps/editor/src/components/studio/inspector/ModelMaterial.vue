<script setup lang="ts">
import { RotateCcw, X } from 'lucide-vue-next'
import { computed } from 'vue'
import type { ModelMaterial, SceneNodeV2 } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSession } from '@/studio/context'

const props = defineProps<{ node: Extract<SceneNodeV2, { kind: 'model' }> }>()
const session = useSession()
const look = computed<ModelMaterial>(() => props.node.model.material ?? {})
const base = computed(() => {
  void session.ui.syncRevision
  return (
    session.sync.modelBaseLook(props.node.id) ?? {
      color: '#ffffff',
      texture: false,
      roughness: 1,
      metalness: 0,
      emissive: '#000000',
    }
  )
})
const edited = computed(() => Object.keys(look.value).length > 0)

const presets: Array<{ label: string; title: string; look: ModelMaterial }> = [
  {
    label: '玻璃',
    title: '半透明、光滑',
    look: { color: '#9fd3ff', texture: false, opacity: 0.35, metalness: 0.1, roughness: 0.05 },
  },
  { label: '金属', title: '金属质感', look: { metalness: 0.9, roughness: 0.3 } },
  { label: '发光', title: '自发光，夜景和泛光下更明显', look: { emissive: '#38bdf8', emissiveIntensity: 2 } },
  {
    label: '透视',
    title: '淡蓝色半透明，看到内部结构',
    look: { color: '#7cc4ff', texture: false, opacity: 0.18, roughness: 0.4 },
  },
]

function save(look: ModelMaterial | undefined, label: string, key?: string): void {
  session.edit(
    label,
    draft => {
      const node = draft.nodes.find(n => n.id === props.node.id)
      if (node?.kind === 'model') node.model.material = look
    },
    { coalesceKey: key && `material:${props.node.id}:${key}` },
  )
}
function set(patch: ModelMaterial, key?: string): void {
  const next = { ...look.value, ...patch }
  for (const field of Object.keys(next) as Array<keyof ModelMaterial>) if (next[field] === undefined) delete next[field]
  save(Object.keys(next).length ? next : undefined, '修改整体材质', key)
}
</script>

<template>
  <UiSection title="整体材质" data-testid="part-material">
    <template #actions>
      <button
        v-if="edited"
        class="s-icon-btn"
        title="恢复模型自带的材质"
        data-testid="material-reset"
        @click="save(undefined, '恢复材质')"
      >
        <RotateCcw :size="13" />
      </button>
    </template>
    <div class="material__presets">
      <button
        v-for="preset in presets"
        :key="preset.label"
        class="chip"
        :title="preset.title"
        :data-testid="`material-preset-${preset.label}`"
        @click="save({ ...preset.look }, '材质预设')"
      >
        {{ preset.label }}
      </button>
    </div>
    <UiRow label="颜色">
      <div class="material__line">
        <UiColor
          :model-value="look.color ?? base.color"
          data-testid="material-color"
          @update="set({ color: $event }, 'color')"
          @commit="session.commit()"
        />
        <button v-if="look.color" class="s-icon-btn" title="使用模型原色" @click="set({ color: undefined })">
          <X :size="12" />
        </button>
      </div>
    </UiRow>
    <UiRow v-if="base.texture" label="贴图" hint="关闭后颜色不再与贴图相乘">
      <UiSwitch
        :model-value="look.texture !== false"
        @update:model-value="set({ texture: $event ? undefined : false })"
      />
    </UiRow>
    <UiRow label="不透明度">
      <UiSlider
        :model-value="look.opacity ?? 1"
        :min="0"
        :max="1"
        :step="0.01"
        :precision="2"
        data-testid="material-opacity"
        @update="set({ opacity: $event >= 1 ? undefined : $event }, 'opacity')"
        @commit="session.commit()"
      />
    </UiRow>
    <UiRow label="金属度">
      <UiSlider
        :model-value="look.metalness ?? base.metalness"
        :min="0"
        :max="1"
        :step="0.01"
        :precision="2"
        @update="set({ metalness: $event }, 'metalness')"
        @commit="session.commit()"
      />
    </UiRow>
    <UiRow label="粗糙度">
      <UiSlider
        :model-value="look.roughness ?? base.roughness"
        :min="0"
        :max="1"
        :step="0.01"
        :precision="2"
        @update="set({ roughness: $event }, 'roughness')"
        @commit="session.commit()"
      />
    </UiRow>
    <UiRow label="自发光">
      <div class="material__line">
        <UiColor
          :model-value="look.emissive ?? base.emissive"
          @update="set({ emissive: $event, emissiveIntensity: look.emissiveIntensity ?? 1 }, 'emissive')"
          @commit="session.commit()"
        />
        <button
          v-if="look.emissive"
          class="s-icon-btn"
          title="关闭自发光修改"
          @click="set({ emissive: undefined, emissiveIntensity: undefined })"
        >
          <X :size="12" />
        </button>
      </div>
    </UiRow>
    <UiRow v-if="look.emissive" label="发光强度">
      <UiSlider
        :model-value="look.emissiveIntensity ?? 1"
        :min="0"
        :max="10"
        :step="0.1"
        :precision="1"
        @update="set({ emissiveIntensity: $event }, 'emissiveIntensity')"
        @commit="session.commit()"
      />
    </UiRow>
  </UiSection>
</template>

<style scoped>
.material__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 12px 6px;
}
.chip {
  padding: 3px 9px;
  border: 1px solid var(--s-line);
  border-radius: 999px;
  background: var(--s-panel-2);
  color: var(--s-fg-2);
  font-size: 11.5px;
  cursor: pointer;
}
.chip:hover {
  border-color: var(--s-accent);
  color: var(--s-fg);
}
.material__line {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 4px;
}
</style>
