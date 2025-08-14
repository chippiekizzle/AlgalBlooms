# AlgalBlooms

A minimal web app for monitoring algal blooms using NASA GIBS chlorophyll-a layers with drawing tools for Areas of Interest (AOIs).

## Features
- Date picker and prev/next day navigation
- Layer selection (VIIRS SNPP, MODIS Terra Chlorophyll-a)
- Opacity control
- Draw polygons for AOIs; import/export GeoJSON; clear AOIs

## Run locally

Using Python 3:

```bash
python3 -m http.server 8000 -d /workspace/app
```

Then open `http://localhost:8000` in your browser.

## Notes
- Imagery served via NASA GIBS WMTS (`epsg3857/best`) with `GoogleMapsCompatible_Level9` tile matrix.
- Recent dates may be unavailable; the app defaults to a recent date to reduce 404 tiles.
- AOI area is computed client-side with Turf.js and shown in the popup.
