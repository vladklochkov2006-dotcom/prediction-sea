import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_DATA } from '../utils/mapData';
import { socket } from '../socket';

const GUN_OFFSET_Z = -1.5;
const GUN_OFFSET_Y = 0.005;
const GUN_SPACING = 0.35;
const BULLET_SPEED = 400;
const FIRE_RATE = 0.15;
const BULLET_LIFE = 0.6;
const POOL_SIZE = 40;
const MAX_AMMO = 16;
const RELOAD_TIME = 10.0;
const DAMAGE_PER_SHOT = 12.5;

const BOAT_RADIUS = 3.0;

const bulletGeo = new THREE.CylinderGeometry(0.15, 0.15, 8, 8);
bulletGeo.rotateX(Math.PI / 2);
const bulletMat = new THREE.MeshBasicMaterial({ color: '#ffcc00', toneMapped: false });

interface BoatProps {
  isPaused: boolean;
  onUpdate: (pos: THREE.Vector3, rotation: number) => void;
  isSpectating: boolean;
  playerTeam: string;
  onWeaponUpdate: (ammo: number, isReloading: boolean, reloadTime: number) => void;
  isCarryingOil?: boolean;
  isEPressed?: boolean;
  isInputLocked?: boolean;
  otherPlayers?: any[];
  onInteraction: (id: string | null) => void;
  onSystemLog: (msg: string, type?: 'info' | 'warning' | 'success' | 'comms') => void;
  onOilPickUp?: () => void;
  onOilDeliver?: () => void;
}

export const HoverBoat: React.FC<BoatProps> = ({
  isPaused,
  onUpdate,
  isSpectating,
  playerTeam,
  onWeaponUpdate,
  isCarryingOil = false,
  isEPressed = false,
  isInputLocked = false,
  otherPlayers = [],
  onInteraction,
  onSystemLog,
  onOilPickUp,
  onOilDeliver
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const bulletsRef = useRef<THREE.Group>(null);
  const flashMeshRef = useRef<THREE.Mesh>(null);
  const gunVisualRef = useRef<THREE.Group>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const lastNetworkUpdate = useRef(0);

  const { scene: modelScene } = useGLTF('/models/boat.glb');
  const clone = useMemo(() => modelScene.clone(), [modelScene]);

  const bulletPool = useMemo(() => {
    return new Array(POOL_SIZE).fill(0).map(() => ({
      mesh: new THREE.Mesh(bulletGeo, bulletMat),
      velocity: new THREE.Vector3(),
      life: 0,
      active: false
    }));
  }, []);

  const [isFiring, setIsFiring] = useState(false);
  const lastFireTime = useRef(0);
  const flashTimer = useRef(0);
  const recoilOffset = useRef(0);
  const ammoCount = useRef(MAX_AMMO);
  const isReloading = useRef(false);
  const reloadTimer = useRef(0);

  const loadTimer = useRef(0);
  const LOAD_DURATION = 15.0;
  const UNLOAD_DURATION = 5.0;

  // РАДІУС ЗОНИ (підігнано під візуальне кільце радіусом 4.5)
  const UNLOAD_ZONE_RADIUS = 8.0;

  const [interactionLabel, setInteractionLabel] = useState<string | null>(null);

  useEffect(() => {
    onWeaponUpdate(ammoCount.current, false, 0);
  }, []);

  useEffect(() => {
    if (!bulletsRef.current) return;
    bulletPool.forEach(b => {
      b.mesh.visible = false;
      b.mesh.position.set(0, -5000, 0);
      bulletsRef.current?.add(b.mesh);
    });
  }, [bulletPool]);

  const keys = useRef<{ [key: string]: boolean }>({});
  const speed = useRef(0);
  const rotationAngle = useRef(0);
  const currentTurnSpeed = useRef(0);
  const tiltAngle = useRef(0);
  const viewAngleOffset = useRef(0);
  const mouseXRatio = useRef(0);
  const mouseYRatio = useRef(0);
  const smoothedCamInputX = useRef(0);
  const smoothedCamInputY = useRef(0);

  const MAX_SPEED = isCarryingOil ? 25 : 45;
  const ACCEL_FORWARD = isCarryingOil ? 0.1 : 0.3;
  const BRAKING = isCarryingOil ? 0.3 : 0.8;
  const MAX_REVERSE = -12;
  const ACCEL_REVERSE = 0.15;
  const TURN_INERTIA = 2.0;
  const MAX_TURN_SPEED = isCarryingOil ? 0.8 : 1.2;
  const MAX_TILT = 0.15;
  const MAP_LIMIT = 2900;

  const startReload = () => {
    if (isReloading.current) return;
    isReloading.current = true;
    reloadTimer.current = RELOAD_TIME;
    onWeaponUpdate(0, true, RELOAD_TIME);
  };

  const fire = () => {
    const now = Date.now() / 1000;
    if (isReloading.current) return;
    if (ammoCount.current < 2) { startReload(); return; }
    if (now - lastFireTime.current < FIRE_RATE || !meshRef.current) return;
    if (!Number.isFinite(meshRef.current.position.x)) return;

    lastFireTime.current = now;
    ammoCount.current -= 2;
    onWeaponUpdate(ammoCount.current, false, 0);

    recoilOffset.current = 0.3;

    if (flashMeshRef.current) {
      flashMeshRef.current.visible = true;
      flashMeshRef.current.position.set(0, 0, -1.6);
      flashTimer.current = 0.05;
    }

    const sides = [-1, 1];
    sides.forEach(side => {
      const bullet = bulletPool.find(b => !b.active);
      if (bullet) {
        bullet.active = true;
        bullet.life = BULLET_LIFE;
        bullet.mesh.visible = true;

        const offset = new THREE.Vector3(side * GUN_SPACING, GUN_OFFSET_Y, GUN_OFFSET_Z - 0.5);
        offset.applyQuaternion(meshRef.current!.quaternion);
        bullet.mesh.position.copy(meshRef.current!.position.clone().add(offset));

        const flatEuler = new THREE.Euler(0, rotationAngle.current, 0);
        const flatQuaternion = new THREE.Quaternion().setFromEuler(flatEuler);
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(flatQuaternion);

        const spreadX = (Math.random() - 0.5) * 0.04;
        const spreadY = (Math.random() - 0.5) * 0.02;
        direction.x += spreadX;
        direction.y += spreadY;

        bullet.velocity.copy(direction.normalize().multiplyScalar(BULLET_SPEED));
        bullet.mesh.quaternion.copy(flatQuaternion);
        bullet.mesh.rotateY(spreadX);
      }
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseXRatio.current = (e.clientX / window.innerWidth) * 2 - 1;
      mouseYRatio.current = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === 'Space') setIsFiring(true);
      if (e.code === 'KeyR') startReload();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
      if (e.code === 'Space') setIsFiring(false);
    };
    const handleBlur = () => {
      keys.current = {};
      setIsFiring(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', handleBlur);
      bulletsRef.current?.clear();
    };
  }, []);

  useEffect(() => {
    if (meshRef.current) {
      const spawnOffset = 30;
      const baseZ = playerTeam === 'RED' ? 1400 - spawnOffset : -1400 + spawnOffset;
      meshRef.current.position.set(0, 0.5, baseZ);
      rotationAngle.current = playerTeam === 'RED' ? 0 : Math.PI;
    }
  }, [playerTeam]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const dt = Math.min(delta, 0.1);

    if (isSpectating) {
      meshRef.current.visible = false;
      return;
    }

    if (isPaused) return;

    // --- РОЗРАХУНОК КООРДИНАТ ---

    // 1. Центр карти (Нафта)
    const distToRig = meshRef.current.position.length();

    // 2. Зона вивантаження (База)
    // Вираховуємо точні координати кола на основі коду BaseStation.tsx
    // Blue Base: z = -1400. Circle Offset: [35, 35]. World Circle: [35, -1365]
    // Red Base: z = 1400. Circle Offset: [-35, -35] (через поворот 180). World Circle: [-35, 1365]

    const unloadZoneX = playerTeam === 'BLUE' ? 35 : -35;
    const unloadZoneZ = playerTeam === 'BLUE' ? -1365 : 1365;

    const distToUnloadZone = Math.sqrt(
      Math.pow(meshRef.current.position.x - unloadZoneX, 2) +
      Math.pow(meshRef.current.position.z - unloadZoneZ, 2)
    );

    const isDocking = isEPressed && distToRig < 35 && !isCarryingOil;
    const isUnloading = isEPressed && distToUnloadZone < UNLOAD_ZONE_RADIUS && isCarryingOil;

    let currentAction = null;
    let requiredTime = 15.0;

    // 1. ЗАВАНТАЖЕННЯ (Центр)
    if (distToRig < 50 && !isCarryingOil) {
      currentAction = "LOAD OIL";
      requiredTime = LOAD_DURATION;

      if (isEPressed) {
        loadTimer.current += dt;
        if (loadTimer.current >= requiredTime) {
          if (onOilPickUp) onOilPickUp();
          loadTimer.current = 0;
        }
      } else {
        loadTimer.current = 0;
      }
    }
    // 2. ВИВАНТАЖЕННЯ (База - точна зона)
    else if (distToUnloadZone < UNLOAD_ZONE_RADIUS && isCarryingOil) {
      currentAction = "UNLOAD OIL";
      requiredTime = UNLOAD_DURATION;

      if (isEPressed) {
        loadTimer.current += dt;
        if (loadTimer.current >= requiredTime) {
          if (onOilDeliver) onOilDeliver();
          loadTimer.current = 0;
        }
      } else {
        loadTimer.current = 0;
      }
    } else {
      loadTimer.current = 0;
    }

    setInteractionLabel(currentAction);

    if (progressBarRef.current) {
      const progress = Math.min(loadTimer.current / requiredTime, 1) * 100;
      progressBarRef.current.style.width = `${progress}%`;
    }

    if (onInteraction) onInteraction(currentAction ? 'active' : null);

    // Логіка уповільнення при натисканні E
    if (isDocking || isUnloading || isInputLocked) {
      speed.current *= 0.8;
      currentTurnSpeed.current = THREE.MathUtils.lerp(currentTurnSpeed.current, 0, dt * 5);
    } else {
      if (keys.current['KeyW'] || keys.current['ArrowUp']) speed.current = Math.min(speed.current + ACCEL_FORWARD, MAX_SPEED);
      else if (keys.current['KeyS'] || keys.current['ArrowDown']) {
        if (speed.current > 0) speed.current = Math.max(speed.current - BRAKING, 0);
        else speed.current = Math.max(speed.current - ACCEL_REVERSE, MAX_REVERSE);
      } else {
        speed.current *= 0.98;
        if (Math.abs(speed.current) < 0.05) speed.current = 0;
      }

      let targetTurn = 0;
      if (keys.current['KeyA'] || keys.current['ArrowLeft']) targetTurn = 1;
      if (keys.current['KeyD'] || keys.current['ArrowRight']) targetTurn = -1;
      currentTurnSpeed.current = THREE.MathUtils.lerp(currentTurnSpeed.current, targetTurn * MAX_TURN_SPEED, dt * TURN_INERTIA);
    }

    rotationAngle.current += currentTurnSpeed.current * dt;
    tiltAngle.current = THREE.MathUtils.lerp(tiltAngle.current, (isDocking || isUnloading || isInputLocked) ? 0 : (keys.current['KeyA'] ? 1 : keys.current['KeyD'] ? -1 : 0) * MAX_TILT, dt * 3);

    const moveZ = -speed.current * dt;
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle.current);
    const nextPos = meshRef.current.position.clone().add(forward.multiplyScalar(moveZ));

    for (const obstacle of WORLD_DATA.obstacles) {
      const dx = nextPos.x - obstacle.position[0];
      const dz = nextPos.z - obstacle.position[2];
      if (Math.abs(dx) > 50 || Math.abs(dz) > 50) continue;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = BOAT_RADIUS + obstacle.radius;
      if (dist < minDist) {
        const pushDirX = dx / dist;
        const pushDirZ = dz / dist;
        const overlap = minDist - dist;
        nextPos.x += pushDirX * overlap;
        nextPos.z += pushDirZ * overlap;
        speed.current *= 0.5;
      }
    }

    meshRef.current.position.x = nextPos.x;
    meshRef.current.position.z = nextPos.z;
    meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0.5, dt * 5);
    meshRef.current.rotation.x = 0;
    meshRef.current.rotation.y = rotationAngle.current;
    meshRef.current.rotation.z = tiltAngle.current;

    meshRef.current.position.x = THREE.MathUtils.clamp(meshRef.current.position.x, -MAP_LIMIT, MAP_LIMIT);
    meshRef.current.position.z = THREE.MathUtils.clamp(meshRef.current.position.z, -MAP_LIMIT, MAP_LIMIT);

    const DEADZONE = 0.25;
    let targetInputX = 0;
    if (mouseXRatio.current > DEADZONE) targetInputX = -(mouseXRatio.current - DEADZONE) / (1 - DEADZONE);
    else if (mouseXRatio.current < -DEADZONE) targetInputX = (Math.abs(mouseXRatio.current) - DEADZONE) / (1 - DEADZONE);
    smoothedCamInputX.current = THREE.MathUtils.lerp(smoothedCamInputX.current, targetInputX, dt * 8);
    viewAngleOffset.current += smoothedCamInputX.current * 2.5 * dt;
    const MIN_CAM_HEIGHT = 1.5; const MAX_CAM_HEIGHT = 8.0;
    const targetHeightInput = THREE.MathUtils.mapLinear(mouseYRatio.current, -1, 1, MIN_CAM_HEIGHT, MAX_CAM_HEIGHT);
    smoothedCamInputY.current = THREE.MathUtils.lerp(smoothedCamInputY.current, targetHeightInput, dt * 5);
    const clampedCamHeight = THREE.MathUtils.clamp(smoothedCamInputY.current, MIN_CAM_HEIGHT, MAX_CAM_HEIGHT);
    const finalAngle = rotationAngle.current + viewAngleOffset.current;
    const camDist = 12;
    const camX = meshRef.current.position.x + Math.sin(finalAngle) * camDist;
    const camZ = meshRef.current.position.z + Math.cos(finalAngle) * camDist;
    const camY = meshRef.current.position.y + clampedCamHeight;

    if (!Number.isFinite(camX) || !Number.isFinite(camZ)) {
      state.camera.position.set(0, 10, 20);
      state.camera.lookAt(0, 0, 0);
    } else {
      state.camera.position.set(camX, camY, camZ);
      state.camera.lookAt(meshRef.current.position.x, meshRef.current.position.y + 1.5, meshRef.current.position.z);
    }

    if (isReloading.current) {
      reloadTimer.current -= dt;
      if (reloadTimer.current <= 0) {
        isReloading.current = false;
        ammoCount.current = MAX_AMMO;
        onWeaponUpdate(MAX_AMMO, false, 0);
      }
    }

    if (gunVisualRef.current && recoilOffset.current > 0) {
      recoilOffset.current = THREE.MathUtils.lerp(recoilOffset.current, 0, dt * 15);
      gunVisualRef.current.position.z = GUN_OFFSET_Z + recoilOffset.current;
    }
    if (flashTimer.current > 0) {
      flashTimer.current -= dt;
      if (flashTimer.current <= 0 && flashMeshRef.current) flashMeshRef.current.visible = false;
    }

    if (isFiring && !isDocking && !isUnloading && !isInputLocked) fire();

    bulletPool.forEach(b => {
      if (b.active) {
        const moveVec = b.velocity.clone().multiplyScalar(dt);
        const nextPos = b.mesh.position.clone().add(moveVec);
        let hit = false;

        for (const obs of WORLD_DATA.obstacles) {
          const dx = nextPos.x - obs.position[0];
          const dz = nextPos.z - obs.position[2];
          if (Math.abs(dx) > obs.radius + 2 || Math.abs(dz) > obs.radius + 2) continue;
          const distSq = dx * dx + dz * dz;
          const r = obs.radius + 0.2;
          if (distSq < r * r) {
            hit = true;
            break;
          }
        }

        if (!hit && otherPlayers) {
          const enemies = Array.isArray(otherPlayers) ? otherPlayers : Object.values(otherPlayers);
          for (const enemy of enemies) {
            if (enemy.team === playerTeam) continue;
            const dx = nextPos.x - enemy.position.x;
            const dz = nextPos.z - enemy.position.z;
            if (Math.abs(dx) < 5 && Math.abs(dz) < 5) {
              const dist = Math.sqrt(dx * dx + dz * dz);
              if (dist < 4.0) {
                hit = true;
                console.log(`💥 HIT! Enemy ID: ${enemy.id} (Dist: ${dist.toFixed(2)})`);
                socket.emit('playerHit', { targetId: enemy.id, damage: DAMAGE_PER_SHOT });
                break;
              }
            }
          }
        }

        if (hit) {
          b.active = false;
          b.mesh.visible = false;
          b.mesh.position.set(0, -5000, 0);
        } else {
          b.mesh.position.add(moveVec);
          b.life -= dt;
          if (b.life <= 0) {
            b.active = false;
            b.mesh.visible = false;
            b.mesh.position.set(0, -5000, 0);
          }
        }
      }
    });

    const now = Date.now();
    if (now - lastNetworkUpdate.current > 30) {
      lastNetworkUpdate.current = now;
      onUpdate(meshRef.current.position, rotationAngle.current);
    }
  });

  return (
    <>
      <group ref={meshRef}>
        {interactionLabel && (
          <Html
            position={[0, 4, 0]}
            center
            style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
          >
            <div style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              fontFamily: '"Consolas", "Monaco", monospace',
              textShadow: '0 2px 5px rgba(0,0,0,0.9)',
              transform: 'scale(1.2)'
            }}>
              <div style={{
                background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 0 15px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
                color: 'white',
                fontWeight: '800',
                fontSize: '14px',
                letterSpacing: '1.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ color: '#aaa', fontSize: '10px' }}>SYSTEM:</span>
                PRESS <span style={{ color: '#fbbf24', fontSize: '16px' }}>[E]</span> TO {interactionLabel}
              </div>
              <div style={{
                width: '160px',
                height: '6px',
                background: 'rgba(0, 0, 0, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div
                  ref={progressBarRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '0%',
                    background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
                    boxShadow: '0 0 10px #fbbf24',
                    transition: 'width 0.1s linear'
                  }}
                ></div>
              </div>
            </div>
          </Html>
        )}

        <primitive object={clone} scale={0.7} rotation={[0, Math.PI / 2, 0]} />
        <pointLight position={[0, -0.5, 0]} intensity={3} distance={15} color="#00ffff" />

        {isCarryingOil && (
          <group position={[0, 0.2, 5.7]} scale={0.8}>
            <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.55, 0.55, 1.4, 16]} /><meshStandardMaterial color="#ffcc00" metalness={0.6} roughness={0.2} /></mesh>
            <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.56, 0.05, 8, 32]} /><meshStandardMaterial color="#111" /></mesh>
            <mesh position={[-0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.56, 0.05, 8, 32]} /><meshStandardMaterial color="#111" /></mesh>
          </group>
        )}

        <group ref={gunVisualRef} position={[0, GUN_OFFSET_Y, GUN_OFFSET_Z]}>
          <mesh position={[0, 0, 0.2]}><boxGeometry args={[GUN_SPACING * 2 + 0.2, 0.1, 0.5]} /><meshStandardMaterial color="#333" /></mesh>
          <mesh position={[-GUN_SPACING, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.12, 1.4, 12]} /><meshStandardMaterial color="#aaaaaa" metalness={1.0} roughness={0.2} /></mesh>
          <mesh position={[GUN_SPACING, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.12, 1.4, 12]} /><meshStandardMaterial color="#aaaaaa" metalness={1.0} roughness={0.2} /></mesh>
          <mesh ref={flashMeshRef} visible={false}><sphereGeometry args={[0.3, 8, 8]} /><meshBasicMaterial color="#ffaa00" transparent opacity={0.8} /></mesh>
        </group>
      </group>
      <group ref={bulletsRef} />
    </>
  );
};