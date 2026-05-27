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
