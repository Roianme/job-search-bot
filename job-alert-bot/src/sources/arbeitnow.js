const axios = require('axios');
const config = require('../../config');

async function fetchAll() {
  if (!config.sources.arbeitnow?.enabled) return [];
  try {
    const { data } = await axios.get(config.sources.arbeitnow.url, {
      headers: { 'User-Agent': 'JobAlertBot/1.0' },
    });
    return (data.data || [])
      .filter(job => job.remote === true)
      .map(job => ({
        id: `arbeitnow::${job.slug}`,
        title: job.title || '',
        company: job.company_name || 'Unknown',
        link: job.url || '',
        source: 'Arbeitnow',
        postedDate: job.created_at || '',
        description: (job.description || '') + ' ' + (job.tags || []).join(' '),
      }));
  } catch (err) {
    console.error('[Arbeitnow] Failed to fetch:', err.message);
    return [];
  }
}

module.exports = { fetchAll };