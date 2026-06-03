// ====================================================================
// 1. DEFINE AND DISPLAY THE MODAL POP-UP (SPLASH SCREEN)
// ====================================================================

// Define the style for the modal: centered, with a distinct look.
var modalStyle = {
  // Use 'top-center' to position it clearly on the screen.
  position: 'top-center', 
  padding: '20px',
  border: '3px solid darkred',
  backgroundColor: 'white',
  width: '450px',
  // Ensure it is visible by default when the app loads.
  shown: true 
};

// Create the button that the user must click to dismiss the modal.
var closeButton = ui.Button({
  label: 'I Understand and Accept',
  style: {stretch: 'horizontal'},
  onClick: function() {
    // 1. Hide the modal panel.
    modalPanel.style().set('shown', false);
    
    // 2. Re-enable map controls so the user can interact.
    Map.setControlVisibility(true, true, true, true, true);
  }
});

// Create the content for the modal.
var modalContent = [
  ui.Label('⚠️ Official Data Release Policy', {
    fontWeight: 'bold', 
    fontSize: '18px', 
    color: 'darkred',
    textAlign: 'center'
  }),
  ui.Label({
    value: 'Results are not final and currently under review. Embargo on external sharing until the Children Climate Risk Report (CCRR) global release.',
    style: {whiteSpace: 'pre-wrap', margin: '15px 0', textAlign: 'center'}
  }),
  closeButton
];

// Create the final modal panel.
var modalPanel = ui.Panel({
  widgets: modalContent,
  style: modalStyle
});

// Add the panel to the root of the UI.
ui.root.add(modalPanel);


// ====================================================================
// 2. CONFIGURE THE MAP (AND TEMPORARILY DISABLE INTERACTION)
// ====================================================================

// By default, hide all map controls (zoom, layer selector, scale bar)
// until the user accepts the terms by clicking the button.
Map.setControlVisibility(false, false, false, false, false);

// Set a default center for your map.
Map.setCenter(0, 0, 2); 

// (Optional) Add your initial data layers here. They will load in the background.
// Map.addLayer(ee.Image(...), {...}, 'Your Initial Layer');


// === Set Map Options ===

// Define base map style.
var basemapStyle = [
    {
        "featureType": "all",
        "elementType": "geometry.fill",
        "stylers": [ { "weight": "2.00" } ]
    },
    {
        "featureType": "all",
        "elementType": "geometry.stroke",
        "stylers": [ { "color": "#9c9c9c" } ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text",
        "stylers": [ { "visibility": "on" } ]
    },
    {
        "featureType": "landscape",
        "elementType": "all",
        "stylers": [ { "color": "#f2f2f2" } ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry.fill",
        "stylers": [ { "color": "#ffffff" } ]
    },
    {
        "featureType": "landscape.man_made",
        "elementType": "geometry.fill",
        "stylers": [ { "color": "#ffffff" } ]
    },
    {
        "featureType": "poi",
        "elementType": "all",
        "stylers": [ { "visibility": "off" } ]
    },
    {
        "featureType": "road",
        "elementType": "all",
        "stylers": [ { "saturation": -100 }, { "lightness": 45 } ]
    },
    {
        "featureType": "road",
        "elementType": "geometry.fill",
        "stylers": [ { "color": "#eeeeee" } ]
    },
    {
        "featureType": "road",
        "elementType": "labels.text.fill",
        "stylers": [ { "color": "#7b7b7b" } ]
    },
    {
        "featureType": "road",
        "elementType": "labels.text.stroke",
        "stylers": [ { "color": "#ffffff" } ]
    },
    {
        "featureType": "road.highway",
        "elementType": "all",
        "stylers": [ { "visibility": "simplified" } ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "labels.icon",
        "stylers": [ { "visibility": "off" } ]
    },
    {
        "featureType": "transit",
        "elementType": "all",
        "stylers": [ { "visibility": "off" } ]
    },
    {
        "featureType": "water",
        "elementType": "all",
        "stylers": [ { "color": "#46bcec" }, { "visibility": "on" } ]
    },
    {
        "featureType": "water",
        "elementType": "geometry.fill",
        "stylers": [ { "color": "#c8d7d4" } ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text.fill",
        "stylers": [ { "color": "#070707" } ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text.stroke",
        "stylers": [ { "color": "#ffffff" } ]
    }
];

Map.setOptions('Base', {
    Base: basemapStyle
});
Map.setControlVisibility({layerList: true});
Map.setCenter(0, 0, 2);
var DefaultOpacity = 0.5;

// === Load core layers ===
var org_childpop = ee.ImageCollection("projects/unicef-ccri/assets/population/worldpop_T_U18_2025_CN_100m");
var childpop = org_childpop.mosaic().select(0).rename('population');

var org_childpop_m = ee.ImageCollection("projects/unicef-ccri/assets/population/worldpop_T_M_U18_2025_CN_100m");
var childpop_m = org_childpop_m.mosaic().select(0).rename('population_m');

var org_childpop_f = ee.ImageCollection("projects/unicef-ccri/assets/population/worldpop_T_F_U18_2025_CN_100m");
var childpop_f = org_childpop_f.mosaic().select(0).rename('population_f');


var pop_target_res = org_childpop.first().projection().nominalScale();
var countryBoundaries = ee.FeatureCollection('projects/unicef-ccri/assets/misc_boundaries/adm0_simple');
var referenceImage = ee.Image("projects/unicef-ccri/assets/hazards/heatwave_frequency_return_level_100yr");
var targetScale = referenceImage.projection().nominalScale();
var targetCRS = referenceImage.projection();

// === Define global geometry ===
var global_geometry = ee.Geometry.Polygon(
  [[[-180, 90], [-180, -90], [180, -90], [180, 90]]], null, false
);

// === Reproject country boundaries ===
var countryBoundariesReprojected = countryBoundaries.map(function(feature) {
  return feature.transform(targetCRS);
});

// --- Admin Level Configuration ---
var adminData = {
  'adm0 (Country)':           {asset: 'projects/unicef-ccri/assets/global_boundary/admin0_regions_merged', nameProp: 'name', chunkAsset: 'projects/unicef-ccri/assets/global_boundary/adm0_chunked_500km_shp'},
  'adm1 (Provinces/States)':  {asset: 'projects/unicef-ccri/assets/global_boundary/adm1',                  nameProp: 'name', chunkAsset: 'projects/unicef-ccri/assets/global_boundary/adm1_chunked_500km_shp'},
  'adm2 (Districts/Counties)':{asset: 'projects/unicef-ccri/assets/global_boundary/adm2',                  nameProp: 'name', chunkAsset: 'projects/unicef-ccri/assets/global_boundary/adm2_chunked_500km_shp'}
};

// === Define hazard metadata ===
var hazards = [
  {"id": "projects/unicef-ccri/assets/hazards/river_flood_r100",                         "threshold": 0.01,                "name": "river_flood_100yr_jrc_2024",         "type": "Collection"},
  {"id": "projects/unicef-ccri/assets/hazards/coastal_flood_r100",                        "threshold": 0,                   "name": "coastal_flood_100yr_jrc_2024",       "type": "Collection"},
  {"id": "projects/unicef-ccri/assets/hazards/storm_giri_rp100",                          "threshold": 17.5,                "name": "tropical_storm_100yr_giri_2024",     "type": "Collection"},
  {"id": "projects/unicef-ccri/assets/hazards/ASI_return_level_100yr",                    "threshold": 30,                  "name": "agricultural_drought_fao_1984-2023", "type": "Image"},
  {"id": "projects/unicef-ccri/assets/droughts/spei12_TerraClimate_1958-2025",            "band": "b2", "threshold": 0.0650162152126539, "name": "drought_spei_terraclimate_1958-2025", "type": "Image"},
  {"id": "projects/unicef-ccri/assets/droughts/spi12_TerraClimate_1958-2025",             "band": "b2", "threshold": 0.0912838950900999, "name": "drought_spi_terraclimate_1958-2025",  "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/heatwave_frequency_return_level_100yr",     "threshold": 16.02,               "name": "heatwave_frequency_ecmwf_2014-2024", "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/heatwave_duration_return_level_100yr",      "threshold": 94.01,               "name": "heatwave_duration_ecmwf_2014-2024",  "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/heatwave_severity_return_level_100yr",      "threshold": 3.66,                "name": "heatwave_severity_ecmwf_2014-2024",  "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/high_temp_degree_days_return_level_100yr",  "threshold": 35,                  "name": "extreme_heat_ecmwf_2014-2024",       "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/FIRMS_FRP_90th_percentile",                 "threshold": 37.89,               "name": "fire_FRP_nasa_2001-2024",            "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/FIRMS_count_90th_percentile",               "threshold": 4.91,                "name": "fire_frequency_nasa_2001-2023",      "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/sand_dust_storm_annual",                    "threshold": 0,                   "name": "sand_dust_storm_unccd_2024",         "type": "Image", "no_data": -999000000},
  {"id": "projects/unicef-ccri/assets/hazards/pm25_p90_1998_2023",                        "threshold": 5,                   "name": "air_pollution_pm25_1998-2023",       "type": "Image"},
  {"id": "projects/unicef-ccri/assets/hazards/Pv_average_2013_2022",                      "threshold": 0.001,               "name": "vectorborne_malariapv_2012-2022",    "type": "Image", "no_data": -9999},
  {"id": "projects/unicef-ccri/assets/hazards/Pf_average_2013_2022",                      "threshold": 0.001,               "name": "vectorborne_malariapf_2012-2022",    "type": "Image", "no_data": -9999},
];

// === Group hazards into topics ===
var hazardTopics = {
  'River Flood':        ["river_flood_100yr_jrc_2024"],
  'Coastal Flood':      ["coastal_flood_100yr_jrc_2024"],
  'Tropical Storm':     ["tropical_storm_100yr_giri_2024"],
  'Drought':            ["agricultural_drought_fao_1984-2023", "drought_spei_terraclimate_1958-2025", "drought_spi_terraclimate_1958-2025"],
  'Heatwave':           ["heatwave_frequency_ecmwf_2014-2024", "heatwave_duration_ecmwf_2014-2024", "heatwave_severity_ecmwf_2014-2024"],
  'Extreme Heat':       ["extreme_heat_ecmwf_2014-2024"],
  'Fire':               ["fire_FRP_nasa_2001-2024", "fire_frequency_nasa_2001-2023"],
  'Sand and Dust Storm':["sand_dust_storm_unccd_2024"],
  'Air Pollution':      ["air_pollution_pm25_1998-2023"],
  'Malaria':            ["vectorborne_malariapv_2012-2022", "vectorborne_malariapf_2012-2022"]
};

var allowNegative = [];  // SPI/SPEI now use probability layers (0–1); threshold is positive

var hazardMap = {};
hazards.forEach(function(h) {
  hazardMap[h.name] = h;
});

function getHazardImageAndVis(hazardName, callback) {
  //print(hazardName);
  var hazard = hazardMap[hazardName];
  if (!hazard) return;

  var image = hazard.type === 'Collection'
    ? ee.ImageCollection(hazard.id).mosaic()
    : ee.Image(hazard.id);
  if (hazard.band) { image = image.select(hazard.band); }

  if (hazard.no_data !== undefined) {
    image = image.updateMask(image.neq(hazard.no_data));
  } else {
    image = image.updateMask(image.gt(-1000));
  }

  image.bandNames().get(0).evaluate(function(bandName) {
    if (hazard.name.indexOf('coastal_flood') !== -1) {
      callback(image, {
        min: 0,
        max: 1,
        palette: ['#ffffff', '#084081']  // white = no risk, blue = risk
      });
      return;
    }
    if (!bandName) {
      print('⚠️ No band found for', hazardName);
      return;
    }

    // Use native resolution here
    image.reduceRegion({
      reducer: ee.Reducer.percentile([2, 98]),
      geometry: global_geometry,
      scale: image.projection().nominalScale(),  // ✅ Use native resolution
      bestEffort: true,
      maxPixels: 1e13
    }).evaluate(function(stats) {
      if (!stats || stats[bandName + '_p2'] === null || stats[bandName + '_p98'] === null) {
        print('⚠️ Failed to compute stats for', hazardName, '— using fallback values');
        callback(image, {
          min: 0,
          max: 1,
          palette: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026']
        });
        return;
      }

      var p2 = stats[bandName + '_p2'];
      var p98 = stats[bandName + '_p98'];
      
      var min = allowNegative.indexOf(hazardName) !== -1 ? p2 : Math.max(0, p2);

      var visParams = {
        min: min,
        max: p98,
        palette: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026']
      };

      callback(image, visParams);
    });
  });
}



// === Function to summarize population exposure ===
function summarizePopulation(hazard) {
  var hazard_layer = hazard.type === 'Collection'
    ? ee.ImageCollection(hazard.id).mosaic()
    : ee.Image(hazard.id);
  if (hazard.band) { hazard_layer = hazard_layer.select(hazard.band); }
  if (hazard.no_data !== undefined) { hazard_layer = hazard_layer.updateMask(hazard_layer.neq(hazard.no_data)); }

  var landSeaMask = ee.Image(1)
    .clip(countryBoundariesReprojected)
    .unmask(0)
    .reproject({crs: targetCRS, scale: targetScale});

  var TH = hazard.threshold;
  if (TH === 'Mean') {
    var masked = hazard_layer.updateMask(landSeaMask);
    TH = ee.Number(masked.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: global_geometry,
      scale: hazard_layer.projection().nominalScale(),
      bestEffort: true
    }).values().get(0));
    print(hazard.name);
    print(TH);
  }

  var exposed_population;
  if (hazard.name === "agricultural_drought_fao_1984-2023") {
    hazard_layer = hazard_layer.updateMask(hazard_layer.lte(100));
    exposed_population = childpop.updateMask(hazard_layer.gt(TH));
  } else {
    if (TH < 0) {
      exposed_population = childpop.updateMask(hazard_layer.lt(TH));
    } else {
      exposed_population = childpop.updateMask(hazard_layer.gt(TH));
    }
  }
  return exposed_population.rename(hazard.name);
}


// === Precompute exposure masks for each hazard ===
var exposureByHazardName = {};
hazards.forEach(function(h) {
  exposureByHazardName[h.name] = summarizePopulation(h);
});

// === Combine masks by topic using union ===
var topicExposureImages = [];
// THIS IS THE SINGLE, CONSISTENT COLOR DICTIONARY
var topicColors = {
  'River Flood': '#1f78b4',
  'Coastal Flood': '#a6cee3',
  'Tropical Storm': '#33a02c',
  'Drought': '#ff7f00',
  'Heatwave': '#e31a1c',
  'Extreme Heat': '#6a3d9a',
  'Fire': '#fb9a99',
  'Sand and Dust Storm': '#b15928',
  'Air Pollution': '#cab2d6',
  'Malaria': '#b2df8a',
  'Multi Hazard Count': '#800026',
  'Multi Hazard Intensity': '#c63a26'
};

var topicMasks = {};
Object.keys(hazardTopics).forEach(function(topic) {
  var masks = hazardTopics[topic].map(function(name) {
    return exposureByHazardName[name].mask();
  });
  var unionMask = masks.reduce(function(acc, m) {
    return acc.or(m);
  });
  topicMasks[topic] = ee.Image.constant(1).updateMask(unionMask);

  var exposureImage = ee.Image.constant(1).updateMask(unionMask).rename(topic);
  topicExposureImages.push(exposureImage);
  Map.addLayer(exposureImage, {palette: [topicColors[topic]], min: 0, max: 1}, topic, false, DefaultOpacity);
});

var topicMasksArray = Object.keys(topicMasks).map(function(key){
  return topicMasks[key];
});
var stacked = ee.ImageCollection(topicMasksArray).toBands();
var topicCountImage = stacked.reduce(ee.Reducer.count()).rename('topic_count');

// === Precompute topic-level hazard data coverage (raw mask, no threshold) ===
// Used to distinguish 'no data' (hazard has no pixels here) from
// '0 exposure' (hazard exists but no children above threshold).
function getHazardRawMask(hazard) {
  var layer = hazard.type === 'Collection'
    ? ee.ImageCollection(hazard.id).mosaic()
    : ee.Image(hazard.id);
  if (hazard.band) { layer = layer.select(hazard.band); }
  return layer.mask();
}

var topicCoverageImages = {};
Object.keys(hazardTopics).forEach(function(topic) {
  var coverages = hazardTopics[topic].map(function(name) {
    var hazard = hazardMap[name];
    return hazard ? getHazardRawMask(hazard) : ee.Image.constant(0);
  });
  var union = coverages.reduce(function(acc, c) { return acc.or(c); });
  // Rename with a safe key (no spaces) so band names are reliable
  topicCoverageImages[topic] = ee.Image.constant(1).updateMask(union)
      .rename('cov_' + topic.replace(/[^a-zA-Z0-9]/g, '_'));
});

// ---
// UI Panel on the Right
// ---

// ==================================================================================
// === Helper Function to Create Color Bar Legends ==================================
// ==================================================================================
function makeColorBar(palette, labels) {
  var gradient = ee.Image.pixelCoordinates({ projection: 'EPSG:4326' }).select('x');
  var colorBar = ui.Thumbnail({
    image: gradient,
    params: {
      bbox: [0, 0, 1, 0.1], crs: 'EPSG:4326',
      min: 0, max: 1, palette: palette,
    },
    style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'},
  });
  var legendLabels = ui.Panel({
    widgets: labels.map(function(label, index) {
      var H_ALIGN = index === 0 ? 'left' : (index === labels.length - 1 ? 'right' : 'center');
      return ui.Label(label, {margin: '4px 8px', textAlign: H_ALIGN, stretch: 'horizontal'});
    }),
    layout: ui.Panel.Layout.flow('horizontal')
  });
  return ui.Panel([colorBar, legendLabels]);
}


// ==================================================================================
// === UI Panel Setup and Logic =====================================================
// ==================================================================================

// --- Panel Initialization ---
var rightPanel = ui.Panel({
  style: { position: 'top-left', width: '300px', padding: '8px', backgroundColor: 'white' }
});

// ==================================================================================
// --- Section 1: Show Topic Layer ---
// ==================================================================================
var topicCountLayerName = "Multi Hazard Count";
var pixelScoreLayerName = "Multi Hazard Intensity";
var topicSelectorItems = Object.keys(hazardTopics);
topicSelectorItems.push(topicCountLayerName, pixelScoreLayerName);

var activeLayer = null;
rightPanel.add(ui.Label('Hazard Layers', { fontWeight: 'bold' }));
var mainLegendContainer = ui.Panel({ style: { padding: '4px 0 0 0' }});

var hazardNames = hazards
  .map(function(h) { return h.name; });

var separator = '──────────';  // Or something like '------ Group ------'

// Build the dropdown items with group dividers
var topicSelectorItems = []
  .concat([separator + " Childrens' exposure to hazards"])    
  .concat(Object.keys(hazardTopics))            // Group 1: Topic masks
  .concat([separator + ' Multi Hazard Layers'])       // Divider
  .concat([topicCountLayerName, pixelScoreLayerName])  // Group 2: Summary layers
  .concat([separator + ' Hazard Intensity'])  // Divider
  .concat(hazardNames);         

var topicSelector = ui.Select({
  items: topicSelectorItems,
  placeholder: 'Select a hazard layer',
  onChange: function(selected) {
    // 1. Initial State Reset
    if (activeLayer !== null) Map.remove(activeLayer);
    mainLegendContainer.clear();
    if (!selected) return;

    var isTopic = hazardTopics[selected] !== undefined;

    // 2. Handle Thematic Topic Layers
    if (isTopic) {
      var selectedColor = topicColors[selected];
      activeLayer = Map.addLayer(topicMasks[selected], {palette: [selectedColor], min: 0, max: 1}, selected, true, DefaultOpacity);

      var colorBox = ui.Label('', { backgroundColor: selectedColor, padding: '8px', margin: '0 8px 0 0', border: '1px solid #ccc'});
      var label = ui.Label(selected, {margin: '4px 0 0 0'});
      var simpleLegend = ui.Panel([colorBox, label], ui.Panel.Layout.Flow('horizontal'));
      mainLegendContainer.add(simpleLegend);

    // 3. Handle Aggregated Count Layers
    } else if (selected === topicCountLayerName) {
      var maxCount = Object.keys(hazardTopics).length;
      var visParams = {min: 0, max: maxCount, palette: ['#ffffd4', '#fed98e', '#fe9929', '#d95f0e', '#993404']};
      activeLayer = Map.addLayer(topicCountImage, visParams, selected, true, DefaultOpacity);
      mainLegendContainer.add(makeColorBar(visParams.palette, ['(' + visParams.min + ')', '(' + visParams.max + ')']));

    // 4. Handle Risk Index / Pixel Score Layers
    } else if (selected === pixelScoreLayerName) {
      var visParams = {min: 0, max: 10, palette: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d']};
      activeLayer = Map.addLayer(ee.Image("projects/unicef-ccri/assets/hazards/MHI_climate"), visParams, selected, true, DefaultOpacity);
      mainLegendContainer.add(makeColorBar(visParams.palette, ['Low (0)', 'High (10)']));

    // 5. Handle Individual Hazard Layers (Asynchronous Callback)
    } else {
      getHazardImageAndVis(selected, function(image, visParams) {
        if (activeLayer) Map.remove(activeLayer);

        // --- Palette Assignment Logic ---
        if (selected == 'river_flood_100yr_jrc_2024') {
            visParams.palette = ['#cfe8ff', '#8fcbff', '#1d7bff', '#0654be', '#00357d'];
        } else if (selected == 'coastal_flood_100yr_jrc_2024') {
            visParams.palette = ['#ffffff', '#084081'];
        } else if (selected == 'tropical_storm_100yr_giri_2024') {
            visParams.palette = ['#e4eff2', '#c3dce7', '#9ebdd2', '#7e8ab0', '#6d6c91'];
        } else if (selected == 'agricultural_drought_fao_1984-2023') {
            visParams.palette = ['#fdf4cb', '#fbd992', '#f3b431', '#c66216', '#843d09'];
        } else if (selected == 'drought_spei_terraclimate_1958-2025' || selected == 'drought_spi_terraclimate_1958-2025') {
            visParams.palette = ['#fdf4cb', '#fbd992', '#f3b431', '#c66216', '#843d09'];
        } else if (selected.indexOf('heatwave') !== -1 || selected === 'extreme_heat_ecmwf_2014-2024') {
            visParams.palette = ['#f8e593', '#f8cc14', '#F89800', '#F86800', '#F83000'];
        } else if (selected.indexOf('fire') !== -1) {
            visParams.palette = ['#F0F0DC', '#FFD282', '#FF8C3C', '#DC3C1E', '#5A0000'];
        } else if (selected == 'sand_dust_storm_unccd_2024') {
            visParams.palette = ['#faf0dc', '#e6d2b4', '#c8aa82', '#a0785a', '#261f28'];
        } else if (selected == 'air_pollution_pm25_1998-2023') {
            visParams.palette = ['#d0dde5', '#99a1b4', '#7c6e87', '#5a4b5e', '#261f27'];
        } else if (selected.indexOf('vectorborne_malaria') !== -1) {
            visParams.palette = ['#e8f0e3', '#bcd4b4', '#8ba889', '#607c66', '#35503d'];
        }

        // --- Apply Masking for Transparency ---
        // We utilize .selfMask() to render 0 values as transparent for the Giri 2024 dataset.
        var finalImage = image;
        if (selected == 'tropical_storm_100yr_giri_2024' || selected == 'coastal_flood_100yr_jrc_2024' || selected.indexOf('heatwave') !== -1) {
            finalImage = image.selfMask();
        }

        activeLayer = Map.addLayer(finalImage, visParams, selected, true, DefaultOpacity);
        
        mainLegendContainer.clear();
        mainLegendContainer.add(makeColorBar(
          visParams.palette,
          ['Low (' + visParams.min.toFixed(2) + ')', 'High (' + visParams.max.toFixed(2) + ')']
        ));
      });
    }
  }
});
rightPanel.add(topicSelector);
rightPanel.add(mainLegendContainer); 


// ==================================================================================
// --- Section 2: Filter Dropdowns ---
// ==================================================================================
rightPanel.add(ui.Label('Multi Hazard Count', { fontWeight: 'bold', margin: '8px 0 0 0' }));
var topicDropdown = ui.Select({
  items: ee.List.sequence(1, Object.keys(hazardTopics).length).getInfo().map(String),
  placeholder: 'Select hazard count',
  onChange: function(value) {
    Map.layers().forEach(function(layer) {
      var name = layer.get('name');
      if (typeof name === 'string' && name.indexOf('≥') === 0) Map.remove(layer);
    });
    if (value) {
      var mask = topicCountImage.gte(ee.Number.parse(value)).selfMask();
      Map.addLayer(mask, {min: 1, max: 1, palette: ['#800026']}, '≥ ' + value + ' Topics', true, DefaultOpacity);
    }
  }
});
rightPanel.add(topicDropdown);
var topicCountLegend = ui.Panel([ui.Label('', {backgroundColor: '#800026', padding: '8px', margin: '0 8px 0 0', border: '1px solid #ccc'}), ui.Label('Areas with selected topic overlap', {margin: '4px 0 0 0'})], ui.Panel.Layout.Flow('horizontal'));
rightPanel.add(topicCountLegend);

rightPanel.add(ui.Label('Multi Hazard Intensity (≥ P)', {margin: '8px 0 0 0' }));
var pixelDropdown = ui.Select({
  items: ['75', '80', '85', '90', '95'],
  placeholder: 'Select percentile',
  onChange: function(percentileStr) {
    Map.layers().forEach(function(layer) {
      var name = layer.get('name');
      if (typeof name === 'string' && name.indexOf('Pixel Score ≥') === 0) Map.remove(layer);
    });
    if (percentileStr) {
      var percentile = ee.Number.parse(percentileStr);
      var hazardScore = ee.Image('projects/unicef-ccri/assets/hazards/MHI_climate');
      var landSeaMask = ee.Image(1).clip(countryBoundariesReprojected).unmask(0).reproject({crs: targetCRS, scale: targetScale});
      var maskedHazard = hazardScore.updateMask(landSeaMask);
      var threshold = maskedHazard.reduceRegion({
        reducer: ee.Reducer.percentile([percentile]),
        geometry: global_geometry,
        scale: hazardScore.projection().nominalScale(),
        bestEffort: true
      }).values().get(0);
      var hazardMask = hazardScore.gt(ee.Number(threshold)).selfMask();
      Map.addLayer(hazardMask, {palette: ['#c63a26']}, 'Pixel Score ≥ P' + percentileStr, true, DefaultOpacity);
    }
  }
});
rightPanel.add(pixelDropdown);
var hazardLegend = ui.Panel([ui.Label('', {backgroundColor: '#c63a26', padding: '8px', margin: '0 8px 0 0', border: '1px solid #ccc'}), ui.Label('Areas with hazard score ≥ P', {margin: '4px 0 0 0'})], ui.Panel.Layout.Flow('horizontal'));
rightPanel.add(hazardLegend);

// ==================================================================================
// --- Section 4: Admin Analysis ---
// ==================================================================================

// --- State variables ---
var activeAdminCollection = null;
var activeBoundaryLayer = null;
var activeClickedBoundaryLayer = null;
var activeNameProp = null;
var activeAdminLevel = null;

// --- UI Widgets ---
var adminLevelPanel = ui.Panel(); 
var summaryPanel = ui.Panel({style: {padding: '4px 8px'}});

rightPanel.add(ui.Panel({style: {backgroundColor: '#ddd', height: '1px', margin: '15px 5px'}}));
rightPanel.add(ui.Label('Summary', {fontWeight: 'bold'}));
rightPanel.add(ui.Label('1. Select a country.', {color: 'gray'}));

// --- Country Selector (Top Level) ---
var countryNames = ee.FeatureCollection(adminData['adm0 (Country)'].asset).aggregate_array('name').sort();
countryNames.evaluate(function(names) {
  var countrySelector = ui.Select({
    items: names,
    placeholder: 'Select a country...',
    onChange: onCountrySelect
  });
  rightPanel.add(countrySelector);
  rightPanel.add(adminLevelPanel);
  rightPanel.add(summaryPanel);
});

// --- Main onChange Handlers ---
// --- Main onChange Handlers ---
function onCountrySelect(countryName) {
  // Clear everything from previous selections
  adminLevelPanel.clear();
  summaryPanel.clear();
  if (activeBoundaryLayer) Map.remove(activeBoundaryLayer);
  if (activeClickedBoundaryLayer) Map.remove(activeClickedBoundaryLayer);
  
  if (!countryName) return;

  // FIX: Create a server-side collection to style to avoid serialization size limits
  var countryCollection = ee.FeatureCollection(adminData['adm0 (Country)'].asset)
    .filter(ee.Filter.eq('name', countryName));

  var countryFeature = countryCollection.first();

  activeBoundaryLayer = Map.addLayer(
    countryCollection.style({color: 'black', width: 2, fillColor: '00000000'}),
    {},
    'Country Boundary'
  );
  
  Map.centerObject(countryCollection, 6);

  // Add the admin level selector for the chosen country
  adminLevelPanel.add(ui.Label('2. Select analysis level.', {color: 'gray'}));
  var levelOptions = ['Select admin level'].concat(Object.keys(adminData));
  var adminLevelSelector = ui.Select({
    items: levelOptions,
    value: 'Select admin level',
    onChange: function(level) {
      if (level === 'Select admin level') return;
      onAdminLevelSelect(level, countryFeature);
    }
  });
  adminLevelPanel.add(adminLevelSelector);
}

function onAdminLevelSelect(level, countryFeature) {
  summaryPanel.clear();
  if (activeBoundaryLayer) Map.remove(activeBoundaryLayer);
  if (activeClickedBoundaryLayer) Map.remove(activeClickedBoundaryLayer);
  
  if (!level) {
    activeAdminCollection = null;
    return;
  }
  
  activeNameProp = adminData[level].nameProp;
  activeAdminLevel = level;

  if (level === 'adm0 (Country)') {
    activeAdminCollection = ee.FeatureCollection(adminData[level].asset)
        .filter(ee.Filter.eq('name', countryFeature.get('name')));
    // Use chunked 500km tiles for adm0 to avoid memory issues with full country geometry.
    // Filter spatially so we don't depend on property name alignment between assets.
    // Evaluate ucode client-side so we can use it as a concrete filter value.
    // Passing countryFeature.get('ucode') directly as a server-side ee.ComputedObject
    // to ee.Filter.eq silently returns 0 results in GEE Apps.
    countryFeature.get('ucode').evaluate(function(ucode) {
      var countryChunks = ee.FeatureCollection(adminData[level].chunkAsset)
          .filter(ee.Filter.eq('ucode', ucode));
      // Tiles are pre-clipped to the country boundary, so no geometry clip is needed.
      runSummaryForFeature(countryFeature, activeAdminCollection, countryChunks);
    });
  } else {
    var countryUCode = countryFeature.get('ucode');
    activeAdminCollection = ee.FeatureCollection(adminData[level].asset)
      .filter(ee.Filter.eq('adm0_ucode', countryUCode));
    
    activeBoundaryLayer = Map.addLayer(
      activeAdminCollection.style({ color: 'blue', width: 1, fillColor: '00000000' }),
      {},
      level + ' boundaries'
    );

    summaryPanel.add(ui.Label('Click a boundary on the map for analysis.', {color: 'gray'}));
  }
}

// --- Map Click Handler ---
Map.onClick(function(coords) {
  if (!activeAdminCollection) {
    print('Please select a country and admin level first.');
    return;
  }
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  
  // FIX: Limit to 1 to create a fast, server-side collection for styling
  var clickedCollection = activeAdminCollection.filterBounds(point).limit(1);
  var clickedFeature = clickedCollection.first();
  
  // Evaluate ucode client-side so it can be used as a concrete filter value
  // in ee.Filter.eq (passing a server-side ee.ComputedObject silently returns 0 results).
  clickedFeature.get('ucode').evaluate(function(ucode) {
    if (!ucode) {
      runSummaryForFeature(clickedFeature, clickedCollection);
      return;
    }
    var chunkAsset = adminData[activeAdminLevel] && adminData[activeAdminLevel].chunkAsset;
    if (chunkAsset) {
      var chunks = ee.FeatureCollection(chunkAsset).filter(ee.Filter.eq('ucode', ucode));
      runSummaryForFeature(clickedFeature, clickedCollection, chunks);
    } else {
      runSummaryForFeature(clickedFeature, clickedCollection);
    }
  });
});

function runSummaryForFeature(feature, featureCollection, chunkedTiles) {
  if (activeClickedBoundaryLayer) Map.remove(activeClickedBoundaryLayer);

  // 1. Highlight the selected area
  var styled = featureCollection.style({ color: 'yellow', width: 2.5, fillColor: 'FFFF0080' });
  activeClickedBoundaryLayer = Map.addLayer(styled, {}, 'Selected Area');

  // 2. Simplify geometry
  var regionGeometry = feature.geometry();
  var area = regionGeometry.area(1);
  // var simplifiedGeometry = ee.Algorithms.If(
  //   area.lt(5e8), 
  //   regionGeometry,
  //   ee.Algorithms.If(
  //     area.lt(3e11), 
  //     regionGeometry.simplify(100),
  //     regionGeometry.simplify(10000)
  //   )
  // );
  
  summaryPanel.clear();
  var regionName = feature.get(activeNameProp);

  regionName.evaluate(function (name) {
    summaryPanel.add(ui.Label('Summary for: ' + name, { fontWeight: 'bold' }));
    var calculatingLabel = ui.Label('Calculating...', { color: 'gray' });
    summaryPanel.add(calculatingLabel);

    var topicBands = [];
    var topics = Object.keys(topicMasks);
    var targetSubTopics = ['Malaria', 'Heatwave', 'Fire', 'Drought'];
    
    // 3. Prepare Image Bands
    topics.forEach(function (topicName) {
      topicBands.push(childpop.updateMask(topicMasks[topicName]).rename(topicName));
      // Coverage band: 1 where hazard has valid data (regardless of threshold)
      topicBands.push(topicCoverageImages[topicName]);
    });

    targetSubTopics.forEach(function(topicName) {
      var subHazards = hazardTopics[topicName];
      if (subHazards) {
        subHazards.forEach(function(hName) {
           topicBands.push(exposureByHazardName[hName].rename(hName));
        });
      }
    });

    var combinedImage = ee.Image.cat(topicBands)
      .addBands(childpop.rename('total_population'))
      .addBands(childpop_m.rename('total_population_male'))
      .addBands(childpop_f.rename('total_population_female'));

    // 4. Check Active Filters
    var countValue = topicDropdown.getValue();
    if (countValue) {
      var countMask = topicCountImage.gte(ee.Number.parse(countValue));
      combinedImage = combinedImage.addBands(childpop.updateMask(countMask).rename('active_count_filter'));
    }

    var intensityP = pixelDropdown.getValue();
    if (intensityP) {
      var hazardScore = ee.Image('projects/unicef-ccri/assets/hazards/MHI_climate');
      // Compute the threshold dynamically from the selected percentile, same as the map layer.
      var mhiLandMask = ee.Image(1).clip(countryBoundariesReprojected).unmask(0)
          .reproject({crs: targetCRS, scale: targetScale});
      var mhiThreshold = hazardScore.updateMask(mhiLandMask).reduceRegion({
        reducer: ee.Reducer.percentile([parseInt(intensityP, 10)]),
        geometry: global_geometry,
        scale: hazardScore.projection().nominalScale(),
        bestEffort: true
      }).values().get(0);
      var intensityMask = hazardScore.gt(ee.Number(mhiThreshold));
      combinedImage = combinedImage.addBands(childpop.updateMask(intensityMask).rename('active_intensity_filter'));
    }

    // 5. Execute Reduction
    // For adm0 with chunked tiles: clip to each tile individually via reduceRegions,
    // then sum the per-tile results. Each tile is a small rectangle so no memory error.
    // For adm1/adm2 clicks: use the simplified geometry directly (small enough).
    var stats;
    if (chunkedTiles) {
      // Tiles are pre-clipped to the country boundary and filtered by adm0_ucode,
      // so no geometry clip is needed. reduceRegions runs tiles in parallel.
      var bandNames = combinedImage.bandNames();
      var numBands = bandNames.size();

      var tileResults = combinedImage.reduceRegions({
        collection: chunkedTiles,
        reducer: ee.Reducer.sum(),
        scale: pop_target_res,
        tileScale: 1
      });

      var sums = tileResults.reduceColumns(
        ee.Reducer.sum().repeat(numBands),
        bandNames
      );
      stats = ee.Dictionary.fromLists(bandNames, sums.get('sum'));
    } else {
      stats = combinedImage.reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: ee.Geometry(regionGeometry),
        scale: pop_target_res,
        maxPixels: 1e13,
        bestEffort: true,
        tileScale: 4
      });
    }

    stats.evaluate(function (result, error) {
      calculatingLabel.setValue('');
      if (error) {
        print('Summary computation error:', error);
        summaryPanel.add(ui.Label('Error: ' + error, {color: 'red', fontSize: '11px'}));
        return;
      }
      if (!result) {
        summaryPanel.add(ui.Label('No data available.'));
        return;
      }

      var totalPop = result.total_population || 0;

      // 6. Render Chart
      // Split topics into: exposed (coverage + exposure > 0), and no-data (no coverage pixels).
      // Topics with coverage but 0 exposure are silently omitted (genuinely unexposed).
      var noDataTopics = [];
      var chartResults = [];
      topics.forEach(function(topic) {
        var covKey = 'cov_' + topic.replace(/[^a-zA-Z0-9]/g, '_');
        var hasCoverage = result[covKey] && result[covKey] > 0;
        if (!hasCoverage) {
          noDataTopics.push(topic);
        } else if (result[topic] && result[topic] > 0) {
          chartResults.push({ topic: topic, count: Math.round(result[topic]) });
        }
        // hasCoverage but 0 exposure → genuinely unexposed, omit from chart
      });

      if (chartResults.length > 0) {
        chartResults.sort(function (a, b) { return b.count - a.count; });
        var maxCount = chartResults.reduce(function (m, r) { return Math.max(m, r.count); }, 0);

        chartResults.forEach(function (r) {
          var color = topicColors[r.topic] || 'gray';
          var barWidth = (r.count / maxCount) * 100 + '%';
          var percentage = totalPop > 0 ? (r.count / totalPop * 100).toFixed(1) + '%' : '0%';

          var barContainer = ui.Panel({
            widgets: [ui.Panel({ style: { backgroundColor: color, height: '12px', width: barWidth } })],
            style: { backgroundColor: '#f0f0f0', height: '12px', margin: '2px 4px', stretch: 'horizontal' }
          });

          var row = ui.Panel({
            widgets: [
              ui.Label(r.topic, { margin: '1px 4px', width: '85px', fontSize: '11px', fontWeight: 'bold' }),
              barContainer,
              ui.Label(r.count.toLocaleString(), { margin: '1px 2px', fontSize: '11px', fontWeight: 'bold' }),
              ui.Label('(' + percentage + ')', { margin: '1px 2px', color: '#666', fontSize: '10px' })
            ],
            layout: ui.Panel.Layout.flow('horizontal'),
            style: { stretch: 'horizontal' }
          });
          summaryPanel.add(row);

          // Sub-Hazards
          if (targetSubTopics.indexOf(r.topic) !== -1) {
            var subHazards = hazardTopics[r.topic];
            if (subHazards) {
              subHazards.forEach(function(hName) {
                var hCount = Math.round(result[hName] || 0);
                var cleanName = hName.split('_').slice(0, 2).join(' ');
                summaryPanel.add(ui.Panel([
                  ui.Label('↳ ' + cleanName, { margin: '1px 4px 1px 15px', stretch: 'horizontal', fontSize: '10px', color: '#777' }),
                  ui.Label(hCount.toLocaleString(), { margin: '1px 2px', color: '#777', fontSize: '10px' })
                ], ui.Panel.Layout.flow('horizontal')));
              });
            }
          }
        });
      } else {
        summaryPanel.add(ui.Label('No significant topic exposure found.', { fontSize: '11px' }));
      }

      // No-data topics: hazard dataset has no coverage for this region
      if (noDataTopics.length > 0) {
        summaryPanel.add(ui.Panel({ style: { backgroundColor: '#eee', height: '1px', margin: '6px 5px 4px 5px' } }));
        summaryPanel.add(ui.Label('No hazard data available:', { fontSize: '10px', color: '#999', fontWeight: 'bold', margin: '0 4px 2px 4px' }));
        noDataTopics.forEach(function(topic) {
          var color = topicColors[topic] || '#ccc';
          summaryPanel.add(ui.Panel([
            ui.Label('', { backgroundColor: color, padding: '4px', margin: '1px 5px 1px 4px', border: '1px solid #ccc' }),
            ui.Label(topic, { fontSize: '11px', color: '#aaa', margin: '2px 0', stretch: 'horizontal' }),
            ui.Label('N/A', { fontSize: '11px', color: '#bbb', margin: '2px 4px' })
          ], ui.Panel.Layout.flow('horizontal')));
        });
      }

      // 7. Render MHC / MHI filter rows (if filters are active)
      if (countValue || intensityP) {
        summaryPanel.add(ui.Panel({ style: { backgroundColor: '#ddd', height: '1px', margin: '8px 5px 4px 5px' } }));
        summaryPanel.add(ui.Label('MULTI HAZARD FILTERS:', { fontSize: '10px', color: '#444', fontWeight: 'bold', margin: '0 4px 2px 4px' }));

        // Helper: render a single MHC/MHI bar row
        function renderFilterRow(label, value, color) {
          var count = Math.round(value || 0);
          var perc = totalPop > 0 ? (count / totalPop * 100).toFixed(1) + '%' : '0%';
          var bw = totalPop > 0 ? (count / totalPop * 100) + '%' : '0%';
          var bar = ui.Panel({
            widgets: [ui.Panel({ style: { backgroundColor: color, height: '12px', width: bw } })],
            style: { backgroundColor: '#f0f0f0', height: '12px', margin: '2px 4px', stretch: 'horizontal' }
          });
          summaryPanel.add(ui.Panel({
            widgets: [
              ui.Label(label, { margin: '1px 4px', width: '85px', fontSize: '11px', fontWeight: 'bold', color: color }),
              bar,
              ui.Label(count.toLocaleString(), { margin: '1px 2px', fontSize: '11px', fontWeight: 'bold' }),
              ui.Label('(' + perc + ')', { margin: '1px 2px', color: '#666', fontSize: '10px' })
            ],
            layout: ui.Panel.Layout.flow('horizontal'),
            style: { stretch: 'horizontal' }
          }));
        }

        if (countValue) {
          renderFilterRow('MHC (≥' + countValue + ')', result.active_count_filter, '#800026');
        }
        if (intensityP) {
          renderFilterRow('MHI (≥P' + intensityP + ')', result.active_intensity_filter, '#c63a26');
        }
      }

      // 8. Totals
      summaryPanel.add(ui.Panel({ style: { backgroundColor: '#ddd', height: '1px', margin: '10px 5px' } }));
      summaryPanel.add(ui.Label('TOTAL CHILD POPULATION:', { fontWeight: 'bold', fontSize: '12px', margin: '0 8px' }));
      summaryPanel.add(ui.Label(Math.round(totalPop).toLocaleString(), {
        fontWeight: 'bold', fontSize: '14px', color: '#0057b7', margin: '2px 8px'
      }));

      var malePop = Math.round(result.total_population_male || 0);
      var femalePop = Math.round(result.total_population_female || 0);
      summaryPanel.add(ui.Panel([
          ui.Label('Male: ' + malePop.toLocaleString(), { fontSize: '11px', color: '#3366cc' }),
          ui.Label('Female: ' + femalePop.toLocaleString(), { fontSize: '11px', color: '#cc3366'})
      ], ui.Panel.Layout.flow('horizontal')));
    });
  });
}
// --- Add Panel to the Root UI ---
ui.root.insert(1, rightPanel);

