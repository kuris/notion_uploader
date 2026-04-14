/**
 * Pauses execution for the specified time.
 * @param {number} ms 
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes a function with retries and exponential backoff.
 * @param {Function} fn 
 * @param {number} retries 
 * @param {number} delay 
 */
async function withRetry(fn, retries = 3, delay = 2000) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        // Exponential backoff
        const backoffDelay = delay * Math.pow(2, i);
        console.log(`\n⚠️  Retrying in ${backoffDelay}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(backoffDelay);
      }
    }
  }
  throw lastError;
}

/**
 * Simple logger to save results to a JSON file.
 * @param {string} logPath 
 * @param {Object} data 
 */
const fs = require('fs');
function saveLog(logPath, data) {
  let logs = [];
  if (fs.existsSync(logPath)) {
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      logs = [];
    }
  }
  logs.push({ timestamp: new Date().toISOString(), ...data });
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

module.exports = { sleep, withRetry, saveLog };
