import { setTimeout as sleep } from 'node:timers/promises';
import { loadCompanionConfig } from './config';
import { fetchCollabLyricsList, fetchProToolsSyncList, upsertProToolsSync } from './api';
import { FileProToolsAdapter } from './adapters/file-adapter';
import { ProToolsSessionInfoAdapter } from './adapters/protools-session-info-adapter';
import { PullSnapshotWriter } from './adapters/pull-writer';

async function run(): Promise<void> {
  const config = loadCompanionConfig();
  const adapter = config.sessionInfoFilePath
    ? new ProToolsSessionInfoAdapter(config)
    : new FileProToolsAdapter(config);
  const pullWriter = config.importFilePath
    ? new PullSnapshotWriter(config.importFilePath)
    : null;

  console.log('[companion] starting Pro Tools bridge', {
    apiBaseUrl: config.apiBaseUrl,
    projectId: config.projectId,
    source: config.source,
    pollMs: config.pollMs,
    exportFilePath: config.exportFilePath,
    sessionInfoFilePath: config.sessionInfoFilePath,
    trackId: config.trackId,
    pullEnabled: config.pullEnabled,
    importFilePath: config.importFilePath,
    pullTrackId: config.pullTrackId,
  });

  for (;;) {
    try {
      const pending = await adapter.readPendingPayloads();
      for (const payload of pending) {
        if (!payload.externalTrackId?.trim()) {
          console.warn('[companion] skipped payload without externalTrackId');
          continue;
        }

        const result = await upsertProToolsSync(config, payload);
        console.log('[companion] synced track', {
          externalTrackId: result.externalTrackId,
          projectId: result.projectId,
          updatedAt: result.updatedAt,
          markers: result.markers.length,
          takeScores: result.takeScores.length,
          pronunciationFeedback: result.pronunciationFeedback.length,
        });
      }

      if (config.pullEnabled && pullWriter) {
        const [protools, lyrics] = await Promise.all([
          fetchProToolsSyncList(config, { externalTrackId: config.pullTrackId }),
          fetchCollabLyricsList(config, { externalTrackId: config.pullTrackId }),
        ]);

        const didWrite = await pullWriter.writeIfChanged({
          pulledAt: new Date().toISOString(),
          protools,
          lyrics,
        });

        if (didWrite || config.logVerbose) {
          console.log('[companion] pulled snapshot', {
            wrote: didWrite,
            protools: protools.length,
            lyrics: lyrics.length,
            outputPath: config.importFilePath,
          });
        }
      }
    } catch (error) {
      console.error('[companion] sync loop error', error);
    }

    await sleep(config.pollMs);
  }
}

void run();
