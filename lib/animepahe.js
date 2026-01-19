const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio');
const { randomUserAgent, extractM3U8FromText } = require('./utils');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

/**
 * AnimePahe scraper class
 */
class AnimePahe {
  constructor() {
    this.base = 'https://animepahe.si';
    this.headers = {
      'User-Agent': randomUserAgent(),
      'Cookie': '__ddg1_=;__ddg2_=',
      'Referer': 'https://animepahe.si/'
    };
  }

  /**
   * Get headers with a fresh user agent
   * @returns {Object} Headers object
   */
  getHeaders() {
    return {
      ...this.headers,
      'User-Agent': randomUserAgent()
    };
  }

  /**
   * Search for anime by query
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of anime results
   */
  async search(query) {
    const url = `${this.base}/api?m=search&q=${encodeURIComponent(query)}`;
    
    try {
      const response = await cloudscraper.get(url, {
        headers: this.getHeaders()
      });

      const data = typeof response === 'string' ? JSON.parse(response) : response;
      const results = [];

      for (const anime of (data.data || [])) {
        results.push({
          id: anime.id,
          title: anime.title,
          url: `${this.base}/anime/${anime.session}`,
          year: anime.year,
          poster: anime.poster,
          type: anime.type,
          session: anime.session
        });
      }

      return results;
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Get episodes for an anime
   * @param {string} animeSession - Anime session ID
   * @returns {Promise<Array>} Array of episodes
   */
  async getEpisodes(animeSession) {
    try {
      // Fetch anime page to get internal ID
      const animePageUrl = `${this.base}/anime/${animeSession}`;
      const html = await cloudscraper.get(animePageUrl, {
        headers: this.getHeaders()
      });

      // Parse HTML to extract meta tag
      const $ = cheerio.load(html);
      const metaTag = $('meta[property="og:url"]');
      
      if (!metaTag.length) {
        throw new Error('Could not find session ID in meta tag');
      }

      const metaContent = metaTag.attr('content');
      const tempId = metaContent.split('/').pop();

      // Fetch first page to get pagination info
      const firstPageUrl = `${this.base}/api?m=release&id=${tempId}&sort=episode_asc&page=1`;
      const firstPageResponse = await cloudscraper.get(firstPageUrl, {
        headers: this.getHeaders()
      });

      const firstPageData = typeof firstPageResponse === 'string' 
        ? JSON.parse(firstPageResponse) 
        : firstPageResponse;

      let episodes = firstPageData.data || [];
      const lastPage = firstPageData.last_page || 1;

      // Fetch remaining pages concurrently
      if (lastPage > 1) {
        const pagePromises = [];
        for (let page = 2; page <= lastPage; page++) {
          const pageUrl = `${this.base}/api?m=release&id=${tempId}&sort=episode_asc&page=${page}`;
          pagePromises.push(
            cloudscraper.get(pageUrl, { headers: this.getHeaders() })
              .then(response => {
                const data = typeof response === 'string' ? JSON.parse(response) : response;
                return data.data || [];
              })
          );
        }

        const additionalPages = await Promise.all(pagePromises);
        for (const pageData of additionalPages) {
          episodes = episodes.concat(pageData);
        }
      }

      // Transform to Episode format
      const formattedEpisodes = episodes.map(ep => ({
        id: ep.id,
        number: ep.episode,
        title: ep.title || `Episode ${ep.episode}`,
        snapshot: ep.snapshot,
        session: ep.session
      }));

      // Sort by episode number ascending
      formattedEpisodes.sort((a, b) => a.number - b.number);

      return formattedEpisodes;
    } catch (error) {
      throw new Error(`Failed to get episodes: ${error.message}`);
    }
  }

  /**
   * Get streaming sources for an episode
   * @param {string} animeSession - Anime session ID
   * @param {string} episodeSession - Episode session ID
   * @returns {Promise<Array>} Array of streaming sources
   */
  async getSources(animeSession, episodeSession) {
    try {
      const playUrl = `${this.base}/play/${animeSession}/${episodeSession}`;
      const html = await cloudscraper.get(playUrl, {
        headers: this.getHeaders()
      });

      // Extract button data attributes using regex
      const buttonPattern = /<button[^>]+data-src="([^"]+)"[^>]+data-fansub="([^"]+)"[^>]+data-resolution="([^"]+)"[^>]+data-audio="([^"]+)"[^>]*>/g;
      const sources = [];
      let match;

      while ((match = buttonPattern.exec(html)) !== null) {
        const [, src, fansub, resolution, audio] = match;
        if (src.startsWith('https://kwik.')) {
          sources.push({
            url: src,
            quality: `${resolution}p`,
            fansub: fansub,
            audio: audio
          });
        }
      }

      // Fallback: extract kwik links directly
      if (sources.length === 0) {
        const kwikPattern = /https:\/\/kwik\.(si|cx|link)\/e\/\w+/g;
        let kwikMatch;
        while ((kwikMatch = kwikPattern.exec(html)) !== null) {
          sources.push({
            url: kwikMatch[0],
            quality: null,
            fansub: null,
            audio: null
          });
        }
      }

      if (sources.length === 0) {
        throw new Error('No kwik links found on play page');
      }

      // Deduplicate sources by URL
      const uniqueSourcesMap = new Map();
      for (const source of sources) {
        if (!uniqueSourcesMap.has(source.url)) {
          uniqueSourcesMap.set(source.url, source);
        }
      }
      const uniqueSources = Array.from(uniqueSourcesMap.values());

      // Sort by resolution descending
      uniqueSources.sort((a, b) => {
        const getResolution = (source) => {
          if (!source.quality) return 0;
          const match = source.quality.match(/(\d+)p/);
          return match ? parseInt(match[1]) : 0;
        };
        return getResolution(b) - getResolution(a);
      });

      return uniqueSources;
    } catch (error) {
      throw new Error(`Failed to get sources: ${error.message}`);
    }
  }

  /**
   * Resolve Kwik URL to M3U8 streaming URL
   * @param {string} kwikUrl - Kwik page URL
   * @returns {Promise<string>} M3U8 streaming URL
   */
  async resolveKwikWithNode(kwikUrl) {
    try {
      // Fetch Kwik page
      const html = await cloudscraper.get(kwikUrl, {
        headers: this.getHeaders(),
        timeout: 20000
      });

      // Check for direct M3U8 URL in HTML
      const directM3u8 = extractM3U8FromText(html);
      if (directM3u8) {
        return directM3u8;
      }

      // Extract script blocks containing eval()
      const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      const scripts = [];
      let scriptMatch;

      while ((scriptMatch = scriptPattern.exec(html)) !== null) {
        scripts.push(scriptMatch[1]);
      }

      // Find the best candidate script
      let scriptBlock = null;
      let largestEvalScript = null;
      let maxLen = 0;

      for (const script of scripts) {
        if (script.includes('eval(')) {
          if (script.includes('source') || script.includes('.m3u8') || script.includes('Plyr')) {
            scriptBlock = script;
            break;
          }
          if (script.length > maxLen) {
            maxLen = script.length;
            largestEvalScript = script;
          }
        }
      }

      if (!scriptBlock) {
        scriptBlock = largestEvalScript;
      }

      if (!scriptBlock) {
        // Try data-src attribute as fallback
        const dataSrcPattern = /data-src="([^"]+\.m3u8[^"]*)"/;
        const dataSrcMatch = html.match(dataSrcPattern);
        if (dataSrcMatch) {
          return dataSrcMatch[1];
        }
        throw new Error('No candidate <script> block found to evaluate');
      }

      // Transform script for Node.js execution
      let transformedScript = scriptBlock.replace(/\bdocument\b/g, 'DOC_STUB');
      transformedScript = transformedScript.replace(/^(var|const|let|j)\s*q\s*=/gm, 'window.q = ');
      transformedScript += '\ntry { console.log(window.q); } catch(e) { console.log("Variable q not found"); }';

      // Create temporary file
      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, `kwik-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.js`);

      const wrapperCode = `
globalThis.window = { location: {} };
globalThis.document = { cookie: '' };
const DOC_STUB = globalThis.document;
globalThis.navigator = { userAgent: 'mozilla' };
${transformedScript}
`;

      await fs.writeFile(tmpFile, wrapperCode, 'utf8');

      // Execute with Node.js
      const nodeOutput = await this._executeNodeScript(tmpFile);

      // Clean up temp file
      try {
        await fs.unlink(tmpFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      // Extract M3U8 from output
      const m3u8FromOutput = extractM3U8FromText(nodeOutput);
      if (m3u8FromOutput) {
        return m3u8FromOutput;
      }

      throw new Error(`Could not resolve .m3u8. Node output (first 2000 chars):\n${nodeOutput.substring(0, 2000)}`);
    } catch (error) {
      throw new Error(`Failed to resolve Kwik URL: ${error.message}`);
    }
  }

  /**
   * Execute a Node.js script and capture output
   * @param {string} scriptPath - Path to script file
   * @returns {Promise<string>} Script output
   * @private
   */
  async _executeNodeScript(scriptPath) {
    return new Promise((resolve, reject) => {
      const nodeProcess = spawn('node', [scriptPath]);
      let stdout = '';
      let stderr = '';

      nodeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      nodeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      nodeProcess.on('close', (code) => {
        const output = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
        resolve(output);
      });

      nodeProcess.on('error', (error) => {
        reject(error);
      });
    });
  }
}

module.exports = AnimePahe;
