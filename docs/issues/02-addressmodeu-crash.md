# Pixi v8: crash (addressModeU on null) when destroying a Texture still bound to a Sprite

## Steps to reproduce

Same minimal repro: [codemonkeynorth/react-pixi-cleanup-issue](https://github.com/codemonkeynorth/react-pixi-cleanup-issue)

```bash
npm install
npm run dev
```

1. Wait for the first image to load.
2. Select **Immediate cleanup (addressModeU bug repro)**.
3. Click **Next image** once.

The repro destroys the previous texture before updating the sprite’s texture prop (while @pixi/react may still render with the old binding).

## What is expected?

If a Texture is destroyed or invalidated while a Sprite still references it — even briefly, e.g. during a React/@pixi/react prop update — the renderer should not throw.

Expected behaviour (any of):

- Skip drawing that sprite for the frame
- Treat the binding as empty / invalid (similar to Texture.EMPTY)
- Tolerate destroyed sources without dereferencing null sampler/style state

## What is actually happening?

Console error on the first texture swap:

```
applyStyleParams.mjs: Uncaught TypeError: Cannot read properties of null (reading 'addressModeU')
```

The renderer appears to read sampler/style properties from a null or torn-down object when batching/drawing a sprite whose texture was destroyed before the binding updated.

Workaround in repro: **Deferred cleanup** — assign the new texture first, then `destroy(true)` after a few `requestAnimationFrame` callbacks. Production code also detaches sprites to `Texture.EMPTY` and calls `sprite.onViewUpdate?.()` before destroy.

## Any additional comments

This is separate from memory retention (issue #1). Apps that correctly try to release old textures on swap hit this crash unless they defer destroy — which makes timely cleanup harder.

**@pixi/react timing:** Sprite texture references are not updated synchronously with React state. Destroy in the same tick as a texture swap is a realistic pattern (not just a deliberate stress test) and should be safe or fail gracefully.

Environment: pixi.js 8.18–8.19, @pixi/react 8.0.5, Chrome on Windows.

**Requested fix:** Renderer should handle destroyed/invalid bound textures without throwing in `applyStyleParams` (or equivalent batch/draw path).

**Related:** Same repro repo as the memory retention issue — link both if filing separately.
