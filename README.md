# react-pixi-cleanup-issue

Minimal standalone repro for PixiJS developers: **image-js decode → `BufferImageSource` → `Texture` → `@pixi/react` sprite**, then navigate to the next image.

Repo: [codemonkeynorth/react-pixi-cleanup-issue](https://github.com/codemonkeynorth/react-pixi-cleanup-issue)

No simulator framework — two separate issues are exercised via the **Texture cleanup on Next** radio group. Full issue text for filing on GitHub: [`docs/issues/`](docs/issues/).

## Stack

- pixi.js ^8.18
- @pixi/react ^8.0.5
- React 19 + Vite 6 (StackBlitz-compatible — no Rolldown / React Compiler)
- image-js ^1.6 (8-bit PNG decode today; same path extends to 16-bit)

## Run

```bash
npm install
npm run dev
```

Sample PNGs are committed under `public/images/`. Run `npm run generate-samples` only if you need to regenerate them.

[Open in StackBlitz](https://stackblitz.com/github/codemonkeynorth/react-pixi-cleanup-issue)

## Issue 1 — Memory retention

Old textures are never destroyed. JS heap and tracked RGBA grow on every **Next image** click until Pixi reclaims replaced dynamic textures without app-side workarounds.

**Steps to reproduce**

1. Select **No cleanup (memory leak repro)**.
2. Wait for the first image to load.
3. Open Chrome DevTools → Memory, take a heap snapshot.
4. Click **Next image** 20–50 times (cycles 512×384, 768×512, 1024×768 PNGs).
5. Take another heap snapshot — look for retained `BufferImageSource`, `Texture`, and typed-array / batch-pool growth.
6. For comparison, repeat with **Deferred cleanup (app workaround)** — tracked RGBA and heap should stay flat.

## Issue 2 — `addressModeU` crash on immediate destroy

Destroying the previous texture before the sprite rebinds crashes the renderer on the first swap.

**Steps to reproduce**

1. Wait for the first image to load.
2. Select **Immediate cleanup (addressModeU bug repro)**.
3. Click **Next image** once.

Expect `applyStyleParams: Cannot read properties of null (reading 'addressModeU')` until Pixi handles destroyed bound textures gracefully.

## Workaround (app-side)

Select **Deferred cleanup (app workaround)** — assign the new texture first, then release the previous one after a few animation frames (`source.unload()`, zero typed-array resource, `texture.destroy(true)`). See `src/loadImageTexture.ts`.

## Sample images

`npm run generate-samples` writes three synthetic PNGs to `public/images/`. Replace them with your own 8-bit (or later 16-bit) scan PNGs if needed.
