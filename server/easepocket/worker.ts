import { cpus } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { scoreConsonantPrecisionFromDecoded } from "./consonant.ts";
import { decodeWav } from "./wav.ts";
import type { ConsonantTimingScore, EasePocketGrid } from "./types.ts";

type WorkerTaskRequest = {
  id: number;
  wavBuffer: Uint8Array;
  bpm: number;
  grid: EasePocketGrid;
  toleranceMs?: number;
  maxEvents?: number;
};

type WorkerTaskSuccess = {
  id: number;
  ok: true;
  durationSeconds: number;
  score: ConsonantTimingScore;
};

type WorkerTaskFailureCode =
  | "invalid_audio"
  | "too_short"
  | "too_long"
  | "internal";

type WorkerTaskFailure = {
  id: number;
  ok: false;
  code: WorkerTaskFailureCode;
  error: string;
};

type WorkerTaskResponse = WorkerTaskSuccess | WorkerTaskFailure;

type WorkerScoringParams = {
  wavBuffer: Buffer;
  bpm: number;
  grid: EasePocketGrid;
  toleranceMs?: number;
  maxEvents?: number;
};

type WorkerScoringResult = {
  durationSeconds: number;
  score: ConsonantTimingScore;
};

function normalizeEnvInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export class EasePocketWorkerTaskError extends Error {
  public readonly code: WorkerTaskFailureCode;

  constructor(message: string, code: WorkerTaskFailureCode) {
    super(message);
    this.name = "EasePocketWorkerTaskError";
    this.code = code;
  }
}

type PendingTask = {
  id: number;
  request: WorkerTaskRequest;
  resolve: (value: WorkerScoringResult) => void;
  reject: (reason: unknown) => void;
};

type WorkerSlot = {
  worker: Worker | null;
  index: number;
  busy: boolean;
  task: PendingTask | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

const HARD_MIN_DURATION_SECONDS = 0.3;
const HARD_MAX_DURATION_SECONDS = 20;

function resolveWorkerEntryFile(): string {
  if (!isMainThread) {
    return fileURLToPath(import.meta.url);
  }

  const sourceEntryPath = path.resolve(
    process.cwd(),
    "server/easepocket/worker.ts"
  );
  if (existsSync(sourceEntryPath)) {
    return sourceEntryPath;
  }

  // Fallback for environments that package source files differently.
  return fileURLToPath(import.meta.url);
}

const WORKER_ENTRY_FILE = resolveWorkerEntryFile();

function createWorkerTaskResponse(request: WorkerTaskRequest): WorkerTaskResponse {
  try {
    const wavBuffer = Buffer.from(request.wavBuffer);
    const decoded = decodeWav(wavBuffer);
    const durationSeconds = decoded.samples.length / decoded.sampleRate;
    if (durationSeconds < HARD_MIN_DURATION_SECONDS) {
      return {
        id: request.id,
        ok: false,
        code: "too_short",
        error: "Recording too short. Please record at least 0.3 seconds.",
      };
    }
    if (durationSeconds > HARD_MAX_DURATION_SECONDS) {
      return {
        id: request.id,
        ok: false,
        code: "too_long",
        error: "Recording too long. Keep takes under 20 seconds.",
      };
    }

    const score = scoreConsonantPrecisionFromDecoded({
      decoded,
      bpm: request.bpm,
      grid: request.grid,
      toleranceMs: request.toleranceMs,
      maxEvents: request.maxEvents,
    });

    return {
      id: request.id,
      ok: true,
      durationSeconds,
      score,
    };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      code: "invalid_audio",
      error:
        error instanceof Error
          ? error.message
          : "Invalid or unsupported audio input.",
    };
  }
}

if (!isMainThread && parentPort) {
  parentPort.on("message", (request: WorkerTaskRequest) => {
    const response = createWorkerTaskResponse(request);
    parentPort?.postMessage(response);
  });
}

class EasePocketWorkerPool {
  private readonly workers: WorkerSlot[] = [];
  private readonly queue: PendingTask[] = [];
  private nextTaskId = 1;

  private readonly queueLimit: number;
  private readonly taskTimeoutMs: number;

  constructor() {
    const cpuCount = Math.max(1, cpus().length);
    const configuredWorkers = normalizeEnvInt(
      process.env.EASEPOCKET_WORKER_COUNT,
      Math.min(2, cpuCount)
    );
    const workerCount = Math.max(1, Math.min(4, configuredWorkers));

    this.queueLimit = Math.max(
      4,
      normalizeEnvInt(process.env.EASEPOCKET_WORKER_QUEUE_LIMIT, 32)
    );
    this.taskTimeoutMs = Math.max(
      2_000,
      normalizeEnvInt(process.env.EASEPOCKET_WORKER_TASK_TIMEOUT_MS, 15_000)
    );

    for (let i = 0; i < workerCount; i += 1) {
      this.workers.push(this.createSlot(i));
    }
  }

  async run(params: WorkerScoringParams): Promise<WorkerScoringResult> {
    const inFlight = this.workers.filter((slot) => slot.busy).length;
    const pendingCount = this.queue.length + inFlight;
    if (pendingCount >= this.queueLimit) {
      throw new EasePocketWorkerTaskError(
        "EasePocket scoring queue is busy. Please retry shortly.",
        "internal"
      );
    }

    const taskId = this.nextTaskId++;
    const request: WorkerTaskRequest = {
      id: taskId,
      wavBuffer: new Uint8Array(params.wavBuffer),
      bpm: params.bpm,
      grid: params.grid,
      toleranceMs: params.toleranceMs,
      maxEvents: params.maxEvents,
    };

    return await new Promise<WorkerScoringResult>((resolve, reject) => {
      this.queue.push({
        id: taskId,
        request,
        resolve,
        reject,
      });
      this.drain();
    });
  }

  private createWorker(): Worker {
    if (WORKER_ENTRY_FILE.endsWith(".ts")) {
      const bootstrapScript = `
        require("tsx/cjs");
        require(${JSON.stringify(WORKER_ENTRY_FILE)});
      `;
      return new Worker(bootstrapScript, {
        workerData: { role: "easepocket-scorer" },
        eval: true,
      });
    }

    return new Worker(WORKER_ENTRY_FILE, {
      workerData: { role: "easepocket-scorer" },
    });
  }

  private attachWorkerHandlers(slot: WorkerSlot, worker: Worker) {
    slot.worker = worker;

    worker.on("message", (response: WorkerTaskResponse) => {
      if (!slot.task || response.id !== slot.task.id) {
        return;
      }

      if (slot.timeoutId) {
        clearTimeout(slot.timeoutId);
        slot.timeoutId = null;
      }

      const currentTask = slot.task;
      slot.task = null;
      slot.busy = false;

      if (response.ok) {
        currentTask.resolve({
          durationSeconds: response.durationSeconds,
          score: response.score,
        });
      } else {
        currentTask.reject(
          new EasePocketWorkerTaskError(response.error, response.code)
        );
      }

      this.drain();
    });

    worker.on("error", (error) => {
      this.restartSlot(slot, error, "EasePocket scoring worker crashed.");
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        this.restartSlot(
          slot,
          new Error(`Worker exited with code ${code}`),
          "EasePocket scoring worker crashed."
        );
      }
    });
  }

  private createSlot(index: number): WorkerSlot {
    const worker = this.createWorker();

    const slot: WorkerSlot = {
      worker,
      index,
      busy: false,
      task: null,
      timeoutId: null,
    };

    this.attachWorkerHandlers(slot, worker);

    return slot;
  }

  private restartSlot(slot: WorkerSlot, reason: unknown, taskErrorMessage: string) {
    if (slot.timeoutId) {
      clearTimeout(slot.timeoutId);
      slot.timeoutId = null;
    }

    const pendingTask = slot.task;
    slot.task = null;
    slot.busy = false;

    if (pendingTask) {
      pendingTask.reject(
        new EasePocketWorkerTaskError(
          taskErrorMessage,
          "internal"
        )
      );
    }

    const oldWorker = slot.worker;
    try {
      oldWorker?.removeAllListeners();
    } catch {
      // Ignore listener cleanup errors.
    }
    void oldWorker?.terminate().catch(() => undefined);
    slot.worker = null;

    console.error("EasePocket worker crash:", reason);
    this.drain();
  }

  private drain() {
    for (const slot of this.workers) {
      if (slot.busy) {
        continue;
      }

      const task = this.queue.shift();
      if (!task) {
        return;
      }

      slot.busy = true;
      slot.task = task;
      slot.timeoutId = setTimeout(() => {
        if (!slot.task || slot.task.id !== task.id) {
          return;
        }

        this.restartSlot(
          slot,
          new Error("Worker task timeout"),
          "EasePocket scoring timed out. Please retry."
        );
      }, this.taskTimeoutMs);

      if (!slot.worker) {
        try {
          this.attachWorkerHandlers(slot, this.createWorker());
        } catch (error) {
          const failedTask = slot.task;
          slot.task = null;
          slot.busy = false;
          if (slot.timeoutId) {
            clearTimeout(slot.timeoutId);
            slot.timeoutId = null;
          }
          failedTask?.reject(
            new EasePocketWorkerTaskError(
              `EasePocket worker could not start: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              "internal"
            )
          );
          continue;
        }
      }

      const activeWorker = slot.worker;
      if (!activeWorker) {
        slot.busy = false;
        slot.task = null;
        if (slot.timeoutId) {
          clearTimeout(slot.timeoutId);
          slot.timeoutId = null;
        }
        task.reject(
          new EasePocketWorkerTaskError(
            "EasePocket worker unavailable. Please retry.",
            "internal"
          )
        );
        continue;
      }

      activeWorker.postMessage(task.request);
    }
  }
}

let easePocketWorkerPoolSingleton: EasePocketWorkerPool | null = null;

function getEasePocketWorkerPool(): EasePocketWorkerPool {
  if (!easePocketWorkerPoolSingleton) {
    easePocketWorkerPoolSingleton = new EasePocketWorkerPool();
  }
  return easePocketWorkerPoolSingleton;
}

export async function scoreConsonantPrecisionInWorker(
  params: WorkerScoringParams
): Promise<WorkerScoringResult> {
  const workerDisabled = process.env.EASEPOCKET_DISABLE_WORKER === "true";
  if (workerDisabled) {
    const decoded = decodeWav(params.wavBuffer);
    const durationSeconds = decoded.samples.length / decoded.sampleRate;
    if (durationSeconds < HARD_MIN_DURATION_SECONDS) {
      throw new EasePocketWorkerTaskError(
        "Recording too short. Please record at least 0.3 seconds.",
        "too_short"
      );
    }
    if (durationSeconds > HARD_MAX_DURATION_SECONDS) {
      throw new EasePocketWorkerTaskError(
        "Recording too long. Keep takes under 20 seconds.",
        "too_long"
      );
    }
    const score = scoreConsonantPrecisionFromDecoded({
      decoded,
      bpm: params.bpm,
      grid: params.grid,
      toleranceMs: params.toleranceMs,
      maxEvents: params.maxEvents,
    });
    return { durationSeconds, score };
  }

  return await getEasePocketWorkerPool().run(params);
}
