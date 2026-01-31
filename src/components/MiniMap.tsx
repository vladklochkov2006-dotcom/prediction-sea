import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MAP_WIDTH, MAP_DEPTH } from '../utils/mapData';

// Описуємо структуру гравця для мінікарти
interface MinimapPlayer {
  id: string;
  position: { x: number; z: number }; // Нам треба тільки X і Z
  team: string;
}

interface MinimapProps {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  playerRotRef: React.MutableRefObject<number>;
  // Нові пропси:
  otherPlayers?: MinimapPlayer[]; // Список інших кораблів
  myTeam?: string;                // Твоя команда, щоб знати, хто друг, а хто ворог
}

export const Minimap: React.FC<MinimapProps> = ({
  playerPosRef,
  playerRotRef,
  otherPlayers = [], // За замовчуванням порожній масив
  myTeam = 'BLUE'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanAngleRef = useRef(0);

  const coordsRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const sectorRef = useRef<HTMLDivElement>(null);

  // Статичні бази
  const bases = [
    { x: 0, z: -1400, color: '#3b82f6', label: 'BLUE' },
    { x: 0, z: 1400, color: '#ef4444', label: 'RED' },
    { x: 0, z: 0, color: '#eab308', label: 'RIG' }
  ];

  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      const radarRadius = 2000;
      const mapScale = (width / 2) / radarRadius;

      ctx.clearRect(0, 0, width, height);

      // --- ФОН ---
      const bgGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, width / 2);
      bgGrad.addColorStop(0, 'rgba(0, 20, 30, 0.9)');
      bgGrad.addColorStop(0.8, 'rgba(0, 10, 20, 0.8)');
      bgGrad.addColorStop(1, 'rgba(0, 255, 255, 0.1)');
      ctx.fillStyle = bgGrad;
      ctx.beginPath(); ctx.arc(centerX, centerY, width / 2, 0, Math.PI * 2); ctx.fill();

      // --- СІТКА ---
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(centerX, centerY, 500 * mapScale, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(centerX, centerY, 1000 * mapScale, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(centerX - 8, centerY); ctx.lineTo(centerX + 8, centerY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(centerX, centerY - 8); ctx.lineTo(centerX, centerY + 8); ctx.stroke();

      // Маска
      ctx.save();
      ctx.beginPath(); ctx.arc(centerX, centerY, width / 2, 0, Math.PI * 2); ctx.clip();

      // --- ТРАНСФОРМАЦІЯ СВІТУ (Обертання навколо гравця) ---
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(playerRotRef.current);

      // 1. БАЗИ
      bases.forEach(base => {
        const relX = base.x - playerPosRef.current.x;
        const relZ = base.z - playerPosRef.current.z;
        const bx = relX * mapScale;
        const bz = relZ * mapScale;

        ctx.shadowBlur = 6; ctx.shadowColor = base.color;
        ctx.fillStyle = base.color;
        ctx.beginPath(); ctx.arc(bx, bz, 4, 0, Math.PI * 2); ctx.fill();
      });

      // 2. ІНШІ ГРАВЦІ (Союзники / Вороги)
      otherPlayers.forEach(p => {
        // Пропускаємо себе (якщо раптом ми є в списку)
        // (Тут можна додати перевірку p.id !== myId, якщо ти передаєш ID)

        const isTeammate = p.team === myTeam;
        const pColor = isTeammate ? '#00ff00' : '#ff0000'; // Зелений або Червоний

        const relX = p.position.x - playerPosRef.current.x;
        const relZ = p.position.z - playerPosRef.current.z;
        const px = relX * mapScale;
        const pz = relZ * mapScale;

        ctx.shadowBlur = 8;
        ctx.shadowColor = pColor;
        ctx.fillStyle = pColor;

        ctx.beginPath();
        // Союзники трохи менші точки, вороги більші (або однакові)
        ctx.arc(px, pz, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. КОРДОНИ СВІТУ
      const wPx = MAP_WIDTH * mapScale;
      const dPx = MAP_DEPTH * mapScale;
      const cx = -playerPosRef.current.x * mapScale;
      const cz = -playerPosRef.current.z * mapScale;

      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 4;
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - wPx / 2, cz - dPx / 2, wPx, dPx);

      ctx.restore(); // Кінець світу
      ctx.restore(); // Кінець маски

      // --- СКАНЕР ---
      scanAngleRef.current += 0.03;
      ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(scanAngleRef.current);
      const scanGrad = ctx.createLinearGradient(0, 0, 0, -width / 2);
      scanGrad.addColorStop(0, 'rgba(0, 255, 255, 0)'); scanGrad.addColorStop(1, 'rgba(0, 255, 255, 0.3)');
      ctx.fillStyle = scanGrad; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, width / 2, -Math.PI / 2, -Math.PI / 2 + 0.5); ctx.fill();
      ctx.restore();

      // --- СТРІЛКА ГРАВЦЯ ---
      ctx.save(); ctx.translate(centerX, centerY);
      const fovGrad = ctx.createLinearGradient(0, 0, 0, -45);
      fovGrad.addColorStop(0, 'rgba(0, 255, 255, 0.2)'); fovGrad.addColorStop(1, 'rgba(0, 255, 255, 0)');
      ctx.fillStyle = fovGrad; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-15, -45); ctx.quadraticCurveTo(0, -55, 15, -45); ctx.lineTo(0, 0); ctx.fill();
      ctx.shadowBlur = 8; ctx.shadowColor = '#00ffff'; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 4); ctx.lineTo(0, 2.5); ctx.lineTo(-3.5, 4); ctx.closePath(); ctx.fill();
      ctx.restore();

      // Окантовка
      ctx.shadowBlur = 0; ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(centerX, centerY, width / 2 - 1.5, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.translate(centerX, centerY); ctx.rotate((i * Math.PI) / 2);
        ctx.fillStyle = '#00ffff'; ctx.fillRect(-1.5, -height / 2 + 1.5, 3, 6); ctx.restore();
      }

      // Текстова інфа
      if (coordsRef.current) {
        const x = Math.round(playerPosRef.current.x);
        const z = Math.round(playerPosRef.current.z);
        coordsRef.current.innerText = `X:${x} Z:${z}`;
      }
      if (headingRef.current) {
        let deg = Math.round((playerRotRef.current * 180) / Math.PI) % 360;
        if (deg < 0) deg += 360;
        headingRef.current.innerText = `HDG: ${deg.toString().padStart(3, '0')}°`;
      }
      if (sectorRef.current) {
        const z = playerPosRef.current.z;
        let sectorName = "OPEN OCEAN";
        if (z > 800) sectorName = "NORTH SECTOR";
        else if (z < -800) sectorName = "SOUTH SECTOR";
        else if (Math.abs(playerPosRef.current.x) < 200 && Math.abs(z) < 200) sectorName = "OIL RIGS";
        if (sectorRef.current.innerText !== sectorName) sectorRef.current.innerText = sectorName;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [playerPosRef, playerRotRef, otherPlayers, myTeam]); // Додали залежності

  return (
    <div className="absolute top-4 right-4 flex flex-col items-center gap-1 pointer-events-none filter drop-shadow-[0_0_8px_rgba(0,255,255,0.2)]">
      <div className="relative">
        <canvas ref={canvasRef} width={160} height={160} />
        <div className="absolute bottom-3 left-0 w-full text-center text-[7px] text-cyan-500/50 font-mono">
          SCANNING...
        </div>
      </div>
      <div className="w-[160px] bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 rounded-md p-1.5 flex flex-col gap-0.5 shadow-lg">
        <div className="flex justify-between items-center border-b border-cyan-500/20 pb-0.5 mb-0.5">
          <div ref={sectorRef} className="text-cyan-400 font-mono text-[10px] font-bold tracking-wider">OPEN OCEAN</div>
          <div className="flex items-center gap-1"><div className="w-1 h-1 rounded-full bg-red-500 animate-pulse"></div><span className="text-[7px] text-red-400 font-bold">LIVE</span></div>
        </div>
        <div className="flex justify-between items-center text-[9px] font-mono text-cyan-200/80"><div ref={coordsRef}>X:0 Z:0</div><div ref={headingRef}>HDG: 000°</div></div>
      </div>
    </div>
  );
};