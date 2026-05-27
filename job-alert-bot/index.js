const cron = require('node-cron');
const config = require('./config');
const { run } = require('./src');

console.log('Job Alert Bot starting...');
console.log(`Cron schedule: ${config.schedule.cronExpression}`);

run();

cron.schedule(config.schedule.cronExpression, () => {
  run();
});
