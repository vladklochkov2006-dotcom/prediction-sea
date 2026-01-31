const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:8977", "http://localhost:3000", "https://hoverwars.xyz", "https://www.hoverwars.xyz"],
        methods: ["GET", "POST"]
    }
});

// --- LINERA CONFIGURATION ---
const LINERA_NODE_URL = process.env.LINERA_NODE_URL || 'https://faucet.testnet-conway.linera.net';
const LINERA_APP_ID = process.env.LINERA_APP_ID || '1c05c820fab631f62d55c071431e1902db34dc4555a2f6f5b467878d73834f1b';

// ============== ROOM-BASED ARCHITECTURE ==============
// Each room is identified by hostChainId
// rooms = { [hostChainId]: RoomState }

const rooms = {};

// Map socket.id -> hostChainId for quick lookup
const playerRooms = {};

function createRoom(hostChainId) {
    return {
        hostChainId,
        players: {},
        gameActive: false,
        gameState: 'waiting', // 'waiting', 'playing', 'game_over'
        matchTime: 900,
        matchState: {
            blueScore: 0,
            redScore: 0,
            isCarryingOil: false,
            oilHolder: 'none',
            carrierId: null
        },
        gameInterval: null,
        roundConfirmations: new Set(),
        waitingForConfirmations: false
    };
}

function getRoom(hostChainId) {
    return rooms[hostChainId];
}

function getPlayerRoom(socketId) {
    const hostChainId = playerRooms[socketId];
    return hostChainId ? rooms[hostChainId] : null;
}

function deleteRoom(hostChainId) {
    const room = rooms[hostChainId];
    if (room) {
        if (room.gameInterval) clearInterval(room.gameInterval);
        // Clean up player mappings
        Object.keys(room.players).forEach(pid => {
            delete playerRooms[pid];
        });
        delete rooms[hostChainId];
        console.log(`[ROOM] Deleted room: ${hostChainId.substring(0, 8)}...`);
    }
}

function emitToRoom(hostChainId, event, data) {
    const room = rooms[hostChainId];
    if (!room) return;
    Object.keys(room.players).forEach(socketId => {
        io.to(socketId).emit(event, data);
    });
}

function startGameLoop(hostChainId) {
    const room = rooms[hostChainId];
    if (!room) return;

    if (room.gameInterval) clearInterval(room.gameInterval);

    room.gameState = 'playing';
    room.matchTime = 900;
    room.matchState = { blueScore: 0, redScore: 0, isCarryingOil: false, oilHolder: 'none', carrierId: null };

    emitToRoom(hostChainId, 'gameStart', { matchTime: room.matchTime, matchState: room.matchState });

    room.gameInterval = setInterval(() => {
        // 1. Match timer
        if (room.matchTime > 0) {
            room.matchTime--;
        } else {
            room.gameState = 'game_over';
            emitToRoom(hostChainId, 'gameOver', room.matchState);
            clearInterval(room.gameInterval);
            room.gameInterval = null;
            return;
        }

        // 2. Respawn timer
        const now = Date.now();
        Object.keys(room.players).forEach(id => {
            const p = room.players[id];
            if (p.isDead) {
                if (now >= p.respawnTime) {
                    p.isDead = false;
                    p.health = 100;
                    p.respawnTime = 0;

                    const isBlue = p.team === 'BLUE';
                    p.position = { x: 0, y: 0.5, z: isBlue ? -1370 : 1370 };
                    p.rotation = isBlue ? Math.PI : 0;

                    emitToRoom(hostChainId, 'playerRespawned', p);
                }
            }
        });

        // 3. Game Tick
        emitToRoom(hostChainId, 'gameTick', {
            time: room.matchTime,
            matchState: room.matchState,
            players: room.players
        });

    }, 1000);
}

// ============== SOCKET HANDLERS ==============

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('joinGame', (data) => {
        try {
            const hostChainId = data.hostChainId || data.chainId;
            if (!hostChainId) {
                console.error('[JOIN] No hostChainId provided!');
                return;
            }

            // Create room if doesn't exist
            if (!rooms[hostChainId]) {
                rooms[hostChainId] = createRoom(hostChainId);
                console.log(`[ROOM] Created new room: ${hostChainId.substring(0, 8)}...`);
            }

            const room = rooms[hostChainId];

            // Determine team
            const playerIds = Object.keys(room.players);
            let team = 'BLUE';

            if (playerIds.length > 0) {
                const hasBlue = Object.values(room.players).some(p => p.team === 'BLUE');
                team = hasBlue ? 'RED' : 'BLUE';
            }

            const isBlue = team === 'BLUE';
            const spawnZ = isBlue ? -1370 : 1370;
            const spawnRotation = isBlue ? Math.PI : 0;

            // Add player to room
            room.players[socket.id] = {
                id: socket.id,
                name: data.name || `Pilot ${socket.id.substr(0, 4)}`,
                position: { x: 0, y: 0.5, z: spawnZ },
                rotation: spawnRotation,
                team: team,
                health: 100,
                kills: 0,
                deaths: 0,
                goals: 0,
                isReady: true,
                isDead: false,
                respawnTime: 0,
                chainId: data.chainId || null,
                hostChainId: hostChainId
            };

            // Track which room this socket is in
            playerRooms[socket.id] = hostChainId;

            // Join socket.io room for targeted broadcasts
            socket.join(hostChainId);

            socket.emit('initGame', {
                myPlayer: room.players[socket.id],
                allPlayers: room.players,
                gameState: room.gameState,
                matchTime: room.matchTime,
                matchState: room.matchState
            });

            // Notify other players in room
            socket.to(hostChainId).emit('playerJoined', room.players[socket.id]);

            console.log(`[ROOM ${hostChainId.substring(0, 8)}] Player ${data.name} joined as ${team}. Total: ${Object.keys(room.players).length}`);

            // Start game if 2 players
            if (Object.keys(room.players).length === 2 && !room.gameActive) {
                console.log(`[ROOM ${hostChainId.substring(0, 8)}] Match Found! Starting Game...`);
                room.gameActive = true;
                startGameLoop(hostChainId);
            }

        } catch (error) {
            console.error("Error in joinGame:", error);
        }
    });

    socket.on('playerMove', (data) => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.players[socket.id] || room.players[socket.id].isDead) return;

        room.players[socket.id].position = data.position;
        room.players[socket.id].rotation = data.rotation;

        socket.to(room.hostChainId).emit('playerMoved', {
            id: socket.id,
            position: data.position,
            rotation: data.rotation
        });
    });

    socket.on('playerHit', ({ targetId, damage }) => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.players[targetId] || room.players[targetId].isDead) return;

        room.players[targetId].health -= damage;

        io.to(targetId).emit('takeDamage', damage);
        socket.emit('hitConfirm');

        if (room.players[targetId].health <= 0.1) {
            socket.emit('killConfirm');

            const killerId = socket.id;
            if (room.players[killerId] && killerId !== targetId) {
                room.players[killerId].kills += 1;
            }
            room.players[targetId].deaths += 1;

            room.players[targetId].isDead = true;
            room.players[targetId].respawnTime = Date.now() + 10000;
            room.players[targetId].health = 0;

            if (room.matchState.isCarryingOil && room.matchState.carrierId === targetId) {
                room.matchState.isCarryingOil = false;
                room.matchState.oilHolder = 'none';
                room.matchState.carrierId = null;
                emitToRoom(room.hostChainId, 'systemLog', { msg: `❌ OIL LOST! CARRIER DESTROYED!`, type: 'warning' });
            }

            emitToRoom(room.hostChainId, 'updateScoreboard', room.players);
            emitToRoom(room.hostChainId, 'killFeed', {
                killer: room.players[killerId] ? room.players[killerId].name : "Unknown",
                victim: room.players[targetId].name,
                killerTeam: room.players[killerId] ? room.players[killerId].team : "GRAY",
                victimTeam: room.players[targetId].team
            });
            emitToRoom(room.hostChainId, 'gameTick', { time: room.matchTime, matchState: room.matchState, players: room.players });
        }
    });

    socket.on('oilPickedUp', () => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.players[socket.id] || room.players[socket.id].isDead) return;
        if (room.matchState.isCarryingOil || room.gameState !== 'playing') return;

        room.matchState.isCarryingOil = true;
        room.matchState.oilHolder = room.players[socket.id].team;
        room.matchState.carrierId = socket.id;

        emitToRoom(room.hostChainId, 'gameTick', { time: room.matchTime, matchState: room.matchState, players: room.players });
        emitToRoom(room.hostChainId, 'systemLog', { msg: `🛢️ OIL SECURED BY ${room.players[socket.id].team} TEAM!`, type: 'warning' });
    });

    socket.on('oilDelivered', () => {
        const room = getPlayerRoom(socket.id);
        if (!room) return;
        if (!room.players[socket.id] || room.players[socket.id].isDead) return;
        if (!room.matchState.isCarryingOil || room.matchState.carrierId !== socket.id) return;

        handleGoalScored(room, socket.id);
    });

    socket.on('debugGoal', () => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.players[socket.id]) return;
        handleGoalScored(room, socket.id);
    });

    function handleGoalScored(room, scorerId) {
        const scoringTeam = room.players[scorerId].team;
        if (scoringTeam === 'BLUE') room.matchState.blueScore++;
        else room.matchState.redScore++;

        room.players[scorerId].goals += 1;
        room.matchState.isCarryingOil = false;
        room.matchState.oilHolder = 'none';
        room.matchState.carrierId = null;

        // Reset positions
        Object.keys(room.players).forEach(playerId => {
            const p = room.players[playerId];
            const isBlue = p.team === 'BLUE';
            p.position = { x: 0, y: 0.5, z: isBlue ? -1370 : 1370 };
            p.rotation = isBlue ? Math.PI : 0;
            p.isDead = false;
            p.health = 100;
            p.respawnTime = 0;
        });

        room.roundConfirmations.clear();
        room.waitingForConfirmations = true;

        emitToRoom(room.hostChainId, 'roundReset', {
            scorerTeam: scoringTeam,
            players: room.players
        });
        emitToRoom(room.hostChainId, 'gameTick', { time: room.matchTime, matchState: room.matchState, players: room.players });
        emitToRoom(room.hostChainId, 'systemLog', { msg: `✅ GOAL! SYNCING WITH BLOCKCHAIN...`, type: 'success' });

        if (room.matchState.blueScore >= 3 || room.matchState.redScore >= 3) {
            console.log(`[ROOM ${room.hostChainId.substring(0, 8)}] Match point! Waiting for sync...`);
        }
    }

    socket.on('roundConfirm', () => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.waitingForConfirmations) return;

        room.roundConfirmations.add(socket.id);

        const connectedPlayers = Object.keys(room.players);
        const confirmedCount = room.roundConfirmations.size;

        console.log(`[ROOM ${room.hostChainId.substring(0, 8)}] Player confirmed (${confirmedCount}/${connectedPlayers.length})`);

        const allConfirmed = connectedPlayers.every(id => room.roundConfirmations.has(id));

        if (allConfirmed) {
            console.log(`[ROOM ${room.hostChainId.substring(0, 8)}] ✅ ALL PLAYERS CONFIRMED!`);
            room.waitingForConfirmations = false;
            room.roundConfirmations.clear();

            if (room.matchState.blueScore >= 3 || room.matchState.redScore >= 3) {
                room.gameState = 'game_over';
                emitToRoom(room.hostChainId, 'gameOver', room.matchState);
                if (room.gameInterval) {
                    clearInterval(room.gameInterval);
                    room.gameInterval = null;
                }
                console.log(`[ROOM ${room.hostChainId.substring(0, 8)}] 🏆 GAME OVER EMITTED`);
            } else {
                emitToRoom(room.hostChainId, 'nextRoundReady');
                emitToRoom(room.hostChainId, 'systemLog', { msg: `🎮 ALL PLAYERS SYNCED. ROUND STARTING!`, type: 'success' });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.id}`);

        const hostChainId = playerRooms[socket.id];
        if (!hostChainId) return;

        const room = rooms[hostChainId];
        if (!room || !room.players[socket.id]) return;

        // Handle oil carrier disconnect
        if (room.matchState.carrierId === socket.id) {
            room.matchState.isCarryingOil = false;
            room.matchState.oilHolder = 'none';
            room.matchState.carrierId = null;
            emitToRoom(hostChainId, 'systemLog', { msg: `❌ CARRIER DISCONNECTED. OIL RESET.`, type: 'warning' });
        }

        delete room.players[socket.id];
        delete playerRooms[socket.id];
        socket.leave(hostChainId);

        emitToRoom(hostChainId, 'playerDisconnected', socket.id);

        const remainingPlayers = Object.keys(room.players).length;
        console.log(`[ROOM ${hostChainId.substring(0, 8)}] Player left. Remaining: ${remainingPlayers}`);

        // If room is empty or game was over, delete the room
        if (remainingPlayers === 0) {
            deleteRoom(hostChainId);
        } else if (room.gameState === 'game_over') {
            // Game was over, just send reset to remaining player
            emitToRoom(hostChainId, 'gameReset');
        } else if (remainingPlayers < 2) {
            // Not enough players to continue game
            room.gameActive = false;
            room.gameState = 'waiting';
            room.roundConfirmations.clear();
            room.waitingForConfirmations = false;
            if (room.gameInterval) {
                clearInterval(room.gameInterval);
                room.gameInterval = null;
            }
            emitToRoom(hostChainId, 'gameReset');
        }
    });
});

const PORT = process.env.PORT || 8976;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
    console.log(`✅ SERVER RUNNING ON ${HOST}:${PORT}`);
    console.log(`📡 LINERA NODE: ${LINERA_NODE_URL}`);
    console.log(`🔗 LINERA APP: ${LINERA_APP_ID}`);
    console.log(`🏠 ROOM-BASED ARCHITECTURE ENABLED`);
});