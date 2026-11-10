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
  /** 天气粒子。早先存的场景没有这一项，读入时按「晴」补上。 */
  weather: z
    .object({ kind: z.enum(['none', 'rain', 'snow']), intensity: z.number().min(0).max(1) })
    .default({ kind: 'none', intensity: 0.6 }),
})

export type SceneSettingsV2 = z.infer<typeof SceneSettingsSchemaV2>
export type SkyMode = SceneSettingsV2['sky']['mode']
export type WeatherKind = SceneSettingsV2['weather']['kind']

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
    weather: { kind: 'none', intensity: 0.6 },
  }
}

/** 编辑器里一键套用的氛围。只改天空、时间、光照、雾和后期，不动地面和天气。 */
export const scenePresets: ReadonlyArray<{ id: string; name: string; apply: (s: SceneSettingsV2) => SceneSettingsV2 }> =
  [
    {
      id: 'day',
      name: '晴朗白天',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'physical' },
        time: { ...s.time, hour: 14 },
        lighting: { ...s.lighting, ambientIntensity: 0.9, sunIntensity: 2.6 },
        fog: { enabled: true, density: 0.25 },
        post: { ...s.post, exposure: 1, bloom: { enabled: true, intensity: 0.5, threshold: 1 } },
      }),
    },
    {
      id: 'dusk',
      name: '黄昏',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'physical' },
        time: { ...s.time, hour: 18.2 },
        lighting: { ...s.lighting, ambientIntensity: 0.7, sunIntensity: 2.2 },
        fog: { enabled: true, density: 0.35 },
        post: { ...s.post, exposure: 1.1, bloom: { enabled: true, intensity: 0.9, threshold: 0.95 } },
      }),
    },
    {
      id: 'night',
      name: '科技夜景',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'gradient' },
        time: { ...s.time, hour: 22 },
        lighting: { ...s.lighting, ambientIntensity: 1.1, sunIntensity: 1.2 },
        fog: { enabled: true, density: 0.45 },
        post: { ...s.post, exposure: 1.15, bloom: { enabled: true, intensity: 1.3, threshold: 0.8 } },
      }),
    },
    {
      id: 'studio',
      name: '展台',
      apply: s => ({
        ...s,
        sky: { ...s.sky, mode: 'color', color: '#1d2126' },
        time: { ...s.time, hour: 13 },
        lighting: { ...s.lighting, ambientIntensity: 1.2, sunIntensity: 2.2 },
        fog: { enabled: false, density: s.fog.density },
        post: { ...s.post, exposure: 1, bloom: { enabled: true, intensity: 0.6, threshold: 1 } },
      }),
    },
  ]
