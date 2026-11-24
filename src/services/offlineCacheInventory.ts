import { BASE_MATHEMATICS_FORMULAS, BASE_PHYSICS_FORMULAS } from '../data/formulas';
import { DEPARTMENTS } from '../data/curriculum';
import { offlineDb } from './offlineDb';
import { storageService } from './storageService';
import type { BootstrapResponse } from './apiClient';

export interface OfflineCachedResourcesSnapshot {
  checkedAt: string;
  cachedPdfCount: number;
  cachedPdfBytes: number;
  savedNotesCount: number;
  routineTasksCount: number;
  alarmsCount: number;
  timerSessionsCount: number;
  totalFormulasCount: number;
  departmentsCount: number;
  cachedNoticesCount: number;
  cachedMcqsCount: number;
  swCacheAvailable: boolean;
  swCachedAssetsCount: number;
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Inspects actual locally cached resources (IndexedDB PDFs & bootstrap snapshot,
 * localStorage study state, bundled curriculum/formulas, and Cache Storage API).
 */
export async function inspectCachedOfflineResources(): Promise<OfflineCachedResourcesSnapshot> {
  const localState = storageService.loadState();

  const [offlinePdfs, cachedBootstrap, swCacheStats] = await Promise.all([
    offlineDb.listOfflinePdfs().catch(() => []),
    offlineDb.getCachedValue<BootstrapResponse>('bootstrap_snapshot_v2').catch(() => null),
    (async () => {
      try {
        if (typeof window === 'undefined' || !('caches' in window)) {
          return { available: false, count: 0 };
        }
        const cacheNames = await window.caches.keys();
        if (cacheNames.length === 0) {
          return { available: false, count: 0 };
        }
        let totalEntries = 0;
        for (const name of cacheNames) {
          const cache = await window.caches.open(name);
          const keys = await cache.keys();
          totalEntries += keys.length;
        }
        return { available: totalEntries > 0, count: totalEntries };
      } catch {
        return { available: false, count: 0 };
      }
    })(),
  ]);

  const cachedPdfBytes = offlinePdfs.reduce(
    (sum, item) => sum + (Number(item.sizeBytes) || 0),
    0
  );

  const baseFormulasCount = BASE_PHYSICS_FORMULAS.length + BASE_MATHEMATICS_FORMULAS.length;
  const customFormulasCount = Array.isArray(cachedBootstrap?.customFormulas)
    ? cachedBootstrap.customFormulas.length
    : 0;
  const deletedIdsCount = Array.isArray(cachedBootstrap?.deletedFormulaIds)
    ? cachedBootstrap.deletedFormulaIds.length
    : 0;

  return {
    checkedAt: new Date().toISOString(),
    cachedPdfCount: offlinePdfs.length,
    cachedPdfBytes,
    savedNotesCount: localState.notes.length,
    routineTasksCount: localState.tasks.length,
    alarmsCount: (localState.timeSettings.alarms || []).length,
    timerSessionsCount: localState.timerHistory.length,
    totalFormulasCount: Math.max(0, baseFormulasCount + customFormulasCount - deletedIdsCount),
    departmentsCount: DEPARTMENTS.length,
    cachedNoticesCount: Array.isArray(cachedBootstrap?.notices)
      ? cachedBootstrap.notices.length
      : 0,
    cachedMcqsCount: Array.isArray(cachedBootstrap?.mcqs) ? cachedBootstrap.mcqs.length : 0,
    swCacheAvailable: swCacheStats.available,
    swCachedAssetsCount: swCacheStats.count,
  };
}
