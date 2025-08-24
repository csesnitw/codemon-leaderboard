import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 8787;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

// ---- Codeforces API Credentials ----
const CF_API_KEY = process.env.CF_API_KEY;
const CF_API_SECRET = process.env.CF_API_SECRET;

// --- In-memory store for streaks and contest data ---
// This is now primarily for the WebSocket live poller
const userContestHistory = new Map();
const contestCache = new Map(); // Caches raw contest data

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true
}));
app.use(express.json());

/**
 * A stateful calculator for custom scores. It reads from and writes to the provided userHistory map.
 * @param {object} standingsData - The raw 'result' object from the Codeforces API.
 * @param {string} contestId - The ID of the current contest.
 * @param {Map} userHistory - The map to use for tracking user contest history for streak calculation.
 * @returns {object} The standingsData object with custom scores and new ranks.
 */
function calculateScoresAndStreaks(standingsData, contestId, userHistory) {
  if (!standingsData || !standingsData.rows) {
    return standingsData;
  }

  // Find First Accepted submissions for bonus points
  const firstAcByProblem = new Map();
  standingsData.problems.forEach((_, index) => {
    let firstAc = { handle: null, time: Infinity };
    for (const row of standingsData.rows) {
      const pr = row.problemResults[index];
      if (pr && pr.points > 0 && pr.bestSubmissionTimeSeconds < firstAc.time) {
        firstAc = { time: pr.bestSubmissionTimeSeconds, handle: row.party.members[0].handle };
      }
    }
    if (firstAc.handle) firstAcByProblem.set(index, firstAc);
  });
  
  const contestParticipants = new Set();

  // Calculate scores for each participant
  const scoredRows = standingsData.rows.map(row => {
    const handle = row.party.members[0].handle;
    contestParticipants.add(handle);

    let baseScore = 0;
    let firstAcBonus = 0;

    if (row.points > 0) {
      if (row.rank <= 30) baseScore = 31 - row.rank;
      
      if (contestId !== '631207') {
        row.problemResults.forEach((pr, index) => {
          const firstAc = firstAcByProblem.get(index);
          if (pr.points > 0 && firstAc && firstAc.handle === handle && firstAc.time === pr.bestSubmissionTimeSeconds) {
            firstAcBonus += 2;
          }
        });
      }
    }

    const rawScore = baseScore + firstAcBonus;

    // Update the provided history map for streak calculation later
    if (!userHistory.has(handle)) {
      userHistory.set(handle, []);
    }
    const history = userHistory.get(handle);
    const existingEntry = history.find(entry => entry.contestId === contestId);
    if (!existingEntry) {
      history.push({ contestId, score: rawScore, rank: row.rank });
    } else {
      existingEntry.score = rawScore;
      existingEntry.rank = row.rank;
    }
    
    return { ...row, rawScore, baseScore, firstAcBonus };
  });

  // Now, apply streak multipliers
  const finalScoredRows = scoredRows.map(row => {
    const handle = row.party.members[0].handle;
    const history = userHistory.get(handle)
      .sort((a, b) => parseInt(a.contestId, 10) - parseInt(b.contestId, 10));

    let streak = 0;
    const currentContestIdx = history.findIndex(h => h.contestId === contestId);
    if (currentContestIdx !== -1) {
      for (let i = currentContestIdx; i >= 0; i--) {
        if (history[i].score > 0) {
          streak++;
        } else {
          break; // Streak broken
        }
      }
    }

    let streakMultiplier = 1.0;
    if (streak >= 4) streakMultiplier = 1.15;
    else if (streak === 3) streakMultiplier = 1.10;
    else if (streak === 2) streakMultiplier = 1.05;
    
    const streakBonus = row.rawScore * (streakMultiplier - 1);
    const customScore = row.rawScore * streakMultiplier;
    return { ...row, customScore, streak, streakBonus };
  });

  finalScoredRows.sort((a, b) => b.customScore - a.customScore || a.penalty - b.penalty);
  
  let currentRank = 0;
  let lastScore = -1;
  let lastPenalty = -1;
  finalScoredRows.forEach((row, index) => {
    if (row.customScore !== lastScore || row.penalty !== lastPenalty) {
      currentRank = index + 1;
      lastScore = row.customScore;
      lastPenalty = row.penalty;
    }
    row.rank = currentRank;
  });

  standingsData.rows = finalScoredRows;
  
  for (const [handle, history] of userHistory.entries()) {
    if (!contestParticipants.has(handle) && !history.find(e => e.contestId === contestId)) {
      history.push({ contestId, score: 0, rank: null });
    }
  }

  return standingsData;
}

// Fetches raw standings and caches them
async function getRawStandings(contestId) {
    if (contestCache.has(contestId)) {
        return contestCache.get(contestId);
    }
    const data = await fetchStandings({ contestId, showUnofficial: 'false' });
    if (data.status === 'OK') {
        contestCache.set(contestId, data.result);
        return data.result;
    }
    throw new Error(data.comment || `Failed to fetch standings for contest ${contestId}`);
}


app.get('/api/multiconteststandings', async (req, res) => {
  const { contestIds } = req.query;
  if (!contestIds) {
    return res.status(400).json({ status: 'FAILED', comment: 'contestIds query parameter is required' });
  }

  const ids = contestIds.split(',').map(id => id.trim());
  const cumulativeScores = new Map();
  
  try {
    // 1. Fetch all raw data first
    const allRawContestData = await Promise.all(ids.map(id => getRawStandings(id)));

    // 2. Sort contests chronologically to process in order
    allRawContestData.sort((a, b) => parseInt(a.contest.id, 10) - parseInt(b.contest.id, 10));
    
    const requestScopedHistory = new Map(); // Use a temporary history for this request only
    const processedContests = {};

    // 3. Process each contest in order, building up the temporary history
    for (const rawData of allRawContestData) {
        const contestId = rawData.contest.id.toString();
        // The `calculateScoresAndStreaks` function will now modify `requestScopedHistory`
        const processedData = calculateScoresAndStreaks(JSON.parse(JSON.stringify(rawData)), contestId, requestScopedHistory);
        processedContests[contestId] = processedData;
    }

    // 4. Aggregate the results for the final leaderboard
    for (const contestId of ids) { // Iterate in original order for the response structure
        const contestData = processedContests[contestId];
        if (!contestData) continue;

        for (const row of contestData.rows) {
            const handle = row.party.members[0].handle;
            if (!cumulativeScores.has(handle)) {
                cumulativeScores.set(handle, { score: 0, penalty: 0, contests: {} });
            }
            const userEntry = cumulativeScores.get(handle);
            userEntry.score += row.customScore;
            userEntry.penalty += row.penalty;
            userEntry.contests[contestId] = { 
                score: row.customScore, 
                rank: row.rank, 
                streak: row.streak,
                baseScore: row.baseScore,
                firstAcBonus: row.firstAcBonus,
                streakBonus: row.streakBonus,
            };
        }
    }

    const leaderboard = Array.from(cumulativeScores.entries())
      .map(([handle, data]) => ({ handle, ...data }))
      .sort((a, b) => b.score - a.score || a.penalty - b.penalty);

    const contestDetails = ids.map(id => {
        const contestData = allRawContestData.find(data => data.contest.id.toString() === id);
        return {
            id,
            name: contestData ? contestData.contest.name : `Contest ${id}`
        };
    });

    res.json({ status: 'OK', result: { leaderboard, problems: contestDetails } });
  } catch (err) {
    res.status(500).json({ status: 'FAILED', comment: err.message });
  }
});


// --- Codeforces API Helper Functions ---

/**
 * Generates the API signature required for authenticated requests.
 * @param {string} methodName - The API method name (e.g., 'contest.standings').
 * @param {object} params - The parameters for the API call, must include apiKey and time.
 * @returns {string} The generated apiSig.
 */
function generateApiSig(methodName, params) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  const rand = Math.random().toString(36).substring(2, 8);
  const text = `${rand}/${methodName}?${sortedParams}#${CF_API_SECRET}`;
  const hash = crypto.createHash('sha512').update(text).digest('hex');
  return `${rand}${hash}`;
}

/**
 * Fetches contest standings from the Codeforces API.
 * It automatically handles API request signing if credentials are provided.
 * @param {object} queryParams - The query parameters for the standings request.
 * @returns {Promise<object>} The data from the Codeforces API.
 */
async function fetchStandings(queryParams) {
  const methodName = 'contest.standings';
  const baseUrl = `https://codeforces.com/api/${methodName}`;

  if (CF_API_KEY && CF_API_SECRET) {
    const time = Math.floor(Date.now() / 1000);
    const paramsForSig = { ...queryParams, apiKey: CF_API_KEY, time };
    const apiSig = generateApiSig(methodName, paramsForSig);
    const finalParams = new URLSearchParams({ ...queryParams, apiKey: CF_API_KEY, time, apiSig }).toString();
    const { data } = await axios.get(`${baseUrl}?${finalParams}`, { timeout: 20000 });
    return data;
  } else {
    const finalParams = new URLSearchParams(queryParams).toString();
    const { data } = await axios.get(`${baseUrl}?${finalParams}`, { timeout: 20000 });
    return data;
  }
}


// Simple health route
app.get('/health', (_, res) => res.json({ ok: true }));

// ---- WebSocket live updates (uses the global history) ----
const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
const intervals = new Map();

function subscribe(ws, contestId) {
  if (!rooms.has(contestId)) rooms.set(contestId, new Set());
  rooms.get(contestId).add(ws);
  console.log(`[ws] client subscribed to contest ${contestId}. Count=${rooms.get(contestId).size}`);

  if (!intervals.has(contestId)) {
    const timer = setInterval(() => pollAndBroadcast(contestId), POLL_INTERVAL_MS);
    intervals.set(contestId, timer);
    pollAndBroadcast(contestId);
  }
}

function unsubscribe(ws, contestId) {
  const set = rooms.get(contestId);
  if (!set) return;
  set.delete(ws);
  console.log(`[ws] client left contest ${contestId}. Count=${set.size}`);
  if (set.size === 0) {
    rooms.delete(contestId);
    if (intervals.has(contestId)) {
      clearInterval(intervals.get(contestId));
      intervals.delete(contestId);
      console.log(`[ws] stopped polling for contest ${contestId}`);
    }
  }
}

async function pollAndBroadcast(contestId) {
  try {
    const rawData = await getRawStandings(contestId);
    const dataWithScores = calculateScoresAndStreaks(JSON.parse(JSON.stringify(rawData)), contestId, userContestHistory);
    const payload = JSON.stringify({ type: 'standings', contestId, data: { status: 'OK', result: dataWithScores }});
    const clients = rooms.get(contestId);
    if (!clients || clients.size === 0) return;

    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
    console.log(`[ws] broadcasted to contest ${contestId} (clients=${clients.size})`);
  } catch (e) {
    const clients = rooms.get(contestId);
    const errorMessage = e.response?.data?.comment || 'Failed to fetch standings';
    const errorMsgPayload = JSON.stringify({ type: 'error', contestId, message: errorMessage });
    
    if (clients) {
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(errorMsgPayload);
      }
    }
    console.error(`[ws] poll error for contest ${contestId}:`, errorMessage);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const contestId = url.searchParams.get('contestId');
  if (!contestId) {
    ws.send(JSON.stringify({ type: 'error', message: 'contestId query required' }));
    ws.close();
    return;
  }
  subscribe(ws, contestId);

  ws.on('close', () => unsubscribe(ws, contestId));
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch {}
  });
});