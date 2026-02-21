import type { EquityPoint } from '../../types/domain';

export function drawEquityCurve(
  canvas: HTMLCanvasElement,
  equityHistory: EquityPoint[],
): void {
  if (!canvas || equityHistory.length < 2) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, Math.floor(rect.width));
  const height = Math.max(100, Math.floor(rect.height));

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#f9fbff';
  ctx.fillRect(0, 0, width, height);

  const padding = 10;
  const values = equityHistory.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  const xFrom = (i: number) =>
    padding + (i / (equityHistory.length - 1)) * (width - padding * 2);
  const yFrom = (value: number) =>
    padding + (1 - (value - min) / span) * (height - padding * 2);

  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const y = padding + (i / 2) * (height - padding * 2);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.beginPath();
  equityHistory.forEach((point, index) => {
    const x = xFrom(index);
    const y = yFrom(point.equity);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  const isPositive = values[values.length - 1]! >= values[0]!;
  ctx.strokeStyle = isPositive ? '#0ea5e9' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.stroke();
}
