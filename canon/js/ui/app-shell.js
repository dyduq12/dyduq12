/**
 * Application shell managing theme persistence (IndexedDB meta.theme + prefers-color-scheme),
 * import/export controls, backup reminder, reserved mascot dock, and footer attributions.
 */

import { STORES } from '../core/db.js';
import { DISMISS_META_KEY, evaluateBackupReminder } from './backup.js';
import { formatUserError, presentErrorToast } from './errors.js';
import { mountSettingsPanel } from './settings.js';

const THEME_META_KEY = 'theme';
const VALID_THEMES = new Set(['paper', 'slate']);

function detectDefaultTheme() {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'slate';
  }
  return 'paper';
}

function applyThemeToRoot(theme) {
  const safeTheme = VALID_THEMES.has(theme) ? theme : 'paper';
  document.documentElement.dataset.theme = safeTheme;
  return safeTheme;
}

/**
 * Mounts and wires the CANON editorial shell.
 * @param {{
 *   db: ReturnType<typeof import('../core/db.js').createDatabase>,
 *   store: ReturnType<typeof import('../core/store.js').createStore>,
 *   toast: ReturnType<typeof import('./toast.js').createToaster>,
 *   onImported?: () => void
 * }} deps
 */
export async function mountAppShell(deps) {
  const themeBtn = document.getElementById('theme-toggle-btn');
  const backupInfo = document.getElementById('backup-info');
  const persistInfo = document.getElementById('persist-info');
  const backupReminderEl = document.getElementById('backup-reminder');
  const exportBtn = document.getElementById('export-btn');
  const importInput = document.getElementById('import-input');
  const settingsPanel = document.getElementById('settings-panel');

  let dismissedAt = null;
  try {
    const savedDismiss = await deps.db.get(STORES.META, DISMISS_META_KEY);
    if (typeof savedDismiss?.value === 'string') {
      dismissedAt = savedDismiss.value;
    }
  } catch (err) {
    console.warn('[app-shell] Falha ao ler dispensa do lembrete:', { message: err?.message });
  }

  let currentTheme = detectDefaultTheme();
  try {
    const savedTheme = await deps.db.get(STORES.META, THEME_META_KEY);
    if (VALID_THEMES.has(savedTheme?.value)) {
      currentTheme = savedTheme.value;
    }
  } catch (err) {
    console.warn('[app-shell] Falha ao ler tema salvo:', { message: err?.message });
  }

  function syncThemeButton(theme) {
    if (!themeBtn) {
      return;
    }
    const isSlate = theme === 'slate';
    themeBtn.textContent = isSlate ? 'Tema: Ardósia Noturna' : 'Tema: Papel Fosco';
    themeBtn.setAttribute('aria-pressed', String(isSlate));
  }

  currentTheme = applyThemeToRoot(currentTheme);
  syncThemeButton(currentTheme);

  themeBtn?.addEventListener('click', async () => {
    currentTheme = applyThemeToRoot(currentTheme === 'paper' ? 'slate' : 'paper');
    syncThemeButton(currentTheme);
    deps.bus?.emit('theme:change', { theme: currentTheme });
    try {
      await deps.db.put(STORES.META, {
        key: THEME_META_KEY,
        value: currentTheme,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      const formatted = formatUserError(err, { context: 'Tema aplicado apenas nesta sessão' });
      deps.toast.warning(formatted.message || 'Tema aplicado apenas nesta sessão.');
    }
  });

  function renderPersistenceInfo(note) {
    if (!persistInfo) {
      return;
    }
    if (!note) {
      persistInfo.hidden = true;
      persistInfo.textContent = '';
      return;
    }
    persistInfo.textContent = note;
    persistInfo.hidden = false;
  }

  function renderBackupReminder(snapshot) {
    if (!backupReminderEl) {
      return;
    }
    const evaluation = evaluateBackupReminder({
      works: snapshot?.works,
      lastBackupAt: snapshot?.lastBackupAt ?? null,
      dismissedAt,
      isMemoryFallback: Boolean(snapshot?.isMemoryFallback)
    });

    if (!evaluation.shouldRemind || !evaluation.message) {
      backupReminderEl.hidden = true;
      backupReminderEl.replaceChildren();
      return;
    }

    backupReminderEl.replaceChildren();
    const text = document.createElement('span');
    text.textContent = evaluation.message;

    const actions = document.createElement('div');
    actions.className = 'canon-backup-reminder-actions';

    const quickExportBtn = document.createElement('button');
    quickExportBtn.type = 'button';
    quickExportBtn.textContent = 'Fazer backup agora';
    quickExportBtn.addEventListener('click', () => exportBtn?.click());

    actions.appendChild(quickExportBtn);

    if (!snapshot?.isMemoryFallback) {
      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.textContent = 'Dispensar';
      dismissBtn.setAttribute('aria-label', 'Dispensar lembrete de backup por 7 dias');
      dismissBtn.addEventListener('click', async () => {
        dismissedAt = new Date().toISOString();
        backupReminderEl.hidden = true;
        try {
          await deps.db.put(STORES.META, { key: DISMISS_META_KEY, value: dismissedAt });
        } catch (err) {
          console.warn('[app-shell] Falha ao salvar dispensa do lembrete:', { message: err?.message });
        }
      });
      actions.appendChild(dismissBtn);
    }

    backupReminderEl.append(text, actions);
    backupReminderEl.hidden = false;
  }

  function renderBackupInfo(lastBackupAt, snapshot = null) {
    if (backupInfo) {
      backupInfo.textContent = lastBackupAt
        ? `Último backup: ${new Date(lastBackupAt).toLocaleString('pt-BR')}`
        : 'Último backup: ainda não exportado';
    }
    if (snapshot) {
      renderBackupReminder(snapshot);
    }
  }

  exportBtn?.addEventListener('click', async () => {
    try {
      const payload = await deps.store.exportCanonJson();
      const jsonText = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);

      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'canon.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }

      dismissedAt = null;
      deps.toast.success(`Exportado canon.json com ${payload.works.length} obra(s).`);
    } catch (err) {
      presentErrorToast(deps.toast, err, { context: 'Exportar canon.json' });
    }
  });

  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const result = await deps.store.importCanonJson(rawText);
      if (!result.ok) {
        const summary = result.errors
          .slice(0, 4)
          .map((e) => `${e.field}: ${e.message}`)
          .join('; ');
        deps.toast.error(`Importação recusada (${summary}).`);
        return;
      }
      deps.onImported?.();
      deps.toast.success(`Importação concluída: ${result.count} obra(s) carregada(s).`);
    } catch (err) {
      presentErrorToast(deps.toast, err, { context: 'Importar canon.json' });
    } finally {
      importInput.value = '';
    }
  });

  if (settingsPanel) {
    await mountSettingsPanel(settingsPanel, {
      db: deps.db,
      onStatus: (msg, isError) => {
        if (isError) {
          deps.toast.error(msg);
        } else {
          deps.toast.success(msg);
        }
      }
    });
  }

  return {
    renderBackupInfo,
    renderPersistenceInfo,
    getTheme: () => currentTheme
  };
}
