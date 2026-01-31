import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, extend, useLoader, useThree } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Water } from 'three-stdlib';

import { HoverBoat } from './Hoverboat';
import { Boundary } from './Boundary';
import { PredictionIsland } from './PredictionIsland';
import { BaseStation } from './BaseStation';
import { OilPlatform } from './OilPlatform';
import { SpectatorMode } from './SpectatorMode';
import { socket } from '../socket';

extend({ Water });

// --- КОРАБЕЛЬ ВОРОГА ---
const RivalShip = ({ player, carrierId }: { player: any, carrierId: string | null }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/models/boat.glb');
  const clone = useMemo(() => scene.clone(), [scene]);

  const targetPos = useRef(new THREE.Vector3(player.position.x, player.position.y, player.position.z));
  const targetRot = useRef(new THREE.Quaternion());

  useEffect(() => {
    targetPos.current.set(player.position.x, player.position.y, player.position.z);
    const euler = new THREE.Euler(0, player.rotation, 0);
    targetRot.current.setFromEuler(euler);
  }, [player.position, player.rotation]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const currentPos = groupRef.current.position;
    const distance = currentPos.distanceTo(targetPos.current);

    if (distance > 20) {
      groupRef.current.position.copy(targetPos.current);
    } else {
      groupRef.current.position.lerp(targetPos.current, delta * 10);
    }
    groupRef.current.quaternion.slerp(targetRot.current, delta * 10);
  });

  if (player.isDead) return null;

  const hasOil = carrierId === player.id;

  return (
    <group ref={groupRef} position={[player.position.x, player.position.y, player.position.z]}>
      <primitive object={clone} scale={0.7} rotation={[0, Math.PI / 2, 0]} />
      <pointLight position={[0, 2, 0]} intensity={2} distance={10} color={player.team === 'BLUE' ? '#0088ff' : '#ff2200'} />

      {hasOil && (
        <mesh position={[0, 1.5, -0.5]}>
          <cylinderGeometry args={[0.3, 0.3, 0.7, 16]} />
          <meshStandardMaterial
            color="#FFD700"
            emissive="#FFA500"
            emissiveIntensity={1}
            metalness={0.8}
            roughness={0.2}
          />
          <pointLight color="orange" intensity={1} distance={3} />
        </mesh>
      )}
    </group>
  );
};

// ---------------------------------------------

interface SceneProps {
  gameState: string;
  onInteractionAvailable: (available: boolean, id?: string) => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  playerRotRef: React.MutableRefObject<number>;
  onSystemLog: (msg: string, type?: 'info' | 'warning' | 'success' | 'comms') => void;
  isSpectating: boolean;
  playerTeam: string;
  onWeaponUpdate: (ammo: number, isReloading: boolean, reloadTime: number) => void;
  onRespawn: () => void;
  isCarryingOil: boolean;
  onOilPickUp: () => void;
  isEPressed: boolean;
  onOilDeliver: () => void;
  oilHolder: string;
  carrierId: string | null;
  countdownValue: number;
  otherPlayers: any[];
}

export const OceanScene: React.FC<SceneProps> = ({
  gameState,
  onInteractionAvailable,
  playerPosRef,
  playerRotRef,
  onSystemLog,
  isSpectating,
  playerTeam,
  onWeaponUpdate,
  onRespawn,
  isCarryingOil,
  onOilPickUp,
  isEPressed,
  onOilDeliver,
  oilHolder,
  carrierId,
  countdownValue,
  otherPlayers
}) => {
  const waterRef = useRef<any>(null);
  const { gl, camera } = useThree();

  const prevAmmoRef = useRef(16);

  const playSound = (path: string, volume: number = 0.5) => {
    const audio = new Audio(path);
    audio.volume = volume;
    audio.play().catch(e => console.error("Sound play failed", e));
  };

  const handleWeaponUpdateWithSound = (ammo: number, isReloading: boolean, reloadTime: number) => {
    if (!isReloading && ammo < prevAmmoRef.current) {
      playSound('/sounds/laser-shot.mp3', 0.07);
    }
    prevAmmoRef.current = ammo;
    onWeaponUpdate(ammo, isReloading, reloadTime);
  };

  const handleOilPickUpWithSound = () => {
    playSound('/sounds/oil-collect.mp3', 0.25);
    onOilPickUp();
  };

  useEffect(() => {
    camera.layers.enable(0);
    camera.layers.enable(1);
  }, [camera]);

  const waterNormals = useLoader(THREE.TextureLoader, '/textures/water-normal.jpg');
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  waterNormals.minFilter = THREE.LinearMipmapLinearFilter;
  waterNormals.magFilter = THREE.LinearFilter;
  waterNormals.anisotropy = gl.capabilities.getMaxAnisotropy();

  const waterConfig = useMemo(() => {
    const geom = new THREE.PlaneGeometry(10000, 10000, 16, 16);
    const config = {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormals,
      sunDirection: new THREE.Vector3(-1, 0.5, -1).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 3.7,
      fog: true,
    };
    return { geom, config };
  }, [waterNormals]);

  useFrame((state, delta) => {
    if (waterRef.current) {
      waterRef.current.material.uniforms['time'].value += delta * 0.6;
    }
  });

  return (
    <>
      <fog attach="fog" args={['#001e0f', 10, 3000]} />

      <Environment
        files="/textures/sky.hdr"
        background={true}
      />

      <ambientLight intensity={0.4} />
      <directionalLight position={[-50, 50, -50]} intensity={1} />

      <water ref={waterRef} args={[waterConfig.geom, waterConfig.config]} rotation-x={-Math.PI / 2} position={[0, -0.5, 0]} />

      <PredictionIsland />

      {/* Платформа зникає, якщо хоч хтось несе нафту */}
      <OilPlatform position={[0, 0, 0]} isHidden={isCarryingOil} />

      <BaseStation position={[0, 0, -1400]} team="BLUE" />
      <BaseStation position={[0, 0, 1400]} team="RED" />
      <Boundary />

      {/* Вороги */}
      {otherPlayers && otherPlayers.map((player) => (
        <RivalShip key={player.id} player={player} carrierId={carrierId} />
      ))}

      {isSpectating && <SpectatorMode />}

      {!isSpectating && (
        <HoverBoat
          isPaused={gameState !== 'playing'}
          onUpdate={(pos, rot) => {
            playerPosRef.current.copy(pos);
            playerRotRef.current = rot;
            socket.emit('playerMove', { position: pos, rotation: rot });
          }}
          isSpectating={isSpectating}
          playerTeam={playerTeam}
          onWeaponUpdate={handleWeaponUpdateWithSound}
          onOilPickUp={handleOilPickUpWithSound}

          // 🔥 ВИПРАВЛЕНО ТУТ:
          // Показуємо бочку на собі, тільки якщо сервер каже, що носій — це я
          isCarryingOil={isCarryingOil && carrierId === socket.id}

          isEPressed={isEPressed}
          isInputLocked={countdownValue > 0}
          otherPlayers={otherPlayers}
          onInteraction={(id) => onInteractionAvailable(!!id, id || undefined)}
          onSystemLog={onSystemLog}
          onOilDeliver={onOilDeliver}
        />
      )}
    </>
  );
};