import React, { useEffect, useMemo, useRef, useState } from 'react'

const WS_URL = (contestId) => `ws://localhost:8787/ws?contestId=${encodeURIComponent(contestId)}`

function rankClass(rank) {
  if (!rank) return ''
  const r = +rank
  if (r <= 10) return 'rank-master'
  if (r <= 100) return 'rank-expert'
  if (r <= 500) return 'rank-specialist'
  if (r <= 2000) return 'rank-pupil'
  return 'rank-newbie'
}

function toHHMM(t) {
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function App() {
  const [contestId, setContestId] = useState('1881')
  const [status, setStatus] = useState('disconnected')
  const [rows, setRows] = useState([])
  const [problems, setProblems] = useState([])
  const wsRef = useRef(null)

  useEffect(() => {
    // clean up socket on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  const connect = () => {
    if (!contestId.trim()) return
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setRows([])
    setProblems([])
    setStatus('connecting')
    const ws = new WebSocket(WS_URL(contestId.trim()))
    wsRef.current = ws
    ws.onopen = () => setStatus('connected')
    ws.onclose = () => setStatus('disconnected')
    ws.onerror = () => setStatus('error')
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'standings' && msg.data?.status === 'OK') {
        const res = msg.data.result
        setRows(res.rows || [])
        setProblems(res.problems || [])
      }
    }
  }

  const headers = useMemo(() => {
    return ['Rank', 'Trainer', 'Points', 'Penalty', ...problems.map((p, idx) => `P${idx+1}`)]
  }, [problems])

  return (
    <div className="min-h-screen text-slate-100 bg-gradient-to-b from-slate-950 to-slate-900">
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-pokeball border-2 border-slate-700 shadow-card"></div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Pokémon CF Live Leaderboard</h1>
            <p className="text-sm text-slate-400">Catch ranks in real time! (Powered by Codeforces)</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none focus:ring focus:ring-slate-700"
              value={contestId}
              onChange={e => setContestId(e.target.value)}
              placeholder="contestId e.g. 1881"
            />
            <button
              onClick={connect}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 transition shadow-card"
            >
              Join
            </button>
            <span className="text-xs px-2 py-1 rounded-full border border-slate-700">
              {status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="poke-card">
          <h2 className="text-lg font-semibold mb-4">Leaderboard</h2>
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
                {rows.map((row) => {
                  const handle = row.party?.members?.[0]?.handle || 'unknown'
                  const rank = row.rank
                  const penalty = row.penalty
                  const points = row.points
                  const problemResults = row.problemResults || []
                  const solved = problemResults.reduce((a, b) => a + (b.points > 0 ? 1 : 0), 0)

                  return (
                    <tr key={handle} className="odd:bg-slate-900/30 even:bg-slate-900/10 hover:bg-slate-800/30 transition">
                      <td className={`px-3 py-2 font-semibold ${rankClass(rank)}`}>{rank}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-pokeball border border-slate-700"></div>
                          <div>
                            <div className="font-medium">{handle}</div>
                            <div className="text-xs text-slate-400">{solved} Pokéballs</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{points}</td>
                      <td className="px-3 py-2">{penalty}</td>
                      {problemResults.map((pr, idx) => {
                        const ok = pr.points > 0
                        const rej = pr.rejectedAttemptCount || 0
                        const time = pr.bestSubmissionTimeSeconds
                        return (
                          <td key={idx} className="px-3 py-2">
                            <span className={`badge ${ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>
                              {ok ? `✓ ${toHHMM(time || 0)}` : (rej > 0 ? `×${rej}` : '—')}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="text-slate-400 text-sm mt-4">No data yet. Enter a contest id and hit <b>Join</b>.</p>
          )}
        </section>

        <section className="poke-card">
          <h2 className="text-lg font-semibold mb-3">Tips</h2>
          <ul className="list-disc list-inside text-slate-300 space-y-1">
            <li>Lower your poll interval on the server for faster updates during live contests.</li>
            <li>You can page results by tweaking the `/api/standings` params.</li>
            <li>Style ranks like Pokémon types — go wild with Tailwind!</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
