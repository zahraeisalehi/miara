import { createServer, type Server } from 'node:http';

// Demo app that Miara deploys and diagnoses. Switchable faults arrive in Phase 3/5.
export function createApp(): Server {
  return createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('buggy-app is running\n');
  });
}
