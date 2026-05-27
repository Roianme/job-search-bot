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
