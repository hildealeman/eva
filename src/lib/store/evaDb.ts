const DB_NAME = 'eva-db';
const SHARDS_STORE = 'emo-shards';
const EPISODES_STORE = 'episodes';

function openDb(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version === undefined
        ? indexedDB.open(DB_NAME)
        : indexedDB.open(DB_NAME, version);

    request.onerror = () => {
      reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARDS_STORE)) {
        db.createObjectStore(SHARDS_STORE);
      }
      if (!db.objectStoreNames.contains(EPISODES_STORE)) {
        db.createObjectStore(EPISODES_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

export async function ensureEvaDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const db = await openDb();
  const hasShards = db.objectStoreNames.contains(SHARDS_STORE);
  const hasEpisodes = db.objectStoreNames.contains(EPISODES_STORE);

  if (hasShards && hasEpisodes) {
    db.close();
    return;
  }

  const nextVersion = Math.max(1, db.version + 1);
  db.close();

  const upgraded = await openDb(nextVersion);
  upgraded.close();
}
