import React, { useEffect, useState } from 'react';
import { useLinera } from './LineraProvider';

interface LineraScores {
    blueScore: number;
    redScore: number;
    currentRound: number;
    matchState: string;
    bluePlayerName: string;
    redPlayerName: string;
}

export const LineraScoreDisplay: React.FC = () => {
    const { client, application, ready } = useLinera();
    const [scores, setScores] = useState<LineraScores>({
        blueScore: 0,
        redScore: 0,
        currentRound: 0,
        matchState: 'WAITING',
        bluePlayerName: '',
        redPlayerName: ''
    });

    useEffect(() => {
        if (!client || !application || !ready) return;

        let isQuerying = false;
        let pending = false;

        const queryScores = async () => {
            if (isQuerying) {
                pending = true;
                return;
            }

            isQuerying = true;
            try {
                const res = await application.query(JSON.stringify({
                    query: `query { 
                        gameStatus { 
                            matchState 
                            bluePlayerName 
                            redPlayerName 
                            blueScore 
                            redScore 
                            currentRound 
                        } 
                    }`
                }));

                const json = typeof res === "string" ? JSON.parse(res) : res;
                const data = json?.data?.gameStatus;

                if (data) {
                    setScores({
                        blueScore: data.blueScore ?? 0,
                        redScore: data.redScore ?? 0,
                        currentRound: data.currentRound ?? 0,
                        matchState: data.matchState ?? 'WAITING',
                        bluePlayerName: data.bluePlayerName ?? '',
                        redPlayerName: data.redPlayerName ?? ''
                    });
                }
            } catch (e) {
                console.error('[Linera Score] Query error:', e);
            } finally {
                isQuerying = false;
                if (pending) {
                    pending = false;
                    queryScores();
                }
            }
        };

        // Subscribe to notifications - triggers query on blockchain events
        const handleNotification = () => {
            queryScores();
        };

        const maybeUnsubscribe = (client as any).onNotification?.(handleNotification);

        // Initial query
        queryScores();

        return () => {
            if (typeof maybeUnsubscribe === 'function') {
                try { maybeUnsubscribe(); } catch { }
            } else {
                try { (client as any).offNotification?.(handleNotification); } catch { }
            }
        };
    }, [client, application, ready]);

    if (!ready) return null;

    return (
        <div className="absolute top-0 left-0 w-full flex justify-center z-50 pointer-events-none">
            <div className="flex flex-col items-center">
                {/* Round indicator */}
                <div className="bg-slate-900/90 border-x border-t border-slate-700 px-6 py-1 rounded-t-lg -mb-1 z-0">
                    <span className="font-mono text-xs text-cyan-400 tracking-widest">
                        ROUND {scores.currentRound} • {scores.matchState}
                    </span>
                </div>

                {/* Score panel */}
                <div className="flex items-center gap-6 bg-black/80 backdrop-blur-md px-10 py-3 rounded-b-2xl border border-slate-700 shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-10 relative">
                    {/* Blue score */}
                    <div className="flex flex-col items-center">
                        <span className="text-blue-500 font-black text-4xl font-mono leading-none drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                            {scores.blueScore}
                        </span>
                        <span className="text-blue-400/60 text-[10px] tracking-[0.3em] font-bold">
                            {scores.bluePlayerName || 'BLUE'}
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="flex flex-col items-center px-4 border-x border-slate-700/50">
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse" />
                        <span className="text-[10px] font-mono tracking-[0.2em] font-bold text-green-400 mt-1">
                            LINERA
                        </span>
                    </div>

                    {/* Red score */}
                    <div className="flex flex-col items-center">
                        <span className="text-red-500 font-black text-4xl font-mono leading-none drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                            {scores.redScore}
                        </span>
                        <span className="text-red-400/60 text-[10px] tracking-[0.3em] font-bold">
                            {scores.redPlayerName || 'RED'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
