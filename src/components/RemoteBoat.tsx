import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';

interface RemoteBoatProps {
    position: { x: number, y: number, z: number };
    rotation: number;
    team: string;
}

export const RemoteBoat: React.FC<RemoteBoatProps> = ({ position, rotation, team }) => {
    const { scene } = useGLTF('/models/boat.glb');
    // Клонуємо модель, щоб мати багато човнів
    const clone = useMemo(() => scene.clone(), [scene]);

    return (
        <group position={[position.x, position.y, position.z]} rotation={[0, rotation, 0]}>
            {/* Трохи піднімемо модель і розвернемо, як в оригіналі */}
            <primitive object={clone} scale={0.7} rotation={[0, Math.PI / 2, 0]} />

            {/* Маркер команди над човном */}
            <mesh position={[0, 2, 0]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshBasicMaterial color={team === 'BLUE' ? '#0088ff' : '#ff2200'} />
            </mesh>
        </group>
    );
};