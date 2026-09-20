import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';

// const API_URL = 'https://codemon-leaderboard.onrender.com';
const API_URL = 'http://localhost:8787';

const SEASONS = {
  2: { label: 'Season 2', contestIds: '712105', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' },
  1: { label: 'Season 1', contestIds: '631207,631208,631209,631210,631211,631212', sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png' },
};

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

export default function App() {
  const [status, setStatus] = useState('loading');
  const [leaderboard, setLeaderboard] = useState([]);
  const [contestHeaders, setContestHeaders] = useState([]);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('dark');
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [season, setSeason] = useState(2);
  const [activeView, setActiveView] = useState('standings'); // 'standings' | 'announcements'
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementsError, setAnnouncementsError] = useState('');

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.body.className = newTheme;
  };

  const controlNavbar = () => {
    if (typeof window !== 'undefined') {
      if (window.scrollY > lastScrollY) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      setLastScrollY(window.scrollY);
    }
  };

  useEffect(() => {
    document.body.className = theme;
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', controlNavbar);
      return () => {
        window.removeEventListener('scroll', controlNavbar);
      };
    }
  }, [lastScrollY, theme]);

  const fetchLeaderboard = async (seasonKey = season) => {
    const idsToFetch = SEASONS[seasonKey].contestIds;
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

  const fetchAnnouncements = async (seasonKey = season) => {
    setAnnouncementsLoading(true);
    setAnnouncementsError('');
    try {
      const response = await axios.get(`${API_URL}/api/announcements`, {
        params: { season: seasonKey }
      });
      if (response.data.status === 'OK') {
        setAnnouncements(response.data.announcements || []);
      } else {
        setAnnouncementsError('Failed to load announcements.');
      }
    } catch (err) {
      console.error("Failed to fetch announcements:", err);
      setAnnouncementsError('Failed to connect to the server for announcements.');
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(season);
    fetchAnnouncements(season);
  }, [season]);

  const handleRefresh = () => {
    if (activeView === 'standings') {
      fetchLeaderboard(season);
    } else {
      fetchAnnouncements(season);
    }
  };

  const headers = useMemo(() => {
    return ['Sl. No', 'Trainer', 'Total Score', ...contestHeaders.map(h => h.name)];
  }, [contestHeaders]);

  if (status === 'loading' && activeView === 'standings') {
    return <LoadingSpinner />;
  }

  return (
    <div className={`min-h-screen`}>
      <header className={`header ${headerVisible ? 'header-visible' : 'header-hidden'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-4xl font-pokemon tracking-wider">
              CodeMon&nbsp;
              <sub className="text-sm">
                <a href="https://csesnitw.in" target="_blank" rel="noopener noreferrer">
                  <span className="by-cses">by CSE</span><span className="text-csesBlue">S</span>
                </a>
              </sub>
            </h1>
            <p className="text-sm text-secondary">Track streaks across multiple contests!</p>
            
            {/* Season Tabs (Master Switch) */}
            <div className="season-tabs mt-2" role="tablist">
              {Object.entries(SEASONS).map(([key, s]) => (
                <button
                  key={key}
                  aria-selected={season == key}
                  className={`season-tab ${season == key ? 'active' : ''}`}
                  onClick={() => setSeason(key)}
                >
                  <img src={s.sprite} alt="" className="season-tab-sprite image-pixelated" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* View Navigation Links */}
            <div className="flex items-center gap-1 bg-slate-800/40 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/50">
              <button
                onClick={() => setActiveView('standings')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  activeView === 'standings'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                <span>🏆</span> Standings
              </button>
              <button
                onClick={() => setActiveView('announcements')}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  activeView === 'announcements'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                <span>📢</span> Announcements
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} className="theme-switcher">
                <div className="pokemon gengar"></div>
                <div className="pokemon clefable"></div>
              </button>
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
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {activeView === 'announcements' ? (
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-table pb-3">
              <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                📢 {SEASONS[season]?.label} Announcements
              </h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30">
                Season {season} Filtered
              </span>
            </div>

            {announcementsLoading ? (
              <div className="py-12 text-center">
                <LoadingSpinner />
              </div>
            ) : announcementsError ? (
              <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-xl">
                <p className="font-bold text-lg">Oops! Something went wrong.</p>
                <p className="mt-2 font-mono bg-red-900/70 p-2 rounded">{announcementsError}</p>
              </div>
            ) : announcements.length === 0 ? (
              <div className="codemon-card text-center py-12">
                <p className="text-secondary text-base">No announcements posted yet for Season {season}.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {announcements.map((item) => (
                  <article key={item.id} className="codemon-card transition-all hover:border-amber-500/40">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-table pb-3 mb-4">
                      <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                        <span className="text-amber-400">⚡</span> {item.title}
                      </h3>
                      {item.date && (
                        <span className="text-xs text-secondary bg-slate-800/60 dark:bg-slate-900/60 px-2.5 py-1 rounded-md border border-slate-700/40">
                          📅 {item.date}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-4">
                      <p className="text-secondary text-sm md:text-base leading-relaxed whitespace-pre-line">
                        {item.content}
                      </p>
                      
                      {item.imageUrl && (
                        <div className="mt-4 rounded-xl overflow-hidden max-w-md border border-table bg-slate-900/40 p-2">
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-full h-auto object-contain rounded-lg max-h-64 image-pixelated"
                          />
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : status === 'error' ? (
          <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-xl">
            <p className="font-bold text-lg">Oops! Something went wrong.</p>
            <p className="mt-2 font-mono bg-red-900/70 p-2 rounded">{error}</p>
          </div>
        ) : (
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
        )}
      </main>

      <footer className="text-center py-4 text-secondary text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="flex items-center justify-center">
            Made with ❤️ by CSES DEV
            <a href="https://github.com/csesnitw" target="_blank" rel="noopener noreferrer" className="inline-block ml-2 text-secondary hover:text-primary">
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