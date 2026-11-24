import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STORES } from '../js/core/db.js';
import {
  BACKUP_REMINDER_DAYS,
  BACKUP_REMINDER_MS,
  PERSIST_META_KEY,
  evaluateBackupReminder,
  requestPersistentStorageOnce
} from '../js/ui/backup.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('backup.js — lembrete > 7 dias e navigator.storage.persist() progressivo', () => {
  it('define o prazo em constante nomeada (7 dias) e avalia todos os cenários com relógio injetado', () => {
    assert.equal(BACKUP_REMINDER_DAYS, 7);
    assert.equal(BACKUP_REMINDER_MS, 7 * DAY_MS);

    const nowMs = Date.parse('2026-11-24T12:00:00.000Z');
    const localWorkOld = { id: 'manual:1', source: 'local', updatedAt: '2026-11-10T12:00:00.000Z' };
    const localWorkRecent = { id: 'manual:2', source: 'local', updatedAt: '2026-11-22T12:00:00.000Z' };
    const publicWork = { id: 'rawg:1', source: 'public', updatedAt: '2026-01-01T00:00:00.000Z' };

    // 1. Apenas catálogo público -> sem lembrete
    assert.equal(
      evaluateBackupReminder({ works: [publicWork], lastBackupAt: null, nowMs }).shouldRemind,
      false
    );

    // 2. Nunca exportou com obras locais -> lembra
    const neverRes = evaluateBackupReminder({ works: [publicWork, localWorkOld], lastBackupAt: null, nowMs });
    assert.equal(neverRes.shouldRemind, true);
    assert.equal(neverRes.reason, 'never_backed_up');

    // 3. Exportou há 3 dias -> não lembra
    const backup3d = new Date(nowMs - 3 * DAY_MS).toISOString();
    const recentRes = evaluateBackupReminder({ works: [localWorkRecent], lastBackupAt: backup3d, nowMs });
    assert.equal(recentRes.shouldRemind, false);
    assert.equal(recentRes.daysSinceBackup, 3);

    // 4. Exportou há 8 dias COM alterações posteriores -> lembra
    const backup8d = new Date(nowMs - 8 * DAY_MS).toISOString();
    const staleWithChanges = evaluateBackupReminder({
      works: [localWorkRecent],
      lastBackupAt: backup8d,
      nowMs
    });
    assert.equal(staleWithChanges.shouldRemind, true);
    assert.equal(staleWithChanges.reason, 'stale_with_changes');
    assert.equal(staleWithChanges.daysSinceBackup, 8);

    // 5. Exportou há 8 dias SEM alterações posteriores -> não lembra
    const staleNoChanges = evaluateBackupReminder({
      works: [localWorkOld],
      lastBackupAt: backup8d,
      nowMs
    });
    assert.equal(staleNoChanges.shouldRemind, false);
    assert.equal(staleNoChanges.reason, 'up_to_date');

    // 6. Dispensado dentro da janela -> suprime
    const dismissed = evaluateBackupReminder({
      works: [localWorkRecent],
      lastBackupAt: backup8d,
      dismissedAt: new Date(nowMs - 1 * DAY_MS).toISOString(),
      nowMs
    });
    assert.equal(dismissed.shouldRemind, false);
    assert.equal(dismissed.reason, 'dismissed');
  });

  it('requestPersistentStorageOnce lida sem erro quando storage.persist é ausente e executa apenas uma vez', async () => {
    const missingOut = await requestPersistentStorageOnce({ db: null, navigatorObj: {} });
    assert.equal(missingOut.supported, false);
    assert.equal(missingOut.persisted, false);

    const store = new Map();
    const fakeDb = {
      async get(_s, k) {
        return store.get(k);
      },
      async put(_s, v) {
        store.set(v.key, v);
      }
    };

    let persistCalls = 0;
    const fakeNav = {
      storage: {
        persisted: async () => false,
        persist: async () => {
          persistCalls += 1;
          return true;
        }
      }
    };

    const first = await requestPersistentStorageOnce({ db: fakeDb, navigatorObj: fakeNav });
    assert.equal(first.supported, true);
    assert.equal(first.persisted, true);
    assert.equal(first.alreadyPrompted, false);
    assert.equal(persistCalls, 1);
    assert.equal(store.get(PERSIST_META_KEY)?.value?.prompted, true);

    const second = await requestPersistentStorageOnce({ db: fakeDb, navigatorObj: fakeNav });
    assert.equal(second.alreadyPrompted, true);
    assert.equal(persistCalls, 1);
  });
});
