require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  schedule: {
    cronExpression: '0 8 * * *',
  },
  sources: {
    rss: [
      'https://weworkremotely.com/categories/remote-programming-jobs.rss',
      'https://jobspresso.co/feed/',
      'https://www.workingnomads.co/jobs/feed',
    ],
    remoteOk: {
      enabled: true,
      url: 'https://remoteok.com/api',
    },
  },
  filter: {
    includeKeywords: [
      'data entry', 'it support', 'tech support', 'help desk',
      'system administrator', 'network engineer', 'software developer',
      'part-time', 'part time', 'casual', 'contract', 'freelance', 'flexible',
    ],
    excludeKeywords: [
      'full-time', 'full time', 'us citizen', 'must be located',
      'authorized to work', 'onsite', 'on-site', 'internship', 'unpaid',
    ],
    blacklistCompanies: [],
  },
  digest: {
    maxJobsPerMessage: 15,
  },
  storage: {
    dbPath: process.env.DB_PATH || './jobs.db',
  },
};
