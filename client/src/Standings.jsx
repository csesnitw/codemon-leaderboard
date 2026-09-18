import React from 'react';

const PODIUM_POKEMON = [
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png', 
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/9.png', 
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/3.png'  
];
const POKEBALL_ICON = 'https://www.freeiconspng.com/uploads/pokeball-icon-3.png';

function rankClass(rank) {
  if (!rank) return 'text-slate-400';
  const r = +rank;
  if (r <= 10) return 'rank-master';
  if (r <= 100) return 'rank-expert';
  if (r <= 500) return 'rank-specialist';
  if (r <= 2000) return 'rank-pupil';
  return 'rank-newbie';
}

export default function Standings({ status, error, season, leaderboard, headers, contestHeaders }) {
  if (status === 'error') {
    return (
      <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-xl">
        <p className="font-bold text-lg">Oops! Something went wrong.</p>
        <p className="mt-2 font-mono bg-red-900/70 p-2 rounded">{error}</p>
      </div>
    );
  }

  return (
    <>
      <section className="codemon-card">
        <h2 className="text-lg font-semibold mb-4 text-primary">Cumulative Leaderboard</h2>
        <div className="overflow-auto rounded-xl border-table">
          <table className="min-w-full text-sm">
            <thead className="table-header">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold border-b border-table">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, index) => (
                <tr key={row.handle} className="table-row">
                  <td className={`px-3 py-2 font-semibold ${rankClass(index + 1)}`}>{index + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={index < 3 ? PODIUM_POKEMON[index] : POKEBALL_ICON}
                        alt="Trainer Icon"
                        className="w-10 h-10 image-pixelated"
                      />
                      <div>
                        <div className="font-medium text-primary">{row.handle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-bold text-primary">{row.score.toFixed(2)}</td>
                  {contestHeaders.map(contestHeader => {
                    const contest = row.contests[contestHeader.id];
                    return (
                      <td key={contestHeader.id} className="px-3 py-2">
                        {contest ? (
                          <div className="text-xs">
                            <div className="text-primary">Score: <span className="font-semibold">{contest.score.toFixed(2)}</span></div>
                            <div className="text-secondary text-[10px]">
                              ({contest.baseScore?.toFixed(2) || '0.00'}
                              +{contest.firstAcBonus?.toFixed(2) || '0.00'})
                              x{((contest.streakBonus / (contest.baseScore + contest.firstAcBonus)) + 1).toFixed(2) || '1.00'}
                            </div>
                            <div className="text-primary">Rank: <span className={rankClass(contest.rank)}>{contest.rank || 'N/A'}</span></div>
                            <div className="text-primary">Streak: <span className="text-amber-300">{contest.streak || 0}x</span></div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leaderboard.length === 0 && status === 'success' && (
          <p className="text-secondary text-center text-sm mt-4">No data available for the given contest IDs. Try different IDs.</p>
        )}
      </section>
    </>
  );
}
