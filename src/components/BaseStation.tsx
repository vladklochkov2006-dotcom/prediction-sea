import React, { useLayoutEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// --- КОМПОНЕНТ ЗОНИ ЗДАЧІ (БЕЗ ЗМІН) ---
const PulsingZone = ({ color }: { color: string }) => {
    const ringRef = useRef<THREE.Mesh>(null);
    const lightRef = useRef<THREE.PointLight>(null);

    useFrame((state) => {
        const time = state.clock.getElapsedTime();

        if (ringRef.current) {
            const scale = 1 + Math.sin(time * 2.5) * 0.05;
            ringRef.current.scale.set(scale, scale, 1);

            const opacity = 0.6 + Math.sin(time * 2.5) * 0.3;
            if (ringRef.current.material instanceof THREE.MeshBasicMaterial) {
                ringRef.current.material.opacity = opacity;
            }
        }

        if (lightRef.current) {
            lightRef.current.intensity = 15 + Math.sin(time * 2.5) * 5;
        }
    });

    return (
        <group>
            <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                <ringGeometry args={[3.5, 4.5, 32]} />
                <meshBasicMaterial color={color} transparent side={THREE.DoubleSide} toneMapped={false} />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[2, 6, 32]} />
                <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>

            <pointLight ref={lightRef} position={[0, 3, 0]} color={color} distance={20} decay={2} />
        </group>
    );
};

interface BaseStationProps {
    position: [number, number, number];
    team: string; // 'RED' | 'BLUE'
    playerPosRef?: React.MutableRefObject<THREE.Vector3>;
    isCarryingOil?: boolean;
    onDeliver?: () => void;
    playerTeam?: string;
    isEPressed?: boolean;
}

export const BaseStation: React.FC<BaseStationProps> = ({
    position,
    team,
    playerPosRef,
    isCarryingOil,
    onDeliver,
    playerTeam,
    isEPressed = false
}) => {
    const groupRef = useRef<THREE.Group>(null);
    const isRed = team === 'RED';
    const rotation: [number, number, number] = isRed ? [0, Math.PI, 0] : [0, 0, 0];

    const concreteColor = '#4a4a4a';
    const metalColor = '#222222';
    const neonZoneColor = '#00ffff';

    const [unloadProgress, setUnloadProgress] = useState(0);
    // Додаємо стан для видимості підказки
    const [showPrompt, setShowPrompt] = useState(false);

    const UNLOAD_TIME = 5;

    useLayoutEffect(() => {
        if (groupRef.current) {
            groupRef.current.traverse((obj) => {
                obj.layers.set(1);
                if (obj instanceof THREE.Mesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });
        }
    }, []);

    useFrame((state, delta) => {
        const isMyBase = playerTeam === team;

        if (isMyBase && playerPosRef && onDeliver) {
            const dist = Math.sqrt(
                Math.pow(playerPosRef.current.x - position[0], 2) +
                Math.pow(playerPosRef.current.z - position[2], 2)
            );

            // Умова розвантаження: Радіус < 65 метрів
            const inZone = dist < 65;
            const canUnload = inZone && isCarryingOil;

            // Керування видимістю підказки (Тільки коли ми близько!)
            // Показуємо, якщо можемо розвантажити, ще не почали процес, і не тримаємо кнопку
            setShowPrompt(canUnload && !isEPressed && unloadProgress === 0);

            if (canUnload && isEPressed) {
                setUnloadProgress(prev => {
                    const newProgress = prev + (delta / UNLOAD_TIME) * 100;
                    if (newProgress >= 100) {
                        onDeliver();
                        return 0;
                    }
                    return newProgress;
                });
            } else {
                setUnloadProgress(prev => Math.max(0, prev - (delta * 50)));
            }
        }
    });

    return (
        <group ref={groupRef} position={position} rotation={rotation}>

            {/* === ІНТЕРФЕЙС === */}

            {/* Підказка "HOLD E" (Тепер залежить від showPrompt) */}
            {playerTeam === team && showPrompt && (
                <Html position={[35, 2, 35]} center zIndexRange={[50, 0]}>
                    <div className="bg-blue-900/80 border border-blue-400 px-4 py-2 rounded animate-bounce pointer-events-none select-none">
                        <span className="text-blue-200 font-bold font-mono text-sm tracking-widest whitespace-nowrap">
                            HOLD [E] TO UNLOAD
                        </span>
                    </div>
                </Html>
            )}

            {/* Шкала прогресу */}
            {unloadProgress > 0 && (
                <Html position={[35, 2, 35]} center zIndexRange={[60, 0]}>
                    <div className="flex flex-col items-center gap-1 pointer-events-none select-none">
                        <div className="text-blue-400 font-mono font-bold text-lg animate-pulse whitespace-nowrap drop-shadow-md">
                            TRANSFERRING...
                        </div>
                        <div className="w-32 h-3 bg-black/80 border border-slate-600 rounded-full overflow-hidden p-0.5">
                            <div
                                className="h-full bg-blue-500 shadow-[0_0_15px_cyan]"
                                style={{ width: `${unloadProgress}%` }}
                            ></div>
                        </div>
                    </div>
                </Html>
            )}


            {/* === 1. ОСНОВА "ПІДКОВА" === */}
            <mesh position={[-45, 2, 20]}>
                <boxGeometry args={[10, 4, 80]} />
                <meshStandardMaterial color={concreteColor} roughness={0.8} />
            </mesh>
            <mesh position={[-40.5, 4.5, 20]}>
                <boxGeometry args={[1, 1, 80]} />
                <meshStandardMaterial color={metalColor} />
            </mesh>

            <mesh position={[45, 2, 20]}>
                <boxGeometry args={[10, 4, 80]} />
                <meshStandardMaterial color={concreteColor} roughness={0.8} />
            </mesh>
            <mesh position={[40.5, 4.5, 20]}>
                <boxGeometry args={[1, 1, 80]} />
                <meshStandardMaterial color={metalColor} />
            </mesh>

            <mesh position={[0, 2, -20]}>
                <boxGeometry args={[100, 4, 20]} />
                <meshStandardMaterial color={concreteColor} roughness={0.8} />
            </mesh>

            {/* === 2. ДАХ АНГАРУ === */}
            <group position={[0, 20, -5]}>
                <mesh>
                    <boxGeometry args={[110, 2, 60]} />
                    <meshStandardMaterial color={metalColor} roughness={0.5} />
                </mesh>

                <mesh position={[-45, -10, 20]}>
                    <boxGeometry args={[4, 20, 4]} />
                    <meshStandardMaterial color={concreteColor} />
                </mesh>
                <mesh position={[45, -10, 20]}>
                    <boxGeometry args={[4, 20, 4]} />
                    <meshStandardMaterial color={concreteColor} />
                </mesh>
                <mesh position={[-45, -10, -20]}>
                    <boxGeometry args={[4, 20, 4]} />
                    <meshStandardMaterial color={concreteColor} />
                </mesh>
                <mesh position={[45, -10, -20]}>
                    <boxGeometry args={[4, 20, 4]} />
                    <meshStandardMaterial color={concreteColor} />
                </mesh>

                <pointLight position={[0, -5, 0]} intensity={15} distance={120} color="#ffffff" decay={2} />
            </group>

            {/* === 3. ЗОНА ПРИЙОМУ НАФТИ === */}
            <group position={[35, -0.45, 35]}>
                <PulsingZone color={neonZoneColor} />

                {/* Труба */}
                <mesh position={[5, 5, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[1, 1, 6]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                <mesh position={[2, 5, 0]} rotation={[0, 0, 0]}>
                    <cylinderGeometry args={[1.2, 1.2, 1]} />
                    <meshStandardMaterial color={neonZoneColor} emissive={neonZoneColor} />
                </mesh>
            </group>

            {/* === 4. РОЗМІТКА СПАВНУ === */}
            <group position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <mesh position={[-20, 0, 0]}>
                    <planeGeometry args={[1.5, 50]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.8} toneMapped={false} />
                </mesh>
                <mesh position={[0, 0, 0]}>
                    <planeGeometry args={[1.5, 50]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.8} toneMapped={false} />
                </mesh>
                <mesh position={[20, 0, 0]}>
                    <planeGeometry args={[1.5, 50]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.8} toneMapped={false} />
                </mesh>
            </group>

            <mesh position={[0, 10, -28]}>
                <boxGeometry args={[108, 20, 2]} />
                <meshStandardMaterial color={metalColor} />
            </mesh>

        </group>
    );
};