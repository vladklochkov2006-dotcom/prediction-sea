import React, { useState, useEffect, useCallback } from 'react';
import { useLinera } from './LineraProvider';

interface LobbyProps {
    onJoin: (name: string, hostChainId: string, playerChainId: string, isHost: boolean) => void;
}

const LineraLogo = () => (
    <img
        src="/linera-logo.jpg"
        alt="Linera Logo"
        className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(232,62,14,0.6)] select-none pointer-events-none"
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
    />
);

type LobbyScreen = 'menu' | 'creating' | 'joining' | 'waiting';

export const GameLobby: React.FC<LobbyProps> = ({ onJoin }) => {
    const [name, setName] = useState('');
    const [hostChainId, setHostChainId] = useState('');
    const [screen, setScreen] = useState<LobbyScreen>('menu');
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [copied, setCopied] = useState(false);

    const { application, chainId, ready } = useLinera();

    const memes = [
        "TRUMP: 'WE WILL BUILD A GREAT HOVERCRAFT, AND MEXICO WILL PAY FOR IT!'",
        "BREAKING: OIL PRICES SKYROCKET! US MARINES DEPLOYED TO YOUR KITCHEN.",
        "FREEDOM IS COMING... AT 200 MPH. PREPARE FOR LIBERATION.",
        "ELON MUSK: 'HOVERWARS IS THE FIRST STEP TO COLONIZING MARS.'",
    ];

    useEffect(() => {
        setStatusText(memes[0]);
        let i = 1;
        const interval = setInterval(() => {
            setStatusText(memes[i % memes.length]);
            i++;
        }, 8000);
        return () => clearInterval(interval);
    }, []);

    // Poll for opponent when waiting in lobby
    useEffect(() => {
        if (screen !== 'waiting' || !application || !ready) return;

        const pollInterval = setInterval(async () => {
            try {
                const res = await application.query('{ "query": "query { room { matchState bluePlayer { name chainId } redPlayer { name chainId } } }" }');
                const json = typeof res === "string" ? JSON.parse(res) : res;
                const room = json?.data?.room;

                if (room && room.matchState === 'IN_PROGRESS') {
                    // Opponent joined, transition to game
                    const isHost = room.bluePlayer?.chainId === chainId;
                    onJoin(name, chainId || '', chainId || '', isHost);
                }
            } catch (e) {
                console.error('[Linera Poll] Error:', e);
            }
        }, 2000);

        return () => clearInterval(pollInterval);
    }, [screen, application, ready, chainId, name, onJoin]);

    const escapeGqlString = (value: string) =>
        value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");

    const handleCreateLobby = async () => {
        if (!name.trim() || !application || !ready) return;
        setIsProcessing(true);
        try {
            const hostName = escapeGqlString(name.trim());
            await application.query(JSON.stringify({
                query: `mutation { createLobby(hostName: "${hostName}") }`
            }));
            setScreen('waiting');
        } catch (e) {
            console.error('[Linera] Create lobby failed:', e);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleJoinLobby = async () => {
        if (!name.trim() || !hostChainId.trim() || !application || !ready) return;
        setIsProcessing(true);
        try {
            const playerName = escapeGqlString(name.trim());
            const hostId = escapeGqlString(hostChainId.trim());
            await application.query(JSON.stringify({
                query: `mutation { joinLobby(hostChainId: "${hostId}", playerName: "${playerName}") }`
            }));
            // After joining, immediately go to game
            onJoin(name.trim(), hostChainId.trim(), chainId || '', false);
        } catch (e) {
            console.error('[Linera] Join lobby failed:', e);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCopyChainId = async () => {
        if (!chainId) return;
        try {
            await navigator.clipboard.writeText(chainId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { }
    };

    const renderContent = () => {
        if (!ready) {
            return (
                <div className="text-center py-8">
                    <div className="text-cyan-400 text-lg animate-pulse">Initializing Linera...</div>
                    <div className="text-cyan-600/50 text-xs mt-2">Connecting to blockchain</div>
                </div>
            );
        }

        if (screen === 'waiting') {
            return (
                <div className="space-y-6">
                    <div className="text-center">
                        <div className="text-cyan-300 text-sm mb-2">LOBBY CREATED</div>
                        <div className="text-2xl text-white font-bold animate-pulse">Waiting for opponent...</div>
                    </div>

                    <div className="bg-[#050b14]/50 border border-cyan-900/50 p-4 space-y-2">
                        <div className="text-cyan-400/60 text-xs tracking-widest">YOUR CHAIN ID (share this)</div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={chainId || ''}
                                readOnly
                                className="flex-1 bg-transparent border-none text-cyan-100 text-xs outline-none truncate"
                            />
                            <button
                                onClick={handleCopyChainId}
                                className="px-3 py-1 bg-cyan-600/30 hover:bg-cyan-500/50 text-cyan-200 text-xs transition-colors"
                            >
                                {copied ? '✓' : 'COPY'}
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={() => setScreen('menu')}
                        className="w-full py-2 text-cyan-400/60 hover:text-cyan-300 text-sm transition-colors"
                    >
                        ← BACK
                    </button>
                </div>
            );
        }

        if (screen === 'joining') {
            return (
                <div className="space-y-6">
                    <div className="relative group">
                        <label className="text-cyan-300 text-xs tracking-widest mb-2 block uppercase opacity-70">
                            Host Chain ID
                        </label>
                        <input
                            type="text"
                            value={hostChainId}
                            onChange={(e) => setHostChainId(e.target.value)}
                            placeholder="PASTE HOST CHAIN ID..."
                            className="w-full bg-[#050b14]/50 border border-cyan-900/50 text-cyan-100 px-4 py-3 outline-none focus:border-cyan-400/80 transition-all placeholder:text-cyan-900/30 text-sm font-mono"
                        />
                    </div>

                    <button
                        onClick={handleJoinLobby}
                        disabled={!name.trim() || !hostChainId.trim() || isProcessing}
                        className={`w-full py-4 bg-green-600/40 hover:bg-green-500/60 border-2 border-green-500/30 
                            text-white font-black tracking-widest transition-all
                            ${(!name.trim() || !hostChainId.trim() || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isProcessing ? 'JOINING...' : 'JOIN BATTLE'}
                    </button>

                    <button
                        onClick={() => setScreen('menu')}
                        className="w-full py-2 text-cyan-400/60 hover:text-cyan-300 text-sm transition-colors"
                    >
                        ← BACK
                    </button>
                </div>
            );
        }

        // Main menu
        return (
            <div className="space-y-6">
                <div className="relative group">
                    <label className="text-cyan-300 text-xs tracking-widest mb-2 block uppercase opacity-70">
                        Pilot Callsign
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="ENTER NAME..."
                        className="w-full bg-[#050b14]/50 border border-cyan-900/50 text-cyan-100 px-4 py-3 outline-none focus:border-cyan-400/80 focus:shadow-[0_0_15px_rgba(0,255,255,0.2)] transition-all placeholder:text-cyan-900/30 text-lg font-bold tracking-wider text-center"
                        maxLength={12}
                        autoFocus
                    />
                </div>

                <div className="grid gap-3">
                    <button
                        onClick={handleCreateLobby}
                        disabled={!name.trim() || isProcessing}
                        className={`w-full py-4 bg-cyan-600/40 hover:bg-cyan-500/60 border-2 border-cyan-500/30 
                            text-white font-black tracking-widest transition-all relative overflow-hidden
                            ${(!name.trim() || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isProcessing ? 'CREATING...' : 'CREATE ROOM'}
                    </button>

                    <button
                        onClick={() => setScreen('joining')}
                        disabled={!name.trim()}
                        className={`w-full py-4 bg-green-600/30 hover:bg-green-500/50 border-2 border-green-500/20 
                            text-white font-bold tracking-widest transition-all
                            ${!name.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        JOIN ROOM
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="relative w-full h-screen bg-[#050b14] overflow-hidden flex items-center justify-center font-mono select-none">
            {/* Background */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center opacity-40 blur-sm scale-105 pointer-events-none"
                style={{ backgroundImage: "url('/textures/lobby-bg.jpg')" }}
            />
            <div className="absolute inset-0 z-0 bg-[#050b14]/80 pointer-events-none" />

            <div className="absolute inset-0 z-0 pointer-events-none mix-blend-overlay">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#081b2e_1px,transparent_1px),linear-gradient(to_bottom,#081b2e_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-40" />
            </div>

            <div className="absolute top-10 left-10 text-cyan-900/40 text-xs tracking-[0.3em] z-20 pointer-events-none">
                SECURE CONNECTION // LINERA PROTOCOL
            </div>

            {/* Main Panel */}
            <div className="relative z-10 w-full max-w-md p-1">
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-400 pointer-events-none" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-400 pointer-events-none" />

                <div className="bg-[#0a1220]/80 backdrop-blur-xl border border-cyan-500/10 p-10 shadow-[0_0_50px_rgba(0,180,255,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-cyan-400/20 shadow-[0_0_10px_cyan] animate-scan pointer-events-none" />

                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-400 tracking-tighter"
                            style={{ textShadow: '0 0 20px rgba(0,255,255,0.5)' }}>
                            HOVERWARS
                        </h1>
                        <div className="text-cyan-500/50 text-[10px] tracking-[0.8em] mt-2 uppercase">
                            Tactical Hover Warfare
                        </div>

                        <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-cyan-500/10">
                            <LineraLogo />
                            <div className="flex flex-col items-start pointer-events-none">
                                <span className="text-cyan-400/60 text-[8px] tracking-[0.2em] uppercase font-bold leading-none mb-1">
                                    Powered by
                                </span>
                                <span className="text-white text-sm tracking-[0.2em] uppercase font-black leading-none drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">
                                    LINERA <span className="text-[#E83E0E]">BLOCKCHAIN</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {renderContent()}

                    {/* Footer */}
                    <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4 gap-4">
                        <div className="flex items-center gap-2 shrink-0">
                            <div className={`w-2 h-2 rounded-full ${ready ? 'bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]' : 'bg-yellow-500'}`} />
                            <span className={`text-[10px] tracking-widest font-bold ${ready ? 'text-green-400/80' : 'text-yellow-400/80'}`}>
                                {ready ? 'CONNECTED' : 'CONNECTING'}
                            </span>
                        </div>
                        <div className="text-[9px] text-cyan-400/60 tracking-widest text-right italic break-words leading-tight flex-1">
                            {statusText}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan {
                    animation: scan 4s linear infinite;
                }
            `}</style>
        </div>
    );
};