import { setTimeout as sleep } from 'node:timers/promises';
import { loadCompanionConfig } from './config';
import {
  ackCompExport,
  downloadCompExport,
  fetchCollabLyricsList,
  fetchCompanionSnapshot,
  fetchProToolsSyncList,
  postSessionCheckpoint,
  upsertProToolsSync,
  uploadTake,
} from './api';
import path from 'node:path';
import { FileProToolsAdapter } from './adapters/file-adapter';
import { ProToolsSessionInfoAdapter } from './adapters/protools-session-info-adapter';
import { PullSnapshotWriter } from './adapters/pull-writer';
import { ProToolsExportWriter } from './adapters/protools-export-writer';
import { markUploaded, readTakeBytes, scanAudioFolder } from './adapters/take-watcher';

async function run(): Promise<void> {
  const config = loadCompanionConfig();
  const adapter = config.sessionInfoFilePath
    ? new ProToolsSessionInfoAdapter(config)
    : new FileProToolsAdapter(config);
  const pullWriter = config.importFilePath
    ? new PullSnapshotWriter(config.importFilePath)
    : null;
  const exportWriter = config.exportDir ? new ProToolsExportWriter(config.exportDir) : null;

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
    audioWatchPath: config.audioWatchPath,
    audioStabilizeMs: config.audioStabilizeMs,
    pairingToken: config.pairingToken ? 'set' : 'missing',
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

        if (config.pairingToken) {
          try {
            const checkpoint = await postSessionCheckpoint(config, {
              source: 'protools-session-info',
              payload: {
                externalTrackId: payload.externalTrackId,
                bpm: payload.bpm,
                markers: payload.markers,
                takeScores: payload.takeScores,
                pronunciationFeedback: payload.pronunciationFeedback,
              },
            });
            if (config.logVerbose) {
              console.log('[companion] checkpoint stored', checkpoint);
            }
          } catch (err) {
            if (config.logVerbose) {
              console.warn('[companion] checkpoint failed', (err as Error).message);
            }
          }
        }
      }

      if (config.audioWatchPath && config.pairingToken) {
        const candidates = await scanAudioFolder(config);
        for (const candidate of candidates) {
          try {
            const bytes = await readTakeBytes(candidate.absolutePath);
            const result = await uploadTake(config, {
              file: bytes,
              filename: candidate.filename,
              absolutePath: candidate.absolutePath,
              externalTrackId: config.trackId,
            });
            await markUploaded(candidate.absolutePath);
            console.log('[companion] uploaded take', {
              filename: candidate.filename,
              size: candidate.size,
              storageUrl: result.url,
            });
          } catch (error) {
            console.warn('[companion] take upload failed', {
              filename: candidate.filename,
              error: (error as Error).message,
            });
          }
        }
      }

      if (config.pullEnabled && pullWriter) {
        const [protools, lyrics, snapshot] = await Promise.all([
          fetchProToolsSyncList(config, { externalTrackId: config.pullTrackId }),
          fetchCollabLyricsList(config, { externalTrackId: config.pullTrackId }),
          config.pairingToken
            ? fetchCompanionSnapshot(config).catch((err) => {
                if (config.logVerbose) {
                  console.warn('[companion] snapshot fetch failed', (err as Error).message);
                }
                return null;
              })
            : Promise.resolve(null),
        ]);

        const didWrite = await pullWriter.writeIfChanged({
          pulledAt: new Date().toISOString(),
          protools,
          lyrics,
          keepers: snapshot?.keepers ?? [],
          markers: snapshot?.markers ?? [],
          regions: snapshot?.regions ?? [],
        });

        if (didWrite || config.logVerbose) {
          console.log('[companion] pulled snapshot', {
            wrote: didWrite,
            protools: protools.length,
            lyrics: lyrics.length,
            keepers: snapshot?.keepers.length ?? 0,
            markers: snapshot?.markers.length ?? 0,
            regions: snapshot?.regions.length ?? 0,
            outputPath: config.importFilePath,
          });
        }

        if (exportWriter && snapshot) {
          try {
            const written = await exportWriter.writeIfChanged(snapshot);
            if (written.markers || written.keepers || config.logVerbose) {
              console.log('[companion] wrote Pro Tools export files', {
                markers: written.markers,
                keepers: written.keepers,
                outputDir: config.exportDir,
              });
            }
          } catch (err) {
            console.warn('[companion] export writer failed', (err as Error).message);
          }
        }

        if (snapshot?.pendingCompExports && snapshot.pendingCompExports.length > 0 && config.audioWatchPath) {
          for (const exp of snapshot.pendingCompExports) {
            if (!exp.wavUrl || !exp.filename) continue;
            try {
              const target = path.join(config.audioWatchPath, exp.filename);
              await downloadCompExport(config, { wavUrl: exp.wavUrl, targetPath: target });
              await ackCompExport(config, exp.compId);
              console.log('[companion] delivered comp export', {
                compId: exp.compId,
                name: exp.name,
                target,
              });
            } catch (err) {
              console.warn('[companion] comp export delivery failed', {
                compId: exp.compId,
                error: (err as Error).message,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('[companion] sync loop error', error);
    }

    await sleep(config.pollMs);
  }
}

void run();
