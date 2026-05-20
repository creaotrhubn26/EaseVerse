import { listTakesForGroup, setBestTakeFlags } from "./takes-db.js";

export type CompositeScore = {
  takeId: string;
  score: number;
  components: {
    timing: number | null;
    pronunciation: number | null;
    pitchStability: number | null;
    energyConsistency: number | null;
  };
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// pitch_stddev_cents: 0 = locked, ~50+ = unstable. Lower is better.
function pitchStabilityFromStddev(stddev: number | null): number | null {
  if (stddev === null || !Number.isFinite(stddev)) return null;
  return 100 - clamp((stddev / 50) * 100, 0, 100);
}

// energy_stddev_db: 0 = perfectly even, ~15+ = wildly dynamic. Lower is better.
function energyConsistencyFromStddev(stddev: number | null): number | null {
  if (stddev === null || !Number.isFinite(stddev)) return null;
  return 100 - clamp((stddev / 15) * 100, 0, 100);
}

export function scoreComposite(args: {
  timingScore: number | null;
  pronunciationScore: number | null;
  pitchStddevCents: number | null;
  energyStddevDb: number | null;
}): CompositeScore["components"] & { score: number } {
  const components = {
    timing: args.timingScore,
    pronunciation: args.pronunciationScore,
    pitchStability: pitchStabilityFromStddev(args.pitchStddevCents),
    energyConsistency: energyConsistencyFromStddev(args.energyStddevDb),
  };
  const present = Object.values(components).filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (present.length === 0) return { ...components, score: 0 };
  const score = present.reduce((sum, v) => sum + v, 0) / present.length;
  return { ...components, score };
}

export async function rankAndMarkBestTake(
  userId: string,
  externalTrackId: string,
): Promise<{ best: CompositeScore | null; ranked: CompositeScore[] }> {
  const takes = await listTakesForGroup(userId, externalTrackId);
  const doneWithAnalysis = takes.filter((t) => t.status === "done" && t.analysis);

  if (doneWithAnalysis.length === 0) return { best: null, ranked: [] };

  const ranked: CompositeScore[] = doneWithAnalysis.map((t) => {
    const a = t.analysis!;
    const result = scoreComposite({
      timingScore: a.timingScore,
      pronunciationScore: a.pronunciationScore,
      pitchStddevCents: a.pitchStddevCents,
      energyStddevDb: a.energyStddevDb,
    });
    return {
      takeId: t.id,
      score: result.score,
      components: {
        timing: result.timing,
        pronunciation: result.pronunciation,
        pitchStability: result.pitchStability,
        energyConsistency: result.energyConsistency,
      },
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  await setBestTakeFlags(externalTrackId, userId, best.takeId);
  return { best, ranked };
}
