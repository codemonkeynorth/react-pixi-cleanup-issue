# Minimal Pixi.js image loader example
_Exported on 6/8/2026 at 20:07:56 GMT+1 from Cursor (3.7.19)_

---

**User**

@lp-ukbf-scanners-m60/app/src/core/features/simulator/components/viewport/image/advanced/utils/pixiTextureLifecycle.ts given the manual cleanup we have to do to prevent memory leaks I need to try create a minimal self contained repro in lp-ukbf-scanners-pixibugfix for  Pixi developers to see the issue 

it should:

* use latest pixi.js
* use latest @pixi/react
* use latest React + compiler
* use image-js for decoding 16 bit png

* allow the user to load an image and then navigate to a new image. for now assume 8 bit images loaded through image-js . decode the image and create a Buffer Source etc for a new Texture, push the texture into the pixiSprite

* not include any of the framework from m60/core etc.. just a fresh basic example of pixi + react + pixi/react + image-js

* just use basic buttons for interaction, a next button only will do

* you can use m60/core for some guidance but it should not use any of that complication, we should create the most basic stripped back version of an image loader => texture => sprite that we can.



---

**Cursor**

I'll set up a minimal Pixi + React repro in `lp-ukbf-scanners-pixibugfix` and use m60's texture lifecycle only as reference—not as a dependency.


Creating a minimal Vite app in `lp-ukbf-scanners-pixibugfix` that reproduces the texture lifecycle issue without m60's cleanup workarounds.


Fixing a bug: toggling manual cleanup shouldn't reload the current image.


Created a minimal standalone repro in `lp-ukbf-scanners-pixibugfix`.

## What it does

**Pipeline:** `fetch PNG` → `image-js decode` → RGBA `Uint8Array` → `BufferImageSource` → `Texture` → `@pixi/react` `<pixiSprite>`

**Interaction:** **Next image** cycles three synthetic PNGs (512×384, 768×512, 1024×768). By default, old textures are **not** destroyed — that’s the leak path Pixi devs should see.

**Optional:** “Manual cleanup” toggle applies the same workaround as production (`unload` → zero resource → `destroy(true)`) for A/B comparison.

**Stats panel:** tracked texture count, estimated RGBA MB, Chrome JS heap (when available).

## Stack (latest at install time)

- pixi.js 8.19
- @pixi/react 8.0.5
- React 19.2 + React Compiler (`@rolldown/plugin-babel`)
- image-js 1.6

## Run

```bash
cd lp-ukbf-scanners-pixibugfix
pnpm install
pnpm dev
```

`pnpm dev` regenerates sample PNGs then starts Vite. Build verified with `tsc -b && vite build`.

## Key files

| File | Role |
|------|------|
| `src/loadImageTexture.ts` | decode + texture create + optional `releaseTexture` |
| `src/App.tsx` | Application, sprite, Next button, memory stats |
| `src/pixiSetup.ts` | `extend({ Container, Sprite })` |
| `scripts/generate-samples.mjs` | synthetic test PNGs |
| `README.md` | repro steps for Pixi team |

No m60/core imports — only the stripped path. `releaseTexture` is isolated in `loadImageTexture.ts` so you can point Pixi devs at the default (leaky) flow vs the workaround.

**Repro for Pixi:** Chrome DevTools → Memory → snapshot → click Next 20–50 times → snapshot again. Look for retained `BufferImageSource`, `Texture`, batch pool / `ViewableBuffer` growth. Toggle manual cleanup to show the difference.

16-bit decode can be added later in `decodePngToRgba` using the same pattern as m60’s `load16BitImage` — currently 8-bit RGB/RGBA/greyscale only.

---

**User**

ticking manual cleanup gives

applyStyleParams.mjs:7 Uncaught TypeError: Cannot read properties of null (reading 'addressModeU')

---

**Cursor**

Manual cleanup is likely destroying the texture while the sprite still references it. I'll trace the release order and align it with how Pixi expects textures to be detached first.


Destroying the texture before the sprite updates leaves Pixi reading a null sampler — I'll defer release until after React assigns the new texture, matching m60's pattern.


The crash came from destroying the old texture **before** `@pixi/react` rebound the sprite — Pixi still tried to sample it and hit `addressModeU` on a null style.

That matches what m60 documents in `pixiTextureLifecycle.ts`: immediate destroy while a sprite holds the texture crashes Pixi.

**Changes:**

1. **Assign the new texture first**, then release the previous one.
2. **`scheduleReleaseTexture`** — defers `destroy(true)` by 3 animation frames so the sprite can switch to the new texture (or `Texture.EMPTY`).
3. **Sprite always mounted** with `texture ?? Texture.EMPTY` instead of unmounting when empty.

Enable manual cleanup, click **Next** a few times — it should run without the `applyStyleParams` error while still freeing memory after the deferred release.

---

**User**

we should maybe also add this test to the repro tho  because addressModeU error should be fixed in pixi by the developers

---

**Cursor**

Adding an explicit "immediate destroy" test path so Pixi devs can reproduce the `addressModeU` crash separately from the deferred workaround.


Refactoring cleanup into explicit modes: none (leak), deferred (workaround), and immediate (the `addressModeU` bug repro).


The checkbox is now a **three-way cleanup mode** so both Pixi issues are explicit and reproducible:

| Mode | Purpose |
|------|---------|
| **No cleanup** | Memory retention repro — heap climbs on repeated Next |
| **Deferred cleanup** | App workaround — release after sprite rebind |
| **Immediate cleanup** | **`addressModeU` bug repro** — destroys the previous texture *before* `setTexture`, while the sprite still holds it |

**To trigger issue 2:** load the first image → select **Immediate cleanup** → click **Next** once. You should get `applyStyleParams: Cannot read properties of null (reading 'addressModeU')`.

The UI shows a warning in immediate mode and the README documents both issues separately, including what Pixi should do instead of throwing. Deferred mode stays the default workaround path for comparison.

---

**User**

put the immediate option 2nd 

also add a red box explanation for No cleanup option as well (like the immediate one)

add a green box explanation for deferred cleanup showing we resolved the issues

---

**Cursor**

Fixing a reference order issue: `CLEANUP_CALLOUTS` referenced `styles` before it was defined.


Done. Updates:

1. **Radio order:** No cleanup → Immediate → Deferred  
2. **Context callout** below the radios (updates with selection):
   - **Red** for No cleanup — issue 1 retention repro  
   - **Red** for Immediate — issue 2 `addressModeU` crash  
   - **Green** for Deferred — workaround; no crash, flat memory  

The duplicate footer notes were removed since the callouts cover the same ground.

