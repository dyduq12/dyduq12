/**
 * Backup reminder evaluator (pure logic with named threshold constant) and
 * progressive one-time `navigator.storage.persist()` helper triggered after first user save.
 */

import { STORES } from '../core/db.js';

export const BACKUP_REMINDER_DAYS = 7;
export const BACKUP_REMINDER_MS = BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000;
export const PERSIST_META_KEY = 'storagePersistPrompted';
export const DISMISS_META_KEY = 'backupReminderDismissedAt';

function parseIsoMs(iso) {
  if (typeof iso !== 'string' || !iso.trim()) {
    return null;
  }
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pure evaluator determining whether the discrete backup reminder banner should appear.
 * Reminds when:
 * - Local works exist and user has never exported `canon.json` (`!lastBackupAt`), OR
 * - Local works have unexported modifications AND `lastBackupAt` is older than `BACKUP_REMINDER_DAYS` (> 7 days).
 * Dismissing suppresses the banner for the current 7-day cycle unless new local edits happen afterward in memory fallback.
 *
 * @param {{
 *   works?: Array<Record<string, any>>,
 *   lastBackupAt?: string | null,
 *   dismissedAt?: string | null,
 *   nowMs?: number,
 *   isMemoryFallback?: boolean
 * }} state
 */
export function evaluateBackupReminder(state = {}) {
  const works = Array.isArray(state.works) ? state.works : [];
  const localWorks = works.filter((w) => w && w.source === 'local');
  const hasLocalWorks = localWorks.length > 0;
  const nowMs = Number.isFinite(state.nowMs) ? state.nowMs : Date.now();
  const lastBackupMs = parseIsoMs(state.lastBackupAt);
  const dismissedMs = parseIsoMs(state.dismissedAt);

  const daysSinceBackup =
    lastBackupMs !== null && nowMs >= lastBackupMs
      ? Math.floor((nowMs - lastBackupMs) / (24 * 60 * 60 * 1000))
      : null;

  if (!hasLocalWorks) {
    return {
      shouldRemind: false,
      reason: 'no_local_works',
      hasLocalWorks: false,
      hasUnexportedChanges: false,
      daysSinceBackup,
      message: null
    };
  }

  let latestLocalChangeMs = 0;
  for (const w of localWorks) {
    const updatedMs = parseIsoMs(w.updatedAt) ?? parseIsoMs(w.createdAt) ?? 0;
    if (updatedMs > latestLocalChangeMs) {
      latestLocalChangeMs = updatedMs;
    }
  }

  const hasUnexportedChanges = lastBackupMs === null || latestLocalChangeMs > lastBackupMs;

  if (state.isMemoryFallback) {
    return {
      shouldRemind: true,
      reason: 'memory_fallback',
      hasLocalWorks: true,
      hasUnexportedChanges: true,
      daysSinceBackup,
      message: 'Armazenamento temporário em memória ativo: os dados serão perdidos ao fechar; exporte o canon.json.'
    };
  }

  if (dismissedMs !== null && nowMs - dismissedMs < BACKUP_REMINDER_MS) {
    return {
      shouldRemind: false,
      reason: 'dismissed',
      hasLocalWorks: true,
      hasUnexportedChanges,
      daysSinceBackup,
      message: null
    };
  }

  if (lastBackupMs === null) {
    return {
      shouldRemind: true,
      reason: 'never_backed_up',
      hasLocalWorks: true,
      hasUnexportedChanges: true,
      daysSinceBackup: null,
      message: `Você tem ${localWorks.length} obra(s) salva(s) localmente e ainda não exportou seu backup canon.json.`
    };
  }

  if (hasUnexportedChanges && nowMs - lastBackupMs > BACKUP_REMINDER_MS) {
    return {
      shouldRemind: true,
      reason: 'stale_with_changes',
      hasLocalWorks: true,
      hasUnexportedChanges: true,
      daysSinceBackup,
      message: `Último backup há ${daysSinceBackup} dia(s) com alterações locais ainda não exportadas. Exporte o canon.json.`
    };
  }

  return {
    shouldRemind: false,
    reason: hasUnexportedChanges ? 'within_window' : 'up_to_date',
    hasLocalWorks: true,
    hasUnexportedChanges,
    daysSinceBackup,
    message: null
  };
}

/**
 * Progressively asks the browser for persistent storage via `navigator.storage.persist()` at most once.
 * Must be invoked only after a real user save gesture; never throws if API is absent or denied.
 *
 * @param {{
 *   db: ReturnType<typeof import('../core/db.js').createDatabase>,
 *   navigatorObj?: Navigator,
 *   nowIso?: () => string
 * }} deps
 */
export async function requestPersistentStorageOnce(deps) {
  const db = deps?.db;
  const navigatorObj = deps?.navigatorObj ?? globalThis.navigator;
  const nowIso = deps?.nowIso || (() => new Date().toISOString());

  if (!navigatorObj?.storage || typeof navigatorObj.storage.persist !== 'function') {
    return {
      supported: false,
      persisted: false,
      alreadyPrompted: false,
      note: 'Armazenamento persistente automático indisponível neste navegador; faça backups periódicos via canon.json.'
    };
  }

  if (db) {
    try {
      const prior = await db.get(STORES.META, PERSIST_META_KEY);
      if (prior?.value?.prompted === true) {
        return {
          supported: true,
          persisted: Boolean(prior.value.persisted),
          alreadyPrompted: true,
          note: null
        };
      }
    } catch (err) {
      console.warn('[backup.persist] Falha ao ler flag de persistência:', { message: err?.message });
    }
  }

  let persisted = false;
  try {
    if (typeof navigatorObj.storage.persisted === 'function') {
      persisted = Boolean(await navigatorObj.storage.persisted());
    }
    if (!persisted) {
      persisted = Boolean(await navigatorObj.storage.persist());
    }
  } catch (err) {
    console.warn('[backup.persist] navigator.storage.persist() falhou:', { message: err?.message });
    persisted = false;
  }

  if (db) {
    try {
      await db.put(STORES.META, {
        key: PERSIST_META_KEY,
        value: {
          prompted: true,
          persisted,
          checkedAt: nowIso()
        }
      });
    } catch (err) {
      console.warn('[backup.persist] Falha ao gravar meta de persistência:', { message: err?.message });
    }
  }

  return {
    supported: true,
    persisted,
    alreadyPrompted: false,
    note: persisted
      ? 'Armazenamento local marcado como persistente pelo navegador.'
      : 'Armazenamento persistente não garantido pelo navegador; mantenha backups via canon.json.'
  };
}
