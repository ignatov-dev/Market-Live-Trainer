import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { pool, closeDb } from './db.js';
import { runMigrations } from './migrate.js';
import { PositionRepository } from './repositories/positionRepository.js';
import { CoinbaseTickerService } from './services/coinbaseTickerService.js';
import { PositionEngine } from './services/positionEngine.js';
import { RealtimeGateway } from './services/realtimeGateway.js';
import { registerPositionRoutes } from './routes/positionsRoutes.js';

async function main(): Promise<void> {
  await runMigrations();

  const app = Fastify({ logger: config.nodeEnv !== 'production' });

  await app.register(cors, {
    origin: config.corsOrigin.split(',').map((item) => item.trim()),
    credentials: true,
  });

  const repository = new PositionRepository(pool);
  const realtime = new RealtimeGateway(app.server);
  const engine = new PositionEngine(repository, realtime);

  await engine.bootstrap();

  const ticker = new CoinbaseTickerService({
    url: config.coinbaseWsUrl,
    products: config.coinbaseProducts,
    reconnectBaseMs: config.reconnectBaseMs,
    reconnectMaxMs: config.reconnectMaxMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
  });

  const openPositions = await repository.listOpenPositions();
  for (const position of openPositions) {
    ticker.addProduct(position.symbol);
  }

  ticker.on('connected', () => {
    app.log.info('Connected to Coinbase websocket.');
  });

  ticker.on('disconnected', () => {
    app.log.warn('Disconnected from Coinbase websocket, reconnecting.');
  });

  ticker.on('error', (error) => {
    app.log.error({ err: error }, 'Coinbase websocket error');
  });

  ticker.on('tick', (tick) => {
    void engine.onTick(tick).catch((error) => {
      app.log.error({ err: error, tick }, 'Failed to process tick');
    });
  });

  registerPositionRoutes(app, {
    repository,
    engine,
    realtime,
    subscribeToSymbol: (symbol) => ticker.addProduct(symbol),
  });

  app.get('/health', async () => ({
    ok: true,
    service: 'market-replay-backend',
    timestamp: new Date().toISOString(),
  }));

  const close = async () => {
    ticker.stop();
    realtime.close();
    await app.close();
    await closeDb();
  };

  process.on('SIGINT', async () => {
    await close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await close();
    process.exit(0);
  });

  ticker.start();

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
