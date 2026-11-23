<script setup lang="ts">
import { MousePointerClick, Plus, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import {
  interactionActionLabels,
  interactionActionTypes,
  interactionTriggerLabels,
  interactionTriggers,
  type InteractionAction,
  type SceneInteraction,
  type SceneNodeV2,
  targetForNode,
  newId,
  targetNodeId,
} from '@twin-studio/core'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'

const props = defineProps<{ nodes: SceneNodeV2[] }>()
const session = useSession()
const node = computed(() => (props.nodes.length === 1 ? props.nodes[0]! : null))
const items = computed(() =>
  node.value ? (session.doc.value.interactions ?? []).filter(item => targetNodeId(item.source) === node.value!.id) : [],
)
const doc = computed(() => session.doc.value)
/** Actions that act on an object and so may point at another one. */
const targetable = new Set(['select', 'focus', 'show', 'hide', 'toggle', 'highlight'])

function addInteraction(source: SceneNodeV2): void {
  session.edit('添加交互', draft => {
    ;(draft.interactions ??= []).push({
      id: newId('interaction'),
      enabled: true,
      source: targetForNode(source),
      trigger: 'click',
      action: { type: 'emit-event', eventName: 'device-click' },
    })
  })
}

function updateInteraction(id: string, change: (rule: SceneInteraction) => void): void {
  session.edit('修改交互', draft => {
    const rule = draft.interactions?.find(item => item.id === id)
    if (rule) change(rule)
  })
}

function removeInteraction(id: string): void {
  session.edit('删除交互', draft => {
    draft.interactions = draft.interactions?.filter(rule => rule.id !== id)
  })
}

function setTrigger(item: SceneInteraction, trigger: SceneInteraction['trigger']): void {
  updateInteraction(item.id, target => {
    target.trigger = trigger
    // Temporary highlight only makes sense while hovering.
    if (target.action.type === 'highlight' && trigger !== 'hover-enter') target.action = { type: 'focus' }
  })
}

function setAction(item: SceneInteraction, type: InteractionAction['type']): void {
  const action: InteractionAction =
    type === 'emit-event'
      ? { type, eventName: 'device-click' }
      : type === 'fly-to-bookmark'
        ? { type, bookmarkId: doc.value.bookmarks[0]?.id ?? 'none' }
        : { type }
  updateInteraction(item.id, target => {
    target.action = action
    if (type === 'highlight') target.trigger = 'hover-enter'
  })
}

function setTarget(item: SceneInteraction, nodeId: string): void {
  const targetNode = session.node(nodeId)
  updateInteraction(item.id, target => {
    if (!targetNode || nodeId === node.value?.id) delete target.action.target
    else target.action.target = targetForNode(targetNode)
  })
}

function actionTargetId(item: SceneInteraction): string {
  const target = item.action.target
  return target ? targetNodeId(target) : (node.value?.id ?? '')
}
</script>

<template>
  <div v-if="node" data-testid="node-interactions">
    <UiSection title="交互" :count="items.length">
      <template #actions>
        <button class="s-btn s-btn--sm" data-testid="add-interaction" @click="addInteraction(node)">
          <Plus :size="12" />添加
        </button>
      </template>
      <div v-if="!items.length" class="s-empty">
        <MousePointerClick :size="20" />
        <span>为对象设置点击、悬停时的反应</span>
        <span class="s-hint">「通知大屏」会向数据大屏发送事件，大屏据此切换面板、弹窗等</span>
      </div>
      <div v-for="item in items" :key="item.id" class="ix">
        <div class="ix__line">
          <select
            class="s-select"
            aria-label="触发事件"
            :value="item.trigger"
            @change="setTrigger(item, ($event.target as HTMLSelectElement).value as SceneInteraction['trigger'])"
          >
            <option v-for="trigger in interactionTriggers" :key="trigger" :value="trigger">
              {{ interactionTriggerLabels[trigger] }}
            </option>
          </select>
          <span class="ix__arrow">→</span>
          <select
            class="s-select"
            aria-label="响应动作"
            :value="item.action.type"
            @change="setAction(item, ($event.target as HTMLSelectElement).value as InteractionAction['type'])"
          >
            <option
              v-for="type in interactionActionTypes"
              :key="type"
              :value="type"
              :disabled="type === 'fly-to-bookmark' && !doc.bookmarks.length"
            >
              {{ interactionActionLabels[type] }}
            </option>
          </select>
          <UiSwitch
            aria-label="启用交互"
            :model-value="item.enabled"
            @update:model-value="updateInteraction(item.id, t => void (t.enabled = $event))"
          />
          <button class="s-icon-btn" title="删除" @click="removeInteraction(item.id)">
            <Trash2 :size="12" />
          </button>
        </div>
        <div v-if="item.action.type === 'emit-event'" class="ix__param">
          <span>事件名</span>
          <UiText
            :model-value="item.action.eventName"
            mono
            @commit="
              updateInteraction(
                item.id,
                t =>
                  t.action.type === 'emit-event' &&
                  /^[a-z][a-z0-9._:-]{0,63}$/i.test($event) &&
                  (t.action.eventName = $event),
              )
            "
          />
        </div>
        <div v-else-if="item.action.type === 'fly-to-bookmark'" class="ix__param">
          <span>镜头</span>
          <select
            class="s-select"
            aria-label="镜头"
            :value="item.action.bookmarkId"
            @change="
              updateInteraction(
                item.id,
                t =>
                  t.action.type === 'fly-to-bookmark' &&
                  (t.action.bookmarkId = ($event.target as HTMLSelectElement).value),
              )
            "
          >
            <option v-if="!doc.bookmarks.length" value="none">（请先在镜头栏添加镜头）</option>
            <option v-for="bookmark in doc.bookmarks" :key="bookmark.id" :value="bookmark.id">
              {{ bookmark.name }}
            </option>
          </select>
        </div>
        <div v-if="targetable.has(item.action.type)" class="ix__param">
          <span>作用于</span>
          <select
            class="s-select"
            aria-label="作用于"
            :value="actionTargetId(item)"
            @change="setTarget(item, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="candidate in doc.nodes" :key="candidate.id" :value="candidate.id">
              {{ candidate.id === node.id ? `自身（${candidate.name}）` : candidate.name }}
            </option>
          </select>
        </div>
      </div>
      <p v-if="items.length" class="ix__note s-hint">交互在「预览」模式和数据大屏中生效。</p>
    </UiSection>
  </div>
  <div v-else class="s-empty">
    <MousePointerClick :size="20" />
    <span>选择单个对象以编辑交互</span>
  </div>
</template>

<style scoped>
.ix {
  margin: 0 8px 6px;
  padding: 8px;
  border: 1px solid var(--s-line);
  border-radius: 6px;
  background: var(--s-panel-2);
}
.ix__line {
  display: grid;
  grid-template-columns: 1fr auto 1.2fr auto auto;
  align-items: center;
  gap: 5px;
}
.ix__arrow {
  color: var(--s-fg-3);
}
.ix__param {
  display: grid;
  grid-template-columns: 48px 1fr;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--s-fg-2);
  font-size: 11px;
}
.ix__note {
  margin: 0;
  padding: 0 12px 6px;
}
</style>
