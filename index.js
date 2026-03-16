const express = require('express');
const cors = require('cors');
const AnimePahe = require('./lib/animepahe');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Create AnimePahe instance
const pahe = new AnimePahe();

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Animepahe API',
    endpoints: {
      search: '/search?q=naruto',
      episodes: '/episodes?session=anime-session-id',
      sources: '/sources?anime_session=xxx&episode_session=yyy',
      ids: '/ids?session=anime-session-id (returns AniList and MyAnimeList IDs)',
      m3u8: '/m3u8?url=kwik-url (returns m3u8 URL with required referer)',
      proxy: '/proxy?url=m3u8-or-ts-url&referer=kwik-referer (Use this to play videos)',
      health: '/health'
    },
    usage: {
      note: 'Use /proxy endpoint to stream videos through the server to bypass CORS and referrer restrictions',
      step1: 'Get M3U8 URL and referer from /m3u8 endpoint',
      step2: 'Use the returned proxy_url directly, or use /proxy?url=<m3u8-url>&referer=<referer> in your video player',
      example: '/m3u8 returns { m3u8: "...", referer: "https://kwik.si/", proxy_url: "/proxy?url=..." }'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Animepahe API is alive!' });
});

app.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const results = await pahe.search(q);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/episodes', async (req, res) => {
  try {
    const { session } = req.query;
    if (!session) {
      return res.status(400).json({ error: 'Query parameter "session" is required' });
    }
    const episodes = await pahe.getEpisodes(session);
    res.json(episodes);
  } catch (error) {
    console.error('Episodes error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/sources', async (req, res) => {
  try {
    const { anime_session, episode_session } = req.query;
    if (!anime_session || !episode_session) {
      return res.status(400).json({ 
        error: 'Query parameters "anime_session" and "episode_session" are required' 
      });
    }
    const sources = await pahe.getSources(anime_session, episode_session);
    res.json(sources);
  } catch (error) {
    console.error('Sources error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/ids', async (req, res) => {
  try {
    const { session } = req.query;
    if (!session) {
      return res.status(400).json({ error: 'Query parameter "session" is required' });
    }
    const ids = await pahe.getIds(session);
    res.json(ids);
  } catch (error) {
    console.error('IDs error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/m3u8', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'Query parameter "url" is required' });
    }
    const result = await pahe.resolveKwikWithNode(url);
    
    // Return m3u8 URL along with required referer for CORS bypass
    res.json({
      m3u8: result.m3u8,
      referer: result.referer,
      headers: {
        'Referer': result.referer,
        'Origin': result.origin
      },
      proxy_url: `/proxy?url=${encodeURIComponent(result.m3u8)}&referer=${encodeURIComponent(result.referer)}`
    });
  } catch (error) {
    console.error('M3U8 resolution error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/proxy', async (req, res) => {
  try {
    const { url, referer: customReferer } = req.query;
    if (!url) {
      return res.status(400).json({ 
        error: 'Query parameter "url" is required',
        usage: 'GET /proxy?url=<m3u8-or-ts-url>&referer=<optional-referer>',
        example: '/proxy?url=https://example.com/video.m3u8&referer=https://kwik.si/'
      });
    }

    const axios = require('axios');
    
    // Use custom referer if provided, otherwise extract from URL
    const urlObj = new URL(url);
    const referer = customReferer || `${urlObj.protocol}//${urlObj.host}/`;
    
    // Fetch the content with proper headers
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Origin': referer.slice(0, -1),
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      },
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Accept 4xx errors to handle them
      }
    });

    // Check if we got blocked
    if (response.status === 403) {
      return res.status(403).json({ 
        error: 'Access forbidden - CDN blocked the request',
        suggestion: 'The video CDN is blocking server requests. Try using a browser extension or different source.',
        url: url
      });
    }

    // Determine content type
    const contentType = response.headers['content-type'] || 
                       (url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 
                        url.includes('.ts') ? 'video/mp2t' : 'application/octet-stream');

    // If it's an m3u8 playlist, modify URLs to go through proxy
    if (contentType.includes('mpegurl') || url.includes('.m3u8')) {
      let content = response.data.toString('utf-8');
      
      // Replace relative URLs with proxied absolute URLs
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const refererParam = customReferer ? `&referer=${encodeURIComponent(customReferer)}` : '';
      content = content.split('\n').map(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && !line.startsWith('http')) {
          // Relative URL - make it absolute and proxy it
          const absoluteUrl = baseUrl + line;
          return `/proxy?url=${encodeURIComponent(absoluteUrl)}${refererParam}`;
        } else if (line.startsWith('http')) {
          // Absolute URL - proxy it
          return `/proxy?url=${encodeURIComponent(line)}${refererParam}`;
        }
        return line;
      }).join('\n');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.send(content);
    } else {
      // Video segment or other binary content
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Accept-Ranges', 'bytes');
      
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      res.send(Buffer.from(response.data));
    }
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    if (error.response && error.response.status === 403) {
      return res.status(403).json({ 
        error: 'Access forbidden - CDN blocked the request',
        suggestion: 'The video CDN has Cloudflare protection. You may need to use a CORS proxy service or browser extension.',
        url: req.query.url
      });
    }
    
    res.status(500).json({ 
      error: error.message,
      url: req.query.url,
      suggestion: 'Try accessing the M3U8 URL directly in your browser or use a CORS proxy service'
    });
  }
});

// Handle OPTIONS for CORS preflight
app.options('/proxy', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.sendStatus(200);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Export for Vercel
module.exports = app;

// Start server if not in Vercel environment
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Animepahe API server running on port ${PORT}`);
  });
}
