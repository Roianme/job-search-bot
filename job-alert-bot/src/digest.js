const config = require('../config');

function buildDigestMessage(jobs) {
  if (jobs.length === 0) return null;

  const date = new Date().toLocaleDateString('en-AU', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
  const cap = config.digest.maxJobsPerMessage;
  const shown = jobs.slice(0, cap);

  let msg = `🟢 *Job Alert* — ${date}\n`;
  msg += `Found *${jobs.length}* new match${jobs.length !== 1 ? 'es' : ''}`;
  if (jobs.length > cap) msg += ` \\(showing top ${cap}\\)`;
  msg += `\n\n`;

  for (const job of shown) {
    msg += `🏢 *${esc(job.company)}*\n`;
    msg += `📌 ${esc(job.title)}\n`;
    msg += `⭐ Score: ${job.relevanceScore}  \\|  🔹 ${esc(job.source)}\n`;
    msg += `🌐 [View job](${job.link})\n\n`;
  }

  return msg.trim();
}

function esc(text = '') {
  return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { buildDigestMessage };
