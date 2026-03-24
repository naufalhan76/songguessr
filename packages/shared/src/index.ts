export * from './types';

// Utility functions
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous characters
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function calculateScore(
  isCorrect: boolean,
  timeTakenMs: number,
  roundDurationMs: number = 30000
): number {
  if (!isCorrect) return 0;
  
  const basePoints = 100;
  const timeFraction = Math.max(0, (roundDurationMs - timeTakenMs) / roundDurationMs);
  const multiplier = 1 + timeFraction; // 1x to 2x based on speed
  return Math.round(basePoints * multiplier);
}