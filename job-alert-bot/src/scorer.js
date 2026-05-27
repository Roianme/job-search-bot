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
