// === Set Map Options ===
Map.setOptions('SATELLITE');

// === Load core layers ===
var org_childpop = ee.ImageCollection("projects/unicef-ccri/assets/misc_population/WorldPop_Con_T_U18");
var childpop = org_childpop
                  .mosaic(); // Select the image for the year 2020.
var pop_target_res = org_childpop.first().projection().nominalScale();

childpop = childpop.setDefaultProjection({
  crs: 'EPSG:4326', // Coordinate reference system
  scale: pop_target_res // Set scale (100m for the original resolution)
});


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

// Area threshold: use simplified geometry if larger than threshold
var areaThreshold = 300000; // Italy is ~301,000 km²

// Large countries → simplified boundaries
var largeCountries = simpleWithArea.filter(ee.Filter.gt('area_km2', areaThreshold));

// Small countries → detailed boundaries
var smallCountries = detailedWithArea.filter(ee.Filter.lte('area_km2', areaThreshold));

// Combine both sets
var hybridBoundaries = largeCountries.merge(smallCountries);

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
  {"id": "projects/unicef-ccri/assets/hazards/spei12_period_mean_2014_2024", "threshold": -1.5, "name": "drought_spei_copernicus_1940-2024"},
  {"id": "projects/unicef-ccri/assets/hazards/spi12_period_mean_2014_2024", "threshold": -1.5, "name": "drought_spi_copernicus_1940-2024"},
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
  'River_Flood': ["river_flood_100yr_jrc_2024"],
  'Coastal_Flood': ["coastal_flood_100yr_jrc_2024"],
  'Tropical_Storm': ["tropical_storm_100yr_giri_2024"],
  'Drought': ["agricultural_drought_fao_1984-2023", "drought_spei_copernicus_1940-2024", "drought_spi_copernicus_1940-2024"],
  'Heatwave': ["heatwave_frequency_ecmwf_2014-2024", "heatwave_duration_ecmwf_2014-2024", "heatwave_severity_ecmwf_2014-2024"],
  'Extreme_Heat': ["extreme_heat_ecmwf_2014-2024"],
  'Fire': ["fire_FRP_nasa_2001-2024", "fire_frequency_nasa_2001-2023"],
  'Sand_and_Dust_Storm': ["sand_dust_storm_unccd_2024"]
  //'Air_Pollution': ["air_pollution_pm25_1998-2023"],
  //'Malaria': ["vectorborne_malariapv_2012-2022", "vectorborne_malariapf_2012-2022"]
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
  'River_Flood': '#1f78b4',
  'Coastal_Flood': '#a6cee3',
  'Tropical_Storm': '#33a02c',
  'Drought': '#ff7f00',
  'Heatwave': '#e31a1c',
  'Extreme_Heat': '#6a3d9a',
  'Fire': '#fb9a99',
  'Sand_and_Dust_Storm': '#b15928',
  'Air_Pollution': '#cab2d6',
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
  Map.addLayer(exposureImage, {palette: [topicColors[topic]], min: 0, max: 1}, topic.replace(/_/g, ' '), false);
});

// === Stack topic images and compute topic count ===
var stacked = ee.ImageCollection(topicExposureImages).toBands();
var topicCount = stacked.reduce(ee.Reducer.count()).rename('topic_count');
Map.addLayer(topicCount, {min: 1, max: 9, palette: ['#f7fcf0','#bae4bc','#7bccc4','#2b8cbe','#08589e']}, 'Topic Count');




// === Step 1: Compute the "Combination ID" Image ===
var combinationIdImage = ee.Image.constant(0);
var topicNames = Object.keys(hazardTopics);

var combinationIdImage = ee.Image.constant(0);
topicNames.forEach(function(topic, i) {
  var value = Math.pow(2, i);
  var topicValueImage = ee.Image.constant(value).updateMask(topicMasks[topic]).unmask(0);
  combinationIdImage = combinationIdImage.add(topicValueImage);
});
combinationIdImage = combinationIdImage.rename('combination_id');


// === Add the resulting layer to the map ===
var visParams = {
  min: 1,
  max: 255,
  palette: ['#f7fcf0','#ccebc5','#7bccc4','#4eb3d3','#2b8cbe','#08589e','#bd0026','#800026']
};
combinationIdImage = combinationIdImage.updateMask(combinationIdImage.neq(0)).toInt32();

Map.addLayer(combinationIdImage, visParams, 'Hazard Combination ID');


var analysisImage = combinationIdImage.addBands(childpop.rename('child_population'));
var analysisImage = ee.Image.cat([
  childpop.rename('child_population'),
  combinationIdImage.rename('combination_id')
]);

var analysisImage = ee.Image.cat([
  childpop.rename('child_population'),
  combinationIdImage.rename('combination_id')
]);

// Mask pixels with zero child population
analysisImage = analysisImage.updateMask(childpop.gt(0));

// === Define reducer: sum population grouped by combination_id ===
var reducer = ee.Reducer.sum().group({
  groupField: 1,  // index of combination_id in the image
  groupName: 'combination_id'
});

// === Compute exposure per country ===
var countryExposureList = countryBoundariesReprojected.map(function(f) {
  var geom = f.geometry().simplify(1000); 

  var exposure = analysisImage.reduceRegion({
    reducer: reducer,
    geometry: geom,
    scale: pop_target_res,
    tileScale: 4,
    bestEffort: true,
    maxPixels: 1e13
  });

  var groups = ee.List(ee.Algorithms.If(exposure.get('groups'), exposure.get('groups'), ee.List([])));

  return ee.Feature(null, {
    ISO3: f.get('ISO3'),          // <-- Add this line
    //country_na: f.get('country_na'), // <-- Add this line
    groups: groups
  });
});

var countryExposureFC = ee.FeatureCollection(countryExposureList);
// --- SERVER-SIDE topic names list (keep the original client-side topicNames for creating combinationIdImage) ---
var topicNamesList = ee.List(topicNames); // ee.List of topic keys

// --- Correct decode function (fully server-side) ---
function decodeGroups(feature) {
  //var countryName = feature.get('country_na');
  var ISO3 = feature.get('ISO3');
  var groups = ee.List(ee.Algorithms.If(feature.get('groups'), feature.get('groups'), ee.List([])));

  var decoded = groups.map(function(item) {
    item = ee.Dictionary(item);
    var comboId = ee.Number(item.get('combination_id')).toInt(); // FORCE integer
    var popSum = ee.Number(item.get('sum'));

    var indices = ee.List.sequence(0, topicNamesList.size().subtract(1));

    var namesWithNulls = indices.map(function(i) {
      i = ee.Number(i);
      var name = ee.String(topicNamesList.get(i));
      var bit = ee.Number(2).pow(i).toInt(); // FORCE integer
      return ee.Algorithms.If(comboId.bitwiseAnd(bit).neq(0),
                               name.split('_').join(' '),
                               null);
    });

    var comboNames = ee.List(namesWithNulls).removeAll([null]);
    var comboString = comboNames.join(' + ');
    var hazardCount = ee.Number(comboNames.length());

    var hazardLevel = ee.String(
      ee.Algorithms.If(hazardCount.eq(1), 'Single',
        ee.Algorithms.If(hazardCount.eq(2), 'Double',
          ee.Algorithms.If(hazardCount.eq(3), 'Triple', 'Multiple')
        )
      )
    );

    return ee.Dictionary({
      ISO3 : ISO3,
      //country: countryName,
      combination_id: comboId,
      combination: comboString,
      hazardCount: hazardCount,
      hazardLevel: hazardLevel,
      population: popSum
    });
  });

  return feature.set('decoded_groups', decoded);
}


// Apply to country features
var countryExposureDecoded = countryExposureFC.map(decodeGroups);

// Aggregate and flatten the nested lists into a single FeatureCollection
var allDecodedLists = ee.List(countryExposureDecoded.aggregate_array('decoded_groups')).flatten();

var decodedFeatureCollection = ee.FeatureCollection(
  allDecodedLists.map(function(d) {
    d = ee.Dictionary(d);
    return ee.Feature(null, d);
  })
);

// Optional: sort with hazardCount (desc) then population (desc)
// First sort by population descending, then sort by hazardCount descending to make hazardCount primary.
var sortedByPop = decodedFeatureCollection.sort('population', false);
var sortedOutput = sortedByPop.sort('hazardCount', false);

// Export
Export.table.toDrive({
  collection: sortedOutput,
  description: 'HazardCombinationExposure_AllLevels_Fixed_climate_sensitive',
  fileFormat: 'CSV'
});

// Quick preview
//print('Sample decoded output (first 30):', sortedOutput.limit(30));