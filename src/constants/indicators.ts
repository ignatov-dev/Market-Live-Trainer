export const SMA_PERIODS = [50, 100, 200] as const;

export type SmaPeriod = (typeof SMA_PERIODS)[number];

export type SmaConfig = Record<SmaPeriod, boolean>;

export const DEFAULT_SMA_CONFIG: SmaConfig = {
  50: true,
  100: true,
  200: true,
};

export const SMA_COLORS: Record<SmaPeriod, string> = {
  50: '#1d4ed8',
  100: '#0f766e',
  200: '#b45309',
};
