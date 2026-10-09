import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { routeRouter } from './routes/route';
import { libraryRouter } from './routes/library';
import { shareRouter } from './routes/share';
import { placesRouter } from './routes/places';
import { attachSockets } from './sockets';
import { UserError } from './services/http';

const PORT = Number(process.env.PORT ?? 3001);
const ORIGIN = process.env.CORS_ORIGIN?.split(',') ?? true;

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '8mb' })); // GPX files can be large
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', routeRouter, libraryRouter, shareRouter, placesRouter);

// Serve the built PWA in production (`npm run build && npm start`).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(err instanceof UserError ? 422 : 502).json({ error: err.message });
});

const server = http.createServer(app);
attachSockets(new Server(server, { cors: { origin: ORIGIN } }));
server.listen(PORT, () => console.log(`ApexRide API on :${PORT}`));
