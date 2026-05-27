const axios = require('axios');
const config = require('../../config');

async function fetchAll() {
  if (!config.sources.himalayas?.enabled) return [];
  try {
    const { data } = await axios.get(config.sources.himalayas.url, {
      headers: { 'User-Agent': 'JobAlertBot/1.0' },
    });
    return (data.jobs || []).map(job => ({
      id: `himalayas::${job.slug}`,
      title: job.title || '',
      company: job.companyName || 'Unknown',
      link: `https://himalayas.app/jobs/${job.slug}`,
      source: 'Himalayas',
      postedDate: job.createdAt || '',
      description: (job.description || '') + ' ' + (job.categories || []).join(' '),
    }));
  } catch (err) {
    console.error('[Himalayas] Failed to fetch:', err.message);
    return [];
  }
}

module.exports = { fetchAll };