<script setup lang="ts">
/** 一个数据接口的折叠区：标题行（状态、名称、摘要、开关、更多操作）+ 按类型不同的配置内容。 */
import { ArrowDown, ArrowUp, ChevronRight, Copy, MoreHorizontal, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import type { ActiveDataSourceConfig } from '@twin-studio/core'
import type { MenuSections } from '@/components/ui/menu'
import UiDropdown from '@/components/ui/UiDropdown.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSession } from '@/studio/context'
import HttpSourceFields from './HttpSourceFields.vue'
import { sourceStatusView, sourceSummary } from './sourceStatus'
import StaticSourceFields from './StaticSourceFields.vue'
import WebSocketSourceFields from './WebSocketSourceFields.vue'

const props = defineProps<{ source: ActiveDataSourceConfig; open: boolean; first: boolean; last: boolean }>()
const emit = defineEmits<{ toggle: []; duplicated: [id: string] }>()
const session = useSession()

const state = computed(() => session.twin.dataSourceStates.find(item => item.id === props.source.id))
const status = computed(() => sourceStatusView(props.source, state.value))
const menu = computed<MenuSections>(() => [
  [
    {
      label: '上移（优先）',
      icon: ArrowUp,
      disabled: props.first,
      action: () => session.devices.moveSource(props.source.id, -1),
    },
    {
      label: '下移',
      icon: ArrowDown,
      disabled: props.last,
      action: () => session.devices.moveSource(props.source.id, 1),
    },
    {
      label: '复制',
      icon: Copy,
      action: () => {
        const id = session.devices.duplicateSource(props.source.id)
        if (id) emit('duplicated', id)
      },
    },
  ],
  [
    {
      label: '删除',
      icon: Trash2,
      danger: true,
      testid: 'source-remove',
      action: () => session.devices.removeSource(props.source.id),
    },
  ],
])
</script>

<template>
  <article
    class="source"
    :class="{ 'is-open': open, 'is-off': !source.enabled }"
    :data-testid="`source-${source.name}`"
  >
    <header class="source__head" data-testid="source-toggle" @click="emit('toggle')">
      <ChevronRight :size="13" class="source__chevron" />
      <span class="source__dot" :class="`is-${status.tone}`" :title="status.label" />
      <span class="source__title">
        <strong>{{ source.name }}</strong>
        <small>
          <span data-testid="datasource-status">{{ status.label }}</span> · {{ sourceSummary(source) }}
        </small>
      </span>
      <span class="source__actions" @click.stop>
        <UiSwitch
          :model-value="source.enabled"
          :data-testid="`source-enabled-${source.name}`"
          @update:model-value="session.devices.updateSource(source.id, { enabled: $event })"
        />
        <UiDropdown :sections="menu" align="end" :width="130">
          <template #default="{ toggle }">
            <button class="s-icon-btn" title="更多" data-testid="source-menu" @click="toggle">
              <MoreHorizontal :size="14" />
            </button>
          </template>
        </UiDropdown>
      </span>
    </header>
    <p v-if="state?.error && source.enabled" class="source__error" data-testid="source-error">{{ state.error }}</p>
    <div v-if="open" class="source__body">
      <HttpSourceFields v-if="source.type === 'http'" :source="source" />
      <WebSocketSourceFields v-else-if="source.type === 'websocket'" :source="source" />
      <StaticSourceFields v-else :source="source" />
    </div>
  </article>
</template>

<style scoped>
.source {
  margin: 0 8px 6px;
  border: 1px solid var(--s-line-2);
  border-radius: var(--s-radius);
  background: var(--s-panel-2);
}
.source.is-open {
  border-color: var(--s-line-strong);
}
.source__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 7px;
  cursor: pointer;
}
.source__chevron {
  flex-shrink: 0;
  color: var(--s-fg-3);
  transition: transform 140ms ease;
}
.source.is-open .source__chevron {
  transform: rotate(90deg);
}
.source__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--s-fg-4);
}
.source__dot.is-ok {
  background: var(--s-ok);
  box-shadow: 0 0 5px color-mix(in srgb, var(--s-ok) 70%, transparent);
}
.source__dot.is-warn {
  background: var(--s-warn);
}
.source__dot.is-danger {
  background: var(--s-danger);
}
.source__title {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.source__title strong,
.source__title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source__title strong {
  font-weight: 500;
}
.source.is-off .source__title strong {
  color: var(--s-fg-3);
}
.source__title small {
  color: var(--s-fg-3);
  font-size: 10.5px;
}
.source__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
}
.source__error {
  margin: 0;
  padding: 0 10px 6px 34px;
  color: var(--s-danger);
  font-size: 11px;
  line-height: 1.5;
}
.source__body {
  padding-top: 4px;
  border-top: 1px solid var(--s-line);
  background: var(--s-panel);
  border-radius: 0 0 var(--s-radius) var(--s-radius);
}
</style>
