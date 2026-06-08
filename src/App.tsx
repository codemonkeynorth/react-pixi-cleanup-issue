import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { Application } from "@pixi/react"
import { Texture, type Renderer } from "pixi.js"

import {
  BATCH_POOL_TEST_MODES,
  runsBatchSweepOnRelease,
  type BatchPoolTestMode,
} from "./batchPoolTestMode"
import { clearStaleBatchTextureRefs } from "./clearStaleBatchTextureRefs"
import {
  LEAK_SCENE_SPRITE_COUNT,
  LEAK_SCENE_STAGE_COUNT,
} from "./leakSceneConfig"
import {
  loadSceneTextures,
  releaseTextures,
  scheduleReleaseTexture,
} from "./loadImageTexture"
import { PixiLeakScene } from "./PixiLeakScene"
import { schedulePixiTextureGc } from "./runPixiTextureGc"

import "./pixiSetup"

const IMAGE_URLS = [
  "/images/sample-1.png",
  "/images/sample-2.png",
  "/images/sample-3.png",
] as const

const codeStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.8125rem",
}

const Code = ({ children }: { children: ReactNode }) => (
  <code style={codeStyle}>{children}</code>
)

const CALLOUTS: Record<
  BatchPoolTestMode,
  { tone: "issue" | "ok"; title: string; body: ReactNode }
> = {
  releaseAfterRebind: {
    tone: "issue",
    title: "Batch-pool shell retention",
    body: (
      <>
        {LEAK_SCENE_STAGE_COUNT} filtered stages, each with its own{" "}
        <Code>BufferImageSource</Code>. On Next: rebind sprites, then{" "}
        <Code>unload()</Code> → zero <Code>resource</Code> → <Code>destroy(true)</Code>. Stale heap
        instances should be ~0.5 KB with empty <Code>resource</Code> — not full image buffers.
      </>
    ),
  },
  releaseWithBatchSweep: {
    tone: "ok",
    title: "Control — batch sweep after release",
    body: (
      <>
        Same release path, plus <Code>batch.textures.clear()</Code> on{" "}
        <Code>_batchersByInstructionSet</Code>. <Code># Delta</Code> should flatten vs release-only
        if Pixi retains destroyed shells in the batch pipe.
      </>
    ),
  },
}

function readHeapUsedMB(): number | null {
  const memory = performance.memory
  if (!memory) return null
  return memory.usedJSHeapSize / 1024 / 1024
}

export default function App() {
  const [imageIndex, setImageIndex] = useState(0)
  const [sceneTextures, setSceneTextures] = useState<Texture[]>([])
  const [loading, setLoading] = useState(false)
  const [testMode, setTestMode] = useState<BatchPoolTestMode>("releaseAfterRebind")
  const [navCount, setNavCount] = useState(0)
  const [heldTextures, setHeldTextures] = useState(0)
  const [heapUsedMB, setHeapUsedMB] = useState<number | null>(readHeapUsedMB())

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const texturesRef = useRef<Texture[]>([])
  const pendingReleaseRef = useRef<Texture[]>([])
  const rendererRef = useRef<Renderer | null>(null)
  const testModeRef = useRef(testMode)
  testModeRef.current = testMode

  const currentUrl = IMAGE_URLS[imageIndex % IMAGE_URLS.length]

  const onRenderer = useCallback((renderer: Renderer) => {
    rendererRef.current = renderer
  }, [])

  const finishRelease = useCallback((previous: Texture[], mode: BatchPoolTestMode) => {
    releaseTextures(previous)
    if (runsBatchSweepOnRelease(mode)) {
      clearStaleBatchTextureRefs(rendererRef.current)
    }
    schedulePixiTextureGc(rendererRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      try {
        const previous = [...texturesRef.current]
        const nextTextures = await loadSceneTextures(currentUrl, LEAK_SCENE_SPRITE_COUNT)
        if (cancelled) {
          releaseTextures(nextTextures)
          return
        }

        texturesRef.current = nextTextures
        setSceneTextures(nextTextures)

        if (previous.length > 0) {
          pendingReleaseRef.current = previous
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [currentUrl])

  const onSceneReady = useCallback(() => {
    const pending = pendingReleaseRef.current
    if (pending.length > 0) {
      pendingReleaseRef.current = []
      finishRelease(pending, testModeRef.current)
    }
    setLoading(false)
  }, [finishRelease])

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeldTextures(
        texturesRef.current.filter((t) => t && !t.destroyed && t !== Texture.EMPTY).length,
      )
      setHeapUsedMB(readHeapUsedMB())
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    return () => {
      const pending = [...texturesRef.current]
      texturesRef.current = []
      for (const texture of pending) {
        scheduleReleaseTexture(texture)
      }
    }
  }, [])

  const callout = CALLOUTS[testMode]

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Pixi batch-pool shell retention</h1>
        <p style={styles.subtitle}>
          Dynamic <Code>BufferImageSource</Code> textures, correct destroy after sprite rebind.
          Compare <Code>BufferImageSource # Delta</Code> in Chrome heap snapshots.
        </p>
      </header>

      <div style={styles.controls}>
        <button
          type="button"
          onClick={() => {
            setImageIndex((i) => (i + 1) % IMAGE_URLS.length)
            setNavCount((c) => c + 1)
          }}
          disabled={loading}
        >
          Next image
        </button>
        <span style={styles.muted}>Navigations: {navCount}</span>
      </div>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Method</legend>
        {BATCH_POOL_TEST_MODES.map(({ value, label }) => (
          <label key={value} style={styles.radio}>
            <input
              type="radio"
              name="batchPoolTestMode"
              value={value}
              checked={testMode === value}
              onChange={() => setTestMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div style={callout.tone === "ok" ? styles.calloutOk : styles.calloutIssue}>
        <strong>{callout.title}</strong>
        <p style={styles.calloutBody}>{callout.body}</p>
      </div>

      <div style={styles.stats}>
        <span>Image: {currentUrl}</span>
        <span>App-held textures: {heldTextures}</span>
        <span>
          JS heap: {heapUsedMB == null ? "n/a (Chrome only)" : `${heapUsedMB.toFixed(1)} MB`}
        </span>
      </div>

      <div ref={viewportRef} style={styles.viewport}>
        <Application background="#111" resizeTo={viewportRef} antialias={false}>
          <PixiLeakScene
            textures={sceneTextures}
            onRenderer={onRenderer}
            onSceneReady={onSceneReady}
          />
        </Application>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: "system-ui, sans-serif",
    margin: 0,
    padding: "1rem",
    color: "#eee",
    background: "#0a0a0a",
    minHeight: "100vh",
    boxSizing: "border-box",
  },
  header: { marginBottom: "0.75rem" },
  title: { margin: "0 0 0.25rem", fontSize: "1.25rem" },
  subtitle: { margin: 0, opacity: 0.75, maxWidth: "52rem", lineHeight: 1.45 },
  controls: {
    display: "flex",
    gap: "1rem",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  muted: { fontSize: "0.875rem", opacity: 0.7 },
  fieldset: {
    border: "1px solid #333",
    borderRadius: "4px",
    margin: "0 0 0.75rem",
    padding: "0.5rem 0.75rem",
    maxWidth: "48rem",
  },
  legend: { padding: "0 0.25rem", fontSize: "0.875rem" },
  radio: {
    display: "flex",
    gap: "0.35rem",
    alignItems: "center",
    cursor: "pointer",
    fontSize: "0.875rem",
    marginBottom: "0.25rem",
  },
  calloutIssue: {
    margin: "0 0 0.75rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "4px",
    background: "#3b1f1f",
    border: "1px solid #7f1d1d",
    color: "#fecaca",
    fontSize: "0.875rem",
    maxWidth: "52rem",
  },
  calloutOk: {
    margin: "0 0 0.75rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "4px",
    background: "#14291a",
    border: "1px solid #166534",
    color: "#bbf7d0",
    fontSize: "0.875rem",
    maxWidth: "52rem",
  },
  calloutBody: { margin: "0.35rem 0 0", lineHeight: 1.45 },
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem",
    fontSize: "0.875rem",
    opacity: 0.9,
    marginBottom: "0.75rem",
  },
  viewport: {
    width: "100%",
    height: "min(70vh, 720px)",
    border: "1px solid #333",
    borderRadius: "4px",
    overflow: "hidden",
  },
}
