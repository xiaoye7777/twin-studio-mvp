<script setup lang="ts">
/** HTTP 接口的配置：请求（地址、定时开关、参数、请求头、请求体、认证）+ 数据解析 + 涉及设备 + 试请求。 */
import { computed, ref } from 'vue'
import { type HttpDataSourceConfig, isSafeHttpUrl } from '@twin-studio/core'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import KeyValueRows from './KeyValueRows.vue'
import SourceDevices from './SourceDevices.vue'
import SourceParsing from './SourceParsing.vue'
import SourceProbe from './SourceProbe.vue'
import { useSourceProbe } from './useSourceProbe'

const props = defineProps<{ source: HttpDataSourceConfig }>()
const session = useSession()
const probe = useSourceProbe(() => props.source)
const update = (patch: Partial<HttpDataSourceConfig>) => session.devices.updateSource(props.source.id, patch)
/** 没写开关的旧场景都是定时请求。 */
const polling = computed(() => props.source.polling !== false)

const urlError = ref('')
function setUrl(url: string): void {
  urlError.value = isSafeHttpUrl(url.trim())
    ? ''
    : '请输入 http(s):// 地址或以 / 开头的同域路径，不能包含账号密码或 Token 参数'
  if (!urlError.value) update({ url: url.trim() })
}
const seconds = (event: Event, max: number, fallback: number) =>
  Math.min(max, Math.max(1, Math.round(Number((event.target as HTMLInputElement).value) || fallback)))
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
      <select
        class="s-select fields__method"
        :value="source.method"
        data-testid="source-method"
        @change="update({ method: ($event.target as HTMLSelectElement).value as 'GET' | 'POST' })"
      >
        <option>GET</option>
        <option>POST</option>
      </select>
      <UiText :model-value="source.url" mono data-testid="datasource-http-url" @commit="setUrl" />
    </UiRow>
    <p v-if="urlError" class="fields__error">{{ urlError }}</p>
    <UiRow label="定时请求" hint="关闭：只在打开场景时请求一次；打开：每隔一段时间重新请求">
      <UiSwitch :model-value="polling" data-testid="source-polling" @update:model-value="update({ polling: $event })" />
      <span class="s-hint">{{ polling ? '按间隔重复请求' : '只请求一次' }}</span>
    </UiRow>
    <UiRow v-if="polling" label="请求间隔" hint="每隔多少秒请求一次">
      <input
        class="s-input fields__short"
        type="number"
        min="1"
        max="3600"
        :value="source.interval"
        data-testid="source-interval"
        @change="update({ interval: seconds($event, 3600, 5) })"
      />
      <span class="s-hint">秒</span>
    </UiRow>
    <UiRow label="超时" hint="超过这么久没有响应算失败；留空：不超过 15 秒，定时请求时也不超过请求间隔">
      <input
        class="s-input fields__short"
        type="number"
        min="1"
        max="120"
        :value="source.timeout"
        placeholder="自动"
        @change="update({ timeout: ($event.target as HTMLInputElement).value ? seconds($event, 120, 15) : undefined })"
      />
      <span class="s-hint">秒</span>
    </UiRow>

    <UiSection title="查询参数" nested :open="!!source.params?.length" :count="source.params?.length || null">
      <KeyValueRows
        :items="source.params ?? []"
        key-hint="参数名"
        testid="source-params"
        @update="update({ params: $event })"
      />
    </UiSection>
    <UiSection title="请求头" nested :open="!!source.headers?.length" :count="source.headers?.length || null">
      <KeyValueRows
        :items="source.headers ?? []"
        key-hint="名称"
        testid="source-headers"
        @update="update({ headers: $event })"
      />
    </UiSection>
    <UiSection v-if="source.method === 'POST'" title="请求体" nested :open="!!source.body">
      <div class="fields__body">
        <textarea
          class="s-textarea s-mono"
          rows="3"
          :value="source.body ?? ''"
          placeholder="留空：自动发送本接口涉及的设备清单"
          @change="update({ body: ($event.target as HTMLTextAreaElement).value || undefined })"
        />
      </div>
    </UiSection>
    <UiSection title="认证" nested :open="source.withCredentials || !!source.authRef">
      <UiRow label="登录 Cookie" hint="带上浏览器里这个站点的登录 Cookie（后端要允许带凭据的跨域）">
        <UiSwitch
          :model-value="source.withCredentials"
          data-testid="source-credentials"
          @update:model-value="update({ withCredentials: $event })"
        />
      </UiRow>
      <UiRow label="认证引用" hint="给这组认证信息起个名字；Viewer SDK 的 dataRequestHeaders 按它提供真正的请求头">
        <UiText
          :model-value="source.authRef ?? ''"
          mono
          placeholder="不需要"
          @commit="update({ authRef: $event.trim() || undefined })"
        />
      </UiRow>
      <p class="fields__note s-hint">场景 JSON 会交给后端和数据大屏，所以不保存 Token，这里只记一个引用名。</p>
    </UiSection>

    <SourceParsing :source="source" :fields="probe.fields" />
    <SourceDevices :source="source" :matched="probe.analysis?.deviceIds" />
    <SourceProbe :source="source" :probe="probe" />
  </div>
</template>

<style scoped>
.fields__method {
  width: 74px;
  flex-shrink: 0;
}
.fields__short {
  width: 80px;
}
.fields__error {
  margin: 0;
  padding: 0 12px 4px 98px;
  color: var(--s-danger);
  font-size: 11px;
}
.fields__body {
  padding: 0 12px;
}
.fields__note {
  margin: 0;
  padding: 2px 12px 0;
  line-height: 1.6;
}
</style>
