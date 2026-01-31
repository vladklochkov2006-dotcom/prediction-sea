import React from 'react';

interface KillEvent {
    id: number;
    killer: string;
    victim: string;
    killerTeam: string;
    victimTeam: string;
}

interface KillFeedProps {
    kills: KillEvent[];
}

export const KillFeed: React.FC<KillFeedProps> = ({ kills }) => {
    return (
        <div style={{
            position: 'absolute',
            top: '180px',
            left: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            zIndex: 40,
            pointerEvents: 'none',
            fontFamily: '"Consolas", "Monaco", monospace',
            fontWeight: 'bold',
            textShadow: '0 1px 3px rgba(0,0,0,0.9)'
        }}>
            {kills.map((k) => (
                <div key={k.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    animation: 'slideIn 0.3s ease-out',
                    fontSize: '14px',
                    letterSpacing: '0.5px',
                    borderLeft: `3px solid ${k.killerTeam === 'BLUE' ? '#60a5fa' : '#f87171'}`
                }}>
                    {/* Вбивця */}
                    <span style={{ color: k.killerTeam === 'BLUE' ? '#60a5fa' : '#f87171' }}>
                        {k.killer}
                    </span>

                    {/* --- ЗМІНА ТУТ: Розвертаємо пістолет вправо --- */}
                    <span style={{
                        color: '#ccc',
                        fontSize: '16px',
                        display: 'inline-block', // Потрібно для трансформації
                        transform: 'scaleX(-1)'  // Віддзеркалення по горизонталі
                    }}>
                        🔫
                    </span>
                    {/* --------------------------------------------- */}

                    {/* Жертва */}
                    <span style={{ color: k.victimTeam === 'BLUE' ? '#60a5fa' : '#f87171' }}>
                        {k.victim}
                    </span>
                </div>
            ))}

            <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
        </div>
    );
};