import type { Renderer } from "pixi.js"

/** Nudge Pixi's texture GC after releasing a replaced texture. */
export function schedulePixiTextureGc(renderer: Renderer | null, frames = 5): void {
  if (!renderer) return

  let remaining = Math.max(1, frames)
  const tick = () => {
    remaining -= 1
    if (remaining > 0) {
      requestAnimationFrame(tick)
      return
    }
    renderer.textureGC.run()
  }
  requestAnimationFrame(tick)
}
