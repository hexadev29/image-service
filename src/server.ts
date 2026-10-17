import cluster from "node:cluster";
import { availableParallelism } from "node:os";

import { buildApp } from "./app.js";
import { RenderWorkerPool } from "./rank-profile/RenderWorkerPool.js";

const port = Number(process.env.PORT ?? 9000);
const host = process.env.HOST ?? "0.0.0.0";
// Tune cluster concurrency to prevent runaway multi-process RAM multiplication
const clusterEnabled = process.env.CLUSTER_MODE === "true";
const defaultConcurrency = Math.max(1, Math.min(availableParallelism(), 2));
const clusterWorkers = readPositiveInt(
  process.env.WEB_CONCURRENCY,
  defaultConcurrency,
);
const renderWorkerThreads = readPositiveInt(
  process.env.RENDER_WORKER_THREADS,
  1,
);
const workerRestartLimit = readPositiveInt(
  process.env.WORKER_RESTART_LIMIT,
  10,
);
let workerRestartCount = 0;

if (clusterEnabled && cluster.isPrimary && clusterWorkers > 1) {
  console.log(
    `Primary ${process.pid} starting ${clusterWorkers} workers with ${renderWorkerThreads} render thread(s) each`,
  );

  for (let index = 0; index < clusterWorkers; index += 1) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    workerRestartCount += 1;
    console.error(
      `Worker ${worker.process.pid} exited (${signal ?? code}); restart ${workerRestartCount}/${workerRestartLimit}`,
    );

    if (workerRestartCount > workerRestartLimit) {
      console.error("Worker restart limit exceeded; stopping primary process");
      process.exit(1);
    }

    cluster.fork();
  });
} else {
  const renderer = new RenderWorkerPool(renderWorkerThreads);
  const app = buildApp({ renderer });

  app
    .listen({ port, host })
    .then(() => {
      app.log.info(
        {
          pid: process.pid,
          port,
          host,
          renderWorkerThreads,
          clustered: cluster.isWorker,
        },
        "server listening",
      );
    })
    .catch((e) => {
      app.log.error(e);
      process.exit(1);
    });
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}
