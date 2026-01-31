import * as THREE from 'three';

export interface Obstacle {
    position: [number, number, number];
    radius: number;
    scale: [number, number, number];
    rotation: [number, number, number];
    type: 'island' | 'reef' | 'boundary';
}

export interface TreeData {
    position: [number, number, number];
    scale: [number, number, number];
    rotation: [number, number, number];
}

export const MAP_DEPTH = 3620;
export const MAP_WIDTH = 4800;
export const BOUNDARY_POSITIONS: [number, number, number][] = [];

let seedValue = 444;
const seededRandom = () => {
    seedValue = (seedValue * 9301 + 49297) % 233280;
    return seedValue / 233280;
};

export const generateWorldData = () => {
    seedValue = 444;
    const obstacles: Obstacle[] = [];
    const trees: TreeData[] = [];

    // --- ЗОНИ БЕЗ СПАВНУ ---
    const isInsideMesh = (x: number, z: number) => {
        if (Math.abs(x) < 80 && Math.abs(z) < 80) return true;
        if (Math.abs(x) < 80 && Math.abs(z - -1400) < 100) return true;
        if (Math.abs(x) < 80 && Math.abs(z - 1400) < 100) return true;
        return false;
    };

    // --- ГЕНЕРАЦІЯ ---
    const placeMirrored = (x: number, z: number, type: 'island' | 'reef', scale: number, rot: number) => {
        const y = (type === 'island' ? 12 : 2) * 0.4 - 2;
        if (isInsideMesh(x, z)) return;

        obstacles.push({
            position: [x, y, z],
            radius: scale * 0.6,
            scale: [scale, scale * (type === 'island' ? 1.8 : 0.8), scale],
            rotation: [0, rot, 0],
            type: type
        });

        const tCount = (type === 'island' && scale > 10) ? 1 : 0;
        if (tCount > 0) {
            trees.push({
                position: [x, y + scale * 0.5, z],
                scale: [2.5, 2.5, 2.5],
                rotation: [0, seededRandom(), 0]
            });
        }

        if (isInsideMesh(-x, -z)) return;

        obstacles.push({
            position: [-x, y, -z],
            radius: scale * 0.6,
            scale: [scale, scale * (type === 'island' ? 1.8 : 0.8), scale],
            rotation: [0, rot + Math.PI, 0],
            type: type
        });

        if (tCount > 0) {
            trees.push({
                position: [-x, y + scale * 0.5, -z],
                scale: [2.5, 2.5, 2.5],
                rotation: [0, seededRandom(), 0]
            });
        }
    };

    const addCluster = (cx: number, cz: number) => {
        const mainType = seededRandom() > 0.4 ? 'island' : 'reef';
        const mainScale = mainType === 'island' ? (14 + seededRandom() * 8) : (8 + seededRandom() * 6);
        placeMirrored(cx, cz, mainType, mainScale, seededRandom() * 6);

        const subCount = 1 + Math.floor(seededRandom() * 2);
        for (let i = 0; i < subCount; i++) {
            const ang = seededRandom() * 6.28;
            const dist = 25 + seededRandom() * 35;
            const sx = cx + Math.cos(ang) * dist;
            const sz = cz + Math.sin(ang) * dist;
            const sType = seededRandom() > 0.7 ? 'island' : 'reef';
            const sScale = 4 + seededRandom() * 5;
            placeMirrored(sx, sz, sType, sScale, seededRandom() * 6);
        }
    };

    const STEP = 210;
    for (let x = -2100; x <= 2100; x += STEP) {
        for (let z = -1700; z <= 0; z += STEP) {
            const ox = (seededRandom() - 0.5) * 100;
            const oz = (seededRandom() - 0.5) * 100;
            if (seededRandom() > 0.9) continue;
            addCluster(x + ox, z + oz);
        }
    }

    // --- КОРДОНИ СВІТУ ---
    const halfW = MAP_WIDTH / 2;
    const halfD = MAP_DEPTH / 2;
    BOUNDARY_POSITIONS.length = 0;
    for (let x = -halfW; x <= halfW; x += 100) { BOUNDARY_POSITIONS.push([x, -3.5, -halfD]); BOUNDARY_POSITIONS.push([x, -3.5, halfD]); }
    for (let z = -halfD + 100; z < halfD; z += 100) { BOUNDARY_POSITIONS.push([-halfW, -3.5, z]); BOUNDARY_POSITIONS.push([halfW, -3.5, z]); }

    const addWall = (x: number, z: number) => { obstacles.push({ position: [x, 0, z], radius: 12, scale: [1, 1, 1], rotation: [0, 0, 0], type: 'boundary' }); };
    for (let x = -halfW; x <= halfW; x += 20) { addWall(x, -halfD); addWall(x, halfD); }
    for (let z = -halfD; z <= halfD; z += 20) { addWall(-halfW, z); addWall(halfW, z); }

    const addBase = (zCenter: number) => {
        for (let x = -50; x <= 50; x += 5) obstacles.push({ position: [x, 0, zCenter + (zCenter > 0 ? 25 : -25)], radius: 5, scale: [1, 1, 1], rotation: [0, 0, 0], type: 'boundary' });
        for (let z = -40; z <= 40; z += 5) {
            obstacles.push({ position: [-45, 0, zCenter + z], radius: 5, scale: [1, 1, 1], rotation: [0, 0, 0], type: 'boundary' });
            obstacles.push({ position: [45, 0, zCenter + z], radius: 5, scale: [1, 1, 1], rotation: [0, 0, 0], type: 'boundary' });
        }
    };
    addBase(-1400); addBase(1400);

    // --- КОЛІЗІЇ ДЛЯ OIL RIGS (ВИПРАВЛЕНО) ---
    const rigLegs = [
        [-45, -45],
        [45, -45],
        [-45, 45],
        [45, 45]
    ];

    rigLegs.forEach(([lx, lz]) => {
        obstacles.push({
            position: [lx, 0, lz],
            // БУЛО 15 (дуже великий запас)
            // СТАЛО 11 (трохи менше за візуальний радіус 12)
            // Тепер можна підпливти впритул
            radius: 11,
            scale: [1, 1, 1],
            rotation: [0, 0, 0],
            type: 'boundary'
        });
    });

    return { obstacles, trees };
};

export const WORLD_DATA = generateWorldData();

// --- SPATIAL GRID ---
const CHUNK_SIZE = 250;
const grid = new Map<string, Obstacle[]>();

WORLD_DATA.obstacles.forEach(obs => {
    const key = `${Math.floor(obs.position[0] / CHUNK_SIZE)},${Math.floor(obs.position[2] / CHUNK_SIZE)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(obs);
});

export const getNearbyObstacles = (x: number, z: number) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    let nearby: Obstacle[] = [];
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            const key = `${cx + i},${cz + j}`;
            if (grid.has(key)) nearby = nearby.concat(grid.get(key)!);
        }
    }
    return nearby;
};