<script setup lang="ts">
/**
 * 场景的「数据」页签。
 *   数据源   多个数据接口，每个一个折叠区：接口配置 + 涉及设备（data/SourceCard.vue）
 *   设备     场景的全部设备：每个变量现在的值、来自哪个接口（data/DeviceList.vue）
 * 一台设备的数据可以来自多个接口；同一个变量有多个接口提供时，以列表靠前的为准。
 */
import { Plus, Radio, Send, SquarePen, Unplug } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { ActiveDataSourceConfig } from '@twin-studio/core'
import type { MenuSections } from '@/components/ui/menu'
import UiDropdown from '@/components/ui/UiDropdown.vue'
import UiSection from '@/components/ui/UiSection.vue'
import { useSession } from '@/studio/context'
import DeviceList from './data/DeviceList.vue'
import SourceCard from './data/SourceCard.vue'

const session = useSession()
const sources = computed(() => session.devices.sources)

// 只有一个接口时默认展开；新建的接口也展开。接口多了以后默认都收起，一眼看全部状态。
const opened = ref(new Set<string>(sources.value.length === 1 ? [sources.value[0]!.id] : []))
function toggle(id: string): void {
  const next = new Set(opened.value)
  if (!next.delete(id)) next.add(id)
  opened.value = next
}
const open = (id: string) => (opened.value = new Set(opened.value).add(id))

function add(type: ActiveDataSourceConfig['type']): void {
  open(session.devices.addSource(type))
}
const addMenu = computed<MenuSections>(() => [
  [
    { label: 'HTTP 接口', icon: Send, testid: 'add-source-http', action: () => add('http') },
    { label: '推送（WebSocket）', icon: Unplug, testid: 'add-source-websocket', action: () => add('websocket') },
    { label: '静态数据（手填）', icon: SquarePen, testid: 'add-source-static', action: () => add('static') },
  ],
])
</script>

<template>
  <div data-testid="scene-data">
    <UiSection title="数据源" :count="sources.length">
      <template #actions>
        <UiDropdown :sections="addMenu" align="end" :width="170">
          <template #default="{ toggle: toggleMenu }">
            <button class="s-btn s-btn--sm" data-testid="add-source" @click="toggleMenu">
              <Plus :size="11" />添加接口
            </button>
          </template>
        </UiDropdown>
      </template>
      <div v-if="!sources.length" class="s-empty">
        <Radio :size="20" />
        <span>还没有数据接口</span>
        <span class="s-hint">没有接口时面板上不显示任何数值</span>
      </div>
      <SourceCard
        v-for="(source, index) in sources"
        :key="source.id"
        :source="source"
        :open="opened.has(source.id)"
        :first="index === 0"
        :last="index === sources.length - 1"
        @toggle="toggle(source.id)"
        @duplicated="open"
      />
      <p v-if="sources.length > 1" class="data__note s-hint">
        一台设备的数据可以来自多个接口。同一个变量有多个接口提供时，以靠前的为准；靠前的断开后，由靠后的接管。
      </p>
    </UiSection>

    <UiSection title="设备" :count="session.devices.devices.length">
      <DeviceList />
    </UiSection>
  </div>
</template>

<style scoped>
.data__note {
  margin: 0;
  padding: 2px 12px 0;
  line-height: 1.6;
}
</style>
