import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const SENTINEL_HUB_PROCESS_ENDPOINT = 'https://services.sentinel-hub.com/api/v1/process';
const SENTINEL_HUB_STAC_SEARCH = 'https://services.sentinel-hub.com/api/v1/catalog/1.0.0/search';
const SENTINEL_HUB_AUTH_URL = 'https://services.sentinel-hub.com/oauth/token';

const COLLECTION_ID = 'c93feff3-b9d0-49ad-b6b0-462a2e395ae9';

const CLIENT_ID = process.env.SH_CLIENT_ID || process.env.SENTINELHUB_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SH_CLIENT_SECRET || process.env.SENTINELHUB_CLIENT_SECRET || '';

let cachedAccessToken = '';
let cachedAccessTokenExpiryMs = 0;

async function getAccessToken() {
  if (process.env.SENTINELHUB_TOKEN) return process.env.SENTINELHUB_TOKEN;
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessTokenExpiryMs - 60_000) {
    return cachedAccessToken;
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing SH_CLIENT_ID/SH_CLIENT_SECRET or SENTINELHUB_CLIENT_ID/SENTINELHUB_CLIENT_SECRET');
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  });
  const res = await fetch(SENTINEL_HUB_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  cachedAccessToken = json.access_token;
  cachedAccessTokenExpiryMs = now + (json.expires_in * 1000);
  return cachedAccessToken;
}

function buildEvalscriptNDCI(redEdgeBand, redBand) {
  const bands = JSON.stringify([redEdgeBand, redBand, 'dataMask']);
  return `//VERSION=3
function setup() {
  return {
    input: ${bands},
    output: { bands: 4 }
  };
}

function evaluatePixel(sample) {
  const ndci = (sample['${redEdgeBand}'] - sample['${redBand}']) / (sample['${redEdgeBand}'] + sample['${redBand}'] + 1e-6);
  const v = Math.max(-0.5, Math.min(0.5, ndci));
  const t = (v + 0.5) / 1.0;
  const r = t < 0.5 ? 0 : (t - 0.5) * 2.0;
  const g = t < 0.5 ? t * 2.0 : (1.0 - (t - 0.5) * 2.0);
  const b = t < 0.5 ? 1.0 - t * 2.0 : 0;
  return [r, g, b, sample.dataMask];
}`;
}

function buildSentinelHubPayload({ bbox, width, height, timeFrom, timeTo, redBand, redEdgeBand }) {
  return {
    input: {
      bounds: {
        bbox,
        properties: {
          crs: 'http://www.opengis.net/def/crs/EPSG/0/4326'
        }
      },
      data: [
        {
          type: 'byoc',
          dataFilter: {
            collectionId: COLLECTION_ID,
            timeRange: timeFrom && timeTo ? { from: timeFrom, to: timeTo } : undefined
          }
        }
      ]
    },
    output: {
      width,
      height,
      responses: [
        { identifier: 'default', format: { type: 'image/png' } }
      ]
    },
    evalscript: buildEvalscriptNDCI(redEdgeBand || 'B05', redBand || 'B04')
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/introspect', async (_req, res) => {
  try {
    const token = await getAccessToken();
    const searchBody = {
      collections: [COLLECTION_ID],
      limit: 1,
      sort: [{ field: 'properties.datetime', direction: 'desc' }]
    };
    const r = await fetch(SENTINEL_HUB_STAC_SEARCH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(searchBody)
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: 'STAC search failed', status: r.status, details: text });
    }
    const data = await r.json();
    const feature = data.features && data.features[0];
    const assets = feature?.assets || {};
    const assetNames = Object.keys(assets);
    res.json({ assetNames, exampleItemId: feature?.id || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Introspection error' });
  }
});

app.post('/process', async (req, res) => {
  try {
    const { bbox, width, height, timeFrom, timeTo, redBand, redEdgeBand } = req.body;
    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return res.status(400).json({ error: 'bbox required as [minX,minY,maxX,maxY] in EPSG:4326' });
    }
    const token = await getAccessToken();
    const payload = buildSentinelHubPayload({ bbox, width: width || 1024, height: height || 1024, timeFrom, timeTo, redBand, redEdgeBand });

    const shRes = await fetch(SENTINEL_HUB_PROCESS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!shRes.ok) {
      const text = await shRes.text();
      return res.status(502).json({ error: 'Sentinel Hub error', status: shRes.status, details: text });
    }

    const arrayBuffer = await shRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.setHeader('Content-Type', 'image/png');
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});