import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';

const API_URL = 'https://codemon-leaderboard.onrender.com';

// URLs for our top 3 Pokémon sprites
const PODIUM_POKEMON = [
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png', // Charizard
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/9.png', // Blastoise
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/3.png'  // Venusaur
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

export default function App() {
  const [contestIds, setContestIds] = useState('631207');
  const [status, setStatus] = useState('loading');
  const [leaderboard, setLeaderboard] = useState([]);
  const [contestHeaders, setContestHeaders] = useState([]);
  const [error, setError] = useState('');

  const fetchLeaderboard = async (idsToFetch) => {
    if (!idsToFetch || !idsToFetch.trim()) {
      setStatus('loading');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStatus('idle');
      setLeaderboard([]);
      setContestHeaders([]);
      setError('');
      return;
    }

    setStatus('loading');
    setError('');
    setLeaderboard([]);

    try {
      const timerPromise = new Promise(resolve => setTimeout(resolve, 2000));
      const apiPromise = axios.get(`${API_URL}/api/multiconteststandings`, {
        params: { contestIds: idsToFetch.trim() }
      });

      const [response] = await Promise.all([apiPromise, timerPromise]);

      if (response.data.status === 'OK') {
        setLeaderboard(response.data.result.leaderboard);
        setContestHeaders(response.data.result.problems);
        setStatus('success');
      } else {
        setStatus('error');
        setError(response.data.comment || 'An unknown API error occurred.');
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      setStatus('error');
      const errorMessage = err.response?.data?.comment || err.message || 'Failed to connect to the server.';
      setError(errorMessage);
    }
  };

  useEffect(() => {
    fetchLeaderboard(contestIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    fetchLeaderboard(contestIds);
  };

  const headers = useMemo(() => {
    return ['Sl. No', 'Trainer', 'Total Score', ...contestHeaders.map(h => h.name)];
  }, [contestHeaders]);

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen text-slate-100 bg-gradient-to-b from-slate-950 to-slate-900">
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1 text-center md:text-left">
          <h1 className="text-4xl font-pokemon tracking-wider text-amber-400">
            CodeMon&nbsp;  
            <sub className="text-sm text-slate-400">
            <a href="https://csesnitw.in" target="_blank" rel="noopener noreferrer">
              <span className="text-white">by CSE</span><span className="text-csesBlue">S</span>
            </a>
            </sub>
          </h1>

            <p className="text-sm text-slate-400">Track streaks across multiple contests!</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <input
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none focus:ring focus:ring-slate-700 w-full sm:w-64"
              value={contestIds}
              onChange={e => setContestIds(e.target.value)}
              placeholder="Enter contest IDs"
              onKeyUp={(e) => e.key === 'Enter' && handleRefresh()}
            />
            <button
              onClick={handleRefresh}
              className="pokeball-button"
              aria-label="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
            </button>
            <span className={`text-xs px-2 py-1 rounded-full border ${status === 'error' ? 'border-red-500 text-red-400' : 'border-slate-700'}`}>
              {status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {status === 'error' ? (
          <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-xl">
            <p className="font-bold text-lg">Oops! Something went wrong.</p>
            <p className="mt-2 font-mono bg-red-900/70 p-2 rounded">{error}</p>
          </div>
        ) : (
          <>
            <div className="bg-slate-800/50 border border-slate-700 text-slate-300 p-4 rounded-xl text-sm">
              <p className="font-bold text-base text-amber-400">Note on the First Codemon Contest (631207):</p>
              <p className="mt-2">
                During the first Codemon contest, Codeforces experienced prolonged 403 errors that disrupted submission timings and affected first-AC detection. To ensure fairness, we have decided that for this contest only, the usual +2 first-AC bonus will not be applied. Participants with identical contest scores will be assigned the same rank and awarded the same leaderboard points, with time not being considered as a tiebreaker for this round.
              </p>
            </div>
            <section className="codemon-card">
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
                            <img
                              src={index < 3 ? PODIUM_POKEMON[index] : POKEBALL_ICON}
                              alt="Trainer Icon"
                              className="w-10 h-10 image-pixelated"
                            />
                            <div>
                              <div className="font-medium">{row.handle}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-bold">{row.score.toFixed(2)}</td>
                        {contestHeaders.map(contestHeader => {
                          const contest = row.contests[contestHeader.id];
                          return (
                            <td key={contestHeader.id} className="px-3 py-2">
                              {contest ? (
                                <div className="text-xs">
                                  <div>Score: <span className="font-semibold">{contest.score.toFixed(2)}</span></div>
                                  <div className="text-slate-400 text-[10px]">
                                    ({contest.baseScore?.toFixed(2) || '0.00'}
                                    +{contest.firstAcBonus?.toFixed(2) || '0.00'})
                                    x{((contest.streakBonus / (contest.baseScore + contest.firstAcBonus)) + 1).toFixed(2) || '1.00'}
                                  </div>
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
              {leaderboard.length === 0 && status === 'success' && (
                <p className="text-slate-400 text-center text-sm mt-4">No data available for the given contest IDs. Try different IDs.</p>
              )}
            </section>
          </>
        )}
      </main>
      <footer className="text-center py-4 text-slate-400 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="flex items-center justify-center">
            Made with ❤️ by CSES DEV
            <a href="https://github.com/csesnitw" target="_blank" rel="noopener noreferrer" className="inline-block ml-2 text-slate-400 hover:text-slate-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" className="bi bi-github" viewBox="0 0 16 16">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.68.62 1.07 1.62.76 2.02.58.06-.45.24-.76.44-1.03-1.55-.18-3.18-.78-3.18-3.45 0-.76.27-1.38.72-1.87-.07-.18-.31-.88.07-1.84 0 0 .58-.19 1.92.72a6.72 6.72 0 0 1 1.75-.24c.59 0 1.2.08 1.75.24 1.33-.91 1.92-.72 1.92-.72.38.96.14 1.66.07 1.84.45.49.72 1.11.72 1.87 0 2.68-1.63 3.27-3.19 3.44.25.22.47.65.47 1.31 0 .95-.01 1.71-.01 1.94 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}