<script setup lang="ts">
/**
 * 右栏「环境」页：什么都没选时显示。氛围预设、天空与时间、光照、后期效果、雾与天气。
 * 地面（地块）不在这里改，用场景默认值。
 */
import { Moon, Sun, Sunrise, Warehouse } from 'lucide-vue-next'
import { computed } from 'vue'
import { scenePresets, type SceneSettingsV2, type SkyMode } from '@twin-studio/core'
import UiColor from '@/components/ui/UiColor.vue'
import UiRow from '@/components/ui/UiRow.vue'
import UiSection from '@/components/ui/UiSection.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { useSession } from '@/studio/context'

const session = useSession()
const settings = computed(() => session.doc.value.settings)

/** 预设卡片上的图标和天空示意色。 */
const presetIcons: Record<string, unknown> = { day: Sun, dusk: Sunrise, night: Moon, studio: Warehouse }
const presetPreview: Record<string, string> = {
  day: 'linear-gradient(180deg, #4d82c4 0%, #c9dbe9 62%, #6f7378 63%, #4a4e53 100%)',
  dusk: 'linear-gradient(180deg, #33456e 0%, #f0a564 60%, #4d4542 61%, #2f2b2a 100%)',
  night: 'linear-gradient(180deg, #03050a 0%, #122036 60%, #0e141c 61%, #080b10 100%)',
  studio: 'linear-gradient(180deg, #23272c 0%, #1d2126 60%, #2a2e33 61%, #1a1d21 100%)',
}

/**
 * 天空模式。HDR 需要上传 .hdr 环境贴图，后端资源库目前不收这种文件，所以不提供；
 * 只有打开的场景本来就是 HDR 时才列出来，让当前状态看得见。
 */
const skyOptions = computed(() => {
  const options: Array<{ value: SkyMode; label: string }> = [
    { value: 'physical', label: '真实' },
    { value: 'gradient', label: '渐变' },
    { value: 'color', label: '纯色' },
  ]
  if (settings.value.sky.mode === 'hdr') options.push({ value: 'hdr', label: 'HDR' })
  return options
})

/** 拖滑块：同一个 key 的连续修改合并成一步撤销，松手时 commit。 */
function set(recipe: (s: SceneSettingsV2) => void, key: string, label = '场景设置'): void {
  session.updateSettings(recipe, label, `settings:${key}`)
}
const commit = () => session.commit()

/** 时间滑块旁显示成 18:15 这样。 */
const hourLabel = computed(() => {
  const hour = settings.value.time.hour
  const h = Math.floor(hour) % 24
  const m = Math.round((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m === 60 ? 0 : m).padStart(2, '0')}`
})
</script>

<template>
  <div data-testid="scene-environment">
    <UiSection title="氛围预设">
      <div class="presets">
        <button
          v-for="preset in scenePresets"
          :key="preset.id"
          class="preset"
          :data-testid="`preset-${preset.id}`"
          @click="session.applyPreset(preset.id)"
        >
          <span class="preset__sky" :style="{ background: presetPreview[preset.id] }">
            <component :is="presetIcons[preset.id]" :size="14" />
          </span>
          <span>{{ preset.name }}</span>
        </button>
      </div>
    </UiSection>

    <UiSection title="天空与时间">
      <UiRow label="天空">
        <UiSegmented
          :model-value="settings.sky.mode"
          :options="skyOptions"
          @update:model-value="session.updateSettings(s => void (s.sky.mode = $event), '天空')"
        />
      </UiRow>
      <UiRow :label="`时间 ${hourLabel}`" hint="驱动太阳位置、天空颜色和夜间照明">
        <UiSlider
          :model-value="settings.time.hour"
          :min="0"
          :max="24"
          :step="0.25"
          data-testid="time-of-day"
          @update="set(s => void (s.time.hour = $event), 'hour', '时间')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="太阳方位">
        <UiSlider
          :model-value="settings.time.azimuth"
          :min="-180"
          :max="180"
          :step="1"
          :precision="0"
          unit="°"
          @update="set(s => void (s.time.azimuth = $event), 'azimuth')"
          @commit="commit"
        />
      </UiRow>
      <UiRow v-if="settings.sky.mode === 'color'" label="背景色">
        <UiColor
          :model-value="settings.sky.color"
          @update="set(s => void (s.sky.color = $event), 'skyColor', '背景色')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="环境反射">
        <UiSlider
          :model-value="settings.sky.environmentIntensity"
          :min="0"
          :max="3"
          @update="set(s => void (s.sky.environmentIntensity = $event), 'env')"
          @commit="commit"
        />
      </UiRow>
    </UiSection>

    <UiSection title="光照">
      <UiRow label="环境光">
        <UiSlider
          :model-value="settings.lighting.ambientIntensity"
          :min="0"
          :max="5"
          @update="set(s => void (s.lighting.ambientIntensity = $event), 'ambient')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="日光">
        <UiSlider
          :model-value="settings.lighting.sunIntensity"
          :min="0"
          :max="10"
          @update="set(s => void (s.lighting.sunIntensity = $event), 'sun')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="阴影" hint="低画质设备会自动关闭">
        <UiSwitch
          :model-value="settings.lighting.shadows"
          @update:model-value="session.updateSettings(s => void (s.lighting.shadows = $event), '阴影')"
        />
      </UiRow>
    </UiSection>

    <UiSection title="后期效果">
      <UiRow label="曝光">
        <UiSlider
          :model-value="settings.post.exposure"
          :min="0.2"
          :max="3"
          @update="set(s => void (s.post.exposure = $event), 'exposure')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="泛光" hint="让自发光材质和灯光产生光晕">
        <UiSwitch
          :model-value="settings.post.bloom.enabled"
          @update:model-value="session.updateSettings(s => void (s.post.bloom.enabled = $event), '泛光')"
        />
      </UiRow>
      <template v-if="settings.post.bloom.enabled">
        <UiRow label="泛光强度">
          <UiSlider
            :model-value="settings.post.bloom.intensity"
            :min="0"
            :max="5"
            @update="set(s => void (s.post.bloom.intensity = $event), 'bloomI')"
            @commit="commit"
          />
        </UiRow>
        <UiRow label="泛光阈值" hint="越低越多物体发光">
          <UiSlider
            :model-value="settings.post.bloom.threshold"
            :min="0"
            :max="2"
            @update="set(s => void (s.post.bloom.threshold = $event), 'bloomT')"
            @commit="commit"
          />
        </UiRow>
      </template>
      <UiRow label="对比度">
        <UiSlider
          :model-value="settings.post.contrast"
          :min="-1"
          :max="1"
          @update="set(s => void (s.post.contrast = $event), 'contrast')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="饱和度">
        <UiSlider
          :model-value="settings.post.saturation"
          :min="-1"
          :max="1"
          @update="set(s => void (s.post.saturation = $event), 'saturation')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="暗角">
        <UiSwitch
          :model-value="settings.post.vignette"
          @update:model-value="session.updateSettings(s => void (s.post.vignette = $event), '暗角')"
        />
      </UiRow>
    </UiSection>

    <UiSection title="雾与天气">
      <UiRow label="大气雾">
        <UiSwitch
          :model-value="settings.fog.enabled"
          data-testid="fog-enabled"
          @update:model-value="session.updateSettings(s => void (s.fog.enabled = $event), '雾')"
        />
      </UiRow>
      <UiRow v-if="settings.fog.enabled" label="雾浓度">
        <UiSlider
          :model-value="settings.fog.density"
          :min="0"
          :max="1"
          @update="set(s => void (s.fog.density = $event), 'fog', '雾浓度')"
          @commit="commit"
        />
      </UiRow>
      <UiRow label="天气">
        <UiSegmented
          :model-value="settings.weather.kind"
          :options="[
            { value: 'none', label: '晴' },
            { value: 'rain', label: '雨' },
            { value: 'snow', label: '雪' },
          ]"
          data-testid="weather-kind"
          @update:model-value="session.updateSettings(s => void (s.weather.kind = $event), '天气')"
        />
      </UiRow>
      <UiRow v-if="settings.weather.kind !== 'none'" label="强度">
        <UiSlider
          :model-value="settings.weather.intensity"
          :min="0.1"
          :max="1"
          @update="set(s => void (s.weather.intensity = $event), 'weather', '天气强度')"
          @commit="commit"
        />
      </UiRow>
    </UiSection>
  </div>
</template>

<style scoped>
.presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 0 10px;
}
.preset {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--s-fg-2);
  font-size: 11px;
  cursor: pointer;
}
.preset__sky {
  display: grid;
  width: 100%;
  aspect-ratio: 1.2;
  place-items: center;
  border: 1px solid var(--s-line-2);
  border-radius: 6px;
  color: rgb(255 255 255 / 0.85);
  transition:
    border-color 120ms ease,
    transform 120ms ease;
}
.preset:hover .preset__sky {
  border-color: var(--s-accent);
  transform: translateY(-1px);
}
.preset:hover {
  color: var(--s-fg);
}
</style>
