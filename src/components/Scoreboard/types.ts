export type ScoreboardEntry = {
  userId: string;
  userName: string;
  netPnl: number;
};

export type RankedGroups = {
  gold: ScoreboardEntry[];
  silver: ScoreboardEntry[];
  bronze: ScoreboardEntry[];
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface ScoreboardUpdateMessage {
  type: 'scoreboard_update';
  payload: ScoreboardEntry[];
}
