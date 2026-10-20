/** PCM level statistics are observations, not a validated vocal performance score.
 * Historic LLM notes/scores and the heuristic best-take flag are deliberately
 * not part of the collaboration payload. */
export function coachingEvidence(row: Record<string, unknown>) {
  const metric = (value: unknown, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
  const date = row.processed_at instanceof Date && Number.isFinite(row.processed_at.getTime()) ? row.processed_at.toISOString() : typeof row.processed_at === 'string' ? row.processed_at : '';
  const processedAt = date && Number.isFinite(Date.parse(date)) ? date : null;
  const energyAvgDb = processedAt ? metric(row.energy_avg_db, -180, 12) : null;
  const energyStddevDb = energyAvgDb !== null ? metric(row.energy_stddev_db, 0, 180) : null;
  return {
    takeId: String(row.id), filename: String(row.filename || 'take.wav'),
    decision: row.producer_decision === 'keeper' || row.producer_decision === 'redo' ? row.producer_decision : null,
    analysisBasis: 'pcm-level-statistics',
    analysisStatus: energyAvgDb === null ? 'unavailable' : 'limited',
    energyAvgDb, energyStddevDb, processedAt,
    timingScore: null, pronunciationScore: null, aiNotes: null, bestInGroup: false,
  };
}

/** Only statements justified by the waveform measurement are generated here. */
export function measuredTakeNotes(energyAvgDb: number | null): string {
  const measured = typeof energyAvgDb === 'number' && Number.isFinite(energyAvgDb) && energyAvgDb >= -180 && energyAvgDb <= 12;
  return (measured ? `Measured average RMS level: ${energyAvgDb.toFixed(1)} dBFS. ` : 'Audio level measurement is unavailable. ')
    + 'Timing, pronunciation and musical performance have not been assessed.';
}
