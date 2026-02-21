import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  Session,
  Ticket,
  TicketSide,
  CoachReport,
  PatternNotification,
  PositionBracketEditor,
  Candle,
  MarksByPair,
  LocalPosition,
} from '../../types/domain';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface SessionState {
  session: Session;
  ticket: Ticket;
  ticketPreviewSide: TicketSide;
  coachReport: CoachReport | null;
  patternNotifications: PatternNotification[];
  positionBracketEditor: PositionBracketEditor;
}

const initialSession: Session = {
  replayIndex: 0,
  sequence: 1,
  balance: 10000,
  positions: [],
  pendingOrders: [],
  closedTrades: [],
  timeline: [],
  equityHistory: [{ index: 0, equity: 10000 }],
};

const initialTicket: Ticket = {
  type: 'market',
  qty: '',
  limitPrice: '',
  stopLoss: '',
  takeProfit: '',
};

const initialBracketEditor: PositionBracketEditor = {
  isOpen: false,
  positionId: null,
  stopLoss: '',
  takeProfit: '',
  error: '',
};

const initialState: SessionState = {
  session: initialSession,
  ticket: initialTicket,
  ticketPreviewSide: 'buy',
  coachReport: null,
  patternNotifications: [],
  positionBracketEditor: initialBracketEditor,
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    // Session replacement (used after async trading operations performed outside Redux)
    setSession(state, action: PayloadAction<Session>) {
      state.session = action.payload;
    },

    // Ticket
    setTicket(state, action: PayloadAction<Partial<Ticket>>) {
      state.ticket = { ...state.ticket, ...action.payload };
    },
    resetTicket(state, action: PayloadAction<{ limitPrice?: string }>) {
      state.ticket = { ...initialTicket, limitPrice: action.payload.limitPrice ?? '' };
    },
    setTicketPreviewSide(state, action: PayloadAction<TicketSide>) {
      state.ticketPreviewSide = action.payload;
    },

    // Coach report
    setCoachReport(state, action: PayloadAction<CoachReport | null>) {
      state.coachReport = action.payload;
    },

    // Pattern notifications
    addPatternNotification(state, action: PayloadAction<PatternNotification>) {
      state.patternNotifications = [action.payload, ...state.patternNotifications].slice(0, 5);
    },
    dismissPatternNotification(state, action: PayloadAction<string>) {
      state.patternNotifications = state.patternNotifications.filter((n) => n.id !== action.payload);
    },

    // Bracket editor modal
    openBracketEditor(
      state,
      action: PayloadAction<{ positionId: number; stopLoss: string; takeProfit: string }>,
    ) {
      state.positionBracketEditor = {
        isOpen: true,
        positionId: action.payload.positionId,
        stopLoss: action.payload.stopLoss,
        takeProfit: action.payload.takeProfit,
        error: '',
      };
    },
    closeBracketEditor(state) {
      state.positionBracketEditor = initialBracketEditor;
    },
    updateBracketEditor(state, action: PayloadAction<Partial<PositionBracketEditor>>) {
      state.positionBracketEditor = { ...state.positionBracketEditor, ...action.payload };
    },

    // Update backendPositionId on an open position after backend sync
    setBackendPositionId(
      state,
      action: PayloadAction<{ positionId: number; backendPositionId: string }>,
    ) {
      const pos = state.session.positions.find((p) => p.id === action.payload.positionId);
      if (pos) {
        pos.backendPositionId = action.payload.backendPositionId;
      }
      // Also update in closedTrades in case it was already closed
      const trade = state.session.closedTrades.find(
        (t) => t.positionId === action.payload.positionId,
      );
      if (trade) {
        trade.backendPositionId = action.payload.backendPositionId;
      }
    },

    // Update a position's brackets (TP/SL) in local session
    updateLocalPositionBrackets(
      state,
      action: PayloadAction<{
        positionId: number;
        takeProfit: number | null;
        stopLoss: number | null;
      }>,
    ) {
      const pos = state.session.positions.find((p) => p.id === action.payload.positionId);
      if (pos) {
        pos.takeProfit = action.payload.takeProfit;
        pos.stopLoss = action.payload.stopLoss;
      }
    },

    // Reset entire session
    resetSession(state, action: PayloadAction<{ initialCandle?: Candle | null }>) {
      const candle = action.payload.initialCandle;
      const startTs = candle?.timestamp ?? Date.now();
      const startIndex = candle?.index ?? 0;
      state.session = {
        ...initialSession,
        replayIndex: startIndex,
        timeline: [
          {
            id: `${startIndex}-${startTs}-init`,
            index: startIndex,
            timestamp: startTs,
            text: 'Session started with $10,000 virtual balance.',
          },
        ],
        equityHistory: [{ index: startIndex, equity: 10000 }],
      };
      state.coachReport = null;
      state.patternNotifications = [];
    },

    // Batch update positions list (used by position sync effects)
    updatePositionsList(state, action: PayloadAction<LocalPosition[]>) {
      state.session = { ...state.session, positions: action.payload };
    },
  },
});

export const {
  setSession,
  setTicket,
  resetTicket,
  setTicketPreviewSide,
  setCoachReport,
  addPatternNotification,
  dismissPatternNotification,
  openBracketEditor,
  closeBracketEditor,
  updateBracketEditor,
  setBackendPositionId,
  updateLocalPositionBrackets,
  resetSession,
  updatePositionsList,
} = sessionSlice.actions;

export default sessionSlice.reducer;
