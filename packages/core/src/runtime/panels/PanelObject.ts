/*
 * 一个信息面板的三维对象：卡片画在 canvas 上，贴到 Sprite 上。
 *
 * Sprite 始终面向镜头，大小以米为单位，所以镜头拉远时和物体一样变小，不是相对屏幕固定。
 * 卡片底部的小尖指向放置面板时点的位置（Sprite 的 center 在底边中点）。
 * 面板不参与深度测试，总画在最上层，不会被放置它的物体切掉一半。
 */
import {
  type Box3,
  CanvasTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { PanelView } from './resolvePanel'

/** 画布的逻辑尺寸（像素），实际按 PIXEL_RATIO 放大，近看也清楚。 */
const CARD_WIDTH = 320
const PIXEL_RATIO = 3
const PADDING = 16
const TITLE_HEIGHT = 44
const ROW_HEIGHT = 30
const BOTTOM_PADDING = 10
const TAIL_HEIGHT = 14
const RADIUS = 10
const FONT = `-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif`
const COLOR = {
  card: 'rgb(14, 20, 25)',
  line: 'rgba(255, 255, 255, 0.2)',
  divider: 'rgba(255, 255, 255, 0.14)',
  accent: '#3fc1d9',
  selected: '#ffb45c',
  title: '#ffffff',
  label: 'rgba(235, 242, 245, 0.72)',
  value: '#ffffff',
}

function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--
  return `${text.slice(0, end)}…`
}

/** 圆角卡片，底边中间带一个向下的小尖。 */
function cardPath(context: CanvasRenderingContext2D, width: number, height: number): void {
  const body = height - TAIL_HEIGHT
  const middle = width / 2
  context.beginPath()
  context.moveTo(RADIUS, 0)
  context.arcTo(width, 0, width, body, RADIUS)
  context.arcTo(width, body, 0, body, RADIUS)
  context.lineTo(middle + TAIL_HEIGHT * 0.7, body)
  context.lineTo(middle, height)
  context.lineTo(middle - TAIL_HEIGHT * 0.7, body)
  context.arcTo(0, body, 0, 0, RADIUS)
  context.arcTo(0, 0, width, 0, RADIUS)
  context.closePath()
}

export class PanelObject extends Group {
  readonly sprite: Sprite
  private readonly material: SpriteMaterial
  private readonly canvas: HTMLCanvasElement | null =
    typeof document === 'undefined' ? null : document.createElement('canvas')
  private texture: CanvasTexture | null = null
  private drawn = ''

  constructor() {
    super()
    this.material = new SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    this.sprite = new Sprite(this.material)
    this.sprite.center.set(0.5, 0)
    this.sprite.renderOrder = 10
    this.sprite.userData.panelSprite = true
    this.sprite.scale.set(3, 2, 1)
    this.add(this.sprite)
  }

  /** 内容变了才重画。 */
  render(view: PanelView, selected: boolean): void {
    const signature = JSON.stringify([view, selected])
    if (signature === this.drawn || !this.canvas) return
    this.drawn = signature
    const rows = Math.max(view.rows.length, 1)
    const height = TITLE_HEIGHT + rows * ROW_HEIGHT + BOTTOM_PADDING + TAIL_HEIGHT
    const pixelWidth = CARD_WIDTH * PIXEL_RATIO
    const pixelHeight = height * PIXEL_RATIO
    const resized = this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight
    if (resized) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    }
    this.draw(view, selected, height)
    this.upload(resized)
    this.sprite.scale.set(view.width, (view.width * height) / CARD_WIDTH, 1)
  }

  private draw(view: PanelView, selected: boolean, height: number): void {
    const context = this.canvas!.getContext('2d')!
    context.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0)
    context.clearRect(0, 0, CARD_WIDTH, height)

    cardPath(context, CARD_WIDTH, height)
    context.fillStyle = COLOR.card
    context.fill()
    context.lineWidth = selected ? 3 : 1.5
    context.strokeStyle = selected ? COLOR.selected : COLOR.line
    context.stroke()

    // 标题栏
    context.textBaseline = 'middle'
    context.fillStyle = COLOR.accent
    context.fillRect(PADDING, 14, 3, TITLE_HEIGHT - 28)
    context.font = `600 17px ${FONT}`
    context.fillStyle = COLOR.title
    context.fillText(ellipsize(context, view.title, CARD_WIDTH - PADDING * 2 - 12), PADDING + 12, TITLE_HEIGHT / 2)
    context.fillStyle = COLOR.divider
    context.fillRect(PADDING, TITLE_HEIGHT - 1, CARD_WIDTH - PADDING * 2, 1)

    if (!view.rows.length) {
      context.font = `15px ${FONT}`
      context.fillStyle = COLOR.label
      context.fillText('还没有字段', PADDING, TITLE_HEIGHT + ROW_HEIGHT / 2)
      return
    }
    view.rows.forEach((row, index) => {
      const y = TITLE_HEIGHT + ROW_HEIGHT * index + ROW_HEIGHT / 2
      context.font = `600 16px ${FONT}`
      context.textAlign = 'right'
      context.fillStyle = COLOR.value
      const value = ellipsize(context, row.value, CARD_WIDTH / 2 - PADDING)
      context.fillText(value, CARD_WIDTH - PADDING, y)
      const valueWidth = context.measureText(value).width
      context.font = `15px ${FONT}`
      context.textAlign = 'left'
      context.fillStyle = COLOR.label
      context.fillText(ellipsize(context, row.label, CARD_WIDTH - PADDING * 2 - valueWidth - 12), PADDING, y)
    })
  }

  private upload(resized: boolean): void {
    if (this.texture && !resized) {
      this.texture.needsUpdate = true
      return
    }
    // 贴图尺寸一旦上传就不能改，换尺寸要换一张新的。
    this.texture?.dispose()
    this.texture = new CanvasTexture(this.canvas!)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.minFilter = LinearMipmapLinearFilter
    this.texture.magFilter = LinearFilter
    this.texture.anisotropy = 4
    this.material.map = this.texture
    this.material.needsUpdate = true
  }

  /** 面板在世界里占的范围：底边中点在节点位置，往上一个面板高（水平方向按面向任何方向算）。 */
  expandBox(box: Box3): void {
    this.updateWorldMatrix(true, true)
    const anchor = new Vector3().setFromMatrixPosition(this.sprite.matrixWorld)
    const size = new Vector3().setFromMatrixScale(this.sprite.matrixWorld)
    box.expandByPoint(new Vector3(anchor.x - size.x / 2, anchor.y, anchor.z - size.x / 2))
    box.expandByPoint(new Vector3(anchor.x + size.x / 2, anchor.y + size.y, anchor.z + size.x / 2))
  }

  dispose(): void {
    this.texture?.dispose()
    this.material.dispose()
  }
}
