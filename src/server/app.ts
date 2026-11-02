import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { redactKey } from '../config.js';
import type { AppDeps } from './deps.js';
import { digestRoutes } from './routes/digests.js';
import { favoriteRoutes } from './routes/favorites.js';
import { settingsRoutes } from './routes/settings.js';
import { sourceRoutes } from './routes/sources.js';
import { BadRequest } from './validate.js';

export function createApp(deps: AppDeps) {
  const api = new Hono()
    .route('/', digestRoutes(deps))
    .route('/', favoriteRoutes(deps))
    .route('/', sourceRoutes(deps))
    .route('/', settingsRoutes(deps));

  const app = new Hono()
    .onError((err, c) => {
      if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
      return c.json({ error: redactKey(err.message || 'Internal error', deps.getConfig()) }, 500);
    })
    .route('/api', api);

  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
  app.use('/*', serveStatic({ root: deps.webDir }));
  app.get('/*', async (c) => c.html(await readFile(join(deps.webDir, 'index.html'), 'utf8')));
  return app;
}

export type AppType = ReturnType<typeof createApp>;
