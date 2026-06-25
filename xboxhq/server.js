// XboxHQ backend
// Proxies the OpenXBL (xbl.io) Xbox Live API, keeps your API key server-side,
// and caches responses so you stay under the free tier's 150 requests/hour.

const express = require('express');
const path = require('path');
// Load .env from next to this file, so it works no matter which folder you launch from.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = (process.env.OPENXBL_KEY || '').trim();
const BASE = 'https://xbl.io/api/v2';

if (!API_KEY) {
  console.warn('\n  No OPENXBL_KEY set. The site will still load using demo data.');
  console.warn('  Make sure your key is in a file named exactly ".env" (not ".env.example"),');
  console.warn('  in the same folder as server.js. See README.md.\n');
}

// ---- tiny in-memory cache (key -> { expires, data }) ----
const cache = new Map();
function getCached(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  return null;
}
function setCached(key, data, ttlSeconds) {
  cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
}

// ---- one helper to call OpenXBL ----
async function xbl(endpoint) {
  const res = await fetch(BASE + endpoint, {
    headers: { 'X-Authorization': API_KEY, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    // Surface the real reason in the terminal so failures aren't silent.
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch (_) {}
    console.error(`  OpenXBL ${endpoint} -> ${res.status} ${res.statusText}  ${body}`);
    const err = new Error(`OpenXBL ${endpoint} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Turn the /account settings array into a flat object, and remember our own XUID.
let myXuid = null;
async function getProfile() {
  const cached = getCached('profile');
  if (cached) return cached;

  const raw = await xbl('/account');
  const user = raw.profileUsers?.[0] || {};
  const s = Object.fromEntries((user.settings || []).map((x) => [x.id, x.value]));
  myXuid = user.id || null;

  const profile = {
    xuid: user.id,
    gamertag: s.Gamertag || s.ModernGamertag || 'Unknown',
    gamerscore: Number(s.Gamerscore || 0),
    avatar: s.GameDisplayPicRaw || null,
    tier: s.AccountTier || null,
    bio: s.Bio || '',
    location: s.Location || '',
  };
  setCached('profile', profile, 300); // 5 min
  return profile;
}

async function ensureXuid() {
  if (!myXuid) await getProfile();
  return myXuid;
}

// ---- API routes the frontend calls ----

app.get('/api/profile', async (req, res) => {
  try {
    res.json(await getProfile());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Recently played titles -> the "continue playing" row + library
app.get('/api/library', async (req, res) => {
  try {
    const cached = getCached('library');
    if (cached) return res.json(cached);

    const xuid = await ensureXuid();
    const raw = await xbl(`/player/titleHistory/${xuid}`);
    const games = (raw.titles || []).map((t) => {
      const a = t.achievement || {};
      return {
        titleId: t.titleId,
        name: t.name,
        image: t.displayImage || (t.images || []).find((i) => i.type === 'BoxArt')?.url || null,
        gamerscoreEarned: a.currentGamerscore ?? null,
        gamerscoreTotal: a.totalGamerscore ?? null,
        achievementsEarned: a.currentAchievements ?? null,
        lastPlayed: t.titleHistory?.lastTimePlayed || null,
      };
    });
    setCached('library', games, 300);
    res.json(games);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Friends list, filtered to whoever is online, with what they're playing
app.get('/api/friends', async (req, res) => {
  try {
    const cached = getCached('friends');
    if (cached) return res.json(cached);

    const raw = await xbl('/friends');
    const online = (raw.people || [])
      .filter((p) => p.presenceState === 'Online')
      .map((p) => ({
        gamertag: p.gamertag || p.displayName,
        avatar: p.displayPicRaw || null,
        playing: p.presenceText || 'Online',
        gamerscore: Number(p.gamerScore || 0),
      }));
    setCached('friends', online, 60); // presence changes fast: 1 min
    res.json(online);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Live achievements for one game (used by the guide's Achievements tab)
app.get('/api/achievements/:titleId', async (req, res) => {
  try {
    const { titleId } = req.params;
    const ckey = `ach:${titleId}`;
    const cached = getCached(ckey);
    if (cached) return res.json(cached);

    const xuid = await ensureXuid();
    const raw = await xbl(`/achievements/player/${xuid}/${titleId}`);
    const list = (raw.achievements || []).map((a) => {
      const reward = (a.rewards || []).find((r) => r.type === 'Gamerscore');
      const icon = (a.mediaAssets || []).find((m) => m.type === 'Icon');
      return {
        name: a.name,
        description: a.progressState === 'Achieved' ? a.description : a.lockedDescription,
        unlocked: a.progressState === 'Achieved',
        gamerscore: Number(reward?.value || 0),
        icon: icon?.url || null,
      };
    });
    setCached(ckey, list, 300);
    res.json(list);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Helpers for media: Xbox returns several thumbnail sizes and media URIs.
// Field names vary between accounts, so we probe a few known shapes.
function pickThumb(item) {
  const t = item.thumbnails || item.thumbnailImages || [];
  const large = t.find((x) => /large/i.test(x.thumbnailType || x.type || ''));
  return (large || t[0] || {}).uri || item.thumbnail || null;
}
function pickMediaUrl(uris) {
  if (!Array.isArray(uris) || !uris.length) return null;
  const download = uris.find((u) => /download/i.test(u.uriType || '')) || uris[0];
  return download.uri || null;
}

// Game clips (DVR)
app.get('/api/clips', async (req, res) => {
  try {
    const cached = getCached('clips');
    if (cached) return res.json(cached);
    const raw = await xbl('/dvr/gameclips');
    const items = raw.values || raw.gameClips || raw.clips || [];
    const clips = items.map((c) => ({
      id: c.gameClipId || c.contentId,
      game: c.titleName || c.contentTitle || 'Unknown game',
      thumbnail: pickThumb(c),
      url: pickMediaUrl(c.gameClipUris || c.contentUris),
      duration: c.durationInSeconds || c.durationSeconds || null,
      date: c.datePublished || c.dateRecorded || c.uploadDate || null,
    }));
    setCached('clips', clips, 300);
    res.json(clips);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Screenshots (DVR)
app.get('/api/screenshots', async (req, res) => {
  try {
    const cached = getCached('shots');
    if (cached) return res.json(cached);
    const raw = await xbl('/dvr/screenshots');
    const items = raw.values || raw.screenshots || [];
    const shots = items.map((s) => ({
      id: s.screenshotId || s.contentId,
      game: s.titleName || s.contentTitle || 'Unknown game',
      thumbnail: pickThumb(s),
      url: pickMediaUrl(s.screenshotUris || s.contentUris),
      date: s.datePublished || s.dateTaken || null,
    }));
    setCached('shots', shots, 300);
    res.json(shots);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Activity feed -> a normalized list of {type, text, sub, date}
app.get('/api/activity', async (req, res) => {
  try {
    const cached = getCached('activity');
    if (cached) return res.json(cached);
    const raw = await xbl('/activity/feed');
    const items = raw.activityItems || raw.values || raw.items || [];
    const feed = items.map((a) => {
      const type = a.activityItemType || a.contentType || 'Activity';
      const who = a.gamertag || a.userGamertag || 'You';
      let text, sub;
      switch (type) {
        case 'Achievement':
          text = `${who} unlocked ${a.achievementName || 'an achievement'}`;
          sub = a.gamerscore ? `+${a.gamerscore} G` : a.titleName || '';
          break;
        case 'GameDVR':
          text = `${who} captured a clip`;
          sub = a.titleName || a.contentTitle || '';
          break;
        case 'Screenshot':
          text = `${who} took a screenshot`;
          sub = a.titleName || a.contentTitle || '';
          break;
        case 'Played':
        case 'TitlePlayed':
          text = `${who} played ${a.titleName || a.contentTitle || 'a game'}`;
          sub = '';
          break;
        case 'UserPost':
        case 'TextPost':
          text = a.description || a.shortDescription || `${who} posted`;
          sub = '';
          break;
        default:
          text = a.description || a.shortDescription || `${who} · ${type}`;
          sub = a.titleName || a.contentTitle || '';
      }
      return { type, text, sub, date: a.date || a.startTime || a.endTime || null };
    });
    setCached('activity', feed, 120); // 2 min
    res.json(feed);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ---- diagnostics: open /api/health in a browser to see what's wrong ----
app.get('/api/health', async (req, res) => {
  const out = {
    keyLoaded: Boolean(API_KEY),
    keyLength: API_KEY.length,
    baseUrl: BASE,
  };
  if (!API_KEY) {
    out.status = 'No key loaded. Put it in a file named ".env" next to server.js as OPENXBL_KEY=yourkey';
    return res.json(out);
  }
  try {
    const r = await fetch(BASE + '/account', {
      headers: { 'X-Authorization': API_KEY, 'Accept': 'application/json' },
    });
    out.upstreamStatus = r.status;
    if (r.ok) {
      const j = await r.json();
      const settings = j.profileUsers?.[0]?.settings || [];
      const tag = settings.find((x) => x.id === 'Gamertag');
      out.status = tag ? `OK — authenticated as ${tag.value}` : 'OK — got a response';
    } else if (r.status === 401 || r.status === 403) {
      out.status = 'Key rejected (401/403). Re-copy your key from xbl.io and make sure you set up the "Xbox App" on your xbl.io profile.';
    } else if (r.status === 429) {
      out.status = 'Rate limited (429). Free tier is 150 requests/hour — wait and retry.';
    } else {
      out.status = `Unexpected upstream status ${r.status}.`;
      out.body = (await r.text()).slice(0, 300);
    }
  } catch (e) {
    out.status = 'Could not reach xbl.io: ' + e.message;
  }
  res.json(out);
});

// ---- serve the frontend ----
// Works whether index.html lives in ./public or right next to server.js.
const fs = require('fs');
const STATIC_DIR = [path.join(__dirname, 'public'), __dirname]
  .find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || __dirname;

app.use(express.static(STATIC_DIR));
app.get('/', (req, res) => {
  const file = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res
    .status(404)
    .send('index.html not found. Put index.html (and app.js) in a "public" folder next to server.js.');
});

app.listen(PORT, () => {
  console.log(`\n  XboxHQ running:  http://localhost:${PORT}`);
  console.log(`  Real data:       ${API_KEY ? 'ON' : 'OFF (demo mode)'}`);
  if (!fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
    console.warn('  WARNING: index.html not found. Check your folder structure (see README).');
  }
  console.log('');
});
