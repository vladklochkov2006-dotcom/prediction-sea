import React from 'react';
import * as THREE from 'three';
import { BOUNDARY_POSITIONS } from '../utils/mapData';

const buoyBodyGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.5, 12);
const buoyBodyMat = new THREE.MeshStandardMaterial({ color: '#dd1100', roughness: 0.6 });
const buoyTopGeo = new THREE.SphereGeometry(0.5, 12, 12);
const buoyTopMat = new THREE.MeshBasicMaterial({ color: '#ffff00' });

export const Boundary: React.FC = () => {
    return (
        <group>
            {BOUNDARY_POSITIONS.map((pos, i) => (
                <group key={i} position={pos} scale={[5, 5, 5]}>
                    <mesh geometry={buoyBodyGeo} material={buoyBodyMat} layers={1} />
                    <mesh geometry={buoyTopGeo} material={buoyTopMat} position={[0, 1.25, 0]} layers={1} />
                </group>
            ))}
        </group>
    );
};