import { io } from 'socket.io-client';

// Socket URL from environment variable or default
// Development: http://localhost:8976
// Production: relative (uses same domain via nginx proxy)
const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:8976';

export const socket = io(SOCKET_URL, {
    autoConnect: true,
    transports: ['websocket', 'polling']
});