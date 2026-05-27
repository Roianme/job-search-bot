const rss = require('./rss');
const remoteok = require('./remoteok');
const remotive = require('./remotive');
const arbeitnow = require('./arbeitnow');
const himalayas = require('./himalayas');

async function fetchAllSources() {
  const [rssJobs, remoteOkJobs, remotiveJobs, arbeitnowJobs, himalayasJobs] =
    await Promise.all([
      rss.fetchAll(),
      remoteok.fetchAll(),
      remotive.fetchAll(),
      arbeitnow.fetchAll(),
      himalayas.fetchAll(),
    ]);

  const all = [
    ...rssJobs,
    ...remoteOkJobs,
    ...remotiveJobs,
    ...arbeitnowJobs,
    ...himalayasJobs,
  ];

  console.log(`[Sources] RSS:${rssJobs.length} RemoteOK:${remoteOkJobs.length} Remotive:${remotiveJobs.length} Arbeitnow:${arbeitnowJobs.length} Himalayas:${himalayasJobs.length}`);
  return all;
}

module.exports = { fetchAllSources };