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
