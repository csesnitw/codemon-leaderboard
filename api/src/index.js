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

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true
}));
app.use(express.json());

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
    const { contestId, from = 1, count = 100, showUnofficial = false } = req.query;
    if (!contestId) {
      return res.status(400).json({ status: 'FAILED', comment: 'contestId is required' });
    }
    const data = await fetchStandings({ contestId, from, count, showUnofficial: showUnofficial.toString() });
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
    // Fetch standings using the new helper function. showUnofficial is often useful for gyms.
    const data = await fetchStandings({ contestId, from: 1, count: 200, showUnofficial: 'true' });
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
