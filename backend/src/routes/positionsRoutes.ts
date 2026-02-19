import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PositionRepository } from '../repositories/positionRepository.js';
import { PositionEngine } from '../services/positionEngine.js';
import { RealtimeGateway } from '../services/realtimeGateway.js';

const createPositionSchema = z.object({
  userId: z.string().min(1),
  symbol: z.string().min(3),
  side: z.enum(['long', 'short']),
  entryPrice: z.number().positive(),
  takeProfit: z.number().positive().nullable().optional().default(null),
  stopLoss: z.number().positive().nullable().optional().default(null),
});

const closePositionSchema = z.object({
  userId: z.string().min(1),
  closePrice: z.number().positive(),
  reason: z.enum(['manual', 'system']).default('manual'),
});

const listPositionsQuerySchema = z.object({
  userId: z.string().min(1),
  status: z.enum(['open', 'closed']).optional(),
});

function validateBrackets(payload: z.infer<typeof createPositionSchema>): string | null {
  const { side, entryPrice, takeProfit, stopLoss } = payload;

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

export function registerPositionRoutes(
  app: FastifyInstance,
  dependencies: {
    repository: PositionRepository;
    engine: PositionEngine;
    realtime: RealtimeGateway;
    subscribeToSymbol: (symbol: string) => void;
  },
): void {
  const { repository, engine, realtime, subscribeToSymbol } = dependencies;

  app.post('/api/positions', async (request, reply) => {
    const parsed = createPositionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const error = validateBrackets(parsed.data);
    if (error) {
      return reply.code(400).send({ error });
    }

    const position = await repository.createPosition({
      userId: parsed.data.userId,
      symbol: parsed.data.symbol.toUpperCase(),
      side: parsed.data.side,
      entryPrice: parsed.data.entryPrice,
      takeProfit: parsed.data.takeProfit,
      stopLoss: parsed.data.stopLoss,
    });

    engine.register(position);
    subscribeToSymbol(position.symbol);
    realtime.broadcast({
      type: 'position.created',
      position,
      source: 'api',
    });

    return reply.code(201).send({ data: position });
  });

  app.get('/api/positions', async (request, reply) => {
    const parsed = listPositionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const positions = await repository.listPositions(parsed.data.userId, parsed.data.status);
    return reply.send({ data: positions });
  });

  app.post('/api/positions/:id/close', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const parsed = closePositionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const closed = await repository.closePositionIfOpen(params.data.id, {
      closePrice: parsed.data.closePrice,
      closeReason: parsed.data.reason,
      closedAt: new Date(),
      userId: parsed.data.userId,
    });

    if (!closed) {
      return reply.code(409).send({ error: 'Position is already closed or not found.' });
    }

    engine.unregister(closed.id, closed.symbol);
    realtime.broadcast({
      type: 'position.closed',
      position: closed,
      source: 'api',
    });

    return reply.send({ data: closed });
  });
}
