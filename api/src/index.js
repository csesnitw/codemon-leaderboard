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
const userContestHistory = new Map(); // handle -> [{ contestId, score, rank }]
const contestCache = new Map(); // contestId -> data

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true
}));
app.use(express.json());

/**
 * Calculates custom scores based on the official rules including streak bonuses.
 * @param {object} standingsData - The 'result' object from the Codeforces API.
 * @param {string} contestId - The ID of the current contest.
 * @returns {object} The standingsData object with custom scores and new ranks.
 */
function calculateCustomScores(standingsData, contestId) {
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

    let basePoints = 0;
    let bonusPoints = 0;

    if (row.points > 0) {
      if (row.rank <= 30) basePoints = 31 - row.rank;
      
      row.problemResults.forEach((pr, index) => {
        const firstAc = firstAcByProblem.get(index);
        if (pr.points > 0 && firstAc && firstAc.handle === handle && firstAc.time === pr.bestSubmissionTimeSeconds) {
          bonusPoints += 2;
        }
      });
    }

    // Temporarily store raw scores before applying streak
    const rawScore = basePoints + bonusPoints;

    // Update user history for streak calculation later
    if (!userContestHistory.has(handle)) {
      userContestHistory.set(handle, []);
    }
    const history = userContestHistory.get(handle);
    const existingEntry = history.find(entry => entry.contestId === contestId);
    if (!existingEntry) {
      history.push({ contestId, score: rawScore, rank: row.rank });
    } else {
      existingEntry.score = rawScore;
      existingEntry.rank = row.rank;
    }
    
    return { ...row, rawScore };
  });

  // Now, apply streak multipliers
  const finalScoredRows = scoredRows.map(row => {
    const handle = row.party.members[0].handle;
    const history = userContestHistory.get(handle)
      .sort((a, b) => parseInt(a.contestId, 10) - parseInt(b.contestId, 10));

    let streak = 0;
    // Find streak ending at the *current* contest
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

    const customScore = row.rawScore * streakMultiplier;
    return { ...row, customScore, streak };
  });

  // Sort by new custom score, then by penalty for tie-breaking
  finalScoredRows.sort((a, b) => b.customScore - a.customScore || a.penalty - b.penalty);
  
  // Re-assign ranks based on the new sorting
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
  
  // For any user in history who didn't participate, add a zero score entry to break their streak
  for (const [handle, history] of userContestHistory.entries()) {
    if (!contestParticipants.has(handle) && !history.find(e => e.contestId === contestId)) {
      history.push({ contestId, score: 0, rank: null });
    }
  }

  return standingsData;
}


async function fetchAndProcessStandings(contestId) {
  if (contestCache.has(contestId)) {
    return contestCache.get(contestId);
  }

  const data = await fetchStandings({ contestId, showUnofficial: 'false' });

  if (data.status === 'OK') {
    const processedData = calculateCustomScores(data.result, contestId);
    contestCache.set(contestId, processedData);
    return processedData;
  } else {
    throw new Error(data.comment || 'Failed to fetch standings');
  }
}

app.get('/api/multiconteststandings', async (req, res) => {
  const { contestIds } = req.query;
  if (!contestIds) {
    return res.status(400).json({ status: 'FAILED', comment: 'contestIds query parameter is required' });
  }

  const ids = contestIds.split(',').map(id => id.trim());
  const cumulativeScores = new Map(); // handle -> { score, penalties, contests: [] }

  try {
    for (const id of ids) {
      const contestData = await fetchAndProcessStandings(id);
      for (const row of contestData.rows) {
        const handle = row.party.members[0].handle;
        if (!cumulativeScores.has(handle)) {
          cumulativeScores.set(handle, { score: 0, penalty: 0, contests: {} });
        }
        const userEntry = cumulativeScores.get(handle);
        userEntry.score += row.customScore;
        userEntry.penalty += row.penalty;
        userEntry.contests[id] = { score: row.customScore, rank: row.rank, streak: row.streak };
      }
    }

    const leaderboard = Array.from(cumulativeScores.entries())
      .map(([handle, data]) => ({ handle, ...data }))
      .sort((a, b) => b.score - a.score || a.penalty - b.penalty);

    res.json({ status: 'OK', result: { leaderboard, problems: ids } }); // Using problems to pass contestIds
  } catch (err) {
    res.status(500).json({ status: 'FAILED', comment: err.message });
  }
});


// --- Existing Codeforces API helpers and WebSocket server ---
// This part remains the same for single-contest live updates.
// ... (generateApiSig, fetchStandings, WebSocket server setup)
// Note: WebSocket part is now for single-contest view only.

// --- Codeforces API Helper Functions ---

/**
 * Generates the API signature required for authenticated requests.
 * @param {string} methodName - The API method name (e.g., 'contest.standings').
 * @param {object} params - The parameters for the API call, must include apiKey and time.
 * @returns {string} The generated apiSig.
 */
function generateApiSig(methodName, params) {
  // Sort parameters alphabetically by key
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');

  // Generate a 6-character random string
  const rand = Math.random().toString(36).substring(2, 8);

  // Create the string to be hashed
  const text = `${rand}/${methodName}?${sortedParams}#${CF_API_SECRET}`;
  
  // Hash the string using SHA-512
  const hash = crypto.createHash('sha512').update(text).digest('hex');

  // The final apiSig is the random string prepended to the hash
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
    // --- Authenticated Request for Gyms/Private Contests ---
    const time = Math.floor(Date.now() / 1000);
    const paramsForSig = {
      ...queryParams,
      apiKey: CF_API_KEY,
      time,
    };
    const apiSig = generateApiSig(methodName, paramsForSig);

    const finalParams = new URLSearchParams({
      ...queryParams,
      apiKey: CF_API_KEY,
      time,
      apiSig,
    }).toString();
    
    const url = `${baseUrl}?${finalParams}`;
    const { data } = await axios.get(url, { timeout: 20000 });
    return data;
  } else {
    // --- Public Request ---
    const finalParams = new URLSearchParams(queryParams).toString();
    const url = `${baseUrl}?${finalParams}`;
    const { data } = await axios.get(url, { timeout: 20000 });
    return data;
  }
}


// Simple health route
app.get('/health', (_, res) => res.json({ ok: true }));

// Proxy endpoint to fetch standings once
app.get('/api/standings', async (req, res) => {
  try {
    const { contestId, from = 1, count = 100 } = req.query;
    if (!contestId) {
      return res.status(400).json({ status: 'FAILED', comment: 'contestId is required' });
    }
    // Fetch official participants only
    const data = await fetchStandings({ contestId, from, count, showUnofficial: 'false' });
    
    // Apply custom scoring logic
    if (data.status === 'OK') {
      data.result = calculateCustomScores(data.result);
    }
    
    res.json(data);
  } catch (err) {
    console.error(err.message);
    // Pass through the error from Codeforces API if available
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    res.status(500).json({ status: 'FAILED', comment: 'Server error fetching standings' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

// ---- WebSocket live updates ----
const wss = new WebSocketServer({ server, path: '/ws' });

// Track subscribers per contestId -> Set<WebSocket>
const rooms = new Map();
// Track intervals per contestId -> NodeJS.Timer
const intervals = new Map();

function subscribe(ws, contestId) {
  if (!rooms.has(contestId)) {
    rooms.set(contestId, new Set());
  }
  rooms.get(contestId).add(ws);
  console.log(`[ws] client subscribed to contest ${contestId}. Count=${rooms.get(contestId).size}`);

  // Start polling if not already
  if (!intervals.has(contestId)) {
    const timer = setInterval(() => pollAndBroadcast(contestId), POLL_INTERVAL_MS);
    intervals.set(contestId, timer);
    // Fire immediately once for the new subscriber
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
    // Stop interval if no one is listening
    if (intervals.has(contestId)) {
      clearInterval(intervals.get(contestId));
      intervals.delete(contestId);
      console.log(`[ws] stopped polling for contest ${contestId}`);
    }
  }
}

async function pollAndBroadcast(contestId) {
  try {
    // Fetch official standings only.
    const data = await fetchStandings({ contestId, from: 1, count: 200, showUnofficial: 'false' });

    // Calculate custom scores before broadcasting
    if (data.status === 'OK') {
      data.result = calculateCustomScores(data.result);
    }

    const payload = JSON.stringify({ type: 'standings', contestId, data });
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
  // Parse query params for contestId
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const contestId = url.searchParams.get('contestId');
  if (!contestId) {
    ws.send(JSON.stringify({ type: 'error', message: 'contestId query required' }));
    ws.close();
    return;
  }
  subscribe(ws, contestId);

  ws.on('close', () => {
    unsubscribe(ws, contestId);
  });

  ws.on('message', (msg) => {
    // reserved for future features
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch {}
  });
});