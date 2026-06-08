import { useApplication } from "@pixi/react"
import {
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Sprite,
  Texture,
  type Filter,
  type Renderer,
} from "pixi.js"
import { useEffect, useRef } from "react"

import { waitFrames } from "./loadImageTexture"
import {
  LEAK_SCENE_SPRITE_COUNT,
  LEAK_SCENE_STAGE_COUNT,
  RENDER_FRAMES_AFTER_TEXTURE,
} from "./leakSceneConfig"

const STAGE_LABELS = ["pre", "intermediate", "post"] as const

/** Post stage is the visible image; pre/intermediate are smaller pipeline thumbs. */
const STAGE_MAX_WIDTH = [140, 140, 520] as const

type PixiLeakSceneProps = {
  textures: Texture[]
  onRenderer: (renderer: Renderer) => void
  onSceneReady?: () => void
}

function makeFilters(stage: number): Filter[] {
  const blur = new BlurFilter({
    strength: 1.5 + stage * 2,
    quality: 3,
  })
  const color = new ColorMatrixFilter()
  if (stage === 0) {
    color.brightness(1.04, false)
  } else if (stage === 1) {
    color.contrast(1.06, false)
  } else {
    color.saturate(1.02, false)
  }
  return [blur, color]
}

function fitSpriteToWidth(sprite: Sprite, texture: Texture, maxWidth: number): void {
  if (!texture || texture === Texture.EMPTY || texture.destroyed) return
  const w = texture.width
  if (w <= 0) return
  const scale = maxWidth / w
  sprite.scale.set(scale)
}

function layoutStageSprite(sprite: Sprite, stage: number): void {
  sprite.anchor.set(0, 0)
  sprite.blendMode = "normal"
  sprite.alpha = 1
  sprite.rotation = 0

  if (stage === 2) {
    sprite.position.set(16, 16)
    return
  }

  sprite.position.set(16 + stage * 156, 400)
}

export function PixiLeakScene({ textures, onRenderer, onSceneReady }: PixiLeakSceneProps) {
  const { app } = useApplication()
  const rootRef = useRef<Container | null>(null)
  const spritesRef = useRef<Sprite[]>([])
  const onSceneReadyRef = useRef(onSceneReady)
  onSceneReadyRef.current = onSceneReady

  useEffect(() => {
      onRenderer(app.renderer)

      const root = new Container()
      const sprites: Sprite[] = []

      for (let stage = 0; stage < LEAK_SCENE_STAGE_COUNT; stage += 1) {
        const stageRoot = new Container()
        stageRoot.label = STAGE_LABELS[stage]

        const sprite = new Sprite(Texture.EMPTY)
        sprite.filters = makeFilters(stage)
        sprite.label = `sprite-${STAGE_LABELS[stage]}`
        layoutStageSprite(sprite, stage)
        stageRoot.addChild(sprite)
        root.addChild(stageRoot)
        sprites.push(sprite)
      }

      app.stage.addChild(root)
      rootRef.current = root
      spritesRef.current = sprites

      return () => {
        for (const sprite of sprites) {
          sprite.texture = Texture.EMPTY
          sprite.destroy({ children: true })
        }
        root.destroy({ children: true })
        rootRef.current = null
        spritesRef.current = []
      }
  }, [app, onRenderer])

  useEffect(() => {
    const sprites = spritesRef.current
    let cancelled = false

    const apply = async () => {
      if (sprites.length === 0) return

      if (textures.length === 0) {
        for (const sprite of sprites) {
          sprite.texture = Texture.EMPTY
        }
        return
      }

      for (let i = 0; i < sprites.length; i += 1) {
        const texture = textures[i]
        const sprite = sprites[i]
        if (texture && !texture.destroyed) {
          sprite.texture = texture
          fitSpriteToWidth(sprite, texture, STAGE_MAX_WIDTH[i] ?? STAGE_MAX_WIDTH[2])
        } else {
          sprite.texture = Texture.EMPTY
        }
      }

      await waitFrames(RENDER_FRAMES_AFTER_TEXTURE)

      if (!cancelled) {
        onSceneReadyRef.current?.()
      }
    }

    void apply()

    return () => {
      cancelled = true
    }
  }, [app, textures])

  return null
}

export { LEAK_SCENE_SPRITE_COUNT }
