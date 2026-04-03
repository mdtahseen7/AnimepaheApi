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
    this.base = process.env.ANIMEPAHE_BASE || 'https://animepahe.com';
    this.headers = {
      'User-Agent': randomUserAgent(),
      'Cookie': '__ddg1_=;__ddg2_=',
      'Referer': `${this.base}/`
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
   * Parse an API response that may be a JSON string or object
   * @param {string|Object} response - Raw response
   * @returns {Object} Parsed JSON object
   * @private
   */
  _parseJsonResponse(response) {
    if (typeof response === 'string') {
      return JSON.parse(response);
    }
    return response || {};
  }

  /**
   * Extract first matching array from a response object
   * @param {Object|Array} payload - Response payload
   * @param {Array<string>} keys - Candidate keys
   * @returns {Array} Array value or empty array
   * @private
   */
  _extractArray(payload, keys = []) {
    if (Array.isArray(payload)) {
      return payload;
    }

    for (const key of keys) {
      if (Array.isArray(payload?.[key])) {
        return payload[key];
      }
    }

    return [];
  }

  /**
   * Best-effort extraction of internal anime id used by release API
   * @param {string} html - Anime detail page html
   * @param {string} animeSession - Public anime session id
   * @returns {string} Internal id
   * @private
   */
  _extractAnimeInternalId(html, animeSession) {
    const $ = cheerio.load(html);

    const ogUrl = $('meta[property="og:url"]').attr('content');
    if (ogUrl) {
      const lastPart = ogUrl.split('/').filter(Boolean).pop();
      if (lastPart) {
        return lastPart.split('?')[0];
      }
    }

    const releaseIdMatch = html.match(/\/api\?m=release&id=([^"'&\s>]+)/i);
    if (releaseIdMatch?.[1]) {
      return releaseIdMatch[1];
    }

    const animeIdMatches = [
      /["']anime_id["']\s*[:=]\s*["']?([^"',\s<;]+)/i,
      /["']animeId["']\s*[:=]\s*["']?([^"',\s<;]+)/i,
      /\bid\s*[:=]\s*["']?([0-9]{1,10})["']?\s*,\s*["']?(?:title|poster|episodes?)\b/i
    ];

    for (const pattern of animeIdMatches) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    // Fallback keeps current behavior for old layouts.
    return animeSession;
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

      const data = this._parseJsonResponse(response);
      const animeRows = this._extractArray(data, ['data', 'results', 'items', 'animes', 'list']);
      const results = [];

      for (const anime of animeRows) {
        const session = anime.session || anime.slug || anime.anime_session || null;
        const resolutionSafeTitle = anime.title || anime.name || anime.anime_title || anime.title_en || anime.title_romaji || null;

        results.push({
          id: anime.id || anime.anime_id || anime.aid || null,
          title: resolutionSafeTitle,
          url: anime.url || (session ? `${this.base}/anime/${session}` : null),
          year: anime.year || anime.release_year || null,
          poster: anime.poster || anime.poster_url || anime.image || anime.cover || null,
          type: anime.type || anime.media_type || anime.format || null,
          session
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

      const tempId = this._extractAnimeInternalId(html, animeSession);

      // Fetch first page to get pagination info
      const firstPageUrl = `${this.base}/api?m=release&id=${encodeURIComponent(tempId)}&sort=episode_asc&page=1`;
      const firstPageResponse = await cloudscraper.get(firstPageUrl, {
        headers: this.getHeaders()
      });

      const firstPageData = this._parseJsonResponse(firstPageResponse);

      let episodes = this._extractArray(firstPageData, ['data', 'results', 'items', 'episodes']);
      const lastPage = Number(
        firstPageData.last_page ||
        firstPageData.lastPage ||
        firstPageData.total_pages ||
        firstPageData.pages ||
        1
      ) || 1;

      // Fetch remaining pages concurrently
      if (lastPage > 1) {
        const pagePromises = [];
        for (let page = 2; page <= lastPage; page++) {
          const pageUrl = `${this.base}/api?m=release&id=${encodeURIComponent(tempId)}&sort=episode_asc&page=${page}`;
          pagePromises.push(
            cloudscraper.get(pageUrl, { headers: this.getHeaders() })
              .then(response => {
                const data = this._parseJsonResponse(response);
                return this._extractArray(data, ['data', 'results', 'items', 'episodes']);
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
        id: ep.id || ep.release_id || null,
        number: Number(ep.episode ?? ep.number ?? ep.ep ?? ep.ep_num),
        title: ep.title || ep.episode_title || `Episode ${ep.episode ?? ep.number ?? ''}`.trim(),
        snapshot: ep.snapshot || ep.thumbnail || ep.image || null,
        session: ep.session || ep.release_session || null
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

      const sources = [];
      const $ = cheerio.load(html);

      // Primary extraction: parse structured data attributes without relying on attribute order.
      $('[data-src]').each((_, el) => {
        const src = ($(el).attr('data-src') || '').trim();
        if (!src || !/https?:\/\/kwik\./i.test(src)) {
          return;
        }

        const rawResolution = ($(el).attr('data-resolution') || $(el).attr('data-res') || '').trim();
        const hasResolution = /\d/.test(rawResolution);
        const quality = hasResolution
          ? (rawResolution.toLowerCase().endsWith('p') ? rawResolution : `${rawResolution}p`)
          : null;

        sources.push({
          url: src,
          quality,
          fansub: ($(el).attr('data-fansub') || $(el).attr('data-fansub-id') || null),
          audio: ($(el).attr('data-audio') || $(el).attr('data-lang') || null)
        });
      });

      // Fallback: extract kwik links directly
      if (sources.length === 0) {
        const kwikPattern = /https?:\/\/kwik\.[a-z]+\/(?:e|f|d)\/[A-Za-z0-9_-]+/gi;
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
          const match = source.quality.match(/(\d+)/);
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
   * @returns {Promise<Object>} Object with m3u8 URL and required referer headers
   */
  async resolveKwikWithNode(kwikUrl) {
    try {
      // Extract referer from kwik URL - use full embed URL as referer
      const kwikUrlObj = new URL(kwikUrl);
      const kwikReferer = kwikUrl; // Full embed URL works better than just the host
      const kwikOrigin = `${kwikUrlObj.protocol}//${kwikUrlObj.host}`;

      // Fetch Kwik page
      const html = await cloudscraper.get(kwikUrl, {
        headers: this.getHeaders(),
        timeout: 20000
      });

      // Check for direct M3U8 URL in HTML
      const directM3u8 = extractM3U8FromText(html);
      if (directM3u8) {
        return { m3u8: directM3u8, referer: kwikReferer, origin: kwikOrigin };
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
          return { m3u8: dataSrcMatch[1], referer: kwikReferer, origin: kwikOrigin };
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
        return { m3u8: m3u8FromOutput, referer: kwikReferer, origin: kwikOrigin };
      }

      throw new Error(`Could not resolve .m3u8. Node output (first 2000 chars):\n${nodeOutput.substring(0, 2000)}`);
    } catch (error) {
      throw new Error(`Failed to resolve Kwik URL: ${error.message}`);
    }
  }

  /**
   * Get external IDs (AniList, MyAnimeList) for an anime
   * @param {string} animeSession - Anime session ID
   * @returns {Promise<Object>} Object with anilist and myanimelist IDs
   */
  async getIds(animeSession) {
    try {
      const animePageUrl = `${this.base}/anime/${animeSession}`;
      const html = await cloudscraper.get(animePageUrl, {
        headers: this.getHeaders()
      });

      const $ = cheerio.load(html);
      const anilistId = $('meta[name="anilist"]').attr('content') || null;
      const malId = $('meta[name="myanimelist"]').attr('content') || null;

      return {
        anilist: anilistId ? parseInt(anilistId, 10) : null,
        myanimelist: malId ? parseInt(malId, 10) : null
      };
    } catch (error) {
      throw new Error(`Failed to get IDs: ${error.message}`);
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
