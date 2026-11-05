<script setup lang="ts">
/**
 * 试请求：请求一次，告诉用户返回里认出了什么，并显示原始返回。点返回里的列表可以把它设为数据位置。
 * 不影响正在运行的接口。
 */
import { Send } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { HttpDataSourceConfig, WebSocketDataSourceConfig } from '@twin-studio/core'
import { useSession } from '@/studio/context'
import JsonTree from './JsonTree.vue'
import type { SourceProbeState } from './useSourceProbe'

const props = defineProps<{ source: HttpDataSourceConfig | WebSocketDataSourceConfig; probe: SourceProbeState }>()
const session = useSession()
const showBody = ref(false)

const verdict = computed(() => {
  const { result, analysis } = props.probe
  if (!result) return null
  if (!result.ok) return { ok: false, text: result.error }
  const a = analysis!
  if (!a.values)
    return {
      ok: false,
      text: `请求成功（${result.duration} ms），但没有解析出数值：请在「数据解析」里检查数据位置和字段；也可能是这些设备还没有绑定`,
    }
  return {
    ok: true,
    text: `成功（${result.duration} ms）：${a.rows} 条数据，认出 ${a.matched.length} 台设备，解析出 ${a.values} 个值`,
  }
})
/** 返回里有、但本接口没有涉及的设备：多半是还没绑定对象。 */
const unmatched = computed(() => {
  const a = props.probe.analysis
  return a ? a.deviceIds.filter(id => !a.matched.includes(id)) : []
})
</script>

<template>
  <div class="probe">
    <button class="s-btn s-btn--sm" :disabled="probe.testing" data-testid="source-probe" @click="probe.run()">
      <Send :size="12" />{{
        probe.testing ? '请求中…' : source.type === 'http' ? '试请求一次' : '试连接并等第一条消息'
      }}
    </button>
    <button v-if="probe.result?.ok" class="s-btn s-btn--sm" @click="showBody = !showBody">
      {{ showBody ? '收起返回' : '查看返回' }}
    </button>
    <p v-if="verdict" class="probe__verdict" :class="verdict.ok ? 'is-ok' : 'is-bad'" data-testid="source-probe-result">
      {{ verdict.text }}
    </p>
    <p v-if="unmatched.length" class="probe__note s-hint" :title="unmatched.join('、')">
      还有 {{ unmatched.length }} 台设备不在本接口范围内或未绑定：{{ unmatched.slice(0, 5).join('、')
      }}{{ unmatched.length > 5 ? '…' : '' }}
    </p>
    <div v-if="showBody && probe.result?.ok" class="probe__body s-mono">
      <JsonTree
        :value="probe.result.body"
        :selected="source.resultPath ?? ''"
        @pick="session.devices.updateSource(source.id, { resultPath: $event })"
      />
    </div>
  </div>
</template>

<style scoped>
.probe {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--s-line);
}
.probe__verdict,
.probe__note {
  width: 100%;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
}
.probe__verdict.is-ok {
  color: var(--s-ok);
}
.probe__verdict.is-bad {
  color: var(--s-danger);
}
.probe__body {
  width: 100%;
  max-height: 220px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--s-line);
  border-radius: var(--s-radius-sm);
  background: var(--s-field);
  font-size: 11px;
}
</style>
