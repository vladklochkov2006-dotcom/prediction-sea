// --- НОВІ ТИПИ ---

export interface MatchState {
  blueScore: number;
  redScore: number;
  isCarryingOil: boolean;
  oilHolder: 'none' | 'BLUE' | 'RED'; // Для майбутнього: хто саме несе
}

export interface SystemLog {
  id: number;
  message: string;
  type: 'info' | 'warning' | 'success' | 'comms';