import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_JWKS_URL: z.string().default(''),
  AUTH_ISSUER: z.string().default(''),
  AUTH_AUDIENCE: z.string().default(''),
  AUTH_CLOCK_SKEW_SECONDS: z.coerce.number().int().nonnegative().default(30),
  AUTH_JWKS_CACHE_TTL_MS: z.coerce.number().int().positive().default(300_000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COINBASE_WS_URL: z.string().default('wss://ws-feed.exchange.coinbase.com'),
  COINBASE_PRODUCTS: z.string().default('BTC-USD,ETH-USD,SOL-USD,XRP-USD'),
  WS_RECONNECT_BASE_MS: z.coerce.number().int().positive().default(1000),
  WS_RECONNECT_MAX_MS: z.coerce.number().int().positive().default(30_000),
  WS_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${errors.join('\n')}`);
}

const data = parsed.data;

export const config = {
  nodeEnv: data.NODE_ENV,
  port: data.PORT,
  host: data.HOST,
  databaseUrl: data.DATABASE_URL,
  authJwksUrl: data.AUTH_JWKS_URL.trim(),
  authIssuer: data.AUTH_ISSUER.trim() || null,
  authAudience: data.AUTH_AUDIENCE.split(',').map((item) => item.trim()).filter(Boolean),
  authClockSkewSeconds: data.AUTH_CLOCK_SKEW_SECONDS,
  authJwksCacheTtlMs: data.AUTH_JWKS_CACHE_TTL_MS,
  corsOrigin: data.CORS_ORIGIN,
  coinbaseWsUrl: data.COINBASE_WS_URL,
  coinbaseProducts: data.COINBASE_PRODUCTS.split(',').map((item) => item.trim()).filter(Boolean),
  reconnectBaseMs: data.WS_RECONNECT_BASE_MS,
  reconnectMaxMs: data.WS_RECONNECT_MAX_MS,
  heartbeatTimeoutMs: data.WS_HEARTBEAT_TIMEOUT_MS,
};
