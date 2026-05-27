# Job Alert Bot — Step-by-Step Build Plan
> **For VS Code Agent use.** Follow each phase completely before moving to the next.
> Do not scaffold the entire project upfront. Build, verify, then proceed.

### Key decisions in this plan
| Concern | Choice | Why |
|---|---|---|
| Database | **SQLite** via `better-sqlite3` | Embedded, zero-config, proper SQL, fast synchronous API |
| Hosting | **Fly.io** (free tier) | Always-on, no sleep, free persistent volume for the DB file, Sydney region available |
| Storage path | `/data/jobs.db` in production, `./jobs.db` locally | Fly.io mounts a persistent volume at `/data` |

---

## Phase 0 — Project Scaffold

**Goal:** Create the folder structure and install dependencies. Nothing runs yet.

### Tasks
1. Create the project root: `job-alert-bot/`
2. Inside it, create the following empty files and folders:
   ```
   job-alert-bot/
   ├── src/
   │   ├── sources/
   │   │   ├── rss.js
   │   │   ├── remoteok.js
   │   │   └── index.js
   │   ├── filters/
   │   │   ├── keywords.js
   │   │   └── dedup.js
   │   ├── notifier/
   │   │   └── telegram.js
   │   ├── storage/
   │   │   └── db.js          ← SQLite layer (replaces seen.js)
   │   ├── scorer.js
   │   ├── digest.js
   │   └── index.js
   ├── config.js
   ├── Dockerfile
   ├── fly.toml
   ├── .env.example
   ├── .env                   ← gitignored
   ├── .dockerignore
   ├── package.json
   └── .gitignore
   ```
   > No `data/` folder — the database file is created automatically at runtime.

3. Run `npm init -y` in the project root.
4. Install dependencies:
   ```bash
   npm install rss-parser axios dotenv node-cron better-sqlite3
   ```
   > `better-sqlite3` is a native module. It requires Python + make + g++ to compile.
   > On Windows, run `npm install --global windows-build-tools` first if the install fails.

5. Populate `.env.example`:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   DB_PATH=./jobs.db
   HEALTH_PING_URL=
   ```

6. Populate `.gitignore`:
   ```
   .env
   node_modules/
   *.db
   *.db-shm
   *.db-wal
   ```

7. Populate `.dockerignore`:
   ```
   node_modules
   .env
   *.db
   .git
   ```

### ✅ Checkpoint
- `node_modules/` exists and contains `better-sqlite3`
- Run `node -e "require('better-sqlite3')"` — must not throw
- `.env` file exists (copy from `.env.example` and fill in values later)

---

## Phase 1 — Configuration

**Goal:** Centralise all tunable settings in one place so later phases never hardcode values.

### Tasks
Populate `config.js`:
```js
require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  schedule: {
    cronExpression: '0 8 * * *',  // 8 AM UTC daily — adjust to your timezone
  },
  sources: {
    rss: [
      'https://weworkremotely.com/categories/remote-programming-jobs.rss',
      'https://jobspresso.co/feed/',
      'https://www.workingnomads.co/jobs/feed',
    ],
    remoteOk: {
      enabled: true,
      url: 'https://remoteok.com/api',
    },
  },
  filter: {
    includeKeywords: [
      'data entry', 'it support', 'tech support', 'help desk',
      'system administrator', 'network engineer', 'software developer',
      'part-time', 'part time', 'casual', 'contract', 'freelance', 'flexible',
    ],
    excludeKeywords: [
      'full-time', 'full time', 'us citizen', 'must be located',
      'authorized to work', 'onsite', 'on-site', 'internship', 'unpaid',
    ],
    blacklistCompanies: [],  // add company name strings here
  },
  digest: {
    maxJobsPerMessage: 15,
  },
  storage: {
    // Locally: ./jobs.db  |  Production (Fly.io): /data/jobs.db via volume mount
    dbPath: process.env.DB_PATH || './jobs.db',
  },
};
```

### ✅ Checkpoint
- Run `node -e "console.log(require('./config').storage.dbPath)"` — should print `./jobs.db`

---

## Phase 2 — SQLite Storage Layer

**Goal:** Open the database, create the schema, and expose simple read/write functions.
All functions are **synchronous** — `better-sqlite3` does not use promises.

### Schema
One table only:
```sql
CREATE TABLE IF NOT EXISTS seen_jobs (
  id           TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);
```

### Tasks
Implement `src/storage/db.js`:
```js
const Database = require('better-sqlite3');
const path = require('path');
const config = require('../../config');

let _db = null;

/**
 * Returns the open database, initialising it on first call.
 * The database file is created automatically if it does not exist.
 */
function getDb() {
  if (_db) return _db;

  const dbPath = path.resolve(config.storage.dbPath);
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrency (safe even for single-writer bots)
  _db.pragma('journal_mode = WAL');

  // Create table if it doesn't exist yet
  _db.exec(`
    CREATE TABLE IF NOT EXISTS seen_jobs (
      id            TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL
    )
  `);

  console.log(`[DB] Opened database at ${dbPath}`);
  return _db;
}

/**
 * Returns true if this job ID has NOT been seen before.
 */
function isNew(id) {
  const row = getDb()
    .prepare('SELECT 1 FROM seen_jobs WHERE id = ?')
    .get(id);
  return row === undefined;
}

/**
 * Persists an array of job IDs in a single transaction.
 * Uses INSERT OR IGNORE so re-running never throws.
 */
function markSeenBatch(ids) {
  if (ids.length === 0) return;
  const insert = getDb().prepare(
    'INSERT OR IGNORE INTO seen_jobs (id, first_seen_at) VALUES (?, ?)'
  );
  const now = new Date().toISOString();
  const insertAll = getDb().transaction((list) => {
    for (const id of list) insert.run(id, now);
  });
  insertAll(ids);
}

/**
 * Returns the total number of jobs stored (useful for debugging).
 */
function countSeen() {
  return getDb().prepare('SELECT COUNT(*) as n FROM seen_jobs').get().n;
}

module.exports = { isNew, markSeenBatch, countSeen };
```

### ✅ Checkpoint
Run this inline test (then delete it):
```js
// test-db.js  (delete after checkpoint passes)
const db = require('./src/storage/db');
console.log('Count before:', db.countSeen());
db.markSeenBatch(['test::001', 'test::002']);
console.log('Count after:', db.countSeen());
console.log('test::001 isNew?', db.isNew('test::001'));   // false
console.log('test::999 isNew?', db.isNew('test::999'));   // true
```
- `jobs.db` file must appear in the project root
- `isNew('test::001')` must return `false`
- `isNew('test::999')` must return `true`

Delete `test-db.js` and `jobs.db` after confirming.

---

## Phase 3 — Job Sources

**Goal:** Fetch raw job data from RSS feeds and the Remote OK API. Return a normalised array.

### Normalised job object shape (all sources must return this)
```js
{
  id:          String,  // "source::uniqueId"  — must be stable across fetches
  title:       String,
  company:     String,
  link:        String,
  source:      String,
  postedDate:  String,
  description: String,
}
```

### Tasks

#### 3a — RSS source (`src/sources/rss.js`)
```js
const RSSParser = require('rss-parser');
const config = require('../../config');

const parser = new RSSParser();

async function fetchAll() {
  const results = [];
  for (const feedUrl of config.sources.rss) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of feed.items) {
        const uid = item.link || item.guid || item.title || '';
        results.push({
          id: `rss::${Buffer.from(uid).toString('base64')}`,
          title: item.title || '',
          company: item.creator || extractCompany(item.title) || 'Unknown',
          link: item.link || '',
          source: feed.title || feedUrl,
          postedDate: item.pubDate || '',
          description: item.contentSnippet || item.content || '',
        });
      }
    } catch (err) {
      console.error(`[RSS] Failed to fetch ${feedUrl}:`, err.message);
    }
  }
  return results;
}

function extractCompany(title = '') {
  const atMatch = title.match(/ at (.+)$/i);
  if (atMatch) return atMatch[1].trim();
  const colonMatch = title.match(/^([^:]+):/);
  if (colonMatch) return colonMatch[1].trim();
  return '';
}

module.exports = { fetchAll };
```

#### 3b — Remote OK source (`src/sources/remoteok.js`)
```js
const axios = require('axios');
const config = require('../../config');

async function fetchAll() {
  if (!config.sources.remoteOk.enabled) return [];
  try {
    const { data } = await axios.get(config.sources.remoteOk.url, {
      headers: { 'User-Agent': 'JobAlertBot/1.0' },
    });
    // First element is a metadata notice — skip it
    return data.slice(1).map(job => ({
      id: `remoteok::${job.id}`,
      title: job.position || '',
      company: job.company || 'Unknown',
      link: job.url || `https://remoteok.com/jobs/${job.id}`,
      source: 'Remote OK',
      postedDate: job.date || '',
      description: (job.description || '') + ' ' + (job.tags || []).join(' '),
    }));
  } catch (err) {
    console.error('[RemoteOK] Failed to fetch:', err.message);
    return [];
  }
}

module.exports = { fetchAll };
```

#### 3c — Source aggregator (`src/sources/index.js`)
```js
const rss = require('./rss');
const remoteok = require('./remoteok');

async function fetchAllSources() {
  const [rssJobs, remoteOkJobs] = await Promise.all([
    rss.fetchAll(),
    remoteok.fetchAll(),
  ]);
  return [...rssJobs, ...remoteOkJobs];
}

module.exports = { fetchAllSources };
```

### ✅ Checkpoint
```bash
node -e "require('./src/sources').fetchAllSources().then(j => console.log('Total fetched:', j.length))"
```
- Must print a number greater than 0
- No unhandled promise rejections

---

## Phase 4 — Filtering & Scoring

**Goal:** Remove irrelevant jobs and score the remainder by keyword density.

### Tasks

#### 4a — Keyword filter (`src/filters/keywords.js`)
```js
const config = require('../../config');

function applyKeywordFilter(jobs) {
  const include = config.filter.includeKeywords;
  const exclude = config.filter.excludeKeywords;
  const blacklist = config.filter.blacklistCompanies.map(c => c.toLowerCase());

  return jobs.filter(job => {
    const text = `${job.title} ${job.description}`.toLowerCase();
    const company = (job.company || '').toLowerCase();

    const hasInclude = include.some(k => text.includes(k));
    const hasExclude = exclude.some(k => text.includes(k));
    const isBlacklisted = blacklist.some(b => company.includes(b));

    return hasInclude && !hasExclude && !isBlacklisted;
  });
}

module.exports = { applyKeywordFilter };
```

#### 4b — Deduplication filter (`src/filters/dedup.js`)
> Uses the SQLite layer directly — no in-memory set is passed around.
```js
const db = require('../storage/db');

function applyDedup(jobs) {
  return jobs.filter(job => db.isNew(job.id));
}

module.exports = { applyDedup };
```

#### 4c — Scorer (`src/scorer.js`)
```js
const config = require('../config');

function scoreJobs(jobs) {
  const include = config.filter.includeKeywords;
  return jobs
    .map(job => {
      const text = `${job.title} ${job.description}`.toLowerCase();
      const score = include.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
      return { ...job, relevanceScore: score };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

module.exports = { scoreJobs };
```

### ✅ Checkpoint
Run a quick inline filter test:
```js
// test-filter.js (delete after)
const { applyKeywordFilter } = require('./src/filters/keywords');
const samples = [
  { title: 'Part-time Data Entry Specialist', company: 'Acme', description: 'Remote contract role', id: '1', link: '', source: '', postedDate: '' },
  { title: 'Full-time Senior Engineer (Onsite)', company: 'Corp', description: 'Must be in US', id: '2', link: '', source: '', postedDate: '' },
];
const result = applyKeywordFilter(samples);
console.log('Passed:', result.map(j => j.title));
// Expected: only "Part-time Data Entry Specialist" passes
```

---

## Phase 5 — Telegram Notifier

**Goal:** Send a formatted digest message to Telegram. Silent if no new jobs.

### Tasks

#### 5a — Message formatter (`src/digest.js`)
```js
const config = require('../config');

function buildDigestMessage(jobs) {
  if (jobs.length === 0) return null;

  const date = new Date().toLocaleDateString('en-AU', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
  const cap = config.digest.maxJobsPerMessage;
  const shown = jobs.slice(0, cap);

  let msg = `🟢 *Job Alert* — ${date}\n`;
  msg += `Found *${jobs.length}* new match${jobs.length !== 1 ? 'es' : ''}`;
  if (jobs.length > cap) msg += ` \\(showing top ${cap}\\)`;
  msg += `\n\n`;

  for (const job of shown) {
    msg += `🏢 *${esc(job.company)}*\n`;
    msg += `📌 ${esc(job.title)}\n`;
    msg += `⭐ Score: ${job.relevanceScore}  |  🔹 ${esc(job.source)}\n`;
    msg += `🌐 [View job](${job.link})\n\n`;
  }

  return msg.trim();
}

// Escape special chars required by Telegram MarkdownV2
function esc(text = '') {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { buildDigestMessage };
```

#### 5b — Telegram sender (`src/notifier/telegram.js`)
```js
const axios = require('axios');
const config = require('../../config');

async function sendMessage(text) {
  const url = `https://api.telegram.org/bot${config.telegram.token}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: config.telegram.chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  } catch (err) {
    // Log the Telegram API error body if available
    const detail = err.response?.data?.description || err.message;
    throw new Error(`Telegram send failed: ${detail}`);
  }
}

async function sendError(errorMessage) {
  const safe = String(errorMessage).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  await sendMessage(`⚠️ *Job Bot Error*\n\`${safe}\``).catch(console.error);
}

module.exports = { sendMessage, sendError };
```

### ✅ Checkpoint
- Fill in `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`
- Run:
  ```bash
  node -e "require('./src/notifier/telegram').sendMessage('✅ Telegram connection test')"
  ```
- A message must appear in your Telegram chat

---

## Phase 6 — Main Orchestrator

**Goal:** Wire all phases into a single `run()` function.

### Tasks
Implement `src/index.js`:
```js
const { fetchAllSources } = require('./sources');
const { applyKeywordFilter } = require('./filters/keywords');
const { applyDedup } = require('./filters/dedup');
const { scoreJobs } = require('./scorer');
const { buildDigestMessage } = require('./digest');
const { sendMessage, sendError } = require('./notifier/telegram');
const db = require('./storage/db');
const axios = require('axios');

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Run started. DB has ${db.countSeen()} seen jobs.`);

  try {
    // 1. Fetch from all sources
    const allJobs = await fetchAllSources();
    console.log(`Fetched: ${allJobs.length} total`);

    // 2. Keyword filter
    const relevant = applyKeywordFilter(allJobs);
    console.log(`After keyword filter: ${relevant.length}`);

    // 3. Remove already-seen (SQLite lookup per job)
    const newJobs = applyDedup(relevant);
    console.log(`New (unseen): ${newJobs.length}`);

    // 4. Score and sort
    const scored = scoreJobs(newJobs);

    // 5. Build and send digest
    const message = buildDigestMessage(scored);
    if (message) {
      await sendMessage(message);
      console.log('Digest sent to Telegram.');
    } else {
      console.log('No new jobs — digest skipped.');
    }

    // 6. Persist new IDs to SQLite in one transaction
    db.markSeenBatch(newJobs.map(j => j.id));
    console.log(`Saved ${newJobs.length} new IDs. DB total: ${db.countSeen()}`);

    // 7. Optional: health ping so you know the bot ran
    if (process.env.HEALTH_PING_URL) {
      await axios.get(process.env.HEALTH_PING_URL).catch(() => {});
    }

  } catch (err) {
    console.error('Fatal error:', err.message);
    await sendError(err.message);
  }
}

module.exports = { run };
```

### ✅ Checkpoint
```bash
npm run test:run
# (we'll add this script in Phase 7)
```
Temporarily add to `package.json` scripts: `"test:run": "node -e \"require('./src').run()\""`
- First run: Telegram message arrives with jobs (or "no new jobs" in console)
- Second run immediately after: zero new jobs (all IDs now in DB)
- `jobs.db` file exists and has rows

---

## Phase 7 — Scheduler (Entry Point)

**Goal:** Keep the process alive and fire the bot on the configured cron schedule.

### Tasks
Create `index.js` at project root:
```js
const cron = require('node-cron');
const config = require('./config');
const { run } = require('./src');

console.log('Job Alert Bot starting...');
console.log(`Cron schedule: ${config.schedule.cronExpression}`);

// Fire once immediately on startup so you know it's working
run();

// Then fire on schedule
cron.schedule(config.schedule.cronExpression, () => {
  run();
});
```

Update `package.json` scripts:
```json
"scripts": {
  "start": "node index.js",
  "test:run": "node -e \"require('./src').run()\""
}
```

### ✅ Checkpoint
- Run `npm start`
- Console shows startup message + immediate run logs
- Process stays alive (does not exit after the first run)
- Press Ctrl+C to stop

---

## Phase 8 — Dockerfile

**Goal:** Package the app so it can run in any cloud environment.

### Why this matters
Fly.io deploys Docker containers. The Dockerfile must install the native build tools
that `better-sqlite3` needs to compile, then produce a lean production image.

### Tasks
Populate `Dockerfile`:
```dockerfile
# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# better-sqlite3 is a native addon — needs build tools to compile
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy only what we need from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src          ./src
COPY --from=builder /app/index.js     ./index.js
COPY --from=builder /app/config.js    ./config.js
COPY --from=builder /app/package.json ./package.json

# /data will be overridden by the Fly.io persistent volume at runtime.
# Creating it here lets the image still work locally without a volume.
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/jobs.db

CMD ["node", "index.js"]
```

### ✅ Checkpoint
Build and run locally to confirm the image works:
```bash
docker build -t job-alert-bot .
docker run --rm \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e TELEGRAM_CHAT_ID=your_chat_id \
  -e DB_PATH=/data/jobs.db \
  -v "$(pwd)/testdata:/data" \
  job-alert-bot
```
- Container starts without errors
- Telegram message arrives (or "no new jobs" log)
- `testdata/jobs.db` is created on your local machine (the volume mount)
- Delete `testdata/` after confirming

---

## Phase 9 — Deploy to Fly.io (Free, Always-On)

**Goal:** Get the bot running in the cloud with zero downtime and persistent storage.

### Why Fly.io
| Feature | Detail |
|---|---|
| Free tier | 3 × shared-CPU VMs (256 MB RAM) — enough for this bot |
| No sleep | Unlike Render's free tier, Fly.io VMs stay running |
| Persistent volumes | 1 GB free — SQLite file survives redeploys |
| Sydney region | `syd` — low latency from AU |

### Pre-requisites
1. Create a free account at [fly.io](https://fly.io)
2. Install the Fly CLI:
   ```bash
   # macOS / Linux
   curl -L https://fly.io/install.sh | sh
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```
3. Log in:
   ```bash
   fly auth login
   ```

### Tasks

#### 9a — Create `fly.toml`
```toml
app = "job-alert-bot"        # change this to a unique name, e.g. "job-alert-bot-yourname"
primary_region = "syd"       # closest free region to Australia

[build]
  # Uses the Dockerfile in the project root

[env]
  NODE_ENV = "production"
  DB_PATH  = "/data/jobs.db"

# Persistent volume mount — this is where jobs.db lives across deploys
[mounts]
  source      = "job_data"
  destination = "/data"

[[vm]]
  memory   = "256mb"
  cpu_kind = "shared"
  cpus     = 1

# No HTTP server — this is a background worker.
# Disable the default health-check that expects a web port.
[checks]
  [checks.alive]
    type    = "tcp"
    port    = 8080
    grace_period = "5s"
    interval = "30s"
    timeout  = "2s"
```
> If the TCP check causes issues, remove the `[checks]` block entirely — it's optional for a worker app.

#### 9b — Launch the app
```bash
# From the project root (one-time setup)
fly launch --no-deploy --name job-alert-bot-yourname --region syd
# When prompted to overwrite fly.toml, say NO — keep the one you created above
```

#### 9c — Create the persistent volume
```bash
fly volumes create job_data --region syd --size 1
```

#### 9d — Set secrets (environment variables)
```bash
fly secrets set TELEGRAM_BOT_TOKEN="your_token_here"
fly secrets set TELEGRAM_CHAT_ID="your_chat_id_here"
```
> Secrets are encrypted at rest. Never put them in `fly.toml` or `.env`.

#### 9e — Deploy
```bash
fly deploy
```

#### 9f — Verify it's running
```bash
# Watch live logs
fly logs

# Check VM status
fly status
```

### ✅ Checkpoint
- `fly status` shows `running`
- `fly logs` shows the startup message and first run logs
- A Telegram message arrives within a minute of deploy
- `fly ssh console` → `ls /data/` shows `jobs.db`

---

## Phase 10 — Error Monitoring & Health Check

**Goal:** Know immediately if the bot breaks, without having to check logs manually.

### Tasks

#### 10a — Verify error alerting
- In `src/sources/rss.js`, temporarily change one feed URL to something invalid
- Deploy or run locally
- Confirm a `⚠️ Job Bot Error` Telegram message arrives
- Revert the URL

#### 10b — Set up healthchecks.io (optional but recommended)
1. Create a free account at [healthchecks.io](https://healthchecks.io)
2. Create a new check → set period to `1 day` → copy the ping URL
3. Add the secret to Fly.io:
   ```bash
   fly secrets set HEALTH_PING_URL="https://hc-ping.com/your-uuid"
   ```
4. The bot already calls this URL at the end of every successful run (see `src/index.js`)
5. healthchecks.io will email/Telegram you if the bot misses a day

### ✅ Checkpoint
- Successful run → healthchecks.io dashboard shows a green tick
- Missed run (simulate by pausing the VM) → you receive an alert email

---

## Phase 11 — Optional Enhancements (Only after Phases 0–10 are stable)

### 11a — Dynamic company blacklist via Telegram command
- Add a Telegram polling loop that listens for `/blacklist <company>` messages
- On command, insert a row into a new `blacklist` table in the same SQLite DB
- Update `src/filters/keywords.js` to query that table instead of the hardcoded array

### 11b — Job tracker saved to SQLite
- Add a `saved_jobs` table: `(id, title, company, link, score, status, saved_at)`
- After filtering, `INSERT OR IGNORE` all new qualifying jobs into this table with `status = 'new'`
- Gives you a queryable history of every job the bot has found

### 11c — Broader scraping via Apify
- Create an Apify account → pick "Indeed Scraper" actor
- Add `src/sources/apify.js` that calls the Apify REST API to trigger a run and fetch results
- Normalise into the same job object shape and add to `fetchAllSources()`
- Cost: ~$5/month for moderate usage

---

## Summary Checklist

| Phase | Description | Status |
|---|---|---|
| 0 | Project scaffold & dependencies | ☐ |
| 1 | Configuration | ☐ |
| 2 | SQLite storage layer | ☐ |
| 3 | Job sources (RSS + Remote OK) | ☐ |
| 4 | Filtering & scoring | ☐ |
| 5 | Telegram notifier | ☐ |
| 6 | Main orchestrator | ☐ |
| 7 | Cron scheduler / entry point | ☐ |
| 8 | Dockerfile | ☐ |
| 9 | Deploy to Fly.io | ☐ |
| 10 | Error monitoring & health check | ☐ |
| 11 | Optional enhancements | ☐ |

---

> **Agent instruction:** Complete each phase's ✅ Checkpoint before writing any code for the next phase.
> Do not create all files at once. Do not install packages not listed in a phase's tasks.
