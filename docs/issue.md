# Pixi v8: BufferImageSource shells retained in batch pool after correct destroy

## Steps to reproduce

```bash
npm install
npm run dev
```

1. **Release after rebind**
2. Heap snapshot #1 → 20–50× **Next** → snapshot #2 → Comparison → `BufferImageSource`
3. Stale `# New` instances should be **~0.5 KB** with `destroyed: true` and empty `resource`. Full-buffer retention means the app failed to release.
4. **Control:** **Release + batch sweep** — `# Delta` should flatten if Pixi retains shells in `_batchersByInstructionSet`.

## Expected

Destroyed shells should not remain reachable from `renderPipes.batch` / `Batch.textures[]`.

## Actual (production / heavy viewports)

~0.6 KB destroyed shells accumulate until manual `clearStaleBatchTextureRefs`. This minimal scene may stay flat without production-level batch pressure.

## Release sequence

`unload` → `source.resource = new Uint8Array(0)` → `texture.destroy(true)` after sprites rebind to new textures.
