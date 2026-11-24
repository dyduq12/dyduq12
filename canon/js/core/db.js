/**
 * IndexedDB Promise wrapper with versioned schema and transparent in-memory fallback.
 */

export const DB_NAME = 'canon-db';
export const DB_VERSION = 1;
export const STORES = Object.freeze({
  WORKS: 'works',
  COVERS: 'covers',
  API_CACHE: 'apiCache',
  META: 'meta'
});

const STORE_CONFIGS = [
  { name: STORES.WORKS, options: { keyPath: 'id' } },
  { name: STORES.COVERS, options: undefined },
  { name: STORES.API_CACHE, options: { keyPath: 'key' } },
  { name: STORES.META, options: { keyPath: 'key' } }
];

function createMemoryStorage() {
  const stores = new Map();
  for (const { name } of STORE_CONFIGS) {
    stores.set(name, new Map());
  }
  return stores;
}

function resolveKeyPath(storeName, value, explicitKey) {
  if (explicitKey !== undefined) {
    return explicitKey;
  }
  const config = STORE_CONFIGS.find((item) => item.name === storeName);
  const keyPath = config?.options?.keyPath;
  if (keyPath && value && typeof value === 'object') {
    return value[keyPath];
  }
  throw new TypeError(`Chave obrigatória ausente para store "${storeName}".`);
}

function requestToPromise(request, contextLabel) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error || new Error(`Falha na operação IndexedDB: ${contextLabel}`));
    };
  });
}

function formatOpenErrorMessage(err) {
  const name = err?.name || 'Error';
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return 'IndexedDB bloqueado neste navegador (modo privado ou cookies restritos). Usando armazenamento temporário em memória.';
  }
  if (name === 'QuotaExceededError') {
    return 'Cota de armazenamento do navegador atingida ao abrir o IndexedDB. Usando memória temporária.';
  }
  return `Não foi possível abrir o banco local (${name}). Usando armazenamento temporário em memória.`;
}

/**
 * Creates a CANON database client wrapping IndexedDB with an automatic memory fallback.
 * @param {IDBFactory | undefined} [idbFactory]
 */
export function createDatabase(idbFactory = globalThis.indexedDB) {
  /** @type {IDBDatabase | null} */
  let dbInstance = null;
  /** @type {Promise<void> | null} */
  let openPromise = null;
  let usingMemoryFallback = false;
  let fallbackReason = '';
  const memoryStores = createMemoryStorage();

  function activateMemoryFallback(err) {
    usingMemoryFallback = true;
    dbInstance = null;
    fallbackReason = formatOpenErrorMessage(err);
    console.warn('[db.open] Fallback em memória ativado:', {
      name: err?.name,
      message: err?.message
    });
  }

  function ensureStoreExists(storeName) {
    if (!memoryStores.has(storeName)) {
      throw new Error(`Object store desconhecida: "${storeName}".`);
    }
  }

  async function open() {
    if (dbInstance || usingMemoryFallback) {
      return { isMemoryFallback: usingMemoryFallback, fallbackReason };
    }
    if (openPromise) {
      await openPromise;
      return { isMemoryFallback: usingMemoryFallback, fallbackReason };
    }

    openPromise = (async () => {
      if (!idbFactory || typeof idbFactory.open !== 'function') {
        activateMemoryFallback(new Error('IndexedDB indisponível no ambiente atual.'));
        return;
      }

      try {
        dbInstance = await new Promise((resolve, reject) => {
          const request = idbFactory.open(DB_NAME, DB_VERSION);

          request.onupgradeneeded = () => {
            const db = request.result;
            for (const { name, options } of STORE_CONFIGS) {
              if (!db.objectStoreNames.contains(name)) {
                db.createObjectStore(name, options);
              }
            }
          };

          request.onblocked = () => {
            reject(new Error('Abertura do IndexedDB bloqueada por outra aba aberta.'));
          };

          request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
              db.close();
              dbInstance = null;
            };
            resolve(db);
          };

          request.onerror = () => {
            reject(request.error || new Error('Erro desconhecido ao abrir IndexedDB.'));
          };
        });
      } catch (err) {
        activateMemoryFallback(err);
      } finally {
        openPromise = null;
      }
    })();

    await openPromise;
    return { isMemoryFallback: usingMemoryFallback, fallbackReason };
  }

  async function runTransaction(storeName, mode, operation) {
    ensureStoreExists(storeName);
    await open();

    if (usingMemoryFallback || !dbInstance) {
      return operation(null, memoryStores.get(storeName));
    }

    try {
      return await new Promise((resolve, reject) => {
        const tx = dbInstance.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let resultValue;

        tx.oncomplete = () => resolve(resultValue);
        tx.onerror = () => reject(tx.error || new Error(`Falha na transação em "${storeName}".`));
        tx.onabort = () => reject(tx.error || new Error(`Transação abortada em "${storeName}".`));

        Promise.resolve(operation(store, null))
          .then((value) => {
            resultValue = value;
          })
          .catch((err) => {
            try {
              tx.abort();
            } catch (abortErr) {
              console.warn('[db.tx] Transação já encerrada ao abortar:', { message: abortErr?.message });
            }
            reject(err);
          });
      });
    } catch (err) {
      console.error(`[db.${mode}] Erro em "${storeName}":`, {
        name: err?.name,
        message: err?.message
      });
      if (err?.name === 'QuotaExceededError') {
        throw new Error('Espaço de armazenamento do navegador esgotado. Exporte seu canon.json para fazer backup.');
      }
      throw err;
    }
  }

  async function get(storeName, key) {
    return runTransaction(storeName, 'readonly', (store, mem) => {
      if (mem) {
        return mem.get(key);
      }
      return requestToPromise(store.get(key), `${storeName}.get`);
    });
  }

  async function getAll(storeName) {
    return runTransaction(storeName, 'readonly', (store, mem) => {
      if (mem) {
        return Array.from(mem.values());
      }
      return requestToPromise(store.getAll(), `${storeName}.getAll`);
    });
  }

  async function put(storeName, value, key) {
    return runTransaction(storeName, 'readwrite', (store, mem) => {
      if (mem) {
        const resolvedKey = resolveKeyPath(storeName, value, key);
        mem.set(resolvedKey, value);
        return resolvedKey;
      }
      const req = key !== undefined ? store.put(value, key) : store.put(value);
      return requestToPromise(req, `${storeName}.put`);
    });
  }

  async function remove(storeName, key) {
    return runTransaction(storeName, 'readwrite', (store, mem) => {
      if (mem) {
        mem.delete(key);
        return undefined;
      }
      return requestToPromise(store.delete(key), `${storeName}.delete`);
    });
  }

  async function clear(storeName) {
    return runTransaction(storeName, 'readwrite', (store, mem) => {
      if (mem) {
        mem.clear();
        return undefined;
      }
      return requestToPromise(store.clear(), `${storeName}.clear`);
    });
  }

  return {
    open,
    get,
    getAll,
    put,
    delete: remove,
    clear,
    isMemoryFallback: () => usingMemoryFallback,
    getFallbackReason: () => fallbackReason
  };
}
