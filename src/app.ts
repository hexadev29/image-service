import Fastify from "fastify";
import { RankProfileCardRenderer } from "./rank-profile/RankProfileCardRenderer.js";

import type {
  RankProfileCardInput,
  RenderResult,
} from "./rank-profile/rankProfile.types.js";

export interface RenderService {
  render(input: RankProfileCardInput): Promise<RenderResult>;
  close?(): Promise<void>;
}

interface BuildAppOptions {
  renderer?: RenderService;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ bodyLimit: 1024 * 1024 });
  const renderer: RenderService =
    options.renderer ?? new RankProfileCardRenderer();

  if (renderer.close) {
    app.addHook("onClose", async () => {
      await renderer.close?.();
    });
  }

  app.post("/v1/rank-profile/render", async (req, reply) => {
    try {
      const start = performance.now();
      const result = await renderer.render(req.body as RankProfileCardInput);
      req.log.info(
        { durationMs: Number((performance.now() - start).toFixed(2)) },
        "rank profile rendered",
      );
      return reply
        .type(result.contentType)
        .header("Content-Disposition", `inline; filename=${result.filename}`)
        .send(result.buffer);
    } catch (error: any) {
      if (error?.name === "ZodError")
        return reply
          .code(400)
          .send({ error: "invalid_rank_profile_data", issues: error.issues });
      return reply.code(500).send({ error: "render_failed" });
    }
  });

  return app;
}
