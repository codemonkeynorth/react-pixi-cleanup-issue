import { decode } from "image-js"
import { BufferImageSource, Texture } from "pixi.js"

export type DecodedImage = {
  width: number
  height: number
  rgba: Uint8Array
}

/** Decode an 8-bit PNG via image-js and expand to RGBA for BufferImageSource. */
export async function decodePngToRgba(url: string): Promise<DecodedImage> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  const decoded = decode(bytes)
  const raw = decoded.getRawImage()
  const { width, height, data, channels } = raw

  const rgba = new Uint8Array(width * height * 4)

  if (channels === 4) {
    rgba.set(data as Uint8Array)
  } else if (channels === 3) {
    const rgb = data as Uint8Array
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      rgba[j] = rgb[i]
      rgba[j + 1] = rgb[i + 1]
      rgba[j + 2] = rgb[i + 2]
      rgba[j + 3] = 255
    }
  } else if (channels === 1) {
    const grey = data as Uint8Array
    for (let i = 0, j = 0; i < grey.length; i += 1, j += 4) {
      const v = grey[i]
      rgba[j] = v
      rgba[j + 1] = v
      rgba[j + 2] = v
      rgba[j + 3] = 255
    }
  } else {
    throw new Error(`Unsupported channel count: ${channels}`)
  }

  return { width, height, rgba }
}

export function createTextureFromRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
): Texture {
  const source = new BufferImageSource({
    resource: rgba,
    width,
    height,
  })
  return Texture.from(source, true)
}

export async function loadImageTexture(url: string): Promise<Texture> {
  const { width, height, rgba } = await decodePngToRgba(url)
  return createTextureFromRgba(rgba, width, height)
}

/** How to release the previous texture when navigating to the next image. */
export type TextureCleanupMode = "none" | "deferred" | "immediate"

/** Minimal manual release — not enabled by default in the repro. */
export function releaseTexture(texture: Texture | null | undefined): void {
  if (!texture || texture.destroyed) return

  const source = texture.source as Texture["source"] & {
    options?: { resource?: unknown }
    unload?: () => void
  }

  try {
    source?.unload?.()
  } catch {
    // unload is optional
  }

  const resource = source?.resource
  if (
    resource instanceof Uint8Array ||
    resource instanceof Uint8ClampedArray ||
    resource instanceof Uint16Array ||
    resource instanceof Float32Array
  ) {
    source.resource = new Uint8Array(0)
    if (source.options && "resource" in source.options) {
      source.options.resource = source.resource
    }
  }

  texture.destroy(true)
}

/**
 * Defer destroy until @pixi/react has rebound the sprite (immediate destroy while the
 * sprite still references the texture crashes Pixi: addressModeU on null).
 */
export function scheduleReleaseTexture(
  texture: Texture | null | undefined,
  frames = 3,
): void {
  if (!texture || texture.destroyed) return

  let remaining = Math.max(1, frames)
  const tick = () => {
    remaining -= 1
    if (remaining > 0) {
      requestAnimationFrame(tick)
      return
    }
    releaseTexture(texture)
  }
  requestAnimationFrame(tick)
}

export function estimateTextureBytes(texture: Texture | null | undefined): number {
  if (!texture || texture.destroyed) return 0
  const resource = texture.source?.resource
  if (resource instanceof Uint8Array || resource instanceof Uint8ClampedArray) {
    return resource.byteLength
  }
  const { width, height } = texture
  return width > 0 && height > 0 ? width * height * 4 : 0
}
