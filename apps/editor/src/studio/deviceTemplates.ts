import type { TwinVariableDefinition } from '@twin-studio/core'

export interface DeviceTemplate {
  id: string
  name: string
  /** 写进设备绑定的设备类型。 */
  type: string
  /** 批量绑定时默认的编号前缀，如 "ESS-" → ESS-001。 */
  prefix: string
  variables: Omit<TwinVariableDefinition, 'id'>[]
}

const v = (key: string, name: string, dataType: TwinVariableDefinition['dataType'], unit?: string) => ({
  key,
  name,
  dataType,
  ...(unit ? { unit } : {}),
})

/** 零碳园区常见的设备类型，变量是常见网关会上报的那些。 */
export const deviceTemplates: readonly DeviceTemplate[] = [
  {
    id: 'ess',
    name: '储能柜',
    type: 'energy-storage',
    prefix: 'ESS-',
    variables: [
      v('soc', '荷电状态', 'number', '%'),
      v('power', '充放电功率', 'number', 'kW'),
      v('temperature', '电池温度', 'number', '℃'),
      v('status', '运行状态', 'string'),
      v('alarm', '告警', 'boolean'),
    ],
  },
  {
    id: 'pv',
    name: '光伏阵列',
    type: 'photovoltaic',
    prefix: 'PV-',
    variables: [
      v('power', '发电功率', 'number', 'kW'),
      v('energyToday', '今日发电量', 'number', 'kWh'),
      v('irradiance', '辐照度', 'number', 'W/m²'),
      v('temperature', '组件温度', 'number', '℃'),
      v('status', '运行状态', 'string'),
    ],
  },
  {
    id: 'wind',
    name: '风机',
    type: 'wind-turbine',
    prefix: 'WT-',
    variables: [
      v('power', '发电功率', 'number', 'kW'),
      v('windSpeed', '风速', 'number', 'm/s'),
      v('rotorSpeed', '转速', 'number', 'rpm'),
      v('status', '运行状态', 'string'),
      v('alarm', '告警', 'boolean'),
    ],
  },
  {
    id: 'charger',
    name: '充电桩',
    type: 'ev-charger',
    prefix: 'EV-',
    variables: [
      v('power', '充电功率', 'number', 'kW'),
      v('voltage', '电压', 'number', 'V'),
      v('current', '电流', 'number', 'A'),
      v('status', '运行状态', 'string'),
      v('occupied', '占用', 'boolean'),
    ],
  },
  {
    id: 'transformer',
    name: '变压器',
    type: 'transformer',
    prefix: 'TR-',
    variables: [
      v('load', '负载率', 'number', '%'),
      v('temperature', '油温', 'number', '℃'),
      v('voltage', '电压', 'number', 'kV'),
      v('alarm', '告警', 'boolean'),
    ],
  },
  {
    id: 'meter',
    name: '能耗电表',
    type: 'energy-meter',
    prefix: 'EM-',
    variables: [
      v('power', '有功功率', 'number', 'kW'),
      v('energy', '累计电量', 'number', 'kWh'),
      v('carbon', '碳排放', 'number', 'kgCO₂'),
    ],
  },
  {
    id: 'environment',
    name: '环境监测',
    type: 'environment-sensor',
    prefix: 'ENV-',
    variables: [
      v('temperature', '温度', 'number', '℃'),
      v('humidity', '湿度', 'number', '%'),
      v('pm25', 'PM2.5', 'number', 'μg/m³'),
      v('co2', 'CO₂', 'number', 'ppm'),
    ],
  },
  {
    id: 'building',
    name: '建筑能耗',
    type: 'building',
    prefix: 'BLD-',
    variables: [
      v('power', '实时负荷', 'number', 'kW'),
      v('energyToday', '今日用电', 'number', 'kWh'),
      v('occupancy', '在岗人数', 'number', '人'),
    ],
  },
  {
    id: 'generic',
    name: '通用设备',
    type: 'generic',
    prefix: 'DEV-',
    variables: [v('status', '运行状态', 'string'), v('value', '读数', 'number')],
  },
]

export function deviceVariables(template: DeviceTemplate): TwinVariableDefinition[] {
  return template.variables.map(variable => ({ ...variable, id: `var_${crypto.randomUUID()}` }))
}

export function deviceIdFor(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(3, '0')}`
}
