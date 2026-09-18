import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import Standings from './Standings';
import Announcements from './Announcements';

const API_URL = 'http://localhost:8787'; // Changed for local development (was 'https://codemon-leaderboard.onrender.com')

const SEASONS = {
  2: {
    label: 'Season 2',
    contests: [
      { id: '712105', platform: 'codeforces' },
    ],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
  },
  1: {
    label: 'Season 1',
    contests: [
      { id: '631207', platform: 'codeforces' },
      { id: '631208', platform: 'hackerrank' },
      { id: '631209', platform: 'codeforces' },
      { id: '631210', platform: 'hackerrank' },
      { id: '631211', platform: 'hackerrank' },
      { id: '631212', platform: 'hackerrank' },
    ],
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png',
  },
};

function AppContent() {
  const [status, setStatus] = useState('loading');
  const [leaderboard, setLeaderboard] = useState([]);
  const [contestHeaders, setContestHeaders] = useState([]);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState('dark');
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [season, setSeason] = useState(2);
  const location = useLocation();

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
    const idsToFetch = SEASONS[seasonKey].contests.map(c => c.id).join(',');
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
    fetchLeaderboard(season);
  }, [season]);

  const handleRefresh = () => {
    fetchLeaderboard(season);
  };

  const headers = useMemo(() => {
    return ['Sl. No', 'Trainer', 'Total Score', ...contestHeaders.map(h => h.name)];
  }, [contestHeaders]);

  return (
    <div className={`min-h-screen`}>
      <header className={`header ${headerVisible ? 'header-visible' : 'header-hidden'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center gap-4">
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
            <div className="season-tabs" role="tablist">
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
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
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
            <nav className="flex gap-4 border-l border-table pl-4">
              <Link to="/" className={`font-semibold hover:text-amber-400 transition-colors ${location.pathname === '/' ? 'text-amber-400' : 'text-primary'}`}>🏆 Standings</Link>
              <Link to="/announcements" className={`font-semibold hover:text-amber-400 transition-colors ${location.pathname === '/announcements' ? 'text-amber-400' : 'text-primary'}`}>📢 Announcements</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Routes>
          <Route path="/" element={
            status === 'loading' ? (
              <LoadingSpinner />
            ) : (
              <Standings 
                status={status} 
                error={error} 
                season={season} 
                leaderboard={leaderboard} 
                headers={headers} 
                contestHeaders={contestHeaders} 
              />
            )
          } />
          <Route path="/announcements" element={<Announcements season={season} />} />
        </Routes>
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

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}