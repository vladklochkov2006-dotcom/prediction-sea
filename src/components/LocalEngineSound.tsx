import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface LocalEngineProps {
    playerPosRef: React.MutableRefObject<THREE.Vector3>;
    gameState: string;
}

export const LocalEngineSound = ({ playerPosRef, gameState }: LocalEngineProps) => {
    const contextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const bufferRef = useRef<AudioBuffer | null>(null);
    const filterNodeRef = useRef<BiquadFilterNode | null>(null);

    const prevPos = useRef(new THREE.Vector3(0, 0, 0));
    const isPlayingRef = useRef(false);

    // --- МАГІЯ: Функція створення дзеркального (безшовного) буфера ---
    const createPingPongBuffer = (ctx: AudioContext, originalBuffer: AudioBuffer) => {
        const channels = originalBuffer.numberOfChannels;
        const rate = originalBuffer.sampleRate;
        const len = originalBuffer.length;

        // Створюємо новий буфер, який у 2 рази довший
        const newBuffer = ctx.createBuffer(channels, len * 2, rate);

        for (let i = 0; i < channels; i++) {
            const oldData = originalBuffer.getChannelData(i);
            const newData = newBuffer.getChannelData(i);

            // 1. Копіюємо звук як є (вперед)
            for (let j = 0; j < len; j++) {
                newData[j] = oldData[j];
            }
            // 2. Копіюємо звук задом наперед (назад)
            // Це створює ідеальний стик, бо кінець файлу стикається сам із собою
            for (let j = 0; j < len; j++) {
                newData[len + j] = oldData[len - 1 - j];
            }
        }
        return newBuffer;
    };
    // -------------------------------------------------------------

    useEffect(() => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        contextRef.current = ctx;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0;
        gainNodeRef.current = gainNode;

        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 800;
        filterNodeRef.current = filterNode;

        filterNode.connect(gainNode);
        gainNode.connect(ctx.destination);

        fetch('/sounds/hover-engine.mp3')
            .then((response) => response.arrayBuffer())
            .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
            .then((decodedBuffer) => {
                // ЗАСТОСОВУЄМО МАГІЮ PING-PONG
                const seamlessBuffer = createPingPongBuffer(ctx, decodedBuffer);
                bufferRef.current = seamlessBuffer;

                if (gameState === 'playing') startSound();
            })
            .catch((err) => console.error("Error loading sound:", err));

        return () => {
            if (contextRef.current) contextRef.current.close();
        };
    }, []);

    const startSound = () => {
        if (!contextRef.current || !bufferRef.current || !filterNodeRef.current || isPlayingRef.current) return;

        const source = contextRef.current.createBufferSource();
        source.buffer = bufferRef.current;
        source.loop = true;

        source.connect(filterNodeRef.current);
        source.start(0);

        sourceRef.current = source;
        isPlayingRef.current = true;

        if (contextRef.current.state === 'suspended') contextRef.current.resume();
    };

    const stopSound = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch (e) { }
            sourceRef.current = null;
        }
        isPlayingRef.current = false;
    };

    useEffect(() => {
        if (gameState === 'playing') startSound();
        else stopSound();
    }, [gameState]);

    useFrame((state, delta) => {
        if (!gainNodeRef.current || !sourceRef.current || !filterNodeRef.current || gameState !== 'playing') return;

        const currentPos = playerPosRef.current;
        const distance = currentPos.distanceTo(prevPos.current);
        const speed = distance / delta;
        prevPos.current.copy(currentPos);

        const maxSpeed = 30;
        const normalizedSpeed = Math.min(speed, maxSpeed) / maxSpeed;

        // Параметри звучання
        const targetVolume = 0.3 + (normalizedSpeed * 0.5);
        const targetPitch = 0.9 + (normalizedSpeed * 0.4);
        const targetFilter = 800 + (normalizedSpeed * 2200);

        const ctx = contextRef.current!;
        const t = ctx.currentTime;
        const dt = 0.1;

        gainNodeRef.current.gain.setTargetAtTime(targetVolume, t, dt);
        sourceRef.current.playbackRate.setTargetAtTime(targetPitch, t, dt);
        filterNodeRef.current.frequency.setTargetAtTime(targetFilter, t, dt);
    });

    return null;
};