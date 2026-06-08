# Pixi v8: BufferImageSource / Texture memory retained after dynamic texture replacement

## Steps to reproduce

Minimal repro: [codemonkeynorth/react-pixi-cleanup-issue](https://github.com/codemonkeynorth/react-pixi-cleanup-issue)

Stack: pixi.js ^8.18, @pixi/react ^8.0, React 19 — image-js decode → BufferImageSource → Texture → `<pixiSprite>`.

```bash
npm install
npm run dev
```

1. Select **No cleanup (memory leak repro)**.
2. Wait for the first image to load.
3. Open Chrome DevTools → Memory, take a heap snapshot.
4. Click **Next image** 20–50 times (each click creates a new BufferImageSource + Texture and assigns it to the sprite).
5. Take another heap snapshot.
6. For comparison, repeat with **Deferred cleanup (app workaround)** — tracked RGBA and heap should stay flat.

## What is expected?

When a sprite is rebound to a new Texture and the previous Texture / BufferImageSource is no longer referenced by application code, Pixi should release:

- CPU typed-array backing stores (`source.resource`)
- GPU memory for the old source
- Any internal pool entries that only existed to render the old texture

`renderer.gc` should be able to reclaim recently replaced dynamic textures without requiring apps to reach into `renderPipes.batch` or zero resources manually before `destroy(true)`.

## What is actually happening?

With no manual cleanup, JS heap and tracked RGBA bytes grow on every texture swap. Heap snapshots show retained BufferImageSource, Texture, and associated ArrayBuffer / typed-array data.

Even when we explicitly release textures in production, `texture.destroy(true)` alone is not sufficient. We also need:

- `source.unload()` — drops GPU data; source object may remain
- Zeroing `source.resource` before destroy — batch-pooled shells can otherwise retain large CPU buffers
- Deferred destroy until after the sprite rebinds (separate issue — see crash when destroying too early)

## Any additional comments

Minimal repro: Single sprite, no filters. Shows retention of BufferImageSource / Texture and CPU buffers. Does not show all retention paths we see in larger apps.

Additional retention observed in production (not in minimal repro):

- **ViewableBuffer / DefaultBatcher** — With multiple sprites, filters, and render groups, heap snapshots show ViewableBuffer growth from orphaned DefaultBatcher instances in `renderPipes.batch._batchersByInstructionSet`. Not observed with one sprite. `BatcherPipe.destroy()` appears to clear active batches only, not stale batchers keyed by InstructionSet.uid.
- **BatchTextureArray slots** — After `texture.destroy(true)`, `Batch.textures[]` can retain references to destroyed BufferImageSource shells (~0.6 KB wrappers). We manually call `batch.textures.clear()` and prune orphan batchers to release them.
- **GCSystem timing** — With `gcActive`, `gcMaxUnusedTime`, and `gcFrequency` configured, `renderer.gc.run()` often does not reclaim replaced textures because they were touched within `gcMaxUnusedTime`. Explicit release on swap is still required.
- **CPU buffer pinning** — If `source.resource` still holds a large Uint8Array at destroy time, batch-pooled shells can keep multi‑MB buffers alive until resource is zeroed.

Environment: pixi.js 8.18–8.19, @pixi/react 8.0.5, Chrome on Windows, dynamic BufferImageSource textures (decoded pixel buffers, not static asset loads).

**Requested fix:** Reliable release of dynamic BufferImageSource CPU/GPU memory when textures are replaced, without app-side batch-pool sweeps or manual resource zeroing.

**Related:** Same repro repo as the `addressModeU` crash issue — link both if filing separately.
