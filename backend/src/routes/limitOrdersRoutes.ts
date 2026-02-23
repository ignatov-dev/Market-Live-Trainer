import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LimitOrderRepository } from '../repositories/limitOrderRepository.js';
import { LimitOrderEngine } from '../services/limitOrderEngine.js';
import { RealtimeGateway } from '../services/realtimeGateway.js';
import { AuthError, AuthService } from '../services/authService.js';

const createLimitOrderSchema = z.object({
  symbol: z.string().min(3),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive(),
  limitPrice: z.number().positive(),
  takeProfit: z.number().positive().nullable().optional().default(null),
  stopLoss: z.number().positive().nullable().optional().default(null),
});

const listLimitOrdersQuerySchema = z.object({
  status: z.enum(['pending', 'filled', 'canceled']).optional(),
});

function validateBrackets(
  side: 'long' | 'short',
  entryPrice: number,
  takeProfit: number | null,
  stopLoss: number | null,
): string | null {
  if (takeProfit !== null) {
    if (side === 'long' && takeProfit <= entryPrice) {
      return 'For long positions, takeProfit must be above entryPrice.';
    }

    if (side === 'short' && takeProfit >= entryPrice) {
      return 'For short positions, takeProfit must be below entryPrice.';
    }
  }

  if (stopLoss !== null) {
    if (side === 'long' && stopLoss >= entryPrice) {
      return 'For long positions, stopLoss must be below entryPrice.';
    }

    if (side === 'short' && stopLoss <= entryPrice) {
      return 'For short positions, stopLoss must be above entryPrice.';
    }
  }

  return null;
}

export function registerLimitOrderRoutes(
  app: FastifyInstance,
  dependencies: {
    repository: LimitOrderRepository;
    engine: LimitOrderEngine;
    realtime: RealtimeGateway;
    auth: AuthService;
    subscribeToSymbol: (symbol: string) => void;
  },
): void {
  const { repository, engine, realtime, auth, subscribeToSymbol } = dependencies;

  const requireUser = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> => {
    const token = auth.extractBearerToken(request.headers.authorization);
    if (!token) {
      await reply.code(401).send({ error: 'Missing bearer token.' });
      return null;
    }

    try {
      const identity = await auth.verifyAccessToken(token);
      return identity.userId;
    } catch (error) {
      const message = error instanceof AuthError ? error.message : 'Invalid token.';
      await reply.code(401).send({ error: message });
      return null;
    }
  };

  app.post('/api/limit-orders', async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) {
      return;
    }

    const parsed = createLimitOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const entryPrice = parsed.data.limitPrice;
    const positionSide = parsed.data.side === 'buy' ? 'long' : 'short';
    const bracketError = validateBrackets(
      positionSide,
      entryPrice,
      parsed.data.takeProfit,
      parsed.data.stopLoss,
    );
    if (bracketError) {
      return reply.code(400).send({ error: bracketError });
    }

    const order = await repository.createLimitOrder({
      userId,
      symbol: parsed.data.symbol.toUpperCase(),
      side: parsed.data.side,
      quantity: parsed.data.quantity,
      limitPrice: parsed.data.limitPrice,
      takeProfit: parsed.data.takeProfit,
      stopLoss: parsed.data.stopLoss,
    });

    engine.register(order);
    subscribeToSymbol(order.symbol);
    realtime.broadcastLimitOrder({
      type: 'limit_order.created',
      order,
      source: 'api',
    });

    return reply.code(201).send({ data: order });
  });

  app.get('/api/limit-orders', async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) {
      return;
    }

    const parsed = listLimitOrdersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const orders = await repository.listLimitOrders(userId, parsed.data.status);
    return reply.send({ data: orders });
  });

  app.post('/api/limit-orders/:id/cancel', async (request, reply) => {
    const userId = await requireUser(request, reply);
    if (!userId) {
      return;
    }

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const canceled = await repository.cancelLimitOrderIfPending(params.data.id, userId);
    if (!canceled) {
      return reply.code(409).send({ error: 'Limit order is already filled or not found.' });
    }

    engine.unregister(canceled.id, canceled.symbol);
    realtime.broadcastLimitOrder({
      type: 'limit_order.canceled',
      order: canceled,
      source: 'api',
    });

    return reply.send({ data: canceled });
  });
}
