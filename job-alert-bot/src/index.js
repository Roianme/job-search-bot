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
    const allJobs = await fetchAllSources();
    console.log(`Fetched: ${allJobs.length} total`);

    const relevant = applyKeywordFilter(allJobs);
    console.log(`After keyword filter: ${relevant.length}`);

    const newJobs = applyDedup(relevant);
    console.log(`New (unseen): ${newJobs.length}`);

    const scored = scoreJobs(newJobs);
    const message = buildDigestMessage(scored);
    if (message) {
      await sendMessage(message);
      console.log('Digest sent to Telegram.');
    } else {
      console.log('No new jobs — digest skipped.');
    }

    db.markSeenBatch(newJobs.map(j => j.id));
    console.log(`Saved ${newJobs.length} new IDs. DB total: ${db.countSeen()}`);

    if (process.env.HEALTH_PING_URL) {
      await axios.get(process.env.HEALTH_PING_URL).catch(() => {});
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    await sendError(err.message);
  }
}

module.exports = { run };
