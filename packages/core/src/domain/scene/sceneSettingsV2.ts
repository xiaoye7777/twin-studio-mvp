import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, { message: '颜色必须是 #RRGGBB 格式' })

/** 场景的外观。设备性能决定能渲染多少（见引擎的画质档位），但不会改动这份设置。 */
export const SceneSettingsSchemaV2 = z.object({
  /** 编辑器的辅助线；Viewer 不显示。 */
  helpers: z.object({ grid: z.boolean(), axes: z.boolean() }),
  ground: z.object({ enabled: z.boolean(), size: z.number().min(1).max(20000), color: hexColor }),
  sky: z.object({
    /** physical：随时间变化的大气天空；gradient：渐变；color：纯色；hdr：环境贴图。 */
    mode: z.enum(['physical', 'gradient', 'color', 'hdr']),
    color: hexColor,
    hdrAssetId: z.string().nullable(),
    /** 环境光照和反射的强度。 */
    environmentIntensity: z.number().min(0).max(3),
  }),
  time: z.object({
    /** 0–24，决定太阳位置和天空颜色。 */
    hour: z.number().min(0).max(24),
    /** 太阳路径绕场景旋转的角度。 */
    azimuth: z.number().min(-180).max(180),
  }),
  lighting: z.object({
    ambientIntensity: z.number().min(0).max(5),
    sunIntensity: z.number().min(0).max(10),
    shadows: z.boolean(),
  }),
  /** density 是相对雾浓度（0–1），引擎按场景大小换算。 */
  fog: z.object({ enabled: z.boolean(), density: z.number().min(0).max(1) }),
  post: z.object({
    exposure: z.number().min(0.1).max(4),
    bloom: z.object({
      enabled: z.boolean(),
      intensity: z.number().min(0).max(5),
      /** 亮度超过这个值才泛光。 */
      threshold: z.number().min(0).max(2),
    }),
    vignette: z.boolean(),
    contrast: z.number().min(-1).max(1),
    saturation: z.number().min(-1).max(1),
  }),
})

export type SceneSettingsV2 = z.infer<typeof SceneSettingsSchemaV2>
export type SkyMode = SceneSettingsV2['sky']['mode']

export function createDefaultSceneSettingsV2(): SceneSettingsV2 {
  return {
    helpers: { grid: true, axes: false },
    ground: { enabled: true, size: 600, color: '#3a3f44' },
    sky: { mode: 'physical', color: '#20242a', hdrAssetId: null, environmentIntensity: 0.7 },
    time: { hour: 15, azimuth: 30 },
    lighting: { ambientIntensity: 0.6, sunIntensity: 2.4, shadows: true },
    fog: { enabled: true, density: 0.3 },
    post: {
      exposure: 1,
      bloom: { enabled: true, intensity: 0.7, threshold: 1 },
      vignette: true,
      contrast: 0.06,
      saturation: 0.05,
    },
  }
}
