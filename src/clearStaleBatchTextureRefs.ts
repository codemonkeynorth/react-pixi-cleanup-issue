import type { Renderer } from "pixi.js"

type BatchTextureArrayLike = { clear?: () => void }

type BatchLike = { textures?: BatchTextureArrayLike }

type BatcherLike = {
  batches?: BatchLike[]
  destroy?: (options?: { shader?: boolean }) => void
}

type BatcherPipeLike = {
  _batchersByInstructionSet?: Record<string, Record<string, BatcherLike>>
  batchersByInstructionSet?: Record<string, Record<string, BatcherLike>>
  _activeBatches?: Record<string, BatcherLike> | null
  activeBatches?: Record<string, BatcherLike> | null
  _activeBatch?: BatcherLike
  activeBatch?: BatcherLike
}

const clearBatchTextureSlots = (batch: BatchLike | undefined | null): void => {
  if (!batch?.textures?.clear) return
  try {
    batch.textures.clear()
  } catch {
    // Pixi internal — optional sweep
  }
}

const clearBatcherBatchTextureSlots = (batcher: BatcherLike | undefined | null): void => {
  const batches = batcher?.batches
  if (!batches?.length) return
  for (const batch of batches) {
    clearBatchTextureSlots(batch)
  }
}

const forEachRecordValue = <T>(
  record: Record<string, T> | undefined,
  visit: (value: T) => void,
): void => {
  if (!record) return
  for (const key of Object.keys(record)) {
    visit(record[key])
  }
}

const destroyBatcher = (batcher: BatcherLike | undefined | null): void => {
  if (!batcher) return
  clearBatcherBatchTextureSlots(batcher)
  try {
    batcher.destroy?.()
  } catch {
    // Pixi internal
  }
}

/**
 * Minimal port of production batch sweep — clears BatchTextureArray slots and destroys
 * cached batchers in _batchersByInstructionSet. Control toggle: heap shells should stop
 * growing when this runs after releaseTexture.
 */
export const clearStaleBatchTextureRefs = (renderer: Renderer | undefined | null): void => {
  if (!renderer) return

  try {
    const pipe = (renderer as Renderer & { renderPipes?: { batch?: unknown } }).renderPipes
      ?.batch as unknown as BatcherPipeLike | undefined
    if (!pipe) return

    clearBatcherBatchTextureSlots(pipe._activeBatch ?? pipe.activeBatch)

    forEachRecordValue(pipe._activeBatches ?? pipe.activeBatches ?? undefined, (batcher) => {
      clearBatcherBatchTextureSlots(batcher)
    })

    const byInstructionSet = pipe._batchersByInstructionSet ?? pipe.batchersByInstructionSet
    forEachRecordValue(byInstructionSet, (instructionBatchers) => {
      forEachRecordValue(instructionBatchers, (batcher) => {
        clearBatcherBatchTextureSlots(batcher)
      })
    })

    // Prune all cached instruction-set batchers (minimal repro — no live uid walk).
    forEachRecordValue(byInstructionSet, (instructionBatchers) => {
      forEachRecordValue(instructionBatchers, (batcher) => {
        destroyBatcher(batcher)
      })
      for (const key of Object.keys(instructionBatchers)) {
        delete instructionBatchers[key]
      }
    })
    if (byInstructionSet) {
      for (const key of Object.keys(byInstructionSet)) {
        delete byInstructionSet[key]
      }
    }
  } catch {
    // Unsupported internal shape
  }
}
