/****************  LOAD IMAGE COLLECTIONS  ****************/
var imageCollection  = ee.ImageCollection('projects/unicef-ccri/assets/hazards/river_flood_r100'),
    imageCollection2 = ee.ImageCollection('projects/unicef-ccri/assets/hazards/coastal_flood_r100'),
    imageCollection3 = ee.ImageCollection('projects/unicef-ccri/assets/hazards/storm_giri_rp100');

/****************  LOAD INDIVIDUAL IMAGES  ****************/
var asi_image = ee.Image('projects/unicef-ccri/assets/hazards/ASI_return_level_100yr');
var sds_img   = ee.Image('projects/unicef-ccri/assets/hazards/sand_dust_storm_annual');
var pf_image  = ee.Image('projects/unicef-ccri/assets/hazards/Pf_average_2013_2022');
var pv_image  = ee.Image('projects/unicef-ccri/assets/hazards/Pv_average_2013_2022');

/****************  BASIC MASKS  ****************/
var filteredASI  = asi_image.updateMask(asi_image.lte(100));
var filtered_pf  = pf_image.updateMask(pf_image.neq(-9999));
var filtered_pv  = pv_image.updateMask(pv_image.neq(-9999));
var filtered_sds = sds_img.updateMask(sds_img.gte(0));

/****************  REFERENCE PROJECTION  ****************/
var referenceImage = ee.Image('projects/unicef-ccri/assets/ERA5_100yr_RP');
var targetProj     = referenceImage.projection();

/****************  LAND/SEA MASK  ****************/
var countryBoundaries = ee.FeatureCollection('projects/unicef-ccri/assets/global_boundary/adm0');

var landSeaMask = ee.Image.constant(0)
  .rename('landsea_mask')
  .reproject(targetProj)
  .paint(countryBoundaries, 1);

/****************  RESAMPLING FUNCTIONS  ****************/
// Full resample: for sub-km sources (floods, fire, malaria, etc.)
var resampleImage = function (img) {
  return img
    .setDefaultProjection(targetProj)
    .reduceResolution({ reducer: ee.Reducer.max(), bestEffort: true })
    .reproject(targetProj);
};

// ERA5-native images are already at target resolution — skip reduceResolution
var reprojectOnly = function (img) {
  return img.reproject(targetProj);
};

/****************  RESAMPLE THREE MOSAICS  ****************/
var imageCollectionResampled  = resampleImage(imageCollection.mosaic());
var imageCollection2Resampled = resampleImage(imageCollection2.mosaic());
var imageCollection3Resampled = resampleImage(imageCollection3.mosaic());

/****************  IMAGE DEFINITIONS  ****************/
// [image, exportName, ERA5-native (reprojectOnly)]
var imageDefs = [
  [filteredASI,                                                                                  'agricultural_drought_fao_1984-2023',      false],
  [ee.Image('projects/unicef-ccri/assets/hazards/FIRMS_count_90th_percentile'),                 'fire_frequency_nasa_2001-2023',            false],
  [ee.Image('projects/unicef-ccri/assets/hazards/FIRMS_FRP_90th_percentile'),                   'fire_FRP_nasa_2001-2024',                  false],
  [ee.Image('projects/unicef-ccri/assets/hazards/heatwave_frequency_return_level_100yr'),       'heatwave_frequency_ecmwf_2014-2024',       true],
  [ee.Image('projects/unicef-ccri/assets/hazards/heatwave_duration_return_level_100yr'),        'heatwave_duration_ecmwf_2014-2024',        true],
  [ee.Image('projects/unicef-ccri/assets/hazards/heatwave_severity_return_level_100yr'),        'heatwave_severity_ecmwf_2014-2024',        true],
  [ee.Image('projects/unicef-ccri/assets/hazards/high_temp_degree_days_return_level_100yr'),    'extreme_heat_ecmwf_2014-2024',             true],
  [ee.Image('projects/unicef-ccri/assets/hazards/pm25_p90_1998_2023'),                          'air_pollution_pm25_1998-2023',             false],
  [filtered_sds,                                                                                 'sand_dust_storm_unccd_2024',               false],
  [filtered_pf,                                                                                  'vectorborne_malariapf_2012-2022',          false],
  [filtered_pv,                                                                                  'vectorborne_malariapv_2012-2022',          false],
  [ee.Image('projects/unicef-ccri/assets/droughts/spei12_TerraClimate_1958-2025').select('b2'), 'drought_spei_terraclimate_1958-2025',      false],
  [ee.Image('projects/unicef-ccri/assets/droughts/spi12_TerraClimate_1958-2025').select('b2'),  'drought_spi_terraclimate_1958-2025',       false]
];

/****************  GLOBAL EXPORT FOOTPRINT  ****************/
var globalGeometry = ee.Geometry.Polygon(
  [[[-180,  90],
    [-180, -90],
    [ 180, -90],
    [ 180,  90],
    [-180,  90]]], null, false);

/****************  EXPORT FUNCTION  ****************/
var out_folder = 'ccri_pixel';

var exportToDrive = function (image, description) {
  Export.image.toDrive({
    image        : image,
    description  : description,
    folder       : out_folder,
    region       : globalGeometry,
    scale        : targetProj.nominalScale(),
    fileFormat   : 'GeoTIFF',
    maxPixels    : 1e13,
    formatOptions: { cloudOptimized: true }
  });
};

/****************  EXPORTS  ****************/
exportToDrive(imageCollectionResampled,  'river_flood_100yr_jrc_2024');
exportToDrive(imageCollection2Resampled, 'coastal_flood_100yr_jrc_2024');
exportToDrive(imageCollection3Resampled, 'tropical_storm_100yr_giri_2024');
exportToDrive(landSeaMask,               'landSeaMask');

imageDefs.forEach(function (def) {
  var fn = def[2] ? reprojectOnly : resampleImage;
  exportToDrive(fn(def[0]), def[1]);
});
