# Algal Bloom Viewer

This app visualizes an algal bloom index (NDCI) from a Sentinel Hub BYOC collection.

## Setup

1. Backend

Create `/workspace/server/.env` from `.env.example` and set:

```
SENTINELHUB_TOKEN=YOUR_OAUTH_ACCESS_TOKEN
PORT=4000
```

Install and run:

```
cd /workspace/server
npm i
node index.js
```

2. Frontend

```
cd /workspace/workspace/web
npm i
npm run dev
```

Open the app and click Update to fetch the overlay.
