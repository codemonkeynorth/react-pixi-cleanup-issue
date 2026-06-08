/** Issue 1 — batch-pool shell retention after correct destroy. */
export type BatchPoolTestMode = "releaseAfterRebind" | "releaseWithBatchSweep"

export const BATCH_POOL_TEST_MODES: { value: BatchPoolTestMode; label: string }[] = [
  { value: "releaseAfterRebind", label: "Release after rebind (expect ~0.5 KB shells if Pixi leaks)" },
  { value: "releaseWithBatchSweep", label: "Release + batch sweep (control)" },
]

export function runsBatchSweepOnRelease(mode: BatchPoolTestMode): boolean {
  return mode === "releaseWithBatchSweep"
}
