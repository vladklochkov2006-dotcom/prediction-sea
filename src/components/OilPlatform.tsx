import React, { useRef, useState, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface PlatformProps {
    position: [number, number, number];
    playerPosRef?: React.MutableRefObject<THREE.Vector3>;
    isCarryingOil?: boolean;
    onOilPickUp?: () => void;
    isEPressed?: boolean;
    oilHolder?: string;
}

export const OilPlatform: React.FC<PlatformProps> = ({
    position,
    playerPosRef,
    isCarryingOil = false,
    onOilPickUp,
    isEPressed = false,
    oilHolder = 'none'
}) => {
    const groupRef = useRef<THREE.Group>(null);
    const craneRef = useRef<THREE.Group>(null);
    const drillRef = useRef<THREE.Mesh>(null);
    const zoneRef = useRef<THREE.Mesh>(null);

    const [loadingProgress, setLoadingProgress] = useState(0);
    const LOADING_TIME = 15;
    const ZONE_RADIUS = 35;

    const [showPrompt, setShowPrompt] = useState(false);

    // Перевірка: чи нафта вже кимось забрана?
    const isRigEmpty = oilHolder === 'none';
    const isRigLocked = !isRigEmpty; // Заблоковано, якщо нафта у когось

    useLayoutEffect(() => {
        if (groupRef.current) {
            groupRef.current.traverse((obj) => { obj.layers.set(1); });
        }
    }, []);

    useFrame((state, delta) => {
        const t = state.clock.elapsedTime;

        // Анімація крана
        if (craneRef.current) craneRef.current.rotation.y = Math.sin(t * 0.05) * 0.5 - 0.5;
        if (drillRef.current) drillRef.current.rotation.y += 0.5;

        if (playerPosRef && onOilPickUp) {
            const dist = Math.sqrt(
                Math.pow(playerPosRef.current.x - position[0], 2) +
                Math.pow(playerPosRef.current.z - position[2], 2)
            );

            const inZone = dist < ZONE_RADIUS;

            // Умова: Можна брати ТІЛЬКИ якщо вишка пуста (isRigEmpty) і ми без нафти
            const canLoad = inZone && !isCarryingOil && isRigEmpty;

            setShowPrompt(canLoad && !isEPressed && loadingProgress < 1);

            // Керування кольором кільця
            if (zoneRef.current) {
                const scale = 1 + Math.sin(t * 3) * 0.05;
                zoneRef.current.scale.set(scale, scale, 1);

                const mat = zoneRef.current.material as THREE.MeshBasicMaterial;

                if (isRigLocked) {
                    // ЧЕРВОНИЙ - якщо хтось вже взяв нафту (БЛОКУВАННЯ)
                    mat.color.setHex(0xff0000);
                    mat.opacity = 0.2;
                } else if (isCarryingOil) {
                    // СІРИЙ - якщо ми вже несемо нафту
                    mat.color.setHex(0x555555);
                    mat.opacity = 0.1;
                } else if (inZone) {
                    // ЖОВТИЙ/ЗЕЛЕНИЙ - процес або готовність
                    mat.color.setHex(isEPressed ? 0xffff00 : 0x00ff00);
                    mat.opacity = isEPressed ? 0.6 : 0.3;
                } else {
                    // ЗЕЛЕНИЙ - простоює
                    mat.color.setHex(0x00ff00);
                    mat.opacity = 0.3;
                }
            }

            // Логіка таймера
            if (canLoad && isEPressed) {
                setLoadingProgress(prev => {
                    const newProgress = prev + (delta / LOADING_TIME) * 100;
                    if (newProgress >= 100) {
                        onOilPickUp();
                        return 0;
                    }
                    return newProgress;
                });
            } else {
                setLoadingProgress(prev => Math.max(0, prev - (delta * 30)));
            }
        }
    });

    return (
        <group ref={groupRef} position={position}>

            {/* ПІДКАЗКА "HOLD E" (Додав pointer-events-none select-none, щоб не виділялась як текст) */}
            {showPrompt && (
                <Html position={[0, 2, 0]} center zIndexRange={[50, 0]}>
                    <div className="bg-black/60 backdrop-blur-sm border border-yellow-400/50 px-4 py-2 rounded animate-bounce pointer-events-none select-none">
                        <span className="text-yellow-400 font-bold font-mono text-sm tracking-widest whitespace-nowrap">
                            HOLD [E] TO LOAD
                        </span>
                    </div>
                </Html>
            )}

            {/* МИ ПРИБРАЛИ БАНЕР "SYSTEM EMPTY" ПОВНІСТЮ */}
            {/* Тепер про те, що система пуста, свідчить червоне кільце на воді */}

            {/* ПРОГРЕС БАР */}
            {loadingProgress > 0 && !isCarryingOil && (
                <Html position={[0, 2, 0]} center zIndexRange={[50, 0]}>
                    <div className="flex flex-col items-center gap-2 pointer-events-none select-none">
                        <div className="text-yellow-400 font-mono font-bold text-lg animate-pulse whitespace-nowrap drop-shadow-md">
                            PUMPING CRUDE OIL...
                        </div>
                        <div className="w-48 h-4 bg-black/80 border border-slate-600 rounded-full overflow-hidden p-0.5">
                            <div
                                className="h-full bg-yellow-500 shadow-[0_0_15px_orange]"
                                style={{ width: `${loadingProgress}%` }}
                            ></div>
                        </div>
                        <div className="text-white font-mono text-sm font-bold">
                            {Math.round(loadingProgress)}%
                        </div>
                    </div>
                </Html>
            )}

            {/* Зона завантаження */}
            <group position={[0, 1, 0]}>
                <mesh ref={zoneRef} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[ZONE_RADIUS - 2, ZONE_RADIUS, 64]} />
                    <meshBasicMaterial color="#00ff00" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
            </group>

            {/* ГЕОМЕТРІЯ */}
            <group position={[0, -25, 0]}>
                <mesh position={[-45, 0, -45]}><cylinderGeometry args={[12, 12, 80, 16]} /><meshStandardMaterial color="#555" roughness={0.9} /></mesh>
                <mesh position={[45, 0, -45]}><cylinderGeometry args={[12, 12, 80, 16]} /><meshStandardMaterial color="#555" roughness={0.9} /></mesh>
                <mesh position={[-45, 0, 45]}><cylinderGeometry args={[12, 12, 80, 16]} /><meshStandardMaterial color="#555" roughness={0.9} /></mesh>
                <mesh position={[45, 0, 45]}><cylinderGeometry args={[12, 12, 80, 16]} /><meshStandardMaterial color="#555" roughness={0.9} /></mesh>
                <mesh position={[0, 15, 0]}><boxGeometry args={[100, 5, 100]} /><meshStandardMaterial color="#444" roughness={0.9} /></mesh>
            </group>

            <group position={[0, 18, 0]}>
                <mesh position={[0, -4, 0]}><boxGeometry args={[130, 6, 130]} /><meshStandardMaterial color="#2a2a2a" roughness={0.7} /></mesh>
                <mesh position={[0, 0, 0]}><boxGeometry args={[140, 2, 140]} /><meshStandardMaterial color="#444" roughness={0.6} /></mesh>
                <mesh position={[0, 2, 0]}><boxGeometry args={[142, 2, 142]} /><meshStandardMaterial color="#ffcc00" wireframe /></mesh>
            </group>

            <group position={[0, 20, 0]}>
                <mesh position={[0, 5, 0]}><boxGeometry args={[30, 10, 30]} /><meshStandardMaterial color="#333" /></mesh>
                <mesh position={[0, 35, 0]}><cylinderGeometry args={[10, 20, 70, 4, 1, true]} /><meshStandardMaterial color="#666" side={2} /></mesh>
                <mesh position={[0, 35, 0]}><cylinderGeometry args={[9.5, 19.5, 70, 4, 4]} /><meshStandardMaterial color="#222" wireframe /></mesh>
                <mesh ref={drillRef} position={[0, 20, 0]}><cylinderGeometry args={[3, 3, 60]} /><meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} /></mesh>
                <mesh position={[0, 72, 0]}><boxGeometry args={[12, 4, 12]} /><meshStandardMaterial color="#ffcc00" /></mesh>
                <pointLight position={[0, 75, 0]} color="red" distance={200} intensity={2} decay={2} />
            </group>

            <group position={[-50, 30, 50]}>
                <mesh><boxGeometry args={[35, 25, 35]} /><meshStandardMaterial color="#ddd" roughness={0.2} /></mesh>
                <group position={[0, 13, 0]}>
                    <mesh><cylinderGeometry args={[24, 22, 2, 8]} /><meshStandardMaterial color="#333" /></mesh>
                    <mesh position={[0, 1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[20, 22, 32]} /><meshBasicMaterial color="yellow" /></mesh>
                </group>
            </group>

            <group ref={craneRef} position={[50, 25, -50]} rotation={[0, -Math.PI / 4, 0]}>
                <mesh position={[0, 5, 0]}><boxGeometry args={[10, 12, 10]} /><meshStandardMaterial color="#ffaa00" /></mesh>
                <mesh position={[0, 10, 30]} rotation={[0.2, 0, 0]}><boxGeometry args={[4, 4, 70]} /><meshStandardMaterial color="#ffaa00" /></mesh>
            </group>
        </group>
    );
};