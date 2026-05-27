const axios = require('axios');
const config = require('../../config');

async function sendMessage(text) {
  const url = `https://api.telegram.org/bot${config.telegram.token}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: config.telegram.chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    });
  } catch (err) {
    const detail = err.response?.data?.description || err.message;
    throw new Error(`Telegram send failed: ${detail}`);
  }
}

async function sendError(errorMessage) {
  const safe = String(errorMessage).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
  await sendMessage(`⚠️ *Job Bot Error*\n\\\`${safe}\\\``).catch(console.error);
}

module.exports = { sendMessage, sendError };
