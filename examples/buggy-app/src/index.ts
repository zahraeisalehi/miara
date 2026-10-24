import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';

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

// Listen only when run directly (`npm start` on Liara), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`buggy-app listening on ${port}`));
}
