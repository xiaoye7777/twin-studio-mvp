<script setup lang="ts">
/** 试请求返回的 JSON：可以展开看，点一层把它设为数据位置。 */
import { ChevronRight, List } from 'lucide-vue-next'
import { computed, ref } from 'vue'

defineOptions({ name: 'JsonTree' })

const props = withDefaults(
  defineProps<{
    value: unknown
    /** 这个节点的路径，如 `data.list`。 */
    path?: string
    name?: string
    /** 已选中的路径，高亮显示。 */
    selected?: string
    depth?: number
  }>(),
  { path: '', name: '', selected: undefined, depth: 0 },
)
const emit = defineEmits<{ pick: [path: string] }>()

const isArray = computed(() => Array.isArray(props.value))
const isObject = computed(() => !!props.value && typeof props.value === 'object')
/** 元素是对象的数组就是数据列表，可以选。 */
const isList = computed(
  () =>
    isArray.value &&
    (props.value as unknown[]).some(item => !!item && typeof item === 'object' && !Array.isArray(item)),
)
const open = ref(props.depth < 2 || (props.selected ?? '').startsWith(props.path))
const entries = computed(() => {
  if (!isObject.value) return []
  const list = isArray.value
    ? (props.value as unknown[]).slice(0, 3).map((item, index) => [String(index), item] as const)
    : Object.entries(props.value as Record<string, unknown>)
  return list
})
const childPath = (key: string) => (isArray.value ? `${props.path}[${key}]` : props.path ? `${props.path}.${key}` : key)
const summary = computed(() => {
  if (isArray.value) return `[${(props.value as unknown[]).length} 项]`
  if (isObject.value) return `{${Object.keys(props.value as object).length}}`
  return ''
})
const scalar = computed(() => {
  const value = props.value
  if (typeof value === 'string') return `"${value.length > 60 ? `${value.slice(0, 60)}…` : value}"`
  return String(value)
})
const scalarClass = computed(() =>
  typeof props.value === 'number' ? 'is-number' : typeof props.value === 'string' ? 'is-string' : 'is-other',
)
</script>

<template>
  <div class="node">
    <div
      class="node__line"
      :class="{ 'is-selected': isObject && selected === path, 'is-list': isList }"
      :style="{ paddingLeft: `${depth * 14 + 4}px` }"
    >
      <button v-if="isObject" class="node__toggle" @click="open = !open">
        <ChevronRight :size="12" :class="{ 'is-open': open }" />
      </button>
      <span v-else class="node__toggle" />
      <span v-if="name" class="node__key">{{ name }}:</span>
      <span v-if="isObject" class="node__summary">{{ summary }}</span>
      <span v-else class="node__value" :class="scalarClass">{{ scalar }}</span>
      <button
        v-if="isObject"
        class="node__pick"
        :class="{ 'is-list': isList }"
        :data-testid="`json-pick-${path || 'root'}`"
        @click="emit('pick', path)"
      >
        <List v-if="isList" :size="11" />{{ selected === path ? '已选用' : isList ? '用作数据列表' : '用作数据' }}
      </button>
    </div>
    <template v-if="isObject && open">
      <JsonTree
        v-for="[key, item] in entries"
        :key="key"
        :value="item"
        :name="key"
        :path="childPath(key)"
        :selected="selected"
        :depth="depth + 1"
        @pick="emit('pick', $event)"
      />
      <div
        v-if="isArray && (value as unknown[]).length > 3"
        class="node__more"
        :style="{ paddingLeft: `${(depth + 1) * 14 + 22}px` }"
      >
        … 还有 {{ (value as unknown[]).length - 3 }} 项
      </div>
    </template>
  </div>
</template>

<style scoped>
.node__line {
  display: flex;
  min-height: 22px;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  border-radius: 4px;
  font-family: var(--s-mono);
  font-size: 11.5px;
  white-space: nowrap;
}
.node__line:hover {
  background: var(--s-hover);
}
.node__line.is-selected {
  background: var(--s-accent-soft);
  box-shadow: inset 2px 0 0 var(--s-accent);
}
.node__toggle {
  display: inline-grid;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--s-fg-3);
  cursor: pointer;
}
.node__toggle svg {
  transition: transform 120ms ease;
}
.node__toggle svg.is-open {
  transform: rotate(90deg);
}
.node__key {
  color: var(--s-guide);
}
.node__summary {
  color: var(--s-fg-3);
}
.node__value {
  overflow: hidden;
  text-overflow: ellipsis;
}
.node__value.is-number {
  color: var(--s-ok);
}
.node__value.is-string {
  color: var(--s-warn);
}
.node__value.is-other {
  color: var(--s-data);
}
.node__pick {
  display: none;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 1px 7px;
  border: 1px solid var(--s-line-2);
  border-radius: 3px;
  background: var(--s-raised);
  color: var(--s-fg-2);
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
}
.node__line:hover .node__pick,
.node__line.is-selected .node__pick,
.node__pick.is-list {
  display: inline-flex;
}
.node__pick.is-list {
  border-color: color-mix(in srgb, var(--s-data) 45%, transparent);
  color: var(--s-data);
}
.node__line.is-selected .node__pick {
  border-color: var(--s-accent-line);
  color: var(--s-accent-2);
}
.node__more {
  color: var(--s-fg-3);
  font-family: var(--s-mono);
  font-size: 11px;
  line-height: 20px;
}
</style>
