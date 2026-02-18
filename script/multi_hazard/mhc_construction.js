// === Set Map Options ===
Map.setOptions('SATELLITE');

// === Load core layers ===
var org_childpop = ee.ImageCollection("projects/unicef-ccri/assets/misc_population/WorldPop_Con_T_U18");
var childpop = org_childpop.mosaic();
var pop_target_res = org_childpop.first().projection().nominalScale();
var totalpop = ee.Image("projects/unicef-ccri/assets/misc_population/worldpop_1km");
var totalpop_res = totalpop.projection().nominalScale();
var referenceImage = ee.Image("projects/unicef-ccri/assets/heatwaves/heatwave_frequency_2014_2023_avg");
var targetScale = referenceImage.projection().nominalScale();
var targetCRS = referenceImage.projection();

// === Define global geometry (fix for reduceRegion error) ===
var global_geometry = ee.Geometry.Polygon(
  [[[-180, 90], [-180, -90], [180, -90], [180, 90]]], null, false
);

// Load both detailed and simplified boundaries
var detailedBoundaries = ee.FeatureCollection('projects/unicef-ccri/assets/global_boundary/adm0');
var simpleBoundaries   = ee.FeatureCollection('projects/unicef-ccri/assets/misc_boundaries/adm0_simple');

// Compute area for each feature (in km²)
var detailedWithArea = detailedBoundaries.map(function(f) {
  return f.set('area_km2', f.geometry().area(1).divide(1e6));
});
var simpleWithArea = simpleBoundaries.map(function(f) {
  return f.set('area_km2', f.geometry().area(1).divide(1e6));
});

var hybridBoundaries = detailedBoundaries.map(function(feature) {
  var geometry = feature.geometry();
  var area = geometry.area(); // Or use feature.getNumber('area_km2').multiply(1e6) if available

  // 1. Determine the simplified geometry
  var simplifiedGeometry = ee.Algorithms.If(
    area.lt(5e8), 
    geometry, 
    ee.Algorithms.If(
      area.lt(3e11), 
      geometry.simplify(100), 
      geometry.simplify(10000)
    )
  );

  // 2. Cast the result to a Geometry and Transform IT (not the feature)
  // We apply .transform() here while it is still a geometry object
  var finalGeometry = ee.Geometry(simplifiedGeometry).transform(targetCRS);

  // 3. Set the transformed geometry back into the feature
  return feature.setGeometry(finalGeometry);
});

// Reproject to match hazard layer
var countryBoundariesReprojected = hybridBoundaries.map(function(feature) {
  return feature.transform(targetCRS);
});

// === Define hazard metadata ===
var hazards = [
  {"id": "projects/unicef-ccri/assets/hazards/river_flood_r100", "threshold": 0.01, "name": "river_flood_100yr_jrc_2024"},
  {"id": "projects/unicef-ccri/assets/hazards/coastal_flood_r100", "threshold": 0, "name": "coastal_flood_100yr_jrc_2024"},
  {"id": "projects/unicef-ccri/assets/hazards/storm_giri_rp100", "threshold": 17.5, "name": "tropical_storm_100yr_giri_2024"},
  {"id": "projects/unicef-ccri/assets/hazards/ASI_return_level_100yr", "threshold": 30, "name": "agricultural_drought_fao_1984-2023"},
  {"id": "projects/unicef-ccri/assets/droughts/drought_spei_copernicus_1940_2024", "threshold": -1.5, "name": "drought_spei_copernicus_1940-2024"},
  {"id": "projects/unicef-ccri/assets/droughts/drought_spi_copernicus_1940_2024", "threshold": -1.5, "name": "drought_spi_copernicus_1940-2024"},
  {"id": "projects/unicef-ccri/assets/hazards/heatwave_frequency_return_level_100yr", "threshold": "Mean", "name": "heatwave_frequency_ecmwf_2014-2024"},
  {"id": "projects/unicef-ccri/assets/hazards/heatwave_duration_return_level_100yr", "threshold": "Mean", "name": "heatwave_duration_ecmwf_2014-2024"},
  {"id": "projects/unicef-ccri/assets/hazards/heatwave_severity_return_level_100yr", "threshold": "Mean", "name": "heatwave_severity_ecmwf_2014-2024"},
  {"id": "projects/unicef-ccri/assets/hazards/high_temp_degree_days_return_level_100yr", "threshold": 35, "name": "extreme_heat_ecmwf_2014-2024"},
  {"id": "projects/unicef-ccri/assets/hazards/FIRMS_FRP_90th_percentile", "threshold": "Mean", "name": "fire_FRP_nasa_2001-2024"},
  {"id": "projects/unicef-ccri/assets/hazards/FIRMS_count_90th_percentile", "threshold": "Mean", "name": "fire_frequency_nasa_2001-2023"},
  {"id": "projects/unicef-ccri/assets/hazards/sand_dust_storm_annual", "threshold": 0, "name": "sand_dust_storm_unccd_2024", "isImage": true},
  {"id": "projects/unicef-ccri/assets/hazards/pm25_p90_1998_2023", "threshold": 5, "name": "air_pollution_pm25_1998-2023"},
  {"id": "projects/unicef-ccri/assets/hazards/Pv_average_2013_2022", "threshold": 0.001, "name": "vectorborne_malariapv_2012-2022"},
  {"id": "projects/unicef-ccri/assets/hazards/Pf_average_2013_2022", "threshold": 0.001, "name": "vectorborne_malariapf_2012-2022"},
  {"id": "projects/unicef-ccri/assets/risk_index_test/p1_avg_pixel", "threshold": 6.516479, "name": "Pixel Based Hazard Score"}
];

// === Group hazards into topics ===
var hazardTopics = {
  'River Flood': ["river_flood_100yr_jrc_2024"],
  'Coastal Flood': ["coastal_flood_100yr_jrc_2024"],
  'Tropical Storm': ["tropical_storm_100yr_giri_2024"],
  'Drought': ["agricultural_drought_fao_1984-2023", "drought_spei_copernicus_1940-2024", "drought_spi_copernicus_1940-2024"],
  'Heatwave': ["heatwave_frequency_ecmwf_2014-2024", "heatwave_duration_ecmwf_2014-2024", "heatwave_severity_ecmwf_2014-2024"],
  'Extreme Heat': ["extreme_heat_ecmwf_2014-2024"],
  'Fire': ["fire_FRP_nasa_2001-2024", "fire_frequency_nasa_2001-2023"],
  'Sand and Dust Storm': ["sand_dust_storm_unccd_2024"]
  // 'Air Pollution': ["air_pollution_pm25_1998-2023"],
  // 'Malaria': ["vectorborne_malariapv_2012-2022", "vectorborne_malariapf_2012-2022"]
};

// === Function to summarize population exposure ===
function summarizePopulation(hazard) {
  var hazard_layer;
  if (hazard.isImage) {
    hazard_layer = ee.Image(hazard.id);
  } else if (hazard.name.match(/flood|storm/)) {
    hazard_layer = ee.ImageCollection(hazard.id).mosaic();
  } else {
    hazard_layer = ee.Image(hazard.id);
  }

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
  'Malaria': '#b2df8a'
};

var topicMasks = {};
Object.keys(hazardTopics).forEach(function(topic) {
  var masks = hazardTopics[topic].map(function(name) {
    return exposureByHazardName[name].mask();
  });
  var unionMask = masks.reduce(function(acc, m) {
    return acc.or(m);
  });
  topicMasks[topic] = unionMask;

  // Store exposure image for counting later
  var exposureImage = ee.Image.constant(1).updateMask(unionMask).rename(topic);
  topicExposureImages.push(exposureImage);

  // Add colored layer
  Map.addLayer(exposureImage, {palette: [topicColors[topic]], min: 0, max: 1}, topic, false);
});

// === Stack topic images and compute topic count ===
var stacked = ee.ImageCollection(topicExposureImages).toBands();
var topicCount = stacked.reduce(ee.Reducer.count()).rename('topic_count');
Map.addLayer(topicCount, {min: 1, max: 9, palette: ['#f7fcf0','#bae4bc','#7bccc4','#2b8cbe','#08589e']}, 'Topic Count');

// === Dropdown to filter by number of overlapping topics ===
var topicSelect = ui.Select({
  items: ee.List.sequence(1, Object.keys(hazardTopics).length).getInfo().map(function(n) { return n.toString(); }),
  placeholder: 'Select topic count ≥ N',
  onChange: function(value) {
    Map.layers().forEach(function(layer) {
    var name = layer.get('name');
    if (typeof name === 'string' && name.indexOf('≥') === 0) Map.remove(layer);
    });
    var mask = topicCount.gte(ee.Number.parse(value)).selfMask();
    Map.addLayer(mask, {min: 1, max: 1, palette: ['#800026']}, '≥ ' + value + ' Topics');
  }
});
Map.add(ui.Panel({widgets: [ui.Label('Topic Count Filter', {fontWeight:'bold'}), topicSelect], style:{position:'top-right', padding:'8px', backgroundColor:'white'}}));

// === Add pixel-based hazard score default layer ===
var pixelScoreLegend = ui.Panel({
  style: {position: 'bottom-right', padding: '8px', backgroundColor: 'white'}
});

var legendTitle = ui.Label('Pixel Score ≥ P90', {fontWeight: 'bold', margin: '0 0 4px 0'});
var scorePalette = ['#fff5f0','#fee0d2','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#cb181d','#a50f15','#67000d'];
var legendLabels = ['0', '', '', '', '', '', '', '', '4+'];

var makeColorBar = function() {
  return scorePalette.map(function(color, i) {
    return ui.Panel([
      ui.Label('', {backgroundColor: color, padding: '8px', margin: '0 4px 4px 0', border: '1px solid #ccc'}),
      ui.Label(legendLabels[i], {margin: '0 0 4px 0'})
    ], ui.Panel.Layout.Flow('horizontal'));
  });
};

pixelScoreLegend.add(legendTitle);
makeColorBar().forEach(function(row) { pixelScoreLegend.add(row); });
Map.add(pixelScoreLegend);

// === Manual check to toggle pixel legend visibility ===
function togglePixelLegend() {
  var showLegend = false;
  Map.layers().forEach(function(layer) {
    var name = layer.get('name');
    if (typeof name === 'string' && name.indexOf('Pixel Score ≥') === 0 && layer.getShown()) {
      showLegend = true;
    }
  });
  pixelScoreLegend.style().set('shown', showLegend);
}

togglePixelLegend();
var defaultHazardScore = ee.Image('projects/unicef-ccri/assets/risk_index_test/p1_avg_pixel');
var landSeaMask = ee.Image(1).clip(countryBoundariesReprojected).unmask(0).reproject({crs: targetCRS, scale: targetScale});
var maskedHazard = defaultHazardScore.updateMask(landSeaMask);
var threshold90 = maskedHazard.reduceRegion({
  reducer: ee.Reducer.percentile([90]),
  geometry: global_geometry,
  scale: defaultHazardScore.projection().nominalScale(),
  bestEffort: true
}).values().get(0);
threshold90 = ee.Number(threshold90);
var exposedDefault = childpop.updateMask(defaultHazardScore.gt(threshold90)).rename('exposed_children');

Map.addLayer(exposedDefault, {min: 0, max: 4, palette: ['#fff5f0','#fee0d2','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#cb181d','#a50f15','#67000d']}, 'Pixel Score ≥ P90');

// === Pixel-based hazard score dropdown ===
var thresholdDropdown = ui.Select({
  items: ['75', '80', '85', '90', '95'],
  placeholder: 'Select percentile threshold for hazard score',
  onChange: function(percentileStr) {
    var percentile = ee.Number.parse(percentileStr);
    var hazardScore = ee.Image('projects/unicef-ccri/assets/risk_index_test/p1_avg_pixel');
    var landSeaMask = ee.Image(1).clip(countryBoundariesReprojected).unmask(0).reproject({crs: targetCRS, scale: targetScale});
    var maskedHazard = hazardScore.updateMask(landSeaMask);
    var threshold = maskedHazard.reduceRegion({
      reducer: ee.Reducer.percentile([percentile]),
      geometry: global_geometry,
      scale: hazardScore.projection().nominalScale(),
      bestEffort: true
    }).values().get(0);
    threshold = ee.Number(threshold);
    var exposedPop = childpop.updateMask(hazardScore.gt(threshold)).rename('exposed_children');
    Map.layers().forEach(function(layer) {
      var name = layer.getName();
      if (typeof name === 'string' && name.indexOf('Pixel Score ≥') === 0) {
        Map.remove(layer);
      }
    });
    Map.addLayer(exposedPop, {min: 0, max: 4, palette: ['#fff5f0','#fee0d2','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#cb181d','#a50f15','#67000d']}, 'Pixel Score ≥ P' + percentileStr);
  }
});
Map.add(ui.Panel({ widgets: [ui.Label('Pixel-Based Hazard Score Filter', {fontWeight: 'bold'}), thresholdDropdown], style: { position: 'top-right', padding: '8px', backgroundColor: 'white' }}));


// === Export child-population exposed to AT LEAST N hazard-topics ===========
var numTopics = Object.keys(hazardTopics).length;   // 9 topics total

// Choose the smallest N you care about (1, 2, …). 2 is common:
var startN = 1;   // set to 2 if you want "≥2" and up

ee.List.sequence(startN, numTopics).getInfo().forEach(function (n) {

  // 1. keep pixels where topicCount ≥ N
  var popExposedN = childpop.updateMask(topicCount.gte(n));

  // 2. per-country sum, output field named 'pop_exposed'
  var summary = popExposedN.reduceRegions({
      collection: countryBoundariesReprojected.map(function (f) {
        return f.setMulti(f.toDictionary(['ISO3', 'name', 'ucode']));
      }),
      reducer : ee.Reducer.sum().setOutputs(['pop_exposed']),
      scale   : pop_target_res,
      crs     : 'EPSG:4326'
  });

  // 3. export one CSV per threshold N  (e.g. child_pop_exposed_ge2_topics)
  Export.table.toDrive({
    collection : summary,
    description: 'child_pop_exposed_ge' + n + '_topics',
    fileFormat : 'CSV',
    selectors  : ['ISO3', 'name', 'ucode', 'pop_exposed'],
    folder     : 'CCRI_results_misc'
  });
});
