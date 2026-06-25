// Shared OpenXBL logic for the Netlify Functions.
// This mirrors what server.js does for local dev, adapted for serverless.
// NOTE: serverless instances are ephemeral, so the cache below only helps while
// a container stays warm — it is best-effort, not a persistent store.

const API_KEY = (process.env.OPENXBL_KEY || '').trim();
const BASE = 'https://xbl.io/api/v2';

const cache = new Map();
function getCached(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  return null;
}
function setCached(key, data, ttlSeconds) {
  cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

async function callXbl(endpoint) {
  if (!API_KEY) {
    const err = new Error('No OPENXBL_KEY set in Netlify environment variables');
    err.status = 500;
    throw err;
  }
  const res = await fetch(BASE + endpoint, {
    headers: { 'X-Authorization': API_KEY, 'Accept': 'application/json' },
  });
  if (!res.ok) {
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch (_) {}
    console.error(`OpenXBL ${endpoint} -> ${res.status} ${res.statusText} ${body}`);
    const err = new Error(`OpenXBL ${endpoint} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

let myXuid = null;
async function getProfile() {
  const cached = getCached('profile');
  if (cached) return cached;
  const raw = await callXbl('/account');
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
  setCached('profile', profile, 300);
  return profile;
}
async function getXuid() {
  if (!myXuid) await getProfile();
  return myXuid;
}

async function getLibrary() {
  const cached = getCached('library');
  if (cached) return cached;
  const xuid = await getXuid();
  const raw = await callXbl(`/player/titleHistory/${xuid}`);
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
  return games;
}

async function getFriends() {
  const cached = getCached('friends');
  if (cached) return cached;
  const raw = await callXbl('/friends');
  const online = (raw.people || [])
    .filter((p) => p.presenceState === 'Online')
    .map((p) => ({
      gamertag: p.gamertag || p.displayName,
      avatar: p.displayPicRaw || null,
      playing: p.presenceText || 'Online',
      gamerscore: Number(p.gamerScore || 0),
    }));
  setCached('friends', online, 60);
  return online;
}

async function getAchievements(titleId) {
  const ckey = `ach:${titleId}`;
  const cached = getCached(ckey);
  if (cached) return cached;
  const xuid = await getXuid();
  const raw = await callXbl(`/achievements/player/${xuid}/${titleId}`);
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
  return list;
}

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

async function getClips() {
  const cached = getCached('clips');
  if (cached) return cached;
  const raw = await callXbl('/dvr/gameclips');
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
  return clips;
}

async function getScreenshots() {
  const cached = getCached('shots');
  if (cached) return cached;
  const raw = await callXbl('/dvr/screenshots');
  const items = raw.values || raw.screenshots || [];
  const shots = items.map((s) => ({
    id: s.screenshotId || s.contentId,
    game: s.titleName || s.contentTitle || 'Unknown game',
    thumbnail: pickThumb(s),
    url: pickMediaUrl(s.screenshotUris || s.contentUris),
    date: s.datePublished || s.dateTaken || null,
  }));
  setCached('shots', shots, 300);
  return shots;
}

async function getActivity() {
  const cached = getCached('activity');
  if (cached) return cached;
  const raw = await callXbl('/activity/feed');
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
  setCached('activity', feed, 120);
  return feed;
}

async function health() {
  const out = { keyLoaded: Boolean(API_KEY), keyLength: API_KEY.length, baseUrl: BASE };
  if (!API_KEY) {
    out.status = 'No key. Set OPENXBL_KEY in Netlify > Site settings > Environment variables, then redeploy.';
    return out;
  }
  try {
    const r = await fetch(BASE + '/account', {
      headers: { 'X-Authorization': API_KEY, 'Accept': 'application/json' },
    });
    out.upstreamStatus = r.status;
    if (r.ok) {
      const j = await r.json();
      const tag = (j.profileUsers?.[0]?.settings || []).find((x) => x.id === 'Gamertag');
      out.status = tag ? `OK — authenticated as ${tag.value}` : 'OK — got a response';
    } else if (r.status === 401 || r.status === 403) {
      out.status = 'Key rejected (401/403). Re-copy your key and set up the "Xbox App" on your xbl.io profile.';
    } else if (r.status === 429) {
      out.status = 'Rate limited (429). Free tier is 150 requests/hour.';
    } else {
      out.status = `Unexpected upstream status ${r.status}.`;
    }
  } catch (e) {
    out.status = 'Could not reach xbl.io: ' + e.message;
  }
  return out;
}

module.exports = {
  json, getProfile, getLibrary, getFriends, getAchievements,
  getClips, getScreenshots, getActivity, health,
};
