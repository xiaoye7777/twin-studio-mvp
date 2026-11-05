<script setup lang="ts">
/** 推送接口的配置：地址、连上后发送的消息、心跳 + 数据解析 + 涉及设备 + 试连接。 */
import { ref } from 'vue'
import { isSafeRealtimeUrl, type WebSocketDataSourceConfig } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import SourceDevices from './SourceDevices.vue'
import SourceParsing from './SourceParsing.vue'
import SourceProbe from './SourceProbe.vue'
import { useSourceProbe } from './useSourceProbe'

const props = defineProps<{ source: WebSocketDataSourceConfig }>()
const session = useSession()
const probe = useSourceProbe(() => props.source)
const update = (patch: Partial<WebSocketDataSourceConfig>) => session.devices.updateSource(props.source.id, patch)

const urlError = ref('')
function setUrl(url: string): void {
  urlError.value = isSafeRealtimeUrl(url.trim()) ? '' : '请输入 ws:// 或 wss:// 地址，不能包含账号密码'
  if (!urlError.value) update({ url: url.trim() })
}
function setHeartbeatInterval(event: Event): void {
  const interval = Math.min(3600, Math.max(1, Math.round(Number((event.target as HTMLInputElement).value) || 30)))
  update({ heartbeat: { interval, message: props.source.heartbeat?.message ?? 'ping' } })
}
</script>

<template>
  <div>
    <UiRow label="名称">
      <UiText
        :model-value="source.name"
        data-testid="source-name"
        @commit="update({ name: $event.trim() || source.name })"
      />
    </UiRow>
    <UiRow label="地址">
      <UiText :model-value="source.url" mono data-testid="datasource-url" @commit="setUrl" />
    </UiRow>
    <p v-if="urlError" class="fields__error">{{ urlError }}</p>

    <UiSection title="连接" nested :open="!!source.subscribe || !!source.heartbeat">
      <UiRow label="连上后发送" hint="连接后发给网关的第一条消息，如订阅主题；留空：发送本接口涉及的设备清单" stack>
        <textarea
          class="s-textarea s-mono"
          rows="2"
          :value="source.subscribe ?? ''"
          placeholder="留空：发送本接口涉及的设备清单"
          @change="update({ subscribe: ($event.target as HTMLTextAreaElement).value || undefined })"
        />
      </UiRow>
      <UiRow label="心跳" hint="有些网关会断开长时间没有消息的连接，定时发一条消息保持连接">
        <UiSwitch
          :model-value="!!source.heartbeat"
          data-testid="source-heartbeat"
          @update:model-value="update({ heartbeat: $event ? { interval: 30, message: 'ping' } : undefined })"
        />
      </UiRow>
      <template v-if="source.heartbeat">
        <UiRow label="心跳间隔">
          <input
            class="s-input fields__short"
            type="number"
            min="1"
            max="3600"
            :value="source.heartbeat.interval"
            @change="setHeartbeatInterval"
          />
          <span class="s-hint">秒</span>
        </UiRow>
        <UiRow label="心跳内容">
          <UiText
            :model-value="source.heartbeat.message"
            mono
            @commit="update({ heartbeat: { interval: source.heartbeat!.interval, message: $event } })"
          />
        </UiRow>
      </template>
    </UiSection>

    <SourceParsing :source="source" :fields="probe.fields" />
    <SourceDevices :source="source" :matched="probe.analysis?.deviceIds" />
    <SourceProbe :source="source" :probe="probe" />
  </div>
</template>

<style scoped>
.fields__short {
  width: 80px;
}
.fields__error {
  margin: 0;
  padding: 0 12px 4px 98px;
  color: var(--s-danger);
  font-size: 11px;
}
</style>
