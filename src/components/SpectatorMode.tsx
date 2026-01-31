import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface SpectatorModeProps {
    onRespawn?: () => void; // Проп опціональний, тут він для сумісності
}

export const SpectatorMode: React.FC<SpectatorModeProps> = () => {
    const { camera } = useThree();
    const controlsRef = useRef<any>(null);

    // При старті режиму піднімаємо камеру гарно вгору
    useEffect(() => {
        camera.position.set(0, 150, 200); // Висота 150, відстань 200
        camera.lookAt(0, 0, 0);
    }, [camera]);

    return (
        <OrbitControls
            ref={controlsRef}
            makeDefault
            autoRotate
            autoRotateSpeed={2.0} // Швидкість обертання
            maxPolarAngle={Math.PI / 2.2} // Щоб не можна було залізти під воду
            minDistance={50}
            maxDistance={400}
        />
    );
};