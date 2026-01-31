import React, { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';

interface OverlayProps {
    onRespawn: () => void;
    targetTime: number; // Це точний час (timestamp), коли гравець має воскреснути
}

export const SpectatorOverlay: React.FC<OverlayProps> = ({ onRespawn, targetTime }) => {
    const [timeLeft, setTimeLeft] = useState(10);
    const [opacity, setOpacity] = useState(0);
    const TOTAL_WAIT_TIME = 10;

    useEffect(() => {
        const fadeTimer = setTimeout(() => setOpacity(1), 100);
        return () => clearTimeout(fadeTimer);
    }, []);

    // Таймер синхронізації
    useEffect(() => {
        const updateTimer = () => {
            const now = Date.now();
            // Рахуємо різницю: (Час воскресіння - Поточний час) / 1000
            const diff = Math.ceil((targetTime - now) / 1000);

            if (diff <= 0) {
                setTimeLeft(0);
                // Не викликаємо onRespawn, чекаємо події від сервера
            } else {
                setTimeLeft(diff);
            }
        };

        updateTimer();
        const timer = setInterval(updateTimer, 200);
        return () => clearInterval(timer);
    }, [targetTime]);

    const progressPercent = Math.min(100, Math.max(0, (timeLeft / TOTAL_WAIT_TIME) * 100));

    return (
        <Html fullscreen zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
            <div
                className="w-full h-full flex flex-col justify-between p-10 transition-opacity duration-[500ms] select-none"
                style={{ opacity: opacity }}
            >
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,10,20,0.9)_100%)]"></div>
                <div className="absolute inset-0 -z-10 bg-red-900/10 mix-blend-overlay"></div>

                <div className="flex justify-center pt-4">
                    <div className="bg-black/80 backdrop-blur-md px-12 py-3 rounded-b-lg border-x border-b border-red-500/30 shadow-[0_0_20px_rgba(255,0,0,0.2)]">
                        <h1 className="text-red-500 font-mono text-xl tracking-[0.5em] font-bold animate-pulse">
                            SIGNAL LOST
                        </h1>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-4 pb-20 pointer-events-auto">
                    <div className="text-cyan-200/50 font-mono text-xs tracking-widest uppercase">
                        System Rebooting...
                    </div>

                    <div className="flex flex-col items-center relative">
                        <div className="absolute -left-12 top-0 h-full w-4 border-l-2 border-t-2 border-b-2 border-red-500/30"></div>
                        <div className="absolute -right-12 top-0 h-full w-4 border-r-2 border-t-2 border-b-2 border-red-500/30"></div>

                        <div className="text-8xl font-black text-white font-mono drop-shadow-[0_0_25px_rgba(255,0,0,0.6)] tabular-nums">
                            00:{timeLeft.toString().padStart(2, '0')}
                        </div>

                        <div className="text-red-400 text-[10px] tracking-[1em] mt-2 animate-pulse font-bold">
                            ESTABLISHING UPLINK
                        </div>
                    </div>

                    <div className="w-96 h-1.5 bg-slate-900/80 rounded-full mt-6 overflow-hidden relative border border-white/10">
                        <div
                            className="h-full bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_15px_red]"
                            style={{
                                width: `${progressPercent}%`,
                                transition: 'width 0.2s linear'
                            }}
                        ></div>
                    </div>
                </div>
            </div>
        </Html>
    );
};