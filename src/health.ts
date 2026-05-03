/**
 * Health Check HTTP Server for Home Assistant Watchdog
 */

import http from 'http';
import { Logger } from 'pino';

export function createHealthServer(port: number, logger: Logger, isHealthy: () => boolean) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      const healthy = isHealthy();
      res.statusCode = healthy ? 200 : 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: healthy ? 'ok' : 'unhealthy',
        timestamp: new Date().toISOString(),
      }));
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Health endpoint listening');
  });

  return server;
}
