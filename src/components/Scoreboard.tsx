import React, { useEffect, useState } from 'react';

interface PlayerStats {
    id: string;
    name: string;
    team: string;
    kills: number;
    deaths: number;
    goals: number; // <--- Додали поле
}

interface ScoreboardProps {
    players: PlayerStats[];
    myId: string;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ players, myId }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const down = (e: KeyboardEvent) => { if (e.code === 'Tab') { e.preventDefault(); setIsVisible(true); } };
        const up = (e: KeyboardEvent) => { if (e.code === 'Tab') { e.preventDefault(); setIsVisible(false); } };

        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, []);

    if (!isVisible) return null;

    // Сортуємо: Голи -> Кіли
    const sortPlayers = (list: PlayerStats[]) => {
        return list.sort((a, b) => {
            if ((b.goals || 0) !== (a.goals || 0)) return (b.goals || 0) - (a.goals || 0);
            return b.kills - a.kills;
        });
    };

    const blueTeam = sortPlayers(players.filter(p => p.team === 'BLUE'));
    const redTeam = sortPlayers(players.filter(p => p.team === 'RED'));

    const TeamTable = ({ teamName, teamColor, teamPlayers }: { teamName: string, teamColor: string, teamPlayers: PlayerStats[] }) => (
        <div style={{ flex: 1, minWidth: '350px' }}> {/* Трохи розширив */}
            <div style={{
                backgroundColor: teamColor === 'BLUE' ? 'rgba(0, 100, 255, 0.2)' : 'rgba(255, 50, 0, 0.2)',
                padding: '10px',
                borderBottom: `2px solid ${teamColor === 'BLUE' ? '#0088ff' : '#ff4400'}`,
                color: 'white', fontWeight: 'bold', letterSpacing: '2px', textAlign: 'center'
            }}>
                {teamName} TEAM
            </div>
            <div style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                <div style={{ display: 'flex', padding: '8px', color: '#888', fontSize: '12px', borderBottom: '1px solid #333' }}>
                    <span style={{ flex: 1 }}>PILOT</span>
                    <span style={{ width: '40px', textAlign: 'center', color: '#fbbf24' }}>G</span> {/* GOALS */}
                    <span style={{ width: '40px', textAlign: 'center' }}>K</span>
                    <span style={{ width: '40px', textAlign: 'center' }}>D</span>
                </div>
                {teamPlayers.map(p => (
                    <div key={p.id} style={{
                        display: 'flex',
                        padding: '8px',
                        color: p.id === myId ? '#fbbf24' : 'white',
                        backgroundColor: p.id === myId ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        borderBottom: '1px solid #222'
                    }}>
                        <span style={{ flex: 1, fontWeight: p.id === myId ? 'bold' : 'normal' }}>
                            {p.name} {p.id === myId && '(YOU)'}
                        </span>
                        <span style={{ width: '40px', textAlign: 'center', color: '#fbbf24', fontWeight: 'bold' }}>{p.goals || 0}</span>
                        <span style={{ width: '40px', textAlign: 'center', color: '#4ade80' }}>{p.kills}</span>
                        <span style={{ width: '40px', textAlign: 'center', color: '#f87171' }}>{p.deaths}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 60, pointerEvents: 'none'
        }}>
            <div style={{
                display: 'flex', gap: '20px',
                backdropFilter: 'blur(10px)',
                padding: '20px',
                borderRadius: '10px',
                boxShadow: '0 0 50px rgba(0,0,0,0.5)'
            }}>
                <TeamTable teamName="BLUE" teamColor="BLUE" teamPlayers={blueTeam} />
                <TeamTable teamName="RED" teamColor="RED" teamPlayers={redTeam} />
            </div>
        </div>
    );
};