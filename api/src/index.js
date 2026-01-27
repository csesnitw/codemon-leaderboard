import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 8787;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);

const CF_API_KEY = process.env.CF_API_KEY;
const CF_API_SECRET = process.env.CF_API_SECRET;

const userContestHistory = new Map();
const contestCache = new Map();

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const parseTxt = (filename) => {
    const filePath = join(__dirname, filename);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').slice(1);
    return lines.map(line => {
        const [rank, username] = line.split(',');
        return { rank: parseInt(rank, 10), username: username.trim() };
    });
};

const codemon1Leaderboard = parseTxt('leaderboard-codemon1.txt');
const codemon2Leaderboard = parseTxt('leaderboard-codemon2.txt');
const codemon3Leaderboard = parseTxt('leaderboard-codemon3.txt');
const codemon4Leaderboard = parseTxt('leaderboard-codemon4.txt');
const codemon5Leaderboard = parseTxt('leaderboard-codemon5.txt');
const codemon6Leaderboard = parseTxt('leaderboard-codemon6.txt');

const parseMapping = () => {
    const filePath = path.join(__dirname, 'mapping.txt');
    if (!fs.existsSync(filePath)) {
        console.error(`Mapping file not found: ${filePath}`);
        return {};
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').slice(1);
    const mapping = {};
    lines.forEach(line => {
        const [cf, hr] = line.split(',');
        if (cf && hr) {
            mapping[hr.trim()] = cf.trim();
        }
    });
    return mapping;
};

const invertedUsernameMapping = parseMapping();

app.use(cors());
app.use(express.json());
app.use(express.static('src'));

function calculateScoresAndStreaks(standingsData, contestId, userHistory) {
    if (!standingsData || !standingsData.rows) return standingsData;

    const firstAcByProblem = new Map();
    if (standingsData.problems) {
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
    }

    const contestParticipants = new Set();
    const scoredRows = standingsData.rows.map(row => {
        const handle = row.party.members[0].handle;
        contestParticipants.add(handle);

        let baseScore = 0;
        let firstAcBonus = 0;

        if (contestId === '631208') { // Codemon 2 (HR)
            // Participation: 5 points for everyone
            baseScore = 5;
        } else if (contestId === '631207') { // Codemon 1 (CF)
            if (row.rank <= 30) baseScore = 31 - row.rank;
        } else if (contestId === '631209') { // Codemon 3 (CF)
            if (row.rank <= 30) baseScore = 31 - row.rank; 
            const firstAcBonuses = {
                'rupenderyadav55': 4,
                'rajzvx': 4,
                'Alok2122P': 2,
                'SR_24MM': 2
            };
            if (firstAcBonuses[handle]) {
                firstAcBonus = firstAcBonuses[handle];
            }
        } else if (contestId === '631210') { // Codemon 4 (HR)
            if (row.rank <= 30) baseScore = 31 - row.rank;
            const firstAcBonuses = {
                'rajzvx': 4,           // rajbanazvx
                'SR_24MM': 2,          // mithintisairush1
                'SamyakJain092006': 2, // samyakjain092006
                'subhamjyotimaha1': 2  // subhamjyotimaha1
            };
            if (firstAcBonuses[handle]) {
                firstAcBonus = firstAcBonuses[handle];
            }
        } else if (contestId === '631211') { // Codemon 5 (HR)
             if (row.rank <= 30) baseScore = 31 - row.rank;
             const firstAcBonuses = {
                'Charan_Harsha': 4,
                'rupenderyadav55': 2,
                'ammar_101': 2,
                'krispatel2702': 2
             };
             if (firstAcBonuses[handle]) {
                firstAcBonus = firstAcBonuses[handle];
             }

             const manualBaseScores = {
                 'SiddhantSangaonkar': 14.9,
                 'SamyakJain092006': 16,
                 'HailOtg': 22.36
             };
             if (manualBaseScores[handle]) {
                 baseScore = manualBaseScores[handle];
             }

        } else if (contestId === '631212'){
            if (row.rank <= 20) baseScore = 31 - row.rank;
                const firstAcBonuses = {
                'rupenderyadav55': 4,
                'AbhinavChalla': 2,
                'SOHAM_MAHAJAN': 2,
            };
            if (firstAcBonuses[handle]) {
                firstAcBonus = firstAcBonuses[handle];
            }
        } else { 
            if (row.points > 0) {
                if (row.rank <= 30) baseScore = 31 - row.rank;
                if (row.problemResults) {
                    row.problemResults.forEach((pr, index) => {
                        const firstAc = firstAcByProblem.get(index);
                        if (pr.points > 0 && firstAc && firstAc.handle === handle && firstAc.time === pr.bestSubmissionTimeSeconds) {
                            firstAcBonus += 2;
                        }
                    });
                }
            }
        }
        
        const rawScore = baseScore + firstAcBonus;
        if (!userHistory.has(handle)) userHistory.set(handle, []);
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

    const finalScoredRows = scoredRows.map(row => {
        const handle = row.party.members[0].handle;
        const history = userHistory.get(handle).sort((a, b) => parseInt(a.contestId, 10) - parseInt(b.contestId, 10));
        let streak = 0;
        const currentContestIdx = history.findIndex(h => h.contestId === contestId);
        if (currentContestIdx !== -1) {
            for (let i = currentContestIdx; i >= 0; i--) {
                if (history[i].score > 0) streak++;
                else break;
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
    
    let currentRank = 0, lastScore = -1, lastPenalty = -1;
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

async function getRawStandings(contestId) {
    if (contestCache.has(contestId)) return contestCache.get(contestId);

    if (contestId === '631207') {
        const rows = codemon1Leaderboard.map(entry => ({
            party: { members: [{ handle: entry.username }] },
            rank: entry.rank,
            points: entry.rank <= 30 ? 31 - entry.rank : 0, 
            penalty: 0,
            problemResults: []
        }));
        const fakeStandings = { contest: { id: 631207, name: 'Codemon Contest 1' }, problems: [], rows };
        contestCache.set(contestId, fakeStandings);
        return fakeStandings;
    }
    
    if (contestId === '631208') {
        const rows = codemon2Leaderboard.map(entry => ({
            party: { members: [{ handle: invertedUsernameMapping[entry.username] || entry.username }] },
            rank: entry.rank,
            points: 5,
            penalty: 0,
            problemResults: []
        }));
        const fakeStandings = { contest: { id: 631208, name: 'Codemon Contest 2' }, problems: [], rows };
        contestCache.set(contestId, fakeStandings);
        return fakeStandings;
    }
    
    if (contestId === '631209') {
        const rows = codemon3Leaderboard.map(entry => ({
            party: { members: [{ handle: entry.username }] },
            rank: entry.rank,
            points: entry.rank <= 30 ? 31 - entry.rank : 0, 
            penalty: 0,
            problemResults: []
        }));
        const fakeStandings = { contest: { id: 631209, name: 'Codemon Contest 3' }, problems: [], rows };
        contestCache.set(contestId, fakeStandings);
        return fakeStandings;
    }

    if (contestId === '631210') {
        const rows = codemon4Leaderboard.map(entry => ({
            party: { members: [{ handle: invertedUsernameMapping[entry.username] || entry.username }] },
            rank: entry.rank,
            points: entry.rank <= 30 ? 31 - entry.rank : 0,
            penalty: 0,
            problemResults: []
        }));
        const fakeStandings = { contest: { id: 631210, name: 'Codemon Contest 4' }, problems: [], rows };
        contestCache.set(contestId, fakeStandings);
        return fakeStandings;
    }

    if (contestId === '631211') {
        const rows = codemon5Leaderboard.map(entry => ({
            party: { members: [{ handle: invertedUsernameMapping[entry.username] || entry.username }] },
            rank: entry.rank,
            points: entry.rank <= 30 ? 31 - entry.rank : 0,
            penalty: 0,
            problemResults: []
        }));
        rows.push({
            party: { members: [{ handle: 'SiddhantSangaonkar' }] },
            rank: 999,
            points: 0,
            penalty: 0,
            problemResults: []
        });
        rows.push({
            party: { members: [{ handle: 'SamyakJain092006' }] },
            rank: 999,
            points: 0,
            penalty: 0,
            problemResults: []
        });
        rows.push({
            party: { members: [{ handle: 'HailOtg' }] },
            rank: 999,
            points: 0,
            penalty: 0,
            problemResults: []
        });
        const fakeStandings = { contest: { id: 631211, name: 'Codemon Contest 5' }, problems: [], rows };
        contestCache.set(contestId, fakeStandings);
        return fakeStandings;
    }

    if (contestId === '631212') {
    const rows = codemon6Leaderboard.map(entry => ({
        party: { members: [{ handle: invertedUsernameMapping[entry.username] || entry.username }] },
        rank: entry.rank,
        points: entry.rank <= 30 ? 31 - entry.rank : 0,
        penalty: 0,
        problemResults: []
    }));
    const fakeStandings = { contest: { id: 631212, name: 'Codemon Contest 6' }, problems: [], rows };
    contestCache.set(contestId, fakeStandings);
    return fakeStandings;
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
    if (!contestIds) return res.status(400).json({ status: 'FAILED', comment: 'contestIds query parameter is required' });

    const ids = contestIds.split(',').map(id => id.trim());
    const cumulativeScores = new Map();
    try {
        const allRawContestData = await Promise.all(ids.map(id => getRawStandings(id)));
        allRawContestData.sort((a, b) => parseInt(a.contest.id, 10) - parseInt(b.contest.id, 10));
        const requestScopedHistory = new Map();
        const processedContests = {};
        for (const rawData of allRawContestData) {
            const contestId = rawData.contest.id.toString();
            processedContests[contestId] = calculateScoresAndStreaks(JSON.parse(JSON.stringify(rawData)), contestId, requestScopedHistory);
        }
        for (const contestId of ids) {
            const contestData = processedContests[contestId];
            if (!contestData) continue;
            for (const row of contestData.rows) {
                const handle = row.party.members[0].handle;
                if (!cumulativeScores.has(handle)) cumulativeScores.set(handle, { score: 0, penalty: 0, contests: {} });
                const userEntry = cumulativeScores.get(handle);
                userEntry.score += row.customScore;
                userEntry.penalty += row.penalty;
                userEntry.contests[contestId] = {
                    score: row.customScore, rank: row.rank, streak: row.streak,
                    baseScore: row.baseScore, firstAcBonus: row.firstAcBonus, streakBonus: row.streakBonus,
                };
            }
        }
        const leaderboard = Array.from(cumulativeScores.entries()).map(([handle, data]) => ({ handle, ...data })).sort((a, b) => b.score - a.score || a.penalty - b.penalty);
        const contestDetails = ids.map(id => {
            const contestData = allRawContestData.find(data => data.contest.id.toString() === id);
            return { id, name: contestData ? contestData.contest.name : `Contest ${id}` };
        });
        res.json({ status: 'OK', result: { leaderboard, problems: contestDetails } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'FAILED', comment: err.message });
    }
});

function generateApiSig(methodName, params) {
    const sortedParams = Object.keys(params).sort().map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
    const rand = Math.random().toString(36).substring(2, 8);
    const text = `${rand}/${methodName}?${sortedParams}#${CF_API_SECRET}`;
    return `${rand}${crypto.createHash('sha512').update(text).digest('hex')}`;
}

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

app.get('/health', (_, res) => res.json({ ok: true }));
const server = app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
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