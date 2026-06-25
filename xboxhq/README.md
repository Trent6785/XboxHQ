# XboxHQ

A console companion dashboard you open in the Xbox browser. Shows your profile,
gamerscore, recently-played library, friends online, and per-game achievements —
pulled live from Xbox Live through the [OpenXBL](https://xbl.io) API.

## What's live vs. what you write

| Feature | Source |
|---|---|
| Gamertag, gamerscore, avatar | Live (Xbox Live) |
| Recently-played library | Live |
| Friends online + what they're playing | Live |
| Per-game achievements | Live |
| Mission lists, tips, boss guides | **You write these** (no API has them) |

## Setup

1. **Get an OpenXBL key (free).** Go to <https://xbl.io>, sign in with your
   Microsoft account, set up the "Xbox App" on your profile, and copy your API key.
   The free tier allows 150 requests/hour — that's why the backend caches everything.

2. **Install and configure:**
   ```bash
   npm install
   cp .env.example .env
   ```
   Open `.env` and paste your key after `OPENXBL_KEY=`.

3. **Run it:**
   ```bash
   npm start
   ```
   Open <http://localhost:3000>. Without a key it still runs in demo mode.

## Open it on your actual Xbox

The Xbox has Microsoft Edge built in, so it can load any URL. Two options:

- **Same network:** keep `npm start` running on your computer, find that computer's
  local IP (e.g. `192.168.1.20`), and in the Xbox Edge browser go to
  `http://192.168.1.20:3000`.
- **Anywhere:** deploy to Netlify (below) and open the public URL on the Xbox.

## Deploy to Netlify

Netlify doesn't run the Express server — it serves the `public/` folder as a static
site and runs the backend as **serverless functions** (already set up in
`netlify/functions/`, wired by `netlify.toml`). Your local `npm start` still uses
`server.js`; Netlify uses the functions. You don't edit anything to switch.

1. **Push the project to GitHub** (the included `.gitignore` keeps your `.env` and
   `node_modules` out of the repo — your key never gets committed).

2. **Create the site:** in Netlify, choose *Add new site → Import an existing project*
   and pick your repo. `netlify.toml` already sets the publish folder (`public`) and
   functions folder, so you can accept the defaults.

3. **Add your key as an environment variable:** in *Site settings → Environment
   variables*, add `OPENXBL_KEY` with your xbl.io key as the value. This replaces the
   local `.env` file. Redeploy after adding it (*Deploys → Trigger deploy*).

4. **Open your site URL.** Visit `https://your-site.netlify.app/api/health` first — it
   reports whether the key loaded and whether OpenXBL accepts it, same as locally.

Prefer the command line? Install the CLI (`npm i -g netlify-cli`), run
`netlify deploy --prod`, then set the key with
`netlify env:set OPENXBL_KEY yourkey` and deploy once more.

### A note on the free tier and serverless

Serverless functions don't share a long-lived cache the way the local server does, so
deployed traffic makes more calls to OpenXBL. For a personal dashboard that's fine, but
keep the 150-requests/hour free limit in mind if several people open the site at once.

## How it's wired

```
Xbox browser  ->  index.html / app.js  (frontend)
                        |  fetch('/api/...')
                        v
                  server.js  (Express)
                        |  caches + adds your API key
                        v
                  xbl.io  (OpenXBL -> Xbox Live)
```

Your API key never reaches the browser — the backend holds it and the frontend only
ever talks to your own `/api/*` routes.

## Adding written guides

Achievements load automatically. Mission lists and tips are yours to write — open
`public/app.js` and add an entry to `GUIDE_CONTENT`, keyed by the game's title ID
(the same ID that comes back in `/api/library`). There's a Halo example in there to
copy from.

## Going multi-user (later)

This version uses one key, so it shows *your* account. To let other people sign in
and see their own data, switch to OpenXBL's "Sign in with Xbox" OAuth flow, store a
key per user, and pass the right key in each request. The endpoints stay the same.

## Notes

- OpenXBL is an unofficial API. It can change without notice — cache aggressively
  (the backend already does) and don't hammer it.
- This project isn't affiliated with or endorsed by Microsoft or Xbox.
