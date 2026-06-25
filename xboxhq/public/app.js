// XboxHQ frontend logic.
// Tries the backend API first; if it's unreachable or in demo mode, falls back
// to the DEMO data below so the page always renders.

// ---------- DEMO fallback data ----------
const DEMO = {
  profile: { gamertag: 'XGamer2077', gamerscore: 24850, avatar: null },
  library: [
    { titleId: 'halo', name: 'Halo Infinite', image: null, gamerscoreEarned: 740, gamerscoreTotal: 1500, achievementsEarned: 22 },
    { titleId: 'forza', name: 'Forza Horizon 5', image: null, gamerscoreEarned: 1420, gamerscoreTotal: 2000, achievementsEarned: 64 },
    { titleId: 'elden', name: 'Elden Ring', image: null, gamerscoreEarned: 340, gamerscoreTotal: 1000, achievementsEarned: 14 },
    { titleId: 'cod', name: 'COD: Modern Warfare', image: null, gamerscoreEarned: 880, gamerscoreTotal: 1500, achievementsEarned: 31 },
  ],
  friends: [
    { gamertag: 'ShadowGhost99', avatar: null, playing: 'Halo Infinite · Ranked' },
    { gamertag: 'NeonXenon', avatar: null, playing: 'Forza Horizon 5' },
    { gamertag: 'BlastRadius_', avatar: null, playing: 'Minecraft · Survival' },
  ],
  achievements: {
    halo: [
      { name: 'Spartan', description: 'Complete the first mission', unlocked: true, gamerscore: 10, icon: null },
      { name: 'Sharp Shooter', description: 'Get 50 headshots', unlocked: true, gamerscore: 20, icon: null },
      { name: 'Cartographer', description: 'Discover all FOBs', unlocked: false, gamerscore: 50, icon: null },
      { name: 'Legendary', description: 'Beat the campaign on Legendary', unlocked: false, gamerscore: 100, icon: null },
    ],
  },
  activity: [
    { type: 'Achievement', text: 'You unlocked Sharp Shooter', sub: '+20 G', date: null },
    { type: 'GameDVR', text: 'You captured a clip', sub: 'Halo Infinite', date: null },
    { type: 'Played', text: 'ShadowGhost99 started Halo Infinite', sub: '', date: null },
    { type: 'Achievement', text: 'NeonXenon unlocked Speed King', sub: '+25 G', date: null },
    { type: 'Screenshot', text: 'You took a screenshot', sub: 'Forza Horizon 5', date: null },
  ],
  clips: [
    { id: 'c1', game: 'Halo Infinite', thumbnail: null, url: null, duration: 30, date: null },
    { id: 'c2', game: 'Forza Horizon 5', thumbnail: null, url: null, duration: 45, date: null },
    { id: 'c3', game: 'Elden Ring', thumbnail: null, url: null, duration: 20, date: null },
  ],
  screenshots: [
    { id: 's1', game: 'Forza Horizon 5', thumbnail: null, url: null, date: null },
    { id: 's2', game: 'Halo Infinite', thumbnail: null, url: null, date: null },
    { id: 's3', game: 'Elden Ring', thumbnail: null, url: null, date: null },
  ],
};

// ---------- Author-supplied guide content (NOT from any API) ----------
// You write these. Keyed by titleId. Achievements come live from Xbox; these don't.
const GUIDE_CONTENT = {
  halo: {
    missions: [
      ['01', 'Warship Gbraakon', 'done'], ['02', 'Foundation', 'done'],
      ['03', 'Outpost Tremonius', 'done'], ['04', 'The Tower', 'curr'],
      ['05', 'Excavation Site', 'lock'], ['06', 'Spire', 'lock'],
    ],
    tips: [
      ['Combat', 'Use the Grappleshot to rip weapons from enemies and save ammo in long firefights.'],
      ['Boss fight', 'Escharum is weak to plasma. Stockpile Fuel Rod Guns before the Act 3 arena.'],
      ['Secret', 'Pop the hidden birthday balloons in each level for a classic Bungie audio cue.'],
    ],
  },
};

let state = { demo: false, library: [] };

const $ = (s) => document.querySelector(s);

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' failed');
  return res.json();
}

// ---------- boot ----------
async function boot() {
  let profile, library, friends;
  try {
    [profile, library, friends] = await Promise.all([
      getJSON('/api/profile'),
      getJSON('/api/library'),
      getJSON('/api/friends'),
    ]);
    $('#demo-banner').classList.add('hidden');
  } catch (e) {
    state.demo = true;
    profile = DEMO.profile;
    library = DEMO.library;
    friends = DEMO.friends;
  }
  state.library = library;
  renderProfile(profile);
  renderLibrary(library);
  renderFriends(friends);

  // Activity loads independently so a feed hiccup never breaks the rest.
  let activity;
  try {
    activity = state.demo ? DEMO.activity : await getJSON('/api/activity');
  } catch (e) {
    activity = DEMO.activity;
  }
  renderActivity(activity);
}

function initials(tag) { return (tag || '?').slice(0, 2).toUpperCase(); }

function renderProfile(p) {
  $('#top-gs').textContent = (p.gamerscore || 0).toLocaleString();
  const av = $('#top-av');
  if (p.avatar) { av.outerHTML = `<img class="av" id="top-av" src="${p.avatar}" alt="">`; }
  else { av.textContent = initials(p.gamertag); }
}

function renderLibrary(games) {
  const cards = games.map((g, i) => {
    const art = g.image
      ? `<div class="tile-art"><img src="${g.image}" alt=""></div>`
      : `<div class="tile-art" style="background:linear-gradient(150deg,#1a3a2a,#0c1a14);color:#8ce0a0">${g.name.toUpperCase()}</div>`;
    const gs = (g.gamerscoreEarned != null && g.gamerscoreTotal != null)
      ? `${g.gamerscoreEarned} / ${g.gamerscoreTotal} G` : '';
    return `<div class="tile" data-title="${g.titleId}">
      ${art}<div class="tile-grad"></div>
      <div class="tile-meta"><div class="tile-name">${g.name}</div><div class="tile-gs">${gs}</div></div>
    </div>`;
  }).join('');

  $('#lib').innerHTML = cards;
  $('#pick-lib').innerHTML = cards;
  document.querySelectorAll('.tile').forEach((t) =>
    t.addEventListener('click', () => openGuide(t.dataset.title)));

  // Hero = most recent game
  const top = games[0];
  if (top) {
    $('#hero-title').textContent = top.name;
    const pct = top.gamerscoreTotal ? Math.round((top.gamerscoreEarned / top.gamerscoreTotal) * 100) : 0;
    $('#hero-prog').style.width = pct + '%';
    $('#hero-sub').textContent = `${top.gamerscoreEarned || 0} of ${top.gamerscoreTotal || '?'} G earned`;
    $('#hero-resume').onclick = () => openGuide(top.titleId);
  }

  // Rail stats
  const totalEarned = games.reduce((s, g) => s + (g.gamerscoreEarned || 0), 0);
  const totalAvail = games.reduce((s, g) => s + (g.gamerscoreTotal || 0), 0);
  const totalAch = games.reduce((s, g) => s + (g.achievementsEarned || 0), 0);
  const pct = totalAvail ? Math.round((totalEarned / totalAvail) * 100) : 0;
  $('#stat-games').textContent = games.length;
  $('#stat-gs').textContent = totalEarned.toLocaleString();
  $('#stat-ach').textContent = totalAch;
  $('#ring-pct').textContent = pct + '%';
  const circ = 226;
  $('#ring-arc').style.strokeDashoffset = circ - (circ * pct) / 100;
  $('#ring-text').innerHTML = `<b>${totalEarned.toLocaleString()} G</b> of <b>${totalAvail.toLocaleString()} G</b> across your recent games.`;
}

function renderFriends(friends) {
  $('#friends-count').textContent = `Friends online · ${friends.length}`;
  if (!friends.length) { $('#friends').innerHTML = `<div class="empty">No friends online right now.</div>`; return; }
  $('#friends').innerHTML = friends.map((f) => {
    const av = f.avatar ? `<img src="${f.avatar}" alt="">` : initials(f.gamertag);
    return `<div class="friend">
      <div class="f-av">${av}</div>
      <div><div class="f-name">${f.gamertag}</div><div class="f-game">${f.playing}</div></div>
    </div>`;
  }).join('');
}

const ACT_ICON = { Achievement: '🏆', GameDVR: '🎬', Screenshot: '📸', Played: '🎮', TitlePlayed: '🎮', UserPost: '💬', TextPost: '💬' };

function renderActivity(items) {
  if (!items || !items.length) { $('#activity').innerHTML = `<div class="empty">No recent activity.</div>`; return; }
  $('#activity').innerHTML = items.slice(0, 8).map((a) => {
    const icon = ACT_ICON[a.type] || '•';
    const subClass = /\+\d+\s*G/.test(a.sub || '') ? 'act-sub' : 'act-sub muted';
    const sub = a.sub ? `<div class="${subClass}">${a.sub}</div>` : '';
    return `<div class="act"><div class="act-chip">${icon}</div>
      <div><div class="act-text">${a.text}</div>${sub}</div></div>`;
  }).join('');
}

// ---------- showcase (lazy-loaded) ----------
let media = { clips: null, screenshots: null, current: 'clips' };
const PH_COLORS = ['#14271f,#0f1a24', '#3a2a6a,#1a1430', '#5a3410,#2a1606', '#5a1410,#2a0806', '#1a4a2a,#0a2414'];
function phGradient(i) { return `linear-gradient(135deg,${PH_COLORS[i % PH_COLORS.length]})`; }
function fmtDuration(s) { if (!s) return ''; const m = Math.floor(s / 60), r = s % 60; return m ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`; }

async function loadMedia(kind) {
  media.current = kind;
  const grid = $('#media-grid');
  if (media[kind]) return renderMedia(kind);
  grid.innerHTML = `<div class="loading">Loading ${kind}…</div>`;
  let list;
  try {
    list = state.demo ? DEMO[kind] : await getJSON('/api/' + kind);
  } catch (e) {
    list = DEMO[kind];
  }
  media[kind] = list;
  if (media.current === kind) renderMedia(kind);
}

function renderMedia(kind) {
  const list = media[kind] || [];
  const grid = $('#media-grid');
  if (!list.length) { grid.innerHTML = `<div class="empty">No ${kind} captured yet.</div>`; return; }
  grid.innerHTML = list.map((m, i) => {
    const thumb = m.thumbnail
      ? `<img class="media-thumb" src="${m.thumbnail}" alt="">`
      : `<div class="media-ph" style="background:${phGradient(i)};color:#dfeede">${m.game.toUpperCase()}</div>`;
    const play = kind === 'clips' ? `<div class="media-play">▶</div>` : '';
    const badge = kind === 'clips' && m.duration ? `<div class="media-badge">${fmtDuration(m.duration)}</div>` : '';
    return `<div class="media-card" data-kind="${kind}" data-i="${i}">
      ${thumb}<div class="media-grad"></div>${play}
      <div class="media-meta"><div class="media-game">${m.game}</div>${badge}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.media-card').forEach((card) =>
    card.addEventListener('click', () => openLightbox(card.dataset.kind, Number(card.dataset.i))));
}

function openLightbox(kind, i) {
  const m = (media[kind] || [])[i];
  if (!m) return;
  const box = $('#lb-content');
  if (kind === 'clips' && m.url) box.innerHTML = `<video src="${m.url}" controls autoplay></video>`;
  else if (kind === 'screenshots' && m.url) box.innerHTML = `<img src="${m.url}" alt="">`;
  else box.innerHTML = `<div class="lb-ph" style="background:${phGradient(i)}">${m.game} · ${kind === 'clips' ? 'demo clip' : 'demo screenshot'}</div>`;
  $('#lightbox').classList.add('on');
  $('#lightbox').setAttribute('aria-hidden', 'false');
}
function closeLightbox() {
  $('#lightbox').classList.remove('on');
  $('#lightbox').setAttribute('aria-hidden', 'true');
  $('#lb-content').innerHTML = '';
}

// ---------- guide ----------
let currentTitle = null;

async function openGuide(titleId) {
  currentTitle = titleId;
  const game = state.library.find((g) => g.titleId === titleId) || { name: titleId };
  $('#g-title').textContent = game.name;
  $('#g-meta').textContent = game.gamerscoreTotal
    ? `${game.gamerscoreEarned || 0} / ${game.gamerscoreTotal} G` : 'Achievements & guide';
  $('#g-bg').style.background = 'linear-gradient(115deg,#14271f,#0f1a24)';

  showScreen('guide');
  setGuideTab('a');
  loadAchievements(titleId);
  renderAuthored(titleId);
}

async function loadAchievements(titleId) {
  const box = $('#gv-a');
  box.innerHTML = `<div class="loading">Loading achievements…</div>`;
  let list;
  try {
    list = state.demo ? (DEMO.achievements[titleId] || []) : await getJSON('/api/achievements/' + titleId);
  } catch (e) {
    list = DEMO.achievements[titleId] || [];
  }
  if (!list.length) { box.innerHTML = `<div class="empty">No achievement data for this title.</div>`; return; }
  box.innerHTML = list.map((a) => {
    const icon = a.icon ? `<img src="${a.icon}" alt="">` : (a.unlocked ? '★' : '🔒');
    return `<div class="ach ${a.unlocked ? '' : 'locked'}">
      <div class="a-hex ${a.unlocked ? 'unlocked' : 'lk'}">${icon}</div>
      <div><div class="a-name">${a.name}</div><div class="a-desc">${a.description || ''}</div></div>
      <div class="a-gs">${a.gamerscore || 0}G</div>
    </div>`;
  }).join('');
}

function renderAuthored(titleId) {
  const c = GUIDE_CONTENT[titleId];
  const mBox = $('#gv-m'), tBox = $('#gv-t');
  if (!c) {
    const msg = `<div class="empty">No written guide yet for this game. Add it in <b>app.js</b> under GUIDE_CONTENT.</div>`;
    mBox.innerHTML = msg; tBox.innerHTML = msg; return;
  }
  mBox.innerHTML = `<div class="authored-note">Mission lists are written by you, not pulled from Xbox.</div>` +
    c.missions.map((m) => `<div class="mission ${m[2] === 'done' ? 'is-done' : ''}">
      <div class="m-hex ${m[2]}">${m[2] === 'done' ? '✓' : m[0]}</div>
      <div class="m-name">${m[1]}</div>
      <div class="m-tag ${m[2] === 'done' ? 't-done' : m[2] === 'curr' ? 't-curr' : 't-lock'}">${m[2] === 'done' ? 'Done' : m[2] === 'curr' ? 'Current' : 'Locked'}</div>
    </div>`).join('');
  tBox.innerHTML = c.tips.map((t) =>
    `<div class="tip"><div class="eyebrow">${t[0]}</div><p>${t[1]}</p></div>`).join('');
}

// ---------- navigation ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  $('#s-' + name).classList.add('on');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.screen === name));
  if (name === 'showcase' && !media[media.current]) loadMedia(media.current);
}
function setGuideTab(v) {
  document.querySelectorAll('.g-tab').forEach((t) => t.classList.toggle('on', t.dataset.gtab === v));
  $('#gv-a').style.display = v === 'a' ? 'block' : 'none';
  $('#gv-m').style.display = v === 'm' ? 'block' : 'none';
  $('#gv-t').style.display = v === 't' ? 'block' : 'none';
}

document.querySelectorAll('[data-screen]').forEach((el) =>
  el.addEventListener('click', () => showScreen(el.dataset.screen)));
document.querySelectorAll('[data-gtab]').forEach((el) =>
  el.addEventListener('click', () => setGuideTab(el.dataset.gtab)));

// Showcase Clips/Screenshots toggle
document.querySelectorAll('.seg').forEach((el) =>
  el.addEventListener('click', () => {
    document.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s === el));
    loadMedia(el.dataset.media);
  }));

// Lightbox close: button, backdrop click, Escape
$('.lb-close').addEventListener('click', closeLightbox);
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

boot();
