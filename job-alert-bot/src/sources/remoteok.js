const axios = require('axios');
const config = require('../../config');

async function fetchAll() {
  if (!config.sources.remoteOk.enabled) return [];
  try {
    const { data } = await axios.get(config.sources.remoteOk.url, {
      headers: { 'User-Agent': 'JobAlertBot/1.0' },
    });
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
