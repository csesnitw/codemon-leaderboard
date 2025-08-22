import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// IMPORTANT: Replace this with your actual Render.com backend URL
const API_URL = 'https://codemon-leaderboard.onrender.com';

function rankClass(rank) {
  if (!rank) return 'text-slate-400';
  const r = +rank;
  if (r <= 10) return 'rank-master';
  if (r <= 100) return 'rank-expert';
  if (r <= 500) return 'rank-specialist';
  if (r <= 2000) return 'rank-pupil';
  return 'rank-newbie';
}

export default function App() {
  const [contestIds, setContestIds] = useState();
  const [status, setStatus] = useState('idle');
  const [leaderboard, setLeaderboard] = useState([]);
  const [contestHeaders, setContestHeaders] = useState([]);
  const [error, setError] = useState('');

  const fetchLeaderboard = async () => {
    if (!contestIds.trim()) return;
    setStatus('loading');
    setError('');
    setLeaderboard([]);
    setContestHeaders([]);

    try {
      const response = await axios.get(`${API_URL}/api/multiconteststandings`, {
        params: { contestIds: contestIds.trim() }
      });

      if (response.data.status === 'OK') {
        setLeaderboard(response.data.result.leaderboard);
        setContestHeaders(response.data.result.problems);
        setStatus('success');
      } else {
        setStatus('error');
        setError(response.data.comment || 'An unknown error occurred.');
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      setStatus('error');
      setError(err.message || 'Failed to connect to the server.');
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headers = useMemo(() => {
    return ['Rank', 'Trainer', 'Total Score', ...contestHeaders];
  }, [contestHeaders]);

  return (
    <div className="min-h-screen text-slate-100 bg-gradient-to-b from-slate-950 to-slate-900">
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-pokeball border-2 border-slate-700 shadow-card"></div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Pokémon CF Cumulative Leaderboard</h1>
            <p className="text-sm text-slate-400">Track streaks across multiple contests!</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none focus:ring focus:ring-slate-700 w-64"
              value={contestIds}
              onChange={e => setContestIds(e.target.value)}
              placeholder="e.g. 1881, 1882, 1883"
            />
            <button
              onClick={fetchLeaderboard}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 transition shadow-card"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Loading...' : 'Refresh'}
            </button>
             <span className="text-xs px-2 py-1 rounded-full border border-slate-700">
              {status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="poke-card">
          <h2 className="text-lg font-semibold mb-4">Cumulative Leaderboard</h2>
          <div className="overflow-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/70">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left font-semibold border-b border-slate-800">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, index) => (
                  <tr key={row.handle} className="odd:bg-slate-900/30 even:bg-slate-900/10 hover:bg-slate-800/30 transition">
                    <td className={`px-3 py-2 font-semibold ${rankClass(index + 1)}`}>{index + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-pokeball border border-slate-700"></div>
                        <div>
                          <div className="font-medium">{row.handle}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-bold">{row.score.toFixed(2)}</td>
                    {contestHeaders.map(contestId => {
                      const contest = row.contests[contestId];
                      return (
                        <td key={contestId} className="px-3 py-2">
                          {contest ? (
                            <div className="text-xs">
                              <div>Score: <span className="font-semibold">{contest.score.toFixed(2)}</span></div>
                              <div>Rank: <span className={rankClass(contest.rank)}>{contest.rank || 'N/A'}</span></div>
                               <div>Streak: <span className="text-amber-300">{contest.streak || 0}x</span></div>
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
          {status === 'error' && (
            <p className="text-red-400 text-sm mt-4">Error: {error}</p>
          )}
          {leaderboard.length === 0 && status === 'success' && (
            <p className="text-slate-400 text-sm mt-4">No data available for the given contest IDs.</p>
          )}
        </section>
      </main>
    </div>
  );
}