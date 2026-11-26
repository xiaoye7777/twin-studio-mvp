import { createUuid, type DeviceTemplate, type TwinVariableDefinition } from '@twin-studio/core'

export const defaultDeviceTemplates: readonly DeviceTemplate[] = [
  {
    id: 'example',
    name: '示例设备',
    type: 'example',
    prefix: 'DEV-',
    variables: [{ key: 'temperature', name: '温度', dataType: 'number', unit: '℃' }],
  },
]

export function deviceVariables(template: DeviceTemplate): TwinVariableDefinition[] {
  return template.variables.map(variable => ({ ...variable, id: `var_${createUuid()}` }))
}

export function deviceIdFor(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(3, '0')}`
}
