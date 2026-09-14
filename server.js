const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET proxy for audio/video media streaming with Range header support
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };
    if (req.headers.range) {
      headers.range = req.headers.range;
    }

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      headers,
      timeout: 45000,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    res.status(response.status);
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
      if (response.headers[h]) {
        res.setHeader(h, response.headers[h]);
      }
    });

    response.data.pipe(res);
  } catch (err) {
    res.status(502).send('Media proxy error: ' + (err.message || 'Stream failed'));
  }
});

// Proxy for client-side scrapers to bypass browser CORS in web mode
app.post('/api/proxy', async (req, res) => {
  const { url, method = 'GET', headers = {}, data, params, responseType } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ status: 400, message: 'Missing target url parameter' });
  }

  try {
    const forwardHeaders = { ...headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['origin'];
    delete forwardHeaders['connection'];
    delete forwardHeaders['content-length'];

    if (!forwardHeaders['user-agent'] && !forwardHeaders['User-Agent']) {
      forwardHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    }

    const axiosConfig = {
      url,
      method: method.toUpperCase(),
      headers: forwardHeaders,
      timeout: 45000,
      validateStatus: () => true, // Forward any status code
      maxRedirects: 10,
    };

    if (params) {
      axiosConfig.params = params;
    }

    if (data !== undefined && data !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(axiosConfig.method)) {
      axiosConfig.data = data;
    }

    if (responseType === 'arraybuffer') {
      axiosConfig.responseType = 'arraybuffer';
      const response = await axios(axiosConfig);
      return res.json({
        status: response.status,
        headers: response.headers,
        data: Buffer.from(response.data).toString('base64'),
        isBase64: true,
      });
    }

    axiosConfig.responseType = 'text';
    const response = await axios(axiosConfig);

    return res.json({
      status: response.status,
      headers: response.headers,
      data: response.data,
      isBase64: false,
    });
  } catch (err) {
    console.error('[Proxy Error]', err.message);
    return res.status(502).json({
      status: 502,
      message: err.message || 'Remote request failed',
      data: null,
    });
  }
});

// Download stream route for clean file downloads in browser
app.get('/api/download', async (req, res) => {
  const { url, filename } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      timeout: 60000,
    });

    const safeFilename = filename ? String(filename).replace(/[/\\?%*:|"<>]/g, '_') : 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error('[Download Error]', err.message);
    res.status(500).send('Download stream failed: ' + (err.message || 'Unknown error'));
  }
});

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Single-page application fallback
app.get('*all', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AstroStar server listening on http://0.0.0.0:${PORT}`);
});
