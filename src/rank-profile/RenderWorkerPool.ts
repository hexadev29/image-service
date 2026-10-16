import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import type { RenderService } from "../app.js";
import type {
  RankProfileCardInput,
  RenderResult,
} from "./rankProfile.types.js";
import type { RenderWorkerOptions } from "./renderWorker.js";

export type { RenderWorkerOptions };

interface WorkerMessage {
  id: number;
  ok: boolean;
  result?: RenderResult;
  error?: {
    message: string;
    name?: string;
    stack?: string;
    issues?: unknown;
  };
}

interface RenderJob {
  id: number;
  input: RankProfileCardInput;
  options?: RenderWorkerOptions;
  resolve: (result: RenderResult) => void;
  reject: (error: unknown) => void;
}

interface WorkerSlot {
  worker: Worker;
  current?: RenderJob;
}

export function getRenderWorkerUrl(): URL {
  const localJs = new URL("./renderWorker.js", import.meta.url);
  if (existsSync(fileURLToPath(localJs))) {
    return localJs;
  }
  const distJs = new URL(
    "../../dist/rank-profile/renderWorker.js",
    import.meta.url,
  );
  if (existsSync(fileURLToPath(distJs))) {
    return distJs;
  }
  try {
    execSync("npm run build", { stdio: "ignore" });
    if (existsSync(fileURLToPath(distJs))) {
      return distJs;
    }
  } catch {
    // Ignore build error and fallback
  }
  return localJs;
}

export class RenderWorkerPool implements RenderService {
  private readonly queue: RenderJob[] = [];
  private readonly workers: WorkerSlot[] = [];
  private nextJobId = 1;
  private closed = false;

  constructor(size = getDefaultRenderWorkerCount()) {
    const workerCount = Math.max(1, Math.floor(size));

    for (let index = 0; index < workerCount; index += 1) {
      this.workers.push(this.createWorkerSlot());
    }
  }

  get size(): number {
    return this.workers.length;
  }

  render(
    input: RankProfileCardInput,
    options?: RenderWorkerOptions,
  ): Promise<RenderResult> {
    if (this.closed) {
      return Promise.reject(new Error("Render worker pool is closed"));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        id: this.nextJobId,
        input,
        options,
        resolve,
        reject,
      });
      this.nextJobId += 1;
      this.dispatch();
    });
  }

  async close(): Promise<void> {
    this.closed = true;

    while (this.queue.length > 0) {
      this.queue.shift()?.reject(new Error("Render worker pool is closed"));
    }

    await Promise.allSettled(
      this.workers.map((slot) => slot.worker.terminate()),
    );
  }

  private createWorkerSlot(): WorkerSlot {
    const slot: WorkerSlot = {
      worker: new Worker(getRenderWorkerUrl(), {
        name: "rank-profile-renderer",
      }),
    };

    slot.worker.on("message", (message: WorkerMessage) => {
      const job = slot.current;
      slot.current = undefined;

      if (!job || job.id !== message.id) {
        this.dispatch();
        return;
      }

      if (message.ok && message.result) {
        job.resolve({
          ...message.result,
          buffer: Buffer.from(message.result.buffer),
        });
      } else {
        job.reject(toWorkerError(message.error));
      }

      this.dispatch();
    });

    slot.worker.on("error", (error) => {
      slot.current?.reject(error);
      slot.current = undefined;
    });

    slot.worker.on("exit", (code) => {
      if (this.closed) return;

      if (slot.current) {
        slot.current.reject(
          new Error(`Render worker exited before completing its job (${code})`),
        );
        slot.current = undefined;
      }

      this.replaceWorker(slot);
      this.dispatch();
    });

    return slot;
  }

  private replaceWorker(slot: WorkerSlot): void {
    const replacement = this.createWorkerSlot();
    slot.worker = replacement.worker;
  }

  private dispatch(): void {
    for (const slot of this.workers) {
      if (slot.current || this.queue.length === 0) continue;

      const job = this.queue.shift();
      if (!job) return;

      slot.current = job;
      slot.worker.postMessage({
        id: job.id,
        input: job.input,
        options: job.options,
      });
    }
  }
}

export function getDefaultRenderWorkerCount(): number {
  return Math.max(1, Math.min(availableParallelism(), 4));
}

function toWorkerError(error: WorkerMessage["error"]): Error {
  const normalized = new Error(error?.message ?? "Render worker failed");

  if (error?.name) normalized.name = error.name;
  if (error?.stack) normalized.stack = error.stack;

  return Object.assign(normalized, { issues: error?.issues });
}
