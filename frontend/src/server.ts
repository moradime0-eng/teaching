import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { ɵsetAngularAppEngineManifest } from '@angular/ssr';
import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the SSR Express app.
 *
 * Why this is async:
 * The Angular CLI generates `angular-app-engine-manifest.mjs` as a sibling of
 * the bundled `server.mjs` but does NOT wire it into the entry point in the
 * legacy (non-`outputMode`) build path. `new AngularNodeAppEngine()` reads the
 * engine manifest via `ɵsetAngularAppEngineManifest`, and throws if it is
 * unset. We therefore dynamically import the manifest at runtime and register
 * it before instantiating the engine.
 */
async function buildApp(): Promise<express.Express> {
  const engineManifest = (
    await import(pathToFileURL(join(__dirname, 'angular-app-engine-manifest.mjs')).href)
  ).default;
  ɵsetAngularAppEngineManifest(engineManifest);

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

  return app;
}

/**
 * Cache the built app once bootstrap resolves. The Angular CLI dev-server
 * imports `reqHandler` and awaits it on every request, so awaiting the cached
 * promise there is safe. When this module is the main entry point, we start
 * listening once the cache resolves.
 */
let appPromise: Promise<express.Express> | undefined;

function getApp(): Promise<express.Express> {
  return (appPromise ??= buildApp());
}

type ReqHandler = (
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  next: (err?: unknown) => void,
) => Promise<void> | void;

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or
 * Firebase Cloud Functions. We rebuild the underlying handler lazily so the
 * engine manifest is registered before the first request.
 */
export const reqHandler: ReqHandler = (req, res, next) =>
  getApp().then((app) => {
    const handler = createNodeRequestHandler(
      app as unknown as Parameters<typeof createNodeRequestHandler>[0],
    ) as unknown as ReqHandler;
    return handler(req, res, next);
  });

/**
 * Start the server if this module is the main entry point. We start listening
 * only after the engine manifest is wired and the Express app is built.
 */
if (isMainModule(import.meta.url)) {
  getApp().then((app) => {
    const port = process.env['PORT'] || 4000;
    app.listen(port, (error) => {
      if (error) {
        throw error;
      }
      console.log(`Node Express server listening on http://localhost:${port}`);
    });
  });
}
