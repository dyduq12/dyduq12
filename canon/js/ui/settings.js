/**
 * User API key settings stored exclusively in IndexedDB (`meta` store), never in browser web storage or repo.
 */

import { STORES } from '../core/db.js';
import { formatUserError } from './errors.js';

export const API_KEYS_META_KEY = 'apiKeys';

/**
 * Reads all stored API keys from IndexedDB `meta` store.
 * @param {ReturnType<typeof import('../core/db.js').createDatabase>} db
 * @returns {Promise<{ tmdb: string, rawg: string }>}
 */
export async function getApiKeys(db) {
  try {
    const record = await db.get(STORES.META, API_KEYS_META_KEY);
    const value = record?.value;
    return {
      tmdb: typeof value?.tmdb === 'string' ? value.tmdb : '',
      rawg: typeof value?.rawg === 'string' ? value.rawg : ''
    };
  } catch (err) {
    console.error('[settings.getApiKeys] Falha ao ler chaves no IndexedDB:', { message: err?.message });
    return { tmdb: '', rawg: '' };
  }
}

/**
 * Reads a single provider key ('tmdb' or 'rawg') from IndexedDB `meta` store.
 * @param {ReturnType<typeof import('../core/db.js').createDatabase>} db
 * @param {'tmdb' | 'rawg'} provider
 * @returns {Promise<string>}
 */
export async function getApiKey(db, provider) {
  const keys = await getApiKeys(db);
  return keys[provider] || '';
}

/**
 * Persists user API keys into IndexedDB `meta` store.
 * @param {ReturnType<typeof import('../core/db.js').createDatabase>} db
 * @param {{ tmdb?: string, rawg?: string }} keys
 */
export async function saveApiKeys(db, keys) {
  const clean = {
    tmdb: typeof keys?.tmdb === 'string' ? keys.tmdb.trim() : '',
    rawg: typeof keys?.rawg === 'string' ? keys.rawg.trim() : ''
  };
  await db.put(STORES.META, {
    key: API_KEYS_META_KEY,
    value: clean,
    updatedAt: new Date().toISOString()
  });
  return clean;
}

/**
 * Clears all stored API keys from IndexedDB `meta` store.
 * @param {ReturnType<typeof import('../core/db.js').createDatabase>} db
 */
export async function clearApiKeys(db) {
  await db.delete(STORES.META, API_KEYS_META_KEY);
  return { tmdb: '', rawg: '' };
}

/**
 * Mounts the Settings UI panel using safe DOM node creation APIs.
 * @param {HTMLElement} container
 * @param {{ db: ReturnType<typeof import('../core/db.js').createDatabase>, onStatus?: (msg: string, isError?: boolean) => void }} deps
 */
export async function mountSettingsPanel(container, deps) {
  if (!container) {
    return;
  }

  container.replaceChildren();

  const heading = document.createElement('h2');
  heading.className = 'canon-panel-title';
  heading.textContent = 'Configurações (Chaves de API)';

  const notice = document.createElement('p');
  notice.textContent =
    'Suas chaves ficam salvas apenas no IndexedDB deste navegador (visíveis localmente no seu dispositivo; nunca enviadas ao repositório). AniList não exige chave.';

  const form = document.createElement('form');

  const tmdbRow = document.createElement('div');
  const tmdbLabel = document.createElement('label');
  tmdbLabel.htmlFor = 'settings-tmdb-key';
  tmdbLabel.textContent = 'Chave TMDB (v3) — Filmes e Séries: ';
  const tmdbInput = document.createElement('input');
  tmdbInput.id = 'settings-tmdb-key';
  tmdbInput.type = 'password';
  tmdbInput.autocomplete = 'off';
  tmdbInput.placeholder = 'Cole sua API key v3 do TMDB';
  tmdbRow.append(tmdbLabel, tmdbInput);

  const rawgRow = document.createElement('div');
  const rawgLabel = document.createElement('label');
  rawgLabel.htmlFor = 'settings-rawg-key';
  rawgLabel.textContent = 'Chave RAWG — Jogos: ';
  const rawgInput = document.createElement('input');
  rawgInput.id = 'settings-rawg-key';
  rawgInput.type = 'password';
  rawgInput.autocomplete = 'off';
  rawgInput.placeholder = 'Cole sua API key da RAWG';
  rawgRow.append(rawgLabel, rawgInput);

  const actions = document.createElement('div');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Salvar chaves';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = 'Apagar chaves';

  const stateHint = document.createElement('p');
  stateHint.textContent = 'Carregando chaves salvas...';

  actions.append(saveBtn, document.createTextNode(' '), clearBtn);
  form.append(tmdbRow, rawgRow, actions);
  container.append(heading, notice, form, stateHint);

  function updateHint(keys) {
    const tmdbState = keys.tmdb ? 'TMDB configurada' : 'TMDB não configurada';
    const rawgState = keys.rawg ? 'RAWG configurada' : 'RAWG não configurada';
    stateHint.textContent = `Estado atual: ${tmdbState} | ${rawgState}.`;
  }

  try {
    const current = await getApiKeys(deps.db);
    tmdbInput.value = current.tmdb;
    rawgInput.value = current.rawg;
    updateHint(current);
  } catch (err) {
    stateHint.textContent = 'Não foi possível ler as chaves locais.';
    deps.onStatus?.(formatUserError(err, { context: 'Ler configurações' }).message, true);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const saved = await saveApiKeys(deps.db, {
        tmdb: tmdbInput.value,
        rawg: rawgInput.value
      });
      updateHint(saved);
      deps.onStatus?.('Chaves de API salvas apenas no IndexedDB local.');
    } catch (err) {
      console.error('[settings.save] Erro ao salvar chaves:', err);
      deps.onStatus?.(formatUserError(err, { context: 'Salvar chaves' }).message, true);
    }
  });

  clearBtn.addEventListener('click', async () => {
    try {
      const cleared = await clearApiKeys(deps.db);
      tmdbInput.value = '';
      rawgInput.value = '';
      updateHint(cleared);
      deps.onStatus?.('Chaves de API removidas do IndexedDB local.');
    } catch (err) {
      console.error('[settings.clear] Erro ao apagar chaves:', err);
      deps.onStatus?.(formatUserError(err, { context: 'Apagar chaves' }).message, true);
    }
  });
}
