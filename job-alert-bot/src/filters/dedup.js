const db = require('../storage/db');

function applyDedup(jobs) {
  return jobs.filter(job => db.isNew(job.id));
}

module.exports = { applyDedup };
