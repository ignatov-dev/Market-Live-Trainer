import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PositionRepository } from '../repositories/positionRepository.js';
import { PositionEngine } from '../services/positionEngine.js';
import { RealtimeGateway } from '../services/realtimeGateway.js';

const createPositionSchema = z.object({
  userId: z.string().min(1),
  symbol: z.string().min(3),
  side: z.enum(['long', 'short']),
  quantity: z.number().positive(),
  entryPrice: z.number().positive(),
  takeProfit: z.number().positive().nullable().optional().default(null),
  stopLoss: z.number().positive().nullable().optional().default(null),
});

const closePositionSchema = z.object({
  userId: z.string().min(1),
  closePrice: z.number().positive(),
  reason: z.enum(['manual', 'system']).default('manual'),
});

const updateBracketsSchema = z.object({
  userId: z.string().min(1),
  takeProfit: z.number().positive().nullable(),
  stopLoss: z.number().positive().nullable(),
});

const listPositionsQuerySchema = z.object({
  userId: z.string().min(1),
  status: z.enum(['open', 'closed']).optional(),
});

const listClosedPositionsQuerySchema = z.object({
  userId: z.string().min(1),
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

    const error = validateBrackets(
      parsed.data.side,
      parsed.data.entryPrice,
      parsed.data.takeProfit,
      parsed.data.stopLoss,
    );
    if (error) {
      return reply.code(400).send({ error });
    }

    const position = await repository.createPosition({
      userId: parsed.data.userId,
      symbol: parsed.data.symbol.toUpperCase(),
      side: parsed.data.side,
      quantity: parsed.data.quantity,
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

  app.get('/api/positions/closed', async (request, reply) => {
    const parsed = listClosedPositionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const positions = await repository.listPositions(parsed.data.userId, 'closed');
    return reply.send({ data: positions });
  });

  app.patch('/api/positions/:id/brackets', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const parsed = updateBracketsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const existing = await repository.getPositionById(params.data.id, parsed.data.userId);
    if (!existing) {
      return reply.code(404).send({ error: 'Position not found.' });
    }

    if (existing.status !== 'open') {
      return reply.code(409).send({ error: 'Position is already closed.' });
    }

    const error = validateBrackets(
      existing.side,
      existing.entryPrice,
      parsed.data.takeProfit,
      parsed.data.stopLoss,
    );
    if (error) {
      return reply.code(400).send({ error });
    }

    const updated = await repository.updatePositionBracketsIfOpen(params.data.id, {
      userId: parsed.data.userId,
      takeProfit: parsed.data.takeProfit,
      stopLoss: parsed.data.stopLoss,
    });

    if (!updated) {
      return reply.code(409).send({ error: 'Position is already closed or not found.' });
    }

    engine.register(updated);
    return reply.send({ data: updated });
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
