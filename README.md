# Pixi texture lifecycle repro

Minimal standalone repro for PixiJS developers: **image-js decode → `BufferImageSource` → `Texture` → `@pixi/react` sprite**, then navigate to the next image.

No simulator framework — two separate issues are exercised via the **Texture cleanup on Next** radio group.

## Stack

- pixi.js ^8.18
- @pixi/react ^8.0
- React 19 + React Compiler (babel-plugin-react-compiler)
- image-js ^1.6 (8-bit PNG decode today; same path extends to 16-bit)

## Run

```bash
pnpm install
pnpm dev
```

## Issue 1 — memory retention

1. Select **No cleanup (memory leak repro)**.
2. Open Chrome DevTools → Memory, take a snapshot.
3. Click **Next image** 20–50 times (cycles 512×384, 768×512, 1024×768 PNGs).
4. Take another snapshot — look for retained `BufferImageSource`, `Texture`, batch pool / `ViewableBuffer` growth.

**Expected fix from Pixi:** GC / batch pool should release CPU/GPU resources when textures are no longer referenced, without app-side batch sweeps.

## Issue 2 — `addressModeU` crash on immediate destroy

1. Wait for the first image to load.
2. Select **Immediate cleanup (addressModeU bug repro)**.
3. Click **Next image** once.

**Current behaviour:** console throws `applyStyleParams.mjs: Cannot read properties of null (reading 'addressModeU')` because the previous texture is destroyed while the `@pixi/react` sprite still references it for at least one render.

**Expected fix from Pixi:** destroying or invalidating a bound texture should not crash the renderer — skip the draw, bind a safe fallback, or tolerate `Texture.EMPTY`-style semantics without throwing.

## Workaround (app-side)

Select **Deferred cleanup (app workaround)** — releases via `source.unload()`, zeroes the typed-array resource, then `texture.destroy(true)` after a few animation frames once the sprite has rebound. This is what the production scanner app does in `pixiTextureLifecycle.ts`.

## Sample images

`pnpm generate-samples` writes three synthetic PNGs to `public/images/`. Replace them with your own 8-bit (or later 16-bit) scan PNGs if needed.

## Related production workaround

The full scanner app implements manual release in `pixiTextureLifecycle.ts` (batch-pool sweep, deferred destroy, GC tuning). This repo keeps those paths explicit and selectable so Pixi can fix the root causes.
