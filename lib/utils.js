/**
 * Utility functions for the AnimePahe scraper
 */

/**
 * Returns a random user agent string from a predefined list
 * @returns {string} Random user agent string
 */
function randomUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/16.1 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

/**
 * Extracts M3U8 URL from text content using regex
 * @param {string} text - Text content to search
 * @returns {string|null} M3U8 URL if found, null otherwise
 */
function extractM3U8FromText(text) {
  const m3u8Pattern = /https?:\/\/[^'"\s<>]+\.m3u8[^\s'")<]*/;
  const match = text.match(m3u8Pattern);
  return match ? match[0] : null;
}

module.exports = {
  randomUserAgent,
  extractM3U8FromText
};
