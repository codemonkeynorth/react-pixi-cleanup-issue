# react-pixi-cleanup-issue

Minimal repro for PixiJS **batch-pool shell retention** after correct dynamic `BufferImageSource` destroy.

Repo: [codemonkeynorth/react-pixi-cleanup-issue](https://github.com/codemonkeynorth/react-pixi-cleanup-issue)

Related (separate issue): [react-pixi-addressmodeu-issue](https://github.com/codemonkeynorth/react-pixi-addressmodeu-issue) — crash when destroying a texture still bound to a sprite.

## Run

```bash
npm install
npm run dev
```

## Test methods

| Method | Purpose |
|--------|---------|
| **Release after rebind** | Heap comparison; expect ~0.5 KB destroyed shells if Pixi leaks |
| **Release + batch sweep** | Control; `# Delta` should flatten if retention is in `_batchersByInstructionSet` |

## Docs

[docs/issue.md](docs/issue.md)

## Stack

pixi.js ^8.18, @pixi/react ^8.0.5, React 19, Vite 6, image-js ^1.6
