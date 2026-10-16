import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { loadEnv, type Plugin } from "vite";

// LOCAL DEV ONLY (`npm run dev`): serves the Vercel functions in api/ from the Vite dev
// server, so the chat, quote form and dashboard can be tried locally against the keys in
// .env. Production is unaffected -- Vercel runs api/ itself. Mirrors Vercel's file routing
// (api/chat/session/[id].ts -> /api/chat/session/:id) and the bits of VercelRequest /
// VercelResponse the handlers use (query, body, status(), json(), send()).

function resolveRoute(root: string, pathname: string): { file: string; params: Record<string, string> } | null {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean); // ["api", "chat", ...]
  let dir = root;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const dynamic = (suffix: string) => entries.find((e) => /^\[[^\]]+\]/.test(e) && e.endsWith(suffix));
    const last = i === segments.length - 1;
    if (last) {
      if (entries.includes(`${seg}.ts`)) return { file: path.join(dir, `${seg}.ts`), params };
      const dyn = dynamic(".ts");
      if (dyn) return { file: path.join(dir, dyn), params: { ...params, [dyn.slice(1, dyn.indexOf("]"))]: seg } };
      return null;
    }
    if (entries.includes(seg) && fs.statSync(path.join(dir, seg)).isDirectory()) {
      dir = path.join(dir, seg);
      continue;
    }
    const dynDir = entries.find((e) => /^\[[^\]]+\]$/.test(e));
    if (!dynDir) return null;
    params[dynDir.slice(1, -1)] = seg;
    dir = path.join(dir, dynDir);
  }
  return null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  // Handlers that check a signature over the exact bytes (api/stripe/webhook.ts) read this.
  (req as IncomingMessage & { rawBody?: string }).rawBody = raw;
  if (!raw) return undefined;
  if ((req.headers["content-type"] ?? "").includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function vercelResponse(res: ServerResponse) {
  const r = res as ServerResponse & Record<string, unknown>;
  r.status = (code: number) => {
    res.statusCode = code;
    return r;
  };
  r.json = (body: unknown) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return r;
  };
  r.send = (body: unknown) => {
    if (typeof body === "object" && body !== null && !Buffer.isBuffer(body)) return (r.json as (b: unknown) => unknown)(body);
    res.end(body as string);
    return r;
  };
  return r;
}

export function vercelApiDev(): Plugin {
  return {
    name: "blr-vercel-api-dev",
    apply: "serve",
    configureServer(server) {
      // Handlers read process.env (not import.meta.env), so load every .env key, not just VITE_*.
      const env = loadEnv(server.config.mode, server.config.root, "");
      for (const [key, value] of Object.entries(env)) if (process.env[key] === undefined) process.env[key] = value;

      const apiRoot = path.join(server.config.root, "api");
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const url = new URL(req.url, "http://localhost");
        const route = resolveRoute(path.dirname(apiRoot), url.pathname);
        const vres = vercelResponse(res);
        if (!route) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: `No function for ${url.pathname}` }));
          return;
        }
        try {
          const vreq = Object.assign(req, {
            query: { ...Object.fromEntries(url.searchParams), ...route.params },
            body: await readBody(req),
            cookies: {},
          });
          const mod = (await server.ssrLoadModule(route.file)) as { default: (req: unknown, res: unknown) => unknown };
          await mod.default(vreq, vres);
        } catch (err) {
          server.config.logger.error(`[api] ${url.pathname} failed: ${err instanceof Error ? err.stack : String(err)}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Function crashed -- see the dev server log." }));
          }
        }
      });
    },
  };
}
