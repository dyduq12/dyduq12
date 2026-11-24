/**
 * CANON entry point (Phase 3): wires core store, event bus, search, editorial UI shell,
 * gallery, full form, sliders, and accessible toast notifications.
 */

import { createApiCache } from './api/cache.js';
import { createSearchService } from './api/search.js';
import { createDatabase } from './core/db.js';
import { createEventBus } from './core/events.js';
import { createStore } from './core/store.js';
import { mountPosterStudio } from './export/studio.js';
import { mountMascotDock } from './mascots/dock.js';
import { mountAppShell } from './ui/app-shell.js';
import { requestPersistentStorageOnce } from './ui/backup.js';
import { formatUserError, presentErrorToast } from './ui/errors.js';
import { createWorkFormPanel } from './ui/form.js';
import { createGallery } from './ui/gallery.js';
import { installGlobalErrorHandlers } from './ui/global-errors.js';
import { createToaster } from './ui/toast.js';

async function bootstrap() {
  const bus = createEventBus();
  const db = createDatabase();
  const cache = createApiCache(db);
  const store = createStore({ db, bus });
  const searchService = createSearchService({ db, cache });

  const toast = createToaster(document.getElementById('toast-region'));
  installGlobalErrorHandlers({ toast });

  const galleryEl = document.getElementById('gallery-panel');
  const formEl = document.getElementById('form-panel');
  const studioRootEl = document.getElementById('studio-root');

  let formPanel = null;
  let studio = null;

  const gallery = galleryEl
    ? createGallery(galleryEl, {
        db,
        bus,
        onEdit: (work) => {
          formPanel?.editWork(work);
        },
        onExportPoster: (work, triggerEl) => {
          studio?.open(work, triggerEl);
        },
        onRemove: async (work) => {
          try {
            await store.remove(work.id);
            if (formPanel?.getEditingId() === work.id) {
              formPanel.reset();
            }
            toast.info(`Obra "${work.title}" removida.`);
          } catch (err) {
            presentErrorToast(toast, err, { context: 'Remover obra' });
          }
        }
      })
    : null;

  if (formEl) {
    formPanel = createWorkFormPanel(formEl, {
      db,
      store,
      searchService,
      bus,
      toast
    });
  }

  const shell = await mountAppShell({
    db,
    store,
    bus,
    toast,
    onImported: () => formPanel?.reset()
  });

  if (studioRootEl) {
    studio = mountPosterStudio(studioRootEl, {
      db,
      getTheme: () => shell.getTheme(),
      toast
    });
  }

  const mascotDockEl = document.querySelector('[data-mascot-dock]');
  mountMascotDock(mascotDockEl, { bus, toast });

  store.on('change', (snapshot) => {
    gallery?.render(snapshot.works)?.catch((err) => {
      presentErrorToast(toast, err, { context: 'Galeria' });
    });
    shell.renderBackupInfo(snapshot.lastBackupAt, snapshot);
  });

  bus.on('work:saved', async () => {
    try {
      const persistResult = await requestPersistentStorageOnce({ db });
      if (persistResult?.note) {
        shell.renderPersistenceInfo(persistResult.note);
      }
    } catch (err) {
      console.warn('[main] Falha ao verificar armazenamento persistente:', { message: err?.message });
    }
  });

  try {
    const snapshot = await store.init();
    if (snapshot.isMemoryFallback) {
      const memInfo = formatUserError(null, { isMemoryFallback: true });
      if (memInfo.message) {
        toast.warning(memInfo.message);
      }
    } else if (snapshot.warnings.length > 0) {
      toast.warning(snapshot.warnings.join(' | '));
    }
  } catch (err) {
    presentErrorToast(toast, err, { context: 'Inicialização' });
  }

  Object.defineProperty(window, 'CANON_DEBUG', {
    value: Object.freeze({
      version: 3,
      getSnapshot: () => store.getSnapshot(),
      getTheme: () => shell.getTheme()
    }),
    writable: false,
    configurable: false
  });
}

bootstrap();
