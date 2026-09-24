import 'dotenv/config';
import axios from 'axios';

const HR_COOKIE = process.env.HR_COOKIE || '';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.hackerrank.com/',
};

if (HR_COOKIE && !HR_COOKIE.includes('your_session_cookie_here')) {
    DEFAULT_HEADERS['Cookie'] = HR_COOKIE.startsWith('_hrank_session=') ? HR_COOKIE : `_hrank_session=${HR_COOKIE}`;
}

export async function fetchHackerRankStandings(contestSlug) {
    if (!contestSlug) {
        throw new Error('Contest slug is required.');
    }

    const cleanSlug = contestSlug
        .replace(/^hr:/i, '')
        .replace(/^https?:\/\/(?:www\.)?hackerrank\.com\/(?:contests\/)?/, '')
        .replace(/\/.*$/, '')
        .trim();

    console.log(`[HackerRank] Fetching contest: "${cleanSlug}"...`);

    let contestInfo = null;
    try {
        const contestRes = await axios.get(`https://www.hackerrank.com/rest/contests/${cleanSlug}`, {
            headers: DEFAULT_HEADERS,
            timeout: 10000
        });
        contestInfo = contestRes.data?.model;
        if (contestInfo) {
            console.log(`[HackerRank] ✅ Contest Found: "${contestInfo.name}" (ID: ${contestInfo.id})`);
        }
    } catch (e) {
        console.warn(`[HackerRank] Could not fetch contest metadata: ${e.response?.status || e.message}`);
    }

    const leaderboardUrl = `https://www.hackerrank.com/rest/contests/${cleanSlug}/leaderboard`;
    const limit = 100;
    let offset = 0;
    let allParticipants = [];
    let total = Infinity;

    while (offset < total) {
        const res = await axios.get(leaderboardUrl, {
            params: { offset, limit },
            headers: DEFAULT_HEADERS,
            timeout: 10000
        });

        const data = res.data;
        total = data.total || 0;
        const models = data.models || [];

        for (const m of models) {
            allParticipants.push({
                rank: m.rank,
                hacker: m.hacker,
                email: m.email || null,
                score: m.score,
                time_taken: m.time_taken,
                challenges: m.challenges || {}
            });
        }

        offset += limit;
        if (models.length === 0 || offset >= total) break;
    }

    console.log(`[HackerRank] ✅ Standings fetched successfully! Total participants: ${allParticipants.length}`);

    return {
        contest: {
            id: contestInfo?.id ? contestInfo.id.toString() : cleanSlug,
            name: contestInfo?.name || cleanSlug,
            slug: cleanSlug
        },
        participants: allParticipants
    };
}
