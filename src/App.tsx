import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Application } from "@pixi/react"
import { Texture } from "pixi.js"

import {
  estimateTextureBytes,
  loadImageTexture,
  releaseTexture,
  scheduleReleaseTexture,
  type TextureCleanupMode,
} from "./loadImageTexture"

import "./pixiSetup"

const IMAGE_URLS = [
  "/images/sample-1.png",
  "/images/sample-2.png",
  "/images/sample-3.png",
] as const

const CLEANUP_MODES: { value: TextureCleanupMode; label: string }[] = [
  { value: "none", label: "No cleanup (memory leak repro)" },
  { value: "immediate", label: "Immediate cleanup (addressModeU bug repro)" },
  { value: "deferred", label: "Deferred cleanup (app workaround)" },
]

type CalloutTone = "issue" | "ok"

const codeStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.8125rem",
}

const Code = ({ children }: { children: ReactNode }) => (
  <code style={codeStyle}>{children}</code>
)

type Callout = { tone: CalloutTone; title: string; body: ReactNode }

const CLEANUP_CALLOUTS: Record<TextureCleanupMode, Callout> = {
  none: {
    tone: "issue",
    title: "Issue 1 — memory retention",
    body: (
      <>
        Old textures are never destroyed. Click Next repeatedly and watch tracked RGBA and JS heap
        climb in DevTools — retained <Code>BufferImageSource</Code>, <Code>Texture</Code>, and
        batch-pool buffers should grow until Pixi reclaims them without app-side sweeps.
      </>
    ),
  },
  immediate: {
    tone: "issue",
    title: "Issue 2 — addressModeU crash",
    body: (
      <>
        Destroys the previous texture before the sprite rebinds. With an image already loaded, click
        Next once — expect <Code>applyStyleParams: addressModeU</Code> until Pixi handles destroyed
        bound textures gracefully (skip draw or safe fallback, not throw).
      </>
    ),
  },
  deferred: {
    tone: "ok",
    title: "Workaround — issues resolved in-app",
    body: (
      <>
        Releases the previous texture after a few frames once the sprite has rebound:{" "}
        <Code>source.unload()</Code> → zero typed-array resource → <Code>texture.destroy(true)</Code>.
        Repeated Next clicks should not crash and tracked memory should stay flat. This is what the
        production scanner does until Pixi fixes retention and immediate-destroy safety.
      </>
    ),
  },
}

type MemorySnapshot = {
  heapUsedMB: number | null
  trackedTextures: number
  trackedBytesMB: number
}

function readHeapUsedMB(): number | null {
  const memory = performance.memory
  if (!memory) return null
  return memory.usedJSHeapSize / 1024 / 1024
}

function dropFromTracked(created: Texture[], texture: Texture): Texture[] {
  return created.filter((t) => t !== texture)
}

export default function App() {
  const [imageIndex, setImageIndex] = useState(0)
  const [texture, setTexture] = useState<Texture | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cleanupMode, setCleanupMode] = useState<TextureCleanupMode>("none")
  const [navCount, setNavCount] = useState(0)
  const [memory, setMemory] = useState<MemorySnapshot>({
    heapUsedMB: readHeapUsedMB(),
    trackedTextures: 0,
    trackedBytesMB: 0,
  })

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const textureRef = useRef<Texture | null>(null)
  const createdTexturesRef = useRef<Texture[]>([])
  const cleanupModeRef = useRef(cleanupMode)
  cleanupModeRef.current = cleanupMode

  const currentUrl = IMAGE_URLS[imageIndex % IMAGE_URLS.length]

  const releasePreviousTexture = (previous: Texture, mode: TextureCleanupMode) => {
    if (mode === "none") return

    createdTexturesRef.current = dropFromTracked(createdTexturesRef.current, previous)

    if (mode === "immediate") {
      releaseTexture(previous)
      return
    }

    scheduleReleaseTexture(previous)
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const nextTexture = await loadImageTexture(currentUrl)
        if (cancelled) {
          releaseTexture(nextTexture)
          return
        }

        const previous = textureRef.current
        const mode = cleanupModeRef.current

        if (previous && mode === "immediate") {
          releasePreviousTexture(previous, "immediate")
        }

        textureRef.current = nextTexture
        createdTexturesRef.current.push(nextTexture)
        setTexture(nextTexture)

        if (previous && mode === "deferred") {
          releasePreviousTexture(previous, "deferred")
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [currentUrl])

  useEffect(() => {
    const id = window.setInterval(() => {
      const live = createdTexturesRef.current.filter((t) => !t.destroyed)
      createdTexturesRef.current = live
      const trackedBytes = live.reduce((sum, t) => sum + estimateTextureBytes(t), 0)
      setMemory({
        heapUsedMB: readHeapUsedMB(),
        trackedTextures: live.length,
        trackedBytesMB: trackedBytes / 1024 / 1024,
      })
    }, 500)

    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    return () => {
      const pending = [...createdTexturesRef.current]
      createdTexturesRef.current = []
      textureRef.current = null
      for (const t of pending) {
        scheduleReleaseTexture(t)
      }
    }
  }, [])

  const onNext = () => {
    setImageIndex((i) => (i + 1) % IMAGE_URLS.length)
    setNavCount((c) => c + 1)
  }

  const cleanupCallout = CLEANUP_CALLOUTS[cleanupMode]
  const calloutStyle = cleanupCallout.tone === "ok" ? styles.calloutOk : styles.calloutIssue

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Pixi texture lifecycle repro</h1>
        <p style={styles.subtitle}>
          image-js decode → BufferImageSource → Texture → @pixi/react sprite. Two issues: retained
          memory on texture swap, and crash when destroying a texture the sprite still references.
        </p>
      </header>

      <div style={styles.controls}>
        <button type="button" onClick={onNext} disabled={loading}>
          Next image
        </button>
      </div>

      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>Texture cleanup on Next</legend>
        {CLEANUP_MODES.map(({ value, label }) => (
          <label key={value} style={styles.radio}>
            <input
              type="radio"
              name="cleanupMode"
              value={value}
              checked={cleanupMode === value}
              onChange={() => setCleanupMode(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div style={calloutStyle}>
        <strong>{cleanupCallout.title}</strong>
        <p style={styles.calloutBody}>{cleanupCallout.body}</p>
      </div>

      <div style={styles.stats}>
        <span>Image: {currentUrl}</span>
        <span>Navigations: {navCount}</span>
        <span>Cleanup: {cleanupMode}</span>
        <span>Loading: {loading ? "yes" : "no"}</span>
        <span>Tracked textures: {memory.trackedTextures}</span>
        <span>Tracked RGBA: {memory.trackedBytesMB.toFixed(2)} MB</span>
        <span>
          JS heap: {memory.heapUsedMB == null ? "n/a (Chrome only)" : `${memory.heapUsedMB.toFixed(1)} MB`}
        </span>
      </div>

      {error ? <p style={styles.error}>{error}</p> : null}

      <div ref={viewportRef} style={styles.viewport}>
        <Application background="#111" resizeTo={viewportRef} antialias={false}>
          <pixiSprite texture={texture ?? Texture.EMPTY} x={0} y={0} />
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
  subtitle: { margin: 0, opacity: 0.75, maxWidth: "52rem" },
  controls: { display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.5rem" },
  fieldset: {
    border: "1px solid #333",
    borderRadius: "4px",
    margin: "0 0 0.75rem",
    padding: "0.5rem 0.75rem",
    maxWidth: "36rem",
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
  error: { color: "#f87171" },
  viewport: {
    width: "100%",
    height: "min(70vh, 720px)",
    border: "1px solid #333",
    borderRadius: "4px",
    overflow: "hidden",
  },
}
