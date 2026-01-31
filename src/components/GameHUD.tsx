import React from 'react';
import { Minimap } from './MiniMap';
import * as THREE from 'three';
import { SystemLog, MatchState } from '../types';

// Описуємо структуру гравця для мінікарти
interface MinimapPlayer {
  id: string;
  position: { x: number; z: number };
  team: string;
}

interface GameHUDProps {
  speed: number;
  gameState: string;
  showInteract: boolean;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  playerRotRef: React.MutableRefObject<number>;
  logs: SystemLog[];
  health: number;
  playerTeam: string;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  reloadTime: number;
  matchState: MatchState;
  matchTime: number;
  countdownValue?: number;
  lastScorer?: string | null;

  // --- ДОДАНО: Список гравців ---
  players: MinimapPlayer[];
}

export const GameHUD: React.FC<GameHUDProps> = ({
  speed,
  gameState,
  showInteract,
  playerPosRef,
  playerRotRef,
  logs,
  health,
  playerTeam,
  ammo,
  maxAmmo,
  isReloading,
  reloadTime,
  matchState,
  matchTime,
  countdownValue = 0,
  lastScorer,
  // --- ДОДАНО ---
  players
}) => {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ЕКРАН ПЕРЕМОГИ
  if (gameState === 'game_over') {
    const isWin = matchState.blueScore > matchState.redScore;
    const isDraw = matchState.blueScore === matchState.redScore;
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-[100] pointer-events-auto select-none">
        <div className="flex flex-col items-center gap-6 p-12 w-full bg-gradient-to-r from-transparent via-slate-900/90 to-transparent">
          <h1 className={`text-8xl font-black font-mono tracking-tighter ${isWin ? 'text-blue-500 drop-shadow-[0_0_30px_blue]' : isDraw ? 'text-white' : 'text-red-500 drop-shadow-[0_0_30px_red]'}`}>
            {isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT'}
          </h1>
          <div className="flex gap-12 text-4xl font-mono font-bold mt-4">
            <span className="text-blue-400">BLUE: {matchState.blueScore}</span>
            <span className="text-slate-600">|</span>
            <span className="text-red-500">RED: {matchState.redScore}</span>
          </div>
          <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-white text-black font-bold font-mono hover:bg-cyan-400 transition-colors rounded">
            RETURN TO LOBBY
          </button>
        </div>
      </div>
    );
  }

  if (gameState !== 'playing' && gameState !== 'countdown') return null;

  let hpColor = 'bg-cyan-400';
  let hpShadow = 'shadow-[0_0_10px_cyan]';
  if (health < 60) { hpColor = 'bg-yellow-400'; hpShadow = 'shadow-[0_0_10px_orange]'; }
  if (health < 30) { hpColor = 'bg-red-500'; hpShadow = 'shadow-[0_0_15px_red] animate-pulse'; }

  const isRed = playerTeam === 'RED';
  const teamColorText = isRed ? 'text-red-500' : 'text-cyan-400';
  const teamBorder = isRed ? 'border-red-500/50' : 'border-cyan-500/50';
  const teamBg = isRed ? 'bg-red-900/20' : 'bg-cyan-900/20';

  return (
    <div className="absolute inset-0 pointer-events-none select-none p-6 flex flex-col justify-between overflow-hidden">

      {gameState === 'countdown' && countdownValue > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[100] bg-black/40 backdrop-blur-[2px]">
          {lastScorer && (
            <div className="text-4xl font-black font-mono text-white mb-4 animate-bounce tracking-widest drop-shadow-[0_0_15px_blue]">
              {lastScorer} SCORED!
            </div>
          )}
          <div className="text-[10rem] font-black font-mono text-yellow-400 animate-ping drop-shadow-[0_0_50px_orange]">
            {countdownValue}
          </div>
          <div className="text-xl font-mono text-white mt-8 tracking-[0.5em]">PREPARE FOR NEXT ROUND</div>
        </div>
      )}

      <div className="absolute inset-0 z-0 transition-opacity duration-500" style={{ background: 'radial-gradient(circle, transparent 60%, rgba(255, 0, 0, 0.4) 100%)', opacity: health < 40 ? (40 - health) / 40 : 0 }}>
        {health < 20 && <div className="absolute inset-0 bg-red-500/10 animate-pulse"></div>}
      </div>

      <div className="absolute top-0 left-0 w-full flex justify-center z-50">
        <div className="flex flex-col items-center">
          <div className="bg-slate-900/90 border-x border-t border-slate-700 px-6 py-1 rounded-t-lg -mb-1 z-0">
            <span className={`font-mono font-bold text-xl tracking-widest ${matchTime < 60 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {formatTime(matchTime)}
            </span>
          </div>
          <div className="flex items-center gap-6 bg-black/80 backdrop-blur-md px-10 py-3 rounded-b-2xl border border-slate-700 shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-10 relative">
            <div className="flex flex-col items-center">
              <span className="text-blue-500 font-black text-4xl font-mono leading-none drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">{matchState.blueScore}</span>
              <span className="text-blue-400/60 text-[10px] tracking-[0.3em] font-bold">BLUE</span>
            </div>
            <div className="flex flex-col items-center px-4 border-x border-slate-700/50">
              <div className={`w-3 h-3 rounded-full mb-2 shadow-[0_0_10px_currentColor] transition-colors duration-300 ${matchState.isCarryingOil ? 'bg-yellow-400 text-yellow-400 animate-pulse' : 'bg-slate-600 text-slate-600'}`}></div>
              <span className={`text-[10px] font-mono tracking-[0.2em] font-bold whitespace-nowrap ${matchState.isCarryingOil ? 'text-yellow-400 animate-pulse' : 'text-slate-500'}`}>
                {matchState.isCarryingOil ? 'SECURED' : 'ACTIVE'}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-red-500 font-black text-4xl font-mono leading-none drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">{matchState.redScore}</span>
              <span className="text-red-400/60 text-[10px] tracking-[0.3em] font-bold">RED</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-start w-full relative z-10">
        <div className="flex flex-col gap-3 w-72">
          <div className={`flex items-center gap-3 px-4 py-2 rounded border-l-4 backdrop-blur-md ${teamBorder} ${teamBg} w-fit shadow-lg`}>
            <div className={`font-black text-3xl font-mono tracking-tighter ${teamColorText} drop-shadow-lg`}>{playerTeam}</div>
            <div className="flex flex-col leading-none">
              <span className="text-[9px] text-white/50 tracking-[0.2em] font-mono">ALLIANCE</span>
              <span className={`text-xs font-bold tracking-widest ${teamColorText}`}>TEAM</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-mono text-cyan-200 uppercase tracking-widest opacity-80">
              <span>Hull Integrity</span><span className={health < 30 ? 'text-red-500 font-bold' : ''}>{health}%</span>
            </div>
            <div className="h-3 w-64 bg-slate-800/80 border border-slate-600 rounded-sm skew-x-[-15deg] overflow-hidden p-[1px]">
              <div className={`h-full ${hpColor} ${hpShadow} transition-all duration-300 ease-out origin-left`} style={{ width: `${health}%` }} />
            </div>
            <div className="flex gap-3 mt-1 flex-wrap w-80">
              <div className="text-[9px] font-mono text-slate-500"><span className="text-red-500 font-bold">[F1]</span> SOS</div>
              <div className="text-[9px] font-mono text-slate-500"><span className="text-orange-400 font-bold">[F2]</span> ENEMY</div>
              <div className="text-[9px] font-mono text-slate-500"><span className="text-blue-400 font-bold">[F3]</span> ATK</div>
              <div className="text-[9px] font-mono text-slate-500"><span className="text-green-400 font-bold">[F4]</span> DEF</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="w-48 flex justify-end">
            {/* --- ВАЖЛИВО: Передаємо гравців і команду в Minimap --- */}
            <Minimap
              playerPosRef={playerPosRef}
              playerRotRef={playerRotRef}
              mapSize={3000}
              otherPlayers={players} // Передаємо список
              myTeam={playerTeam}    // Передаємо свою команду
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 left-8 z-20 flex flex-col items-start gap-1 pointer-events-auto">
        <div className="text-[10px] font-mono text-orange-200 uppercase tracking-widest opacity-80 ml-1">
          {isReloading ? <span className="text-red-500 animate-pulse">RELOADING SYSTEM...</span> : 'PLASMA CANNON'}
        </div>
        <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur border border-white/10 px-4 py-2 rounded skew-x-[-15deg] shadow-lg">
          <div className="skew-x-[15deg] p-1 bg-orange-500/20 rounded">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-orange-400">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="h-8 w-[1px] bg-white/20 skew-x-[15deg]"></div>
          <div className="flex items-baseline gap-1 skew-x-[15deg]">
            <span className={`text-4xl font-black font-mono tracking-tighter ${isReloading ? 'text-red-500' : ammo === 0 ? 'text-red-500' : 'text-orange-400'}`}>
              {isReloading ? '00' : ammo}
            </span>
            <span className="text-sm text-white/40 font-bold">/ {maxAmmo}</span>
          </div>
        </div>
        {isReloading && (
          <div className="h-2 w-full bg-slate-800/80 border border-red-900/50 rounded-full overflow-hidden mt-1 skew-x-[-15deg]">
            <div className="h-full bg-red-500 shadow-[0_0_8px_red]" style={{ width: '100%', transition: `width ${reloadTime}s linear`, animation: `reloadProgress ${reloadTime}s linear forwards` }} />
            <style>{`@keyframes reloadProgress { from { width: 0%; } to { width: 100%; } }`}</style>
          </div>
        )}
      </div>

      <div className="absolute bottom-32 left-0 w-80 flex flex-col gap-1.5 z-10 pointer-events-none">
        {logs.map((log) => (
          <div key={log.id} className={`text-[11px] font-mono px-3 py-1.5 rounded-r border-l-4 backdrop-blur-sm shadow-lg animate-in slide-in-from-left-10 fade-in duration-300 ${log.type === 'comms' ? 'border-orange-500 bg-orange-900/60 text-white font-bold' : log.type === 'warning' ? 'border-red-500 bg-red-900/50 text-red-100' : log.type === 'success' ? 'border-green-500 bg-green-900/50 text-green-100' : 'border-cyan-500 bg-slate-900/50 text-cyan-100'}`}>
            {log.type === 'comms' && <span className="mr-2">📻</span>}
            {log.type === 'warning' && <span className="mr-2">⚠️</span>}
            {log.type === 'success' && <span className="mr-2">🛡️</span>}
            {log.type === 'info' && <span className="mr-2">⚔️</span>}
            {log.message}
          </div>
        ))}
      </div>

    </div>
  );
};