<script setup lang="ts">
/** 一个静态数据的输入框：按变量类型把文字转成数字、布尔或文本，清空就是没有值。 */
import { computed } from 'vue'
import type { TwinVariableDefinition } from '@twin-studio/core'
import UiText from '@/components/ui/UiText.vue'
import { useSession } from '@/studio/context'
import type { StaticValue } from '@/studio/session/DeviceData'

const props = defineProps<{ deviceId: string; variable: TwinVariableDefinition }>()
const session = useSession()
const value = computed(() => session.devices.staticValue(props.deviceId, props.variable.key))
const text = computed(() => (value.value === undefined ? '' : String(value.value)))

function parse(raw: string): StaticValue | undefined {
  const input = raw.trim()
  if (!input) return undefined
  if (props.variable.dataType === 'number') {
    const number = Number(input)
    return Number.isFinite(number) ? number : undefined
  }
  if (props.variable.dataType === 'boolean') return ['true', '1', '是'].includes(input.toLowerCase())
  return input
}

function commit(raw: string): void {
  session.devices.setStaticValue(props.deviceId, props.variable.key, parse(raw))
}
</script>

<template>
  <UiText :model-value="text" placeholder="未填" :data-testid="`static-${deviceId}-${variable.key}`" @commit="commit" />
</template>
