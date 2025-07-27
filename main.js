// Debug check
console.log("Main.js loaded!");

// 🌍 Initialize the map (same coords as your HTML)
const map = L.map('map').setView([43.7803, -79.417], 18);

// 🗺️ Add OpenStreetMap base layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

// Initialize layer variables
let buildingsLayer, streetsLayer, businessLayer;

// Buffer analysis variables
let bufferLayer = null;
let highlightedLayer = null;
let lastClickedBusiness = null;
let userMarker = null;

// Set for tracking active business filters
const filterBusinessTypes = new Set(['pharmacy', 'restaurant', 'store', 'coffeeshop', 'print_shop', 'bank']);

// Business stats and chart variables
let businessCounts = {};
let chartInstance = null;
let currentChartType = 'pie';

// Business Icons Configuration
const businessIcons = {
  pharmacy: L.icon({
    iconUrl: '/images/prescription-bottle-medical-solid.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  restaurant: L.icon({
    iconUrl: './images/restaurant.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  store: L.icon({
    iconUrl: '/images/cash-register-solid.svg',
    iconSize: [24, 24],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  coffeeshop: L.icon({
    iconUrl: '/images/mug-hot-solid.svg',
    iconSize: [24, 24],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  print_shop: L.icon({
    iconUrl: '/images/print-solid.svg',
    iconSize: [24, 24],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  bank: L.icon({
    iconUrl: '/images/building-columns-solid.svg',
    iconSize: [24, 24],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  default: L.icon({
    iconUrl: '/images/mug-hot-solid.svg',
    iconSize: [24, 24],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  }),
  highlighted: L.icon({
    iconUrl: '/images/star-solid.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  })
};

// 🛣️ Load and style Streets layer
fetch('/data/Streets_GeoJson.geojson')
  .then(res => {
    if (!res.ok) throw new Error('Failed to load streets');
    return res.json();
  })
  .then(data => {
    streetsLayer = L.geoJSON(data, {
      style: {
        color: '#333',
        weight: 3,
        opacity: 0.8
      }
    }).addTo(map);
  })
  .catch(err => console.error('Street layer error:', err));

// 🏢 Load and style Buildings layer
fetch('/data/Buildings.geojson')
  .then(res => res.json())
  .then(data => {
    buildingsLayer = L.geoJSON(data, {
      style: {
        color: 'blue',
        weight: 1,
        fillColor: 'lightblue',
        fillOpacity: 0.5
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.name) {
          layer.bindPopup(`Building: ${feature.properties.name}`);
        }
      }
    }).addTo(map);
  })
  .catch(err => console.error('Building layer error:', err));

function clearBufferAnalysis() {
  if (bufferLayer) {
    map.removeLayer(bufferLayer);
    bufferLayer = null;
  }
  if (highlightedLayer) {
    map.removeLayer(highlightedLayer);
    highlightedLayer = null;
  }
  if (lastClickedBusiness) {
    const type = lastClickedBusiness.feature.properties?.type?.toLowerCase() || 'default';
    const icon = businessIcons[type] || businessIcons.default;
    lastClickedBusiness.setIcon(icon);
    
    const name = lastClickedBusiness.feature.properties?.name || "Business";
    const typeName = lastClickedBusiness.feature.properties?.type || "Unknown";
    lastClickedBusiness.setPopupContent(`<strong>${name}</strong><br>Type: ${typeName}`);
    
    lastClickedBusiness = null;
  }
}

function performBufferAnalysis(layer) {
  // Clear existing analysis first
  clearBufferAnalysis();

  const clickedPoint = turf.point([layer.getLatLng().lng, layer.getLatLng().lat]);
  const buffer = turf.buffer(clickedPoint, 0.05, { units: 'kilometers' });

  bufferLayer = L.geoJSON(buffer, {
    style: {
      color: '#3388ff',
      weight: 2,
      fillColor: '#3388ff',
      fillOpacity: 0.2
    }
  }).addTo(map);

  const nearbyFeatures = [];
  businessLayer.eachLayer(biz => {
    if (biz !== layer && biz.getLatLng) {
      const bizPoint = turf.point([biz.getLatLng().lng, biz.getLatLng().lat]);
      if (turf.booleanPointInPolygon(bizPoint, buffer)) {
        nearbyFeatures.push(biz.feature);
      }
    }
  });

  highlightedLayer = L.geoJSON({
    type: "FeatureCollection",
    features: nearbyFeatures
  }, {
    pointToLayer: (feature, latlng) => {
      return L.circleMarker(latlng, {
        radius: 8,
        color: '#ff7800',
        weight: 1,
        fillColor: '#ffd42a',
        fillOpacity: 0.8,
        className: 'highlighted-business'
      });
    },
    onEachFeature: (feature, layer) => {
      const name = feature.properties?.name || "Nearby Business";
      const type = feature.properties?.type || "Unknown";
      layer.bindPopup(`<strong>${name}</strong><br>Type: ${type}<br><em>Within 50m radius</em>`);
    }
  }).addTo(map);

  // Set star icon - added error handling
  try {
    layer.setIcon(businessIcons.highlighted);
    console.log('Star icon set successfully');
  } catch (e) {
    console.error('Error setting star icon:', e);
  }

  const name = layer.feature.properties?.name || "Business";
  const type = layer.feature.properties?.type || "Unknown";
  layer.setPopupContent(`
    <strong>${name}</strong><br>
    Type: ${type}<br>
    <strong>${nearbyFeatures.length}</strong> nearby businesses within 50m
    <div style="font-size: smaller; color: #666;">Click again to clear</div>
  `);
  layer.openPopup();
  
  lastClickedBusiness = layer;
}

function drawBusinessChart() {
  const ctx = document.getElementById('business-chart');
  if (!ctx) {
    console.error('Chart canvas not found');
    return;
  }

  if (chartInstance) {
    chartInstance.destroy();
  }

  const labels = Object.keys(businessCounts).map(type => 
    type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '));
  const values = Object.values(businessCounts);
  
  const colors = [
    '#4CAF50', '#2196F3', '#FFC107', '#FF5722', 
    '#9C27B0', '#607D8B', '#00BCD4', '#8BC34A'
  ];

  const commonConfig = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.raw || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = Math.round((value / total) * 100);
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  const config = {
    type: currentChartType,
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 1
      }]
    },
    options: {
      ...commonConfig,
      plugins: {
        ...commonConfig.plugins,
        legend: {
          display: currentChartType === 'pie',
          position: 'right',
          labels: {
            boxWidth: 12,
            padding: 10,
            usePointStyle: true
          }
        }
      }
    }
  };

  if (currentChartType === 'bar') {
    config.options.indexAxis = 'y';
    config.options.scales = {
      x: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          stepSize: 1
        }
      }
    };
  }

  chartInstance = new Chart(ctx, config);

  const toggleBtn = document.getElementById('toggleChartType');
  if (toggleBtn) {
    toggleBtn.textContent = currentChartType === 'pie' 
      ? '🔄 Switch to Bar Chart' 
      : '🔄 Switch to Pie Chart';
  }
}

function loadBusinessLayer() {
  fetch('/data/Business_GeoJson.geojson')
    .then(res => res.json())
    .then(data => {
      if (businessLayer && map.hasLayer(businessLayer)) {
        map.removeLayer(businessLayer);
      }
      
      businessCounts = {};
      const filteredFeatures = data.features.filter(feature => {
        const type = feature.properties?.type?.toLowerCase();
        return filterBusinessTypes.has(type);
      });
      
      filteredFeatures.forEach(feature => {
        const type = feature.properties?.type?.toLowerCase() || 'default';
        businessCounts[type] = (businessCounts[type] || 0) + 1;
      });
      
      businessLayer = L.geoJSON(filteredFeatures, {
        pointToLayer: (feature, latlng) => {
          const type = feature.properties?.type?.toLowerCase() || 'default';
          const icon = businessIcons[type] || businessIcons.default;
          return L.marker(latlng, { 
            icon: icon,
            title: feature.properties?.name || "Business"
          });
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.name || "Business";
          const type = feature.properties?.type || "Unknown";
          layer.bindPopup(`<strong>${name}</strong><br>Type: ${type}`);
          
          layer.on('click', function(e) {
            if (lastClickedBusiness === layer) {
              clearBufferAnalysis();
              return;
            }
            clearBufferAnalysis();
            lastClickedBusiness = layer;
            performBufferAnalysis(layer);
          });
        }
      });
      
      if (document.getElementById('toggleBusinesses').checked) {
        businessLayer.addTo(map);
      }
      
      drawBusinessChart();
    })
    .catch(err => console.error('Business layer error:', err));
}

// Initial load
loadBusinessLayer();

// Event listeners
document.getElementById('toggleStreets').addEventListener('change', e => {
  e.target.checked ? streetsLayer.addTo(map) : map.removeLayer(streetsLayer);
});

document.getElementById('toggleBuildings').addEventListener('change', e => {
  e.target.checked ? buildingsLayer.addTo(map) : map.removeLayer(buildingsLayer);
});

document.getElementById('toggleBusinesses').addEventListener('change', e => {
  if (e.target.checked) {
    if (businessLayer && !map.hasLayer(businessLayer)) {
      businessLayer.addTo(map);
    }
  } else {
    if (businessLayer && map.hasLayer(businessLayer)) {
      map.removeLayer(businessLayer);
    }
    clearBufferAnalysis();
  }
});

document.querySelectorAll('.biz-filter').forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    const type = checkbox.dataset.type.toLowerCase();
    checkbox.checked ? filterBusinessTypes.add(type) : filterBusinessTypes.delete(type);
    loadBusinessLayer();
    clearBufferAnalysis();
  });
});

document.getElementById('btnNearest').addEventListener('click', () => {
  if (!businessLayer || !document.getElementById('toggleBusinesses').checked) {
    alert('Please enable businesses layer first!');
    return;
  }

  alert('Please click on the map to specify your current location');
  
  if (userMarker) {
    map.removeLayer(userMarker);
    userMarker = null;
  }
  
  clearBufferAnalysis();
  
  const userClickHandler = map.on('click', (e) => {
    if (userMarker) map.removeLayer(userMarker);
    
    userMarker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'user-location-icon',
        html: '📍',
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      })
    }).addTo(map);
    
    userMarker.bindPopup('Your location').openPopup();
    
    let nearestBusiness = null;
    let minDistance = Infinity;
    
    businessLayer.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        const distance = e.latlng.distanceTo(layer.getLatLng());
        if (distance < minDistance) {
          minDistance = distance;
          nearestBusiness = layer;
        }
      }
    });
    
    if (nearestBusiness) {
      nearestBusiness.setIcon(businessIcons.highlighted);
      
      const name = nearestBusiness.feature.properties?.name || "Business";
      const type = nearestBusiness.feature.properties?.type || "Unknown";
      nearestBusiness.setPopupContent(
        `<strong>${name}</strong><br>
         Type: ${type}<br>
         <strong>Distance:</strong> ${Math.round(minDistance)}m (${(minDistance/1000).toFixed(2)}km)<br>
         <em>Nearest to your location</em>`
      );
      nearestBusiness.openPopup();
      map.setView(nearestBusiness.getLatLng(), 18);
    }
    
    map.off('click', userClickHandler);
  });
});

document.getElementById('btnClearBuffer').addEventListener('click', clearBufferAnalysis);

document.getElementById('toggleChartType').addEventListener('click', function() {
  currentChartType = currentChartType === 'pie' ? 'bar' : 'pie';
  drawBusinessChart();
});

setTimeout(() => {
  map.invalidateSize();
  console.log("Map initialized at:", map.getCenter());
}, 500);