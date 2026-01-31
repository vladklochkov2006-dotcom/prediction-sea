import React, { useState, useEffect, useRef, useCallback, Suspense, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import { OceanScene } from './components/OceanScene';
import { GameHUD } from './components/GameHUD';
import { GameLobby } from './components/GameLobby';
import { InstancedWorld } from './components/InstancedWorld';
import { socket } from './socket';
import { LocalEngineSound } from './components/LocalEngineSound';
import { GameState, SystemLog, MatchState } from './types';
import * as THREE from 'three';

import { SpectatorMode } from './components/SpectatorMode';
import { SpectatorOverlay } from './components/SpectatorOverlay';
import { Scoreboard } from './components/Scoreboard';
import { KillFeed } from './components/KillFeed';
import { GameOverScreen } from './components/GameOverScreen';
import { LineraScoreDisplay } from './components/LineraScoreDisplay';
import { useLinera } from './components/LineraProvider';

const MemoizedOceanScene = memo(OceanScene, (prev, next) => {
  return prev.gameState === next.gameState &&
    prev.playerTeam === next.playerTeam &&
    prev.isSpectating === next.isSpectating &&
    prev.isCarryingOil === next.isCarryingOil &&
    prev.isEPressed === next.isEPressed &&
    prev.oilHolder === next.oilHolder &&
    prev.carrierId === next.carrierId &&
    prev.countdownValue === next.countdownValue &&
    JSON.stringify(prev.otherPlayers) === JSON.stringify(next.otherPlayers);
});

const WaitingScreen = ({ team }: { team: string }) => {
  const [dots, setDots] = React.useState('');
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);
  const isBlue = team === 'BLUE';
  const teamColorClass = isBlue ? 'text-blue-400' : 'text-red-500';
  const borderColorClass = isBlue ? 'border-blue-500/30' : 'border-red-500/30';
  const shadowClass = isBlue ? 'shadow-[0_0_30px_rgba(59,130,246,0.2)]' : 'shadow-[0_0_30px_rgba(239,68,68,0.2)]';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center font-mono select-none">
      <div className="absolute inset-0 bg-[#050b14]/60 backdrop-blur-sm"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%] pointer-events-none opacity-50"></div>
      <div className="relative z-10 w-full max-w-lg p-1">
        <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 ${isBlue ? 'border-blue-500' : 'border-red-500'}`}></div>
        <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 ${isBlue ? 'border-blue-500' : 'border-red-500'}`}></div>
        <div className={`bg-[#0a1220]/90 border ${borderColorClass} p-12 ${shadowClass} backdrop-blur-xl relative overflow-hidden flex flex-col items-center`}>
          <div className="absolute top-0 left-0 w-full h-0.5 bg-white/20 animate-scan-fast pointer-events-none"></div>
          <h2 className="text-cyan-500/70 text-xs tracking-[0.5em] mb-6 uppercase">System Standby</h2>
          <h1 className="text-3xl font-black text-white tracking-widest mb-8 text-center drop-shadow-md">
            WAITING FOR OPPONENT<span className="inline-block w-8 text-left">{dots}</span>
          </h1>
          <div className="w-full h-px bg-white/10 mb-8"></div>
          <div className="text-center">
            <div className="text-gray-400 text-xs tracking-[0.3em] mb-2 uppercase">Assigned Squadron</div>
            <div className={`text-4xl font-black ${teamColorClass} tracking-widest uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]`}>
              {team} TEAM
            </div>
          </div>
          <div className="mt-12 flex gap-2">
            <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse"></div>
            <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse delay-100"></div>
            <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse delay-200"></div>
          </div>
          <div className="mt-4 text-[10px] text-gray-500 uppercase tracking-widest animate-pulse">
            Match will auto-deploy upon connection
          </div>
        </div>
      </div>
      <style>{`
        @keyframes scan-fast { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .animate-scan-fast { animation: scan-fast 3s linear infinite; }
      `}</style>
    </div>
  );
};

const App: React.FC = () => {
  const { client, application, ready: lineraReady, chainId: myChainId } = useLinera();
  const [gameState, setGameState] = useState<GameState | 'spectating' | 'game_over' | 'countdown' | 'lobby' | 'waiting'>('lobby');
  const [playerName, setPlayerName] = useState<string>('PILOT');

  const [activeIslandId, setActiveIslandId] = useState<string | null>(null);
  const [health, setHealth] = useState(100);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [respawnKey, setRespawnKey] = useState(0);
  const [ammo, setAmmo] = useState(16);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadTime, setReloadTime] = useState(10);
  const [isEPressed, setIsEPressed] = useState(false);

  const [matchTime, setMatchTime] = useState(900);
  const [countdownValue, setCountdownValue] = useState(0);
  const [lastScorer, setLastScorer] = useState<string | null>(null);

  const MATCH_WIN_SCORE = 3;

  const [matchState, setMatchState] = useState<MatchState>({
    blueScore: 0,
    redScore: 0,
    isCarryingOil: false,
    oilHolder: 'none',
    carrierId: null
  });

  const [myTeam, setMyTeam] = useState<string>('BLUE');
  const [isHost, setIsHost] = useState<boolean>(false);
  const playerPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const playerRotRef = useRef(0);

  const [otherPlayers, setOtherPlayers] = useState<any>({});
  const [allPlayersList, setAllPlayersList] = useState<any[]>([]);
  const [killFeed, setKillFeed] = useState<any[]>([]);

  const [enemyShotTriggers, setEnemyShotTriggers] = useState<{ [key: string]: number }>({});
  const [respawnTargetTime, setRespawnTargetTime] = useState(0);

  const playGlobalSound = useCallback((path: string, volume: number = 0.5) => {
    const audio = new Audio(path);
    audio.volume = volume;
    audio.play().catch(e => console.warn("Audio play failed (interact first?)", e));
  }, []);

  const addSystemLog = useCallback((message: string, type: 'info' | 'warning' | 'success' | 'comms' = 'info') => {
    const id = Date.now();
    setLogs(prev => [...prev.slice(-5), { id, message, type }]);
    setTimeout(() => {
      setLogs(prev => prev.filter(log => log.id !== id));
    }, 6000);
  }, []);

  useEffect(() => {
    socket.on('connect', () => console.log("✅ CONNECTED TO SERVER"));

    socket.on('initGame', (data) => {
      setMyTeam(data.myPlayer.team);
      playerPosRef.current.set(data.myPlayer.position.x, data.myPlayer.position.y, data.myPlayer.position.z);
      playerRotRef.current = data.myPlayer.rotation;
      setGameState('waiting');
      setHealth(100);

      const others = { ...data.allPlayers };
      if (socket.id) delete others[socket.id];
      setOtherPlayers(others);
      setAllPlayersList(Object.values(data.allPlayers));

      setMatchTime(data.matchTime);
      setMatchState(data.matchState);
      if (data.gameState === 'playing') setGameState('playing');
    });

    socket.on('playerJoined', (player) => {
      addSystemLog(`${player.name} JOINED LOBBY`, 'info');
      setOtherPlayers((prev: any) => ({ ...prev, [player.id]: player }));
      setAllPlayersList(prev => [...prev, player]);
    });

    socket.on('playerMoved', (data) => {
      setOtherPlayers((prev: any) => {
        if (!prev[data.id]) return prev;
        return {
          ...prev,
          [data.id]: {
            ...prev[data.id],
            position: data.position,
            rotation: data.rotation
          }
        };
      });
    });

    socket.on('gameTick', (data) => {
      setMatchTime(data.time);
      setMatchState(data.matchState);

      const updatedOthers = { ...otherPlayers };

      Object.keys(data.players).forEach(id => {
        if (id === socket.id) {
          const myData = data.players[id];
          if (myData.isDead) {
            if (gameState !== 'spectating') {
              setGameState('spectating');
              setHealth(0);
              playGlobalSound('/sounds/you-died.mp3', 1.0);
            }
            setRespawnTargetTime(myData.respawnTime);
          } else if (gameState === 'spectating' && data.players[id].health > 0) {
            handleRespawn(myData);
          }
        } else {
          if (updatedOthers[id]) {
            updatedOthers[id] = { ...updatedOthers[id], isDead: data.players[id].isDead };
          } else {
            updatedOthers[id] = data.players[id];
          }
        }
      });
      setOtherPlayers(updatedOthers);

      // Update allPlayersList with latest stats (kills, goals, deaths)
      setAllPlayersList(Object.values(data.players));
    });

    socket.on('hitConfirm', () => {
      playGlobalSound('/sounds/hit-marker.mp3', 0.5);
    });

    socket.on('killConfirm', () => {
      playGlobalSound('/sounds/ship-explosion.mp3', 0.8);
    });

    socket.on('enemyShoot', (id) => {
      setEnemyShotTriggers(prev => ({ ...prev, [id]: Date.now() }));
    });

    socket.on('roundReset', async ({ scorerTeam, players }) => {
      console.log("♻️ ROUND RESET! SYNCING WITH BLOCKCHAIN...");
      playGlobalSound('/sounds/siren.mp3', 0.6);

      if (socket.id && players[socket.id]) {
        const myData = players[socket.id];
        playerPosRef.current.set(myData.position.x, myData.position.y, myData.position.z);
        playerRotRef.current = myData.rotation;
      }

      const others = { ...players };
      if (socket.id) delete others[socket.id];
      setOtherPlayers(others);

      setRespawnKey(prev => prev + 1);
      setHealth(100);
      setAmmo(16);
      setIsReloading(false);
      setLastScorer(scorerTeam);

      // Show SYNCING state (not countdown yet - wait for both to confirm)
      setGameState('syncing');
      setCountdownValue(0);

      // 🔗 SCORER: Call Linera mutation -> Emit confirmation on success
      // If I am the team that scored (or I am host acting on behalf? No, contract allows dynamic)
      // Actually, if blue scored, blue submits. If red scored, red submits.
      if (scorerTeam === myTeam && application && lineraReady) {
        try {
          const result = scorerTeam === 'BLUE' ? 'BLUE_WIN' : 'RED_WIN';
          console.log(`[Linera] I scored! Reporting round result: ${result}`);

          await application.query(JSON.stringify({
            query: `mutation { reportRoundResult(result: ${result}) }`
          }));

          console.log('[Linera] Round result reported successfully');
          socket.emit('roundConfirm'); // Submitter confirms immediately after success
        } catch (e) {
          console.error('[Linera] Failed to report round result:', e);
          socket.emit('roundConfirm');
        }
      }
      // 🔗 OPPONENT (didn't score this round): Waits for onNotification in separate useEffect.
      // 🔗 GUEST: Does NOT confirm here. Waits for onNotification in separate useEffect.
    });

    // 🎮 Both players confirmed - NOW show scorer and start countdown
    socket.on('nextRoundReady', () => {
      console.log('✅ ALL PLAYERS SYNCED! Starting countdown...');
      playGlobalSound('/sounds/comms-attack.mp3', 0.8);

      setGameState('countdown');
      setCountdownValue(3);
    });

    socket.on('systemLog', (data) => {
      addSystemLog(data.msg, data.type);
    });

    // 🔥 ВСІ ГРАВЦІ ОТРИМУЮТЬ ЦЕЙ СИГНАЛ ВІД СЕРВЕРА
    socket.on('gameOver', (finalState) => {
      setMatchState(finalState);
      setGameState('game_over');

      let winner = 'draw';
      if (finalState.blueScore > finalState.redScore) winner = 'BLUE';
      else if (finalState.redScore > finalState.blueScore) winner = 'RED';

      if (winner === 'draw') {
        playGlobalSound('/sounds/draw.mp3', 0.8);
      } else if (winner === myTeam) {
        playGlobalSound('/sounds/victory.mp3', 1.0);
      } else {
        playGlobalSound('/sounds/defeat.mp3', 0.8);
      }
    });

    socket.on('gameStart', () => {
      setGameState('playing');
      setMatchTime(900);
      addSystemLog("⚠️ BATTLE STATION READY! ENGAGE!", "success");
    });

    socket.on('gameReset', () => {
      // If game was over, ignore - player will manually click Return to Base
      if (gameState === 'game_over') {
        return;
      }
      setGameState('waiting');
      addSystemLog("OPPONENT DISCONNECTED. WAITING...", "warning");
      setOtherPlayers({});
      setAllPlayersList(prev => prev.filter(p => p.id === socket.id));
    });

    socket.on('playerDisconnected', (id) => {
      setOtherPlayers((prev: any) => {
        const newPlayers = { ...prev };
        delete newPlayers[id];
        return newPlayers;
      });
      addSystemLog(`PLAYER DISCONNECTED`, 'warning');
      setAllPlayersList(prev => prev.filter(p => p.id !== id));
    });

    socket.on('takeDamage', (damage: number) => {
      setHealth(prev => Math.max(0, prev - damage));
      playGlobalSound('/sounds/hit.mp3', 0.8);
    });

    socket.on('updateScoreboard', (playersMap) => {
      setAllPlayersList(Object.values(playersMap));
    });

    socket.on('killFeed', (data) => {
      const id = Date.now();
      setKillFeed(prev => {
        const newList = [...prev, { id, ...data }];
        if (newList.length > 5) return newList.slice(newList.length - 5);
        return newList;
      });
      setTimeout(() => {
        setKillFeed(prev => prev.filter(item => item.id !== id));
      }, 5000);
    });

    socket.on('disconnect', () => addSystemLog("CONNECTION LOST", "warning"));

    return () => {
      socket.off('connect');
      socket.off('initGame');
      socket.off('playerJoined');
      socket.off('playerMoved');
      socket.off('gameStart');
      socket.off('gameReset');
      socket.off('playerDisconnected');
      socket.off('takeDamage');
      socket.off('updateScoreboard');
      socket.off('killFeed');
      socket.off('disconnect');
      socket.off('gameTick');
      socket.off('systemLog');
      socket.off('gameOver');
      socket.off('roundReset');
      socket.off('hitConfirm');
      socket.off('killConfirm');
      socket.off('enemyShoot');
    };
  }, [addSystemLog, gameState, otherPlayers, playGlobalSound, myTeam, isHost, application, lineraReady]);

  // 🔗 Separate effect for Linera notifications (Guest Sync)
  useEffect(() => {
    if (!client || !lineraReady || !application) return;

    const handleNotification = async (evt: any) => {
      // If we are syncing and receive a notification, it means the round result block is processed
      // SCORER confirms after mutation, OPPONENT (Non-Scorer) confirms here
      console.log(`[Linera] 📩 Notification received! GameState: ${gameState}, IsHost: ${isHost}, Scorer: ${lastScorer}, MyTeam: ${myTeam}`);

      if (gameState === 'syncing' && lastScorer !== myTeam) {
        console.log('[Linera] I am the OPPONENT. Verifying state from blockchain...');

        try {
          // Verify with a query that the round actually updated
          const res = await application.query(JSON.stringify({
            query: `query { gameStatus { currentRound blueScore redScore } }`
          }));

          console.log('[Linera] 🔍 Query response raw:', res);
          const json = typeof res === "string" ? JSON.parse(res) : res;
          const data = json?.data?.gameStatus;

          if (data) {
            console.log(`[Linera] ✅ Verified state: Round ${data.currentRound}, Blue: ${data.blueScore}, Red: ${data.redScore}`);
            socket.emit('roundConfirm');
          } else {
            console.warn('[Linera] ⚠️ verification failed: no data in response', json);
          }
        } catch (e) {
          console.error('[Linera] ❌ Verification query failed:', e);
        }
      } else {
        console.log('[Linera] Ignoring notification (either not syncing or I am the scorer who already confirmed)');
      }
    };

    const maybeUnsubscribe = (client as any).onNotification?.(handleNotification);

    return () => {
      if (typeof maybeUnsubscribe === 'function') {
        try { maybeUnsubscribe(); } catch { }
      } else {
        try { (client as any).offNotification?.(handleNotification); } catch { }
      }
    };
  }, [client, lineraReady, gameState, isHost, application, lastScorer, myTeam]);

  const handleJoinGame = (name: string, hostChainId: string, playerChainId: string, isHostParam: boolean) => {
    setPlayerName(name);
    setIsHost(isHostParam);
    // Send chainId to server for synchronization
    socket.emit('joinGame', { name: name, chainId: playerChainId, hostChainId: hostChainId, isHost: isHostParam });
  };

  const handleWeaponUpdate = useCallback((newAmmo: number, reloading: boolean, time: number) => {
    setAmmo(newAmmo);
    setIsReloading(reloading);
    if (reloading) setReloadTime(time);
  }, []);

  useEffect(() => {
    const handleMouseDown = () => {
      if (gameState === 'playing' && ammo > 0 && !isReloading) {
        socket.emit('playerShoot');
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [gameState, ammo, isReloading]);

  useEffect(() => {
    if (gameState === 'countdown') {
      if (countdownValue > 0) {
        const timer = setTimeout(() => setCountdownValue(p => p - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setGameState('playing');
        setLastScorer(null);
        addSystemLog("🟢 ROUND STARTED!", "success");
      }
    }
  }, [gameState, countdownValue, addSystemLog]);

  const handleRespawn = (playerData: any) => {
    setRespawnKey(prev => prev + 1);
    setHealth(100);
    setAmmo(16);
    setIsReloading(false);
    setGameState('playing');

    if (playerData) {
      playerPosRef.current.set(playerData.position.x, playerData.position.y, playerData.position.z);
      playerRotRef.current = playerData.rotation;
    }

    addSystemLog("SYSTEM REBOOTED. ONLINE.", "success");
  };

  const handleOilPickUp = useCallback(() => {
    socket.emit('oilPickedUp');
  }, []);

  const handleOilDelivery = useCallback(() => {
    socket.emit('oilDelivered');
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'spectating' || gameState === 'game_over' || gameState === 'lobby' || gameState === 'waiting') return;

      if (e.code === 'KeyE') setIsEPressed(true);
      if (e.key === 'Escape') { setGameState('playing'); setActiveIslandId(null); }

      if (e.code === 'F1') {
        e.preventDefault();
        playGlobalSound('/sounds/comms-sos.mp3', 1.0);
        addSystemLog("🆘 SOS! REQUIRE BACKUP!", 'warning');
      }
      if (e.code === 'F2') {
        e.preventDefault();
        playGlobalSound('/sounds/comms-enemy.mp3', 1.0);
        addSystemLog("👀 ENEMY SPOTTED!", 'comms');
      }
      if (e.code === 'F3') {
        e.preventDefault();
        playGlobalSound('/sounds/comms-attack.mp3', 1.0);
        addSystemLog("⚔️ ATTACKING!", 'info');
      }
      if (e.code === 'F4') {
        e.preventDefault();
        playGlobalSound('/sounds/comms-defend.mp3', 1.0);
        addSystemLog("🛡️ DEFENDING!", 'success');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        setIsEPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [addSystemLog, gameState, activeIslandId, playGlobalSound]);

  const playersArray = Object.values(otherPlayers);

  return (
    <div className="w-full h-screen bg-slate-900 overflow-hidden relative">
      {gameState === 'lobby' && <GameLobby onJoin={handleJoinGame} />}

      {gameState === 'waiting' && <WaitingScreen team={myTeam} />}

      {gameState !== 'lobby' && (
        <>
          <Canvas shadows={false} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: "high-performance", precision: "highp" }} camera={{ position: [0, 5, 10], fov: 60, near: 0.1, far: 3000 }}>
            <fog attach="fog" args={['#acc1d1', 100, 2500]} />
            <AdaptiveDpr pixelated />
            <Suspense fallback={null}>

              <LocalEngineSound playerPosRef={playerPosRef} gameState={gameState} />

              <InstancedWorld />
              <MemoizedOceanScene
                key={respawnKey}
                gameState={gameState}
                onInteractionAvailable={(avail, id) => { if (avail && id) setActiveIslandId(id); else setActiveIslandId(null); }}
                playerPosRef={playerPosRef}
                playerRotRef={playerRotRef}
                onSystemLog={addSystemLog}
                isSpectating={gameState === 'spectating'}
                playerTeam={myTeam}
                onWeaponUpdate={handleWeaponUpdate}
                onRespawn={() => { }}
                isCarryingOil={matchState.isCarryingOil}
                onOilPickUp={handleOilPickUp}
                isEPressed={isEPressed}
                onOilDeliver={handleOilDelivery}
                oilHolder={matchState.oilHolder}
                carrierId={matchState.carrierId}
                countdownValue={gameState === 'waiting' ? 1 : countdownValue}
                otherPlayers={playersArray}
                enemyShotTriggers={enemyShotTriggers}
              />

              {gameState === 'spectating' && (
                <>
                  <SpectatorMode />
                  <SpectatorOverlay onRespawn={() => { }} targetTime={respawnTargetTime} />
                </>
              )}

            </Suspense>
          </Canvas>

          {(gameState !== 'spectating' && gameState !== 'waiting' && gameState !== 'game_over') && (
            <GameHUD
              speed={0}
              gameState={gameState}
              showInteract={!!activeIslandId}
              playerPosRef={playerPosRef}
              playerRotRef={playerRotRef}
              logs={logs}
              health={health}
              playerTeam={myTeam}
              ammo={ammo}
              maxAmmo={16}
              isReloading={isReloading}
              reloadTime={reloadTime}
              matchState={matchState}
              matchTime={matchTime}
              countdownValue={countdownValue}
              lastScorer={lastScorer}
              players={playersArray}
            />
          )}

          {/* DEBUG: Add Point Button */}
          {gameState === 'playing' && (
            <button
              className="fixed top-32 left-8 z-[60] bg-red-500/90 hover:bg-red-600 text-white font-bold py-2 px-4 rounded shadow-lg border-2 border-red-300 backdrop-blur-md transition-all active:scale-95"
              onClick={() => socket.emit('debugGoal')}
            >
              🐛 ADD POINT (+1)
            </button>
          )}

          {/* Linera blockchain scores overlay */}
          {(gameState === 'playing' || gameState === 'countdown' || gameState === 'syncing') && <LineraScoreDisplay />}

          {/* Syncing with blockchain overlay */}
          {gameState === 'syncing' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-6">
                <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-cyan-400 tracking-widest animate-pulse">
                    ⛓️ SYNCING WITH BLOCKCHAIN
                  </h2>
                  <p className="text-slate-400 mt-2 text-lg">
                    {lastScorer === myTeam ? '🎯 YOU SCORED!' : '💔 OPPONENT SCORED'} • Waiting for confirmation...
                  </p>
                </div>
              </div>
            </div>
          )}

          <Scoreboard players={allPlayersList} myId={socket.id || ''} />
          <KillFeed kills={killFeed} />

          {gameState === 'game_over' && (
            <GameOverScreen
              matchState={matchState}
              players={allPlayersList}
              myId={socket.id || ''}
              onReturnToLobby={async () => {
                if (application && lineraReady) {
                  try {
                    console.log('[Linera] Leaving lobby...');
                    await application.query(JSON.stringify({
                      query: `mutation { leaveLobby }`
                    }));
                  } catch (e) {
                    console.error('[Linera] Failed to leave lobby:', e);
                  }
                }
                window.location.reload();
              }}
            />
          )}

        </>
      )}
    </div>
  );
};

export default App;