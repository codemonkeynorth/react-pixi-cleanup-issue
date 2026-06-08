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

/** One BufferImageSource per filtered sprite in the leak scene. */
export async function loadSceneTextures(url: string, count: number): Promise<Texture[]> {
  const textures: Texture[] = []
  for (let i = 0; i < count; i += 1) {
    textures.push(await loadImageTexture(url))
  }
  return textures
}

export function releaseTextures(textures: Iterable<Texture | null | undefined>): void {
  for (const texture of textures) {
    releaseTexture(texture)
  }
}

export function waitFrames(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    let remaining = Math.max(1, frames)
    const tick = () => {
      remaining -= 1
      if (remaining > 0) {
        requestAnimationFrame(tick)
        return
      }
      resolve()
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Production-equivalent release: unload GPU → zero CPU `resource` → `destroy(true)`.
 * Retained Pixi batch-pool shells should be ~0.5 KB with `resource` empty — not full image buffers.
 */
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

/** Defer destroy until sprites have rebound to new textures. */
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
