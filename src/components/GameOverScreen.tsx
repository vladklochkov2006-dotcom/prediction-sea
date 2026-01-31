import React, { useEffect, useState } from 'react';

interface GameOverProps {
    matchState: any;
    players: any[];
    myId: string;
    onReturnToLobby: () => void;
}

export const GameOverScreen: React.FC<GameOverProps> = ({ matchState, players, myId, onReturnToLobby }) => {
    // Етапи анімації: 0-нічого, 1-заголовок, 2-MVP, 3-список, 4-кнопка
    const [animationStep, setAnimationStep] = useState(0);

    // Визначаємо переможця
    let winnerTeam = 'DRAW';
    if (matchState.blueScore > matchState.redScore) winnerTeam = 'BLUE';
    else if (matchState.redScore > matchState.blueScore) winnerTeam = 'RED';

    const isDraw = winnerTeam === 'DRAW';

    // --- ЛОГІКА MVP ---
    const calculateScore = (p: any) => ((p.goals || 0) * 300) + (p.kills * 100) - (p.deaths * 50);
    const sortedByPerformance = [...players].sort((a, b) => calculateScore(b) - calculateScore(a));
    const mvp = sortedByPerformance[0];

    // Запуск анімації по черзі
    useEffect(() => {
        const t1 = setTimeout(() => setAnimationStep(1), 100);  // Заголовок
        const t2 = setTimeout(() => setAnimationStep(2), 1500); // MVP
        const t3 = setTimeout(() => setAnimationStep(3), 2500); // Список
        const t4 = setTimeout(() => setAnimationStep(4), 5000); // Кнопка

        return () => {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
        };
    }, []);

    const titleColor = isDraw ? 'text-gray-200' : (winnerTeam === 'BLUE' ? 'text-blue-500' : 'text-red-500');

    return (
        <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-[#050b14]/95 backdrop-blur-md select-none overflow-hidden font-mono">

            {/* 1. ЗАГОЛОВОК */}
            <div
                className={`relative z-10 text-center transition-all duration-1000 ease-out transform 
                ${animationStep >= 1 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-10'}`}
            >
                <h2 className="text-xl text-gray-400 tracking-[1em] uppercase mb-2">Operation Finished</h2>

                {/* ВИПРАВЛЕНО ТЕКСТ: ЯКЩО НІЧИЯ, ПИШЕ "MISSION DRAW" */}
                <h1 className={`text-9xl font-black italic tracking-tighter ${titleColor} drop-shadow-[0_0_50px_currentColor]`}>
                    {isDraw ? "MISSION DRAW" : `${winnerTeam} WINS`}
                </h1>

                <div className="text-5xl text-white font-mono mt-6 tracking-widest font-bold">
                    <span className="text-blue-400">{matchState.blueScore}</span>
                    <span className="mx-4 text-gray-600">-</span>
                    <span className="text-red-500">{matchState.redScore}</span>
                </div>
            </div>

            {/* 2. БЛОК MVP */}
            <div
                className={`relative z-10 w-full max-w-3xl mt-16 bg-[#0a1220] border border-white/10 p-1 shadow-2xl transition-all duration-1000 ease-out transform 
                ${animationStep >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-20'}`}
            >
                {/* Плашка MVP */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-black px-6 py-2 text-sm tracking-widest uppercase rounded shadow-[0_0_20px_#eab308] z-20">
                    MVP // Most Valuable Pilot
                </div>

                <div className="bg-[#0f192b] p-8 flex items-center justify-between relative overflow-hidden">
                    {/* Сяйво */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/5 blur-[60px] rounded-full pointer-events-none"></div>

                    <div className="flex flex-col relative z-10">
                        <span className="text-gray-500 text-xs tracking-widest uppercase mb-1">Pilot Callsign</span>
                        <span className="text-5xl text-white font-black tracking-wide drop-shadow-md">{mvp.name}</span>
                        <span className={`text-xs font-bold px-3 py-1 mt-3 w-fit rounded uppercase tracking-wider ${mvp.team === 'BLUE' ? 'bg-blue-900/50 text-blue-300 border border-blue-500/30' : 'bg-red-900/50 text-red-300 border border-red-500/30'}`}>
                            {mvp.team} Squadron
                        </span>
                    </div>

                    <div className="flex gap-12 text-center z-10">
                        <div className="flex flex-col items-center">
                            <div className="text-yellow-400 text-4xl font-black drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">{mvp.goals || 0}</div>
                            <div className="text-gray-500 text-[10px] tracking-[0.2em] uppercase mt-1">Goals</div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-green-400 text-4xl font-black drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">{mvp.kills}</div>
                            <div className="text-gray-500 text-[10px] tracking-[0.2em] uppercase mt-1">Kills</div>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="text-cyan-400 text-4xl font-black drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">{calculateScore(mvp)}</div>
                            <div className="text-gray-500 text-[10px] tracking-[0.2em] uppercase mt-1">Score</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. СПИСОК ІНШИХ ГРАВЦІВ */}
            <div
                className={`w-full max-w-3xl space-y-1 mt-4 transition-all duration-1000 ease-out 
                ${animationStep >= 3 ? 'opacity-100' : 'opacity-0'}`}
            >
                {sortedByPerformance.slice(1, 5).map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between bg-white/5 px-6 py-3 border-l-2 border-white/10 hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-4">
                            <span className="text-gray-600 font-mono text-sm">#{idx + 2}</span>
                            <span className="text-gray-300 font-bold tracking-wide">{p.name}</span>
                        </div>
                        <div className="flex gap-8 font-mono text-sm text-gray-400">
                            <span className="text-yellow-500/80 font-bold">{p.goals || 0} G</span>
                            <span className="text-green-500/80 font-bold">{p.kills} K</span>
                            <span className="text-white w-20 text-right font-bold">{calculateScore(p)} PTS</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* 4. КНОПКА ВИХОДУ */}
            <div className="h-24 mt-10 flex items-center justify-center">
                {animationStep >= 4 ? (
                    <button
                        onClick={onReturnToLobby}
                        className="group relative px-10 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black tracking-[0.2em] transition-all duration-300 animate-[zoomIn_0.3s_ease-out] shadow-[0_0_30px_rgba(8,145,178,0.4)]"
                        style={{ clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)' }}
                    >
                        <span className="relative z-10 group-hover:drop-shadow-[0_0_10px_white]">RETURN TO BASE</span>
                    </button>
                ) : (
                    <div className={`flex items-center gap-2 text-cyan-500/50 text-xs tracking-widest animate-pulse transition-opacity duration-500 ${animationStep >= 1 ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full"></div>
                        SYNCING BATTLE DATA...
                    </div>
                )}
            </div>
        </div>
    );
};