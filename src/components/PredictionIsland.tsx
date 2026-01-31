import React from 'react';
import { Instance, Instances } from '@react-three/drei';
import { WORLD_DATA } from '../utils/mapData';

// Кольори
const ISLAND_ROCK_COLOR = "#7a7a7a";
const REEF_COLOR = "#1a1a1a";
const TRUNK_COLOR = "#8B4513";
const LEAF_COLOR = "#228b22";

export const PredictionIsland: React.FC = () => {
  const islands = WORLD_DATA.obstacles.filter(o => o.type === 'island');
  const reefs = WORLD_DATA.obstacles.filter(o => o.type === 'reef');
  const trees = WORLD_DATA.trees;

  return (
    <group>
      {/* ВИПРАВЛЕННЯ: layers={1} тепер стоїть у батьківському компоненті <Instances>.
         Саме він створює InstancedMesh, який рендерить відеокарта.
         Тепер вода (яка бачить тільки шар 0) ігноруватиме ці об'єкти.
      */}

      {/* 1. ОСТРОВИ */}
      <Instances range={islands.length} layers={1}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshLambertMaterial color={ISLAND_ROCK_COLOR} />
        {islands.map((data, i) => (
          <Instance
            key={i}
            position={data.position}
            scale={data.scale}
            rotation={data.rotation}
          />
        ))}
      </Instances>

      {/* 2. РИФИ */}
      <Instances range={reefs.length} layers={1}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshLambertMaterial color={REEF_COLOR} />
        {reefs.map((data, i) => (
          <Instance
            key={i}
            position={data.position}
            scale={data.scale}
            rotation={data.rotation}
          />
        ))}
      </Instances>

      {/* 3. СТОВБУРИ */}
      <Instances range={trees.length} layers={1}>
        <cylinderGeometry args={[0.3, 0.5, 6, 5]} />
        <meshLambertMaterial color={TRUNK_COLOR} />
        {trees.map((data, i) => (
          <Instance
            key={i}
            position={[data.position[0], data.position[1] + 3, data.position[2]]}
            scale={data.scale}
            rotation={data.rotation}
          />
        ))}
      </Instances>

      {/* 4. ЛИСТЯ */}
      <Instances range={trees.length} layers={1}>
        <coneGeometry args={[3.5, 3, 5]} />
        <meshLambertMaterial color={LEAF_COLOR} />
        {trees.map((data, i) => (
          <Instance
            key={i}
            position={[data.position[0], data.position[1] + 6, data.position[2]]}
            scale={data.scale}
            rotation={data.rotation}
          />
        ))}
      </Instances>
    </group>
  );
};