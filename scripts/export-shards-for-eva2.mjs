import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

function getDebugShardIds() {
  const raw = process.env.EVA_EXPORT_DEBUG_SHARD_IDS ?? '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpOk(url, { timeoutMs = 60_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      // Any HTTP response means the origin is up (even if route returns 404/redirect).
      if (res.status) return;
    } catch {
      // ignore
    }
    await sleep(500);
  }
  throw new Error(`Timeout waiting for dev server at ${url}`);
}

async function isHttpOk(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    return Boolean(res.status);
  } catch {
    return false;
  }
}

function canStartDummyServerForOrigin(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function startDummyServerForOrigin(baseUrl) {
  const u = new URL(baseUrl);
  const port = Number(u.port);
  const host = u.hostname;

  const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('eva export dummy origin\n');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve(() =>
        new Promise((r) => {
          server.close(() => r());
        })
      );
    });
  });
}

function guessChromeUserDataDir() {
  const home = process.env.HOME;
  if (!home) return null;
  return path.join(
    home,
    'Library',
    'Application Support',
    'Google',
    'Chrome'
  );
}

async function ensureTmpDir(tmpDir) {
  await fs.mkdir(tmpDir, { recursive: true });
}

async function getCandidateProfileNames(userDataDir) {
  const base = userDataDir;
  const name = path.basename(base);

  // If user passed a direct profile dir (…/Chrome/Default or …/Chrome/Profile X),
  // normalize to its parent as userDataDirRoot and return only that profile.
  if (name === 'Default' || name.startsWith('Profile ')) {
    return [name];
  }

  // Otherwise treat as Chrome root user data dir and enumerate profiles.
  const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => n === 'Default' || n.startsWith('Profile '));

  candidates.sort((a, b) => {
    if (a === 'Default') return -1;
    if (b === 'Default') return 1;
    return a.localeCompare(b);
  });

  return candidates;
}

async function withRetries(fn, { retries = 5, delayMs = 750 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(delayMs);
    }
  }
  throw lastErr;
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timeout after ${ms}ms${label ? ` (${label})` : ''}`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  // IMPORTANT: IndexedDB is scoped by origin (scheme + host + port).
  // Defaulting to 3000 increases the chance we hit the origin where your data lives.
  const port = Number(process.env.EVA_EXPORT_PORT ?? 3000);
  const host = process.env.EVA_EXPORT_HOST ?? 'localhost';
  const defaultBaseUrl = process.env.EVA_EXPORT_BASE_URL ?? `http://${host}:${port}`;
  const originsFromEnv = (process.env.EVA_EXPORT_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const baseUrls = originsFromEnv.length ? originsFromEnv : [defaultBaseUrl];
  const startDummyServers = process.env.EVA_EXPORT_START_DUMMY_SERVER !== '0';
  const autoStartDevServer = process.env.EVA_EXPORT_AUTO_START_DEV !== '0';

  const forcedProfileName = process.env.EVA_EXPORT_CHROME_PROFILE ?? null;

  let userDataDir = process.env.EVA_EXPORT_USER_DATA_DIR ?? guessChromeUserDataDir();

  if (!userDataDir) {
    throw new Error(
      'No pude determinar EVA_EXPORT_USER_DATA_DIR (directorio de perfil de Chrome).'
    );
  }

  // Accept either Chrome root dir or a concrete profile dir.
  const providedBasename = path.basename(userDataDir);
  if (providedBasename === 'Default' || providedBasename.startsWith('Profile ')) {
    userDataDir = path.dirname(userDataDir);
  }

  const profileNames = await getCandidateProfileNames(userDataDir);
  if (!profileNames.length) {
    throw new Error(`No encontré perfiles de Chrome en ${userDataDir}`);
  }

  const effectiveProfileNames = forcedProfileName
    ? profileNames.filter((n) => n === forcedProfileName)
    : profileNames;

  if (forcedProfileName && effectiveProfileNames.length === 0) {
    throw new Error(
      `EVA_EXPORT_CHROME_PROFILE=${forcedProfileName} no existe dentro de ${userDataDir}`
    );
  }

  console.log(`[export] baseUrls=${baseUrls.join(', ')}`);
  console.log(`[export] userDataDir=${userDataDir}`);
  console.log(`[export] profiles=${effectiveProfileNames.length}`);

  const debugIds = getDebugShardIds();

  let devServer = null;
  let devServerExitCode = null;
  const primaryBaseUrl = baseUrls[0];
  const alreadyRunning = await isHttpOk(primaryBaseUrl);

  console.log(`[export] devServerAlreadyRunning=${alreadyRunning}`);

  const primaryPort = (() => {
    try {
      const u = new URL(primaryBaseUrl);
      const p = Number(u.port);
      return Number.isFinite(p) && p > 0 ? p : port;
    } catch {
      return port;
    }
  })();

  if (!alreadyRunning && autoStartDevServer) {
    console.log('[export] starting next dev...');
    devServer = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'dev', '--', '-p', String(primaryPort)],
      {
        stdio: 'inherit',
        env: { ...process.env, PORT: String(primaryPort) },
      }
    );

    devServer.on('exit', (code) => {
      devServerExitCode = code;
    });
  }

  try {
    console.log('[export] waiting for server...');
    if (!alreadyRunning) {
      if (!autoStartDevServer) {
        console.warn(
          `[export] primary origin no responde y EVA_EXPORT_AUTO_START_DEV=0; no puedo levantar dev server automaticamente (${primaryBaseUrl}).`
        );
      }
      await waitForHttpOk(primaryBaseUrl, { timeoutMs: 90_000 });
    }

    console.log('[export] launching playwright chromium (persistent)...');

    const { chromium } = await import('playwright');

    const dummyServerClosers = [];
    const combinedEpisodesById = new Map();
    try {
      for (const baseUrl of baseUrls) {
        const ok = await isHttpOk(baseUrl);
        if (ok) continue;

        if (!startDummyServers || !canStartDummyServerForOrigin(baseUrl)) {
          continue;
        }

        console.log(`[export] origin down; starting dummy server for ${baseUrl}`);
        try {
          const close = await startDummyServerForOrigin(baseUrl);
          dummyServerClosers.push(close);
          await waitForHttpOk(baseUrl, { timeoutMs: 10_000 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[export] failed to start dummy server for ${baseUrl}: ${msg}`);
        }
      }

    async function extractFromProfile(profileName, baseUrl) {
      console.log(`[export] trying profile ${profileName} origin=${baseUrl}`);
      const context = await chromium.launchPersistentContext(userDataDir, {
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', `--profile-directory=${profileName}`],
      });

      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);

        page.on('console', (msg) => {
          const type = msg.type();
          const text = msg.text();
          if (text?.startsWith('[export]') || text?.startsWith('[export][')) {
            if (type === 'warning') console.warn(text);
            else if (type === 'error') console.error(text);
            else console.log(text);
          }
        });

        return await withRetries(async () => {
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(750);

          return page.evaluate(async ({ debugIds }) => {
      const DB_NAME = 'eva-db';
      const SHARDS_STORE = 'emo-shards';
      const EPISODES_STORE = 'episodes';

      function safeString(v) {
        return typeof v === 'string' ? v : null;
      }

      function shardIdOf(obj) {
        if (!obj) return null;
        return safeString(obj.id) ?? safeString(obj.shardId);
      }

      function openDb() {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME);
          req.onerror = () => reject(req.error ?? new Error('indexedDB open error'));
          req.onsuccess = () => resolve(req.result);
        });
      }

      function openDbByName(name) {
        return new Promise((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onerror = () => reject(req.error ?? new Error('indexedDB open error'));
          req.onsuccess = () => resolve(req.result);
        });
      }

      function readAllFromStore(db, storeName) {
        return new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onerror = () => reject(req.error ?? new Error('getAll error'));
          req.onsuccess = () => resolve(req.result ?? []);
        });
      }

      function hasStore(db, storeName) {
        try {
          return Array.from(db.objectStoreNames ?? []).includes(storeName);
        } catch {
          return false;
        }
      }

      function scanRowsForIds(rows, debugIds) {
        const hits = [];
        if (!Array.isArray(rows) || !Array.isArray(debugIds) || !debugIds.length) return hits;

        for (const row of rows) {
          if (!row) continue;
          const sid = shardIdOf(row);
          if (sid && debugIds.includes(sid)) {
            hits.push({
              id: sid,
              episodeId: safeString(row.episodeId),
              createdAt: safeString(row.createdAt),
              status: safeString(row.status),
              publishState: safeString(row.publishState),
            });
          }
        }
        return hits;
      }

      function normalizeEpisodeIdFromShard(shard) {
        return shard.episodeId ?? shard.id ?? shard.shardId;
      }

      const db = await openDb();

      if (Array.isArray(debugIds) && debugIds.length) {
        const stores = Array.from(db.objectStoreNames ?? []);
        console.log('[export][indexeddb-debug] openDb', {
          dbName: DB_NAME,
          stores,
        });

        // Optional deep scan across all IndexedDB databases (if supported) to locate IDs.
        // Some Chromium builds return [] here; when it works, it's the most reliable way
        // to prove IDs live in another DB/store.
        if (typeof indexedDB.databases === 'function') {
          try {
            const dbs = await indexedDB.databases();
            const dbNames = (Array.isArray(dbs) ? dbs : [])
              .map((d) => safeString(d?.name))
              .filter(Boolean);
            const uniqueDbNames = Array.from(new Set(dbNames));

            const deepHits = [];
            for (const name of uniqueDbNames) {
              let other;
              try {
                other = await openDbByName(name);
              } catch {
                continue;
              }

              const otherStores = Array.from(other.objectStoreNames ?? []);
              for (const storeName of otherStores) {
                let rows;
                try {
                  rows = await readAllFromStore(other, storeName);
                } catch {
                  continue;
                }
                const hits = scanRowsForIds(rows, debugIds);
                if (hits.length) {
                  deepHits.push({ dbName: name, storeName, hits });
                }
              }

              other.close();
            }

            console.log(
              '[export][indexeddb-debug] deepScan',
              JSON.stringify(
                {
                  supported: true,
                  dbCount: uniqueDbNames.length,
                  hitCount: deepHits.reduce((n, h) => n + (h?.hits?.length ?? 0), 0),
                  deepHits,
                },
                null,
                2
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log('[export][indexeddb-debug] deepScan', JSON.stringify({ supported: true, error: msg }));
          }
        } else {
          console.log('[export][indexeddb-debug] deepScan', JSON.stringify({ supported: false }));
        }
      }

      const shards = hasStore(db, SHARDS_STORE) ? await readAllFromStore(db, SHARDS_STORE) : [];
      const episodeSummaries = hasStore(db, EPISODES_STORE)
        ? await readAllFromStore(db, EPISODES_STORE)
        : [];

      if (Array.isArray(debugIds) && debugIds.length) {
        const present = new Set(
          (Array.isArray(shards) ? shards : [])
            .map((s) => (s ? safeString(s.id) ?? safeString(s.shardId) : null))
            .filter(Boolean)
        );
        const presence = Object.fromEntries(debugIds.map((id) => [id, present.has(id)]));

        const preview = debugIds
          .filter((id) => presence[id])
          .map((id) => {
            const match = (Array.isArray(shards) ? shards : []).find(
              (s) => safeString(s?.id) === id || safeString(s?.shardId) === id
            );
            if (!match) return { id, found: false };
            return {
              id,
              found: true,
              episodeId: safeString(match.episodeId),
              createdAt: safeString(match.createdAt),
              status: safeString(match.status),
              publishState: safeString(match.publishState),
              deleted: typeof match.deleted === 'boolean' ? match.deleted : null,
            };
          });

        console.log(
          '[export][indexeddb-debug] rawShardsPresence',
          JSON.stringify(
            {
              shardsCount: Array.isArray(shards) ? shards.length : 0,
              presence,
              preview,
            },
            null,
            2
          )
        );
      }

      // Scan any other stores inside eva-db to catch legacy storage layouts.
      const extraStores = Array.from(db.objectStoreNames ?? []).filter(
        (n) => n !== SHARDS_STORE && n !== EPISODES_STORE
      );
      const legacyShardCandidates = [];
      for (const storeName of extraStores) {
        let rows;
        try {
          rows = await readAllFromStore(db, storeName);
        } catch {
          continue;
        }
        if (!Array.isArray(rows) || rows.length === 0) continue;
        legacyShardCandidates.push(...rows);
      }

      db.close();

      const episodesById = new Map();

      // Seed episodes from stored summaries (if present)
      for (const ep of episodeSummaries) {
        if (!ep?.id) continue;
        episodesById.set(ep.id, {
          id: ep.id,
          title: ep.title ?? null,
          shards: [],
        });
      }

      // Attach shards and create episodes on the fly if needed
      for (const shard of shards) {
        if (!shard) continue;

        const shardId = shard.id ?? shard.shardId;
        if (!shardId) continue;

        const episodeId = normalizeEpisodeIdFromShard(shard);
        if (!episodesById.has(episodeId)) {
          episodesById.set(episodeId, {
            id: episodeId,
            title: null,
            shards: [],
          });
        }

        episodesById.get(episodeId).shards.push({
          id: shardId,
          episodeId,
          startTimeSec: shard.startTime,
          endTimeSec: shard.endTime,
          source: 'local',
          meta: {
            createdAt: shard.createdAt,
            inputSource: shard.source,
            intensity: shard.intensity,
            status: shard.status,
            suggestedTags: shard.suggestedTags,
            userTags: shard.userTags,
            notes: shard.notes ?? null,
            transcript: shard.transcript ?? null,
            transcriptLanguage: shard.transcriptLanguage ?? null,
            transcriptionConfidence: shard.transcriptionConfidence ?? null,
            primaryEmotion: shard.primaryEmotion ?? null,
            emotionLabels: shard.emotionLabels ?? [],
            valence: shard.valence ?? null,
            arousal: shard.arousal ?? null,
            prosodyFlags: shard.prosodyFlags ?? null,
            analysisSource: shard.analysisSource ?? null,
            analysisMode: shard.analysisMode ?? null,
            analysisVersion: shard.analysisVersion ?? null,
            analysisAt: shard.analysisAt ?? null,
            publishState: shard.publishState ?? null,
            deleted: shard.deleted ?? null,
          },
          features: shard.features ?? null,
          analysis: {
            ...(shard.analysis ?? {}),
            semantic: shard.semantic ?? null,
          },
        });
      }

      // Merge shard-like rows from any other eva-db stores (legacy schemas)
      for (const row of legacyShardCandidates) {
        if (!row) continue;
        const sid = shardIdOf(row);
        if (!sid) continue;

        const start = typeof row.startTime === 'number' ? row.startTime : null;
        const end = typeof row.endTime === 'number' ? row.endTime : null;
        if (start === null || end === null) continue;

        const episodeId = normalizeEpisodeIdFromShard(row) ?? sid;
        if (!episodesById.has(episodeId)) {
          episodesById.set(episodeId, {
            id: episodeId,
            title: null,
            shards: [],
          });
        }

        episodesById.get(episodeId).shards.push({
          id: sid,
          episodeId,
          startTimeSec: start,
          endTimeSec: end,
          source: 'local',
          meta: {
            createdAt: row.createdAt,
            inputSource: row.source,
            intensity: row.intensity,
            status: row.status,
            suggestedTags: row.suggestedTags,
            userTags: row.userTags,
            notes: row.notes ?? null,
            transcript: row.transcript ?? null,
            transcriptLanguage: row.transcriptLanguage ?? null,
            transcriptionConfidence: row.transcriptionConfidence ?? null,
            primaryEmotion: row.primaryEmotion ?? null,
            emotionLabels: row.emotionLabels ?? [],
            valence: row.valence ?? null,
            arousal: row.arousal ?? null,
            prosodyFlags: row.prosodyFlags ?? null,
            analysisSource: row.analysisSource ?? null,
            analysisMode: row.analysisMode ?? null,
            analysisVersion: row.analysisVersion ?? null,
            analysisAt: row.analysisAt ?? null,
            publishState: row.publishState ?? null,
            deleted: row.deleted ?? null,
          },
          features: row.features ?? null,
          analysis: {
            ...(row.analysis ?? {}),
            semantic: row.semantic ?? null,
          },
        });
      }

      // NOTE: We intentionally avoid relying on indexedDB.databases() because it's often
      // unavailable/empty in Chromium. The eva-db store scan above is the reliable path.

      const episodes = Array.from(episodesById.values()).map((ep) => ({
        ...ep,
        shards: ep.shards.sort((a, b) => (a.startTimeSec ?? 0) - (b.startTimeSec ?? 0)),
      }));

      // Sort episodes by most recent shard createdAt if possible
      episodes.sort((a, b) => {
        const aLast = a.shards[a.shards.length - 1]?.meta?.createdAt ?? '';
        const bLast = b.shards[b.shards.length - 1]?.meta?.createdAt ?? '';
        return new Date(bLast).getTime() - new Date(aLast).getTime();
      });

      console.log('[export][indexeddb-scan]', {
        evaDbExtraStores: extraStores,
        evaDbLegacyCandidates: legacyShardCandidates.length,
      });

      return { episodes };
          }, { debugIds });
        }, { retries: 6, delayMs: 900 });
      } finally {
        await context.close().catch(() => null);
      }
    }

    for (const baseUrl of baseUrls) {
      for (const profileName of effectiveProfileNames) {
        const partial = await withTimeout(
          extractFromProfile(profileName, baseUrl),
          60_000,
          `extractFromProfile:${profileName}:${baseUrl}`
        ).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[export] origin no disponible o error leyendo perfil ${profileName} origin=${baseUrl}: ${msg}`
          );
          return { episodes: [] };
        });

        const partialShards = (partial.episodes ?? []).flatMap((e) => e?.shards ?? []).length;
        console.log(
          `[export] profile result: ${profileName} origin=${baseUrl} episodes=${(partial.episodes ?? []).length} shards=${partialShards}`
        );

        for (const ep of partial.episodes ?? []) {
          if (!ep?.id) continue;
          if (!combinedEpisodesById.has(ep.id)) {
            combinedEpisodesById.set(ep.id, {
              ...ep,
              shards: [...(ep.shards ?? [])],
            });
          } else {
            const existing = combinedEpisodesById.get(ep.id);
            existing.shards.push(...(ep.shards ?? []));
          }
        }
      }
    }

    } finally {
      await Promise.allSettled(dummyServerClosers.map((close) => close()));
    }

    const episodes = Array.from(combinedEpisodesById.values()).map((ep) => {
      const shardMap = new Map();
      for (const s of ep.shards ?? []) {
        if (!s?.id) continue;
        shardMap.set(s.id, s);
      }
      const shards = Array.from(shardMap.values()).sort(
        (a, b) => (a.startTimeSec ?? 0) - (b.startTimeSec ?? 0)
      );
      return { ...ep, shards };
    });

    episodes.sort((a, b) => {
      const aLast = a.shards[a.shards.length - 1]?.meta?.createdAt ?? '';
      const bLast = b.shards[b.shards.length - 1]?.meta?.createdAt ?? '';
      return new Date(bLast).getTime() - new Date(aLast).getTime();
    });

    const exportData = { episodes };

    console.log('[export] browser closed; writing JSON...');

    const tmpDir = path.join(process.cwd(), 'tmp');
    await ensureTmpDir(tmpDir);

    const outPath = path.join(tmpDir, 'eva1-shards-export.json');
    await fs.writeFile(outPath, JSON.stringify(exportData, null, 2), 'utf8');

    // Debug (optional): verify specific shard IDs are present in the JSON that was just written.
    if (debugIds.length) {
      try {
        const raw = await fs.readFile(outPath, 'utf8');
        const parsed = JSON.parse(raw);

        const episodeShards = Array.isArray(parsed?.episodes)
          ? parsed.episodes.flatMap((e) => (Array.isArray(e?.shards) ? e.shards : []))
          : [];
        const topLevelShards = Array.isArray(parsed?.shards) ? parsed.shards : [];
        const allShardLike = [...episodeShards, ...topLevelShards];

        const presentIds = new Set(
          allShardLike
            .map((s) => (s ? s.id ?? s.shardId : null))
            .filter((v) => typeof v === 'string')
        );

        const presence = Object.fromEntries(debugIds.map((id) => [id, presentIds.has(id)]));

        console.log('[export] debugShardPresence', presence);

        for (const [id, ok] of Object.entries(presence)) {
          if (ok) continue;
          console.warn(
            `[export] debugShardPresence missing: ${id} (no aparece en el export; probablemente vive en otro origen/puerto o aún no está en IndexedDB)`
          );
        }
      } catch {
        // ignore debug errors
      }
    }

    const allShards = exportData.episodes.flatMap((e) => e.shards ?? []);
    const totalShards = allShards.length;
    const totalEpisodes = exportData.episodes.length;
    console.log(`[export] result: episodes=${totalEpisodes} shards=${totalShards}`);
    console.log(`OK: export escrito en ${outPath}`);
  } finally {
    if (devServer && devServerExitCode === null) {
      devServer.kill('SIGTERM');
      await sleep(500);
      devServer.kill('SIGKILL');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
