const axios = require('axios');
const config = require('../../config');

async function fetchAll() {
  if (!config.sources.remotive?.enabled) return [];
  const results = [];

  for (const category of config.sources.remotive.categories) {
    try {
      const { data } = await axios.get(config.sources.remotive.url, {
        params: { category },
        headers: { 'User-Agent': 'JobAlertBot/1.0' },
      });
      for (const job of data.jobs || []) {
        results.push({
          id: `remotive::${job.id}`,
          title: job.title || '',
          company: job.company_name || 'Unknown',
          link: job.url || '',
          source: 'Remotive',
          postedDate: job.publication_date || '',
          description: (job.description || '') + ' ' + (job.tags || []).join(' '),
        });
      }
    } catch (err) {
      console.error(`[Remotive] Failed to fetch category "${category}":`, err.message);
    }
  }
  return results;
}

module.exports = { fetchAll };