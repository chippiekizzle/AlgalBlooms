'use strict';

(function main() {
  const layerSelect = document.getElementById('layerSelect');
  const dateInput = document.getElementById('dateInput');
  const datePrevButton = document.getElementById('datePrev');
  const dateNextButton = document.getElementById('dateNext');
  const opacitySlider = document.getElementById('opacitySlider');
  const importButton = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const exportButton = document.getElementById('exportBtn');
  const clearButton = document.getElementById('clearBtn');
  const statusText = document.getElementById('statusText');

  const layerIdToDisplayName = {
    VIIRS_SNPP_Chlorophyll_A: 'VIIRS SNPP Chlorophyll-a',
    MODIS_Terra_Chlorophyll_A: 'MODIS Terra Chlorophyll-a',
  };

  function toIsoDateString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseInputDate(value) {
    const parts = value.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getDefaultGibsDate() {
    const date = new Date();
    date.setDate(date.getDate() - 2);
    return date;
  }

  function getMaxSelectableDate() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  }

  function buildGibsUrl(layerId, isoDate) {
    const base = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
    const tileMatrix = 'GoogleMapsCompatible_Level9';
    const ext = 'png';
    return `${base}/${layerId}/default/${isoDate}/${tileMatrix}/{z}/{y}/{x}.${ext}`;
  }

  function updateStatusText(layerId, isoDate) {
    const name = layerIdToDisplayName[layerId] || layerId;
    statusText.textContent = `${name} • ${isoDate}`;
  }

  const map = L.map('map', {
    worldCopyJump: true,
    minZoom: 2,
  }).setView([20, 0], 3);

  const osmAttribution = '&copy; OpenStreetMap contributors';
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: osmAttribution,
  }).addTo(map);

  const drawnItems = L.featureGroup().addTo(map);

  const drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polyline: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
      marker: false,
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: { color: '#2563eb', weight: 2 },
      },
    },
    edit: {
      featureGroup: drawnItems,
      edit: true,
      remove: true,
    },
  });
  map.addControl(drawControl);

  function describeAreaSqKm(geojson) {
    try {
      const areaSquareMeters = turf.area(geojson);
      const areaSquareKilometers = areaSquareMeters / 1_000_000;
      return `${areaSquareKilometers.toFixed(2)} km²`;
    } catch (e) {
      return null;
    }
  }

  function bindAreaPopupIfPolygon(layer) {
    const gj = layer.toGeoJSON();
    if (!gj || (gj.type !== 'Feature' && gj.type !== 'FeatureCollection')) return;
    const geometryType = gj.type === 'Feature' ? gj.geometry?.type : null;
    if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
      const area = describeAreaSqKm(gj);
      if (area) {
        layer.bindPopup(`Area: ${area}`);
      }
    }
  }

  map.on(L.Draw.Event.CREATED, function onDrawCreated(event) {
    const layer = event.layer;
    drawnItems.addLayer(layer);
    bindAreaPopupIfPolygon(layer);
  });

  function exportAoIs() {
    const geojson = drawnItems.toGeoJSON();
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      alert('No AOIs to export. Draw one or import first.');
      return;
    }
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aoi-${Date.now()}.geojson`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importAoIs(file) {
    const reader = new FileReader();
    reader.onload = function onFileLoad() {
      try {
        const gj = JSON.parse(String(reader.result));
        const layer = L.geoJSON(gj, {
          style: { color: '#16a34a', weight: 2 },
          onEachFeature: function (_feature, lyr) {
            bindAreaPopupIfPolygon(lyr);
          },
        });
        drawnItems.addLayer(layer);
        try {
          map.fitBounds(layer.getBounds(), { padding: [16, 16] });
        } catch (e) {
          /* ignore */
        }
      } catch (err) {
        alert('Invalid GeoJSON file.');
      }
    };
    reader.readAsText(file);
  }

  exportButton.addEventListener('click', exportAoIs);
  importButton.addEventListener('click', function () { importInput.click(); });
  importInput.addEventListener('change', function () {
    const file = importInput.files && importInput.files[0];
    if (file) importAoIs(file);
    importInput.value = '';
  });
  clearButton.addEventListener('click', function () { drawnItems.clearLayers(); });

  let currentLayerId = layerSelect.value;
  let currentDateIso = toIsoDateString(getDefaultGibsDate());
  const maxDateIso = toIsoDateString(getMaxSelectableDate());

  dateInput.value = currentDateIso;
  dateInput.max = maxDateIso;
  dateInput.min = '2000-01-01';

  const gibsOverlay = L.tileLayer(buildGibsUrl(currentLayerId, currentDateIso), {
    opacity: Number(opacitySlider.value),
    tileSize: 256,
    maxZoom: 9,
    attribution: 'Imagery: NASA Global Imagery Browse Services (GIBS)',
  }).addTo(map);

  updateStatusText(currentLayerId, currentDateIso);

  function setDateAndRefresh(newIso) {
    currentDateIso = newIso;
    dateInput.value = newIso;
    gibsOverlay.setUrl(buildGibsUrl(currentLayerId, currentDateIso));
    updateStatusText(currentLayerId, currentDateIso);
  }

  function shiftDateBy(days) {
    const d = parseInputDate(currentDateIso);
    d.setDate(d.getDate() + days);
    let iso = toIsoDateString(d);
    if (iso > maxDateIso) iso = maxDateIso;
    setDateAndRefresh(iso);
  }

  layerSelect.addEventListener('change', function () {
    currentLayerId = layerSelect.value;
    gibsOverlay.setUrl(buildGibsUrl(currentLayerId, currentDateIso));
    updateStatusText(currentLayerId, currentDateIso);
  });

  opacitySlider.addEventListener('input', function () {
    gibsOverlay.setOpacity(Number(opacitySlider.value));
  });

  dateInput.addEventListener('change', function () {
    const val = dateInput.value;
    if (!val) return;
    if (val > maxDateIso) {
      setDateAndRefresh(maxDateIso);
    } else {
      setDateAndRefresh(val);
    }
  });

  datePrevButton.addEventListener('click', function () { shiftDateBy(-1); });
  dateNextButton.addEventListener('click', function () { shiftDateBy(1); });
})();