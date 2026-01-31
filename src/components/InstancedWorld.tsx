import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { WORLD_DATA } from '../utils/mapData';

// ОПТИМІЗАЦІЯ 1: ПРОСТА ГЕОМЕТРІЯ
const islandGeo = new THREE.DodecahedronGeometry(1, 0);
const reefGeo = new THREE.IcosahedronGeometry(1, 0);
const treeGeo = new THREE.ConeGeometry(0.5, 2, 4);

// ОПТИМІЗАЦІЯ 1 (продовження): ДЕШЕВІ МАТЕРІАЛИ
const islandMat = new THREE.MeshLambertMaterial({ color: '#4a4a4a' });
const reefMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });
const treeMat = new THREE.MeshLambertMaterial({ color: '#0f5f0f' });

export const InstancedWorld = () => {
    const islands = useMemo(() => WORLD_DATA.obstacles.filter(o => o.type === 'island'), []);
    const reefs = useMemo(() => WORLD_DATA.obstacles.filter(o => o.type === 'reef'), []);

    const islandRef = useRef<THREE.InstancedMesh>(null);
    const reefRef = useRef<THREE.InstancedMesh>(null);
    const treeRef = useRef<THREE.InstancedMesh>(null);

    useLayoutEffect(() => {
        const tempObj = new THREE.Object3D();

        const setupInstances = (ref: React.RefObject<THREE.InstancedMesh>, data: any[]) => {
            if (!ref.current) return;

            // Шар 1 (вода не віддзеркалює)
            ref.current.layers.set(1);

            // Frustum Culling (не малювати поза екраном)
            ref.current.frustumCulled = true;

            data.forEach((item, i) => {
                tempObj.position.set(item.position[0], item.position[1], item.position[2]);
                tempObj.scale.set(...item.scale);
                tempObj.rotation.set(...item.rotation);
                tempObj.updateMatrix();
                ref.current!.setMatrixAt(i, tempObj.matrix);
            });

            ref.current.instanceMatrix.needsUpdate = true;
            ref.current.computeBoundingSphere();
        };

        setupInstances(islandRef, islands);
        setupInstances(reefRef, reefs);
        setupInstances(treeRef, WORLD_DATA.trees);
    }, [islands, reefs]);

    return (
        <group>
            {/* ОПТИМІЗАЦІЯ 2: ТІНІ */}

            {/* 1. Острови: Великі, тому залишаємо castShadow (кидають тінь) */}
            <instancedMesh ref={islandRef} args={[islandGeo, islandMat, islands.length]} castShadow receiveShadow />

            {/* 2. Рифи: Маленькі/низькі. Вимкнули castShadow. Тільки receiveShadow (приймають тінь від інших) */}
            <instancedMesh ref={reefRef} args={[reefGeo, reefMat, reefs.length]} receiveShadow />

            {/* 3. Дерева: Дрібні деталі. Вимкнули castShadow. Це економить купу ресурсів. */}
            <instancedMesh ref={treeRef} args={[treeGeo, treeMat, WORLD_DATA.trees.length]} receiveShadow />
        </group>
    );
};