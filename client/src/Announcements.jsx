import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';

const API_URL = 'http://localhost:8787'; // Match your App.jsx API URL

export default function Announcements({ season }) {
  const [allAnnouncements, setAllAnnouncements] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/announcements`);
        if (response.data.status === 'OK') {
          // Sort by date descending (newest first)
          const sorted = response.data.result.sort((a, b) => new Date(b.date) - new Date(a.date));
          setAllAnnouncements(sorted);
          setStatus('success');
        } else {
          setStatus('error');
          setError(response.data.comment || 'Failed to load announcements.');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setError(err.message || 'Network error.');
      }
    };
    fetchAnnouncements();
  }, []);

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (status === 'error') {
    return (
      <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-xl">
        <p className="font-bold text-lg">Oops! Something went wrong.</p>
        <p className="mt-2 font-mono bg-red-900/70 p-2 rounded">{error}</p>
      </div>
    );
  }

  const seasonAnnouncements = allAnnouncements.filter(post => post.season == season);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-primary mb-4 border-b border-table pb-2">Season {season} Announcements</h2>
      {seasonAnnouncements.length === 0 ? (
        <p className="text-secondary text-center py-8 bg-black/10 rounded-xl border border-table">No announcements for this season yet.</p>
      ) : (
        seasonAnnouncements.map((post) => (
          <article key={post.id} className="codemon-card border-table rounded-xl overflow-hidden p-6">
            <h2 className="text-2xl font-pokemon text-primary tracking-wide mb-2">{post.title}</h2>
            <time className="text-xs text-amber-400 font-semibold mb-4 block">{new Date(post.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</time>
            {post.imageUrl && (
              <div className="mb-4 rounded-lg overflow-hidden border border-table bg-black/20 flex justify-center">
                <img src={post.imageUrl} alt={post.title} className="max-h-64 object-contain image-pixelated p-2" />
              </div>
            )}
            <p className="text-secondary whitespace-pre-wrap leading-relaxed">{post.content}</p>
          </article>
        ))
      )}
    </div>
  );
}
