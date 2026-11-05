<script setup lang="ts">
/** 静态数据接口：直接手填每台设备的数值，场景里的信息面板立即按这些值显示。用于调试和演示。 */
import { Camera } from 'lucide-vue-next'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { sourceProvides, type StaticDataSourceConfig } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import StaticValueInput from '../StaticValueInput.vue'
import SourceDevices from './SourceDevices.vue'

const props = defineProps<{ source: StaticDataSourceConfig }>()
const session = useSession()
const devices = computed(() =>
  session.devices.devices.flatMap(device => {
    const variables = device.variables.filter(variable => sourceProvides(props.source, device.id, variable.key))
    return variables.length ? [{ ...device, variables }] : []
  }),
)
function capture(): void {
  const count = session.devices.captureStaticValues(props.source.id)
  if (count) ElMessage.success(`已记下 ${count} 个当前数值`)
  else ElMessage.info('现在没有收到任何数值：先用「推送」或「HTTP」接口连上数据')
}
</script>

<template>
  <div>
    <UiRow label="名称">
      <UiText
        :model-value="source.name"
        data-testid="source-name"
        @commit="session.devices.updateSource(source.id, { name: $event.trim() || source.name })"
      />
    </UiRow>
    <div class="static__actions">
      <button class="s-btn s-btn--sm" title="把现在收到的实时数值记下来，作为静态数据" @click="capture">
        <Camera :size="12" />记下当前数值
      </button>
    </div>
    <SourceDevices :source="source" />
    <div v-if="devices.length" class="static__list">
      <template v-for="device in devices" :key="device.id">
        <div class="static__device">{{ device.name || device.id }}</div>
        <div class="static__values">
          <label v-for="variable in device.variables" :key="variable.key">
            <span :title="variable.key">{{ variable.name || variable.key }}</span>
            <StaticValueInput
              :data-type="variable.dataType"
              :value="source.values[device.id]?.[variable.key]"
              :testid="`source-static-${device.id}-${variable.key}`"
              @commit="session.devices.setStaticValue(source.id, device.id, variable.key, $event)"
            />
            <small>{{ variable.unit }}</small>
          </label>
        </div>
      </template>
    </div>
    <p v-else class="static__note s-hint">还没有可填的设备：先给对象绑定设备。</p>
  </div>
</template>

<style scoped>
.static__actions {
  display: flex;
  justify-content: flex-end;
  padding: 2px 12px 6px;
}
.static__list {
  padding: 6px 0 8px;
  border-top: 1px solid var(--s-line);
}
.static__device {
  padding: 4px 12px 2px;
  color: var(--s-fg-2);
  font-size: 11.5px;
  font-weight: 500;
}
.static__values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 10px;
  padding: 0 12px 4px;
}
.static__values label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 62px auto;
  align-items: center;
  gap: 4px;
  color: var(--s-fg-2);
  font-size: 11px;
}
.static__values span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.static__values small {
  color: var(--s-fg-3);
}
.static__note {
  margin: 0;
  padding: 0 12px 8px;
}
</style>
