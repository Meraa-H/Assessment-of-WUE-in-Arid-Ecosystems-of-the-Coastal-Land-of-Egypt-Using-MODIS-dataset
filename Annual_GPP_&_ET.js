

// === STEP 1: Load and process MODIS GPP & ET ===

// Load your study area (update this with your actual asset ID)
var studyArea = image //upload your study area

// Define time range
var start = ee.Date('start');
var end = ee.Date('end');

// Load and scale MODIS GPP
var gpp = ee.ImageCollection("MODIS/061/MOD17A2HGF")
            .filterDate(start, end)
            .select('Gpp')
            .map(function(img) {
              return img.clip(studyArea)
                        .multiply(0.0001) // scale factor for GPP
                        .copyProperties(img, ['system:time_start']);
            });

// Load and scale MODIS ET
var et = ee.ImageCollection("MODIS/061/MOD16A2GF")
           .filterDate(start, end)
           .select('ET')
           .map(function(img) {
             return img.clip(studyArea)
                       .multiply(0.1) // scale factor for ET
                       .copyProperties(img, ['system:time_start']);
           });

// Print to console to inspect
print('GPP Image Collection:', gpp);
print('ET Image Collection:', et);

// Visualize the first image for each
Map.centerObject(studyArea, 7);
Map.addLayer(gpp.first(), {min: 0, max: 1, palette: ['pink', 'yellow']}, 'Sample GPP');
Map.addLayer(et.first(), {min: 0, max: 100, palette: ['white', 'blue']}, 'Sample ET');


// === STEP 2: Aggregate to Annual Mean ===

// Define start and end year
var startYear = 2000;
var endYear = 2024;

// Function to calculate annual mean
function annualMean(collection, year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  
  var annual = collection
    .filterDate(start, end)
    .mean()
    .set('year', year)
    .set('system:time_start', start.millis());
    
  return annual;
}

// Create annual GPP ImageCollection
var annualGPP = ee.ImageCollection(
  ee.List.sequence(startYear, endYear).map(function(year){
    return annualMean(gpp, ee.Number(year));
  })
);

// Create annual ET ImageCollection
var annualET = ee.ImageCollection(
  ee.List.sequence(startYear, endYear).map(function(year){
    return annualMean(et, ee.Number(year));
  })
);

// Print to check
print('Annual GPP:', annualGPP);
print('Annual ET:', annualET);

// Visualize a sample year (e.g., 2020)
var gpp2020 = annualGPP.filter(ee.Filter.eq('year', 2020)).first();
var et2020 = annualET.filter(ee.Filter.eq('year', 2020)).first();

Map.addLayer(gpp2020, {min: 0, max: 1, palette: ['white', 'green']}, 'GPP 2020');
Map.addLayer(et2020, {min: 0, max: 100, palette: ['white', 'blue']}, 'ET 2020');


//  Export Annual GPP & ET to drive ===

// Convert years to a list
var years = ee.List.sequence(2000, 2024);

// Export each year’s GPP image
years.getInfo().forEach(function(year) {
  var img = annualGPP.filter(ee.Filter.eq('year', year)).first();
  
  Export.image.toDrive({
    image: img,
    description: 'GPP_' + year,
    folder: 'GEE_Exports',
    fileNamePrefix: 'GPP_' + year,
    region: studyArea.geometry(),
    scale: 500,
    crs: 'EPSG:4326',
    maxPixels: 1e13
  });
});

// Export each year’s GPP image
years.getInfo().forEach(function(year) {
  var img = annualET.filter(ee.Filter.eq('year', year)).first();
  
  Export.image.toDrive({
    image: img,
    description: 'ET_' + year,
    folder: 'GEE_Exports',
    fileNamePrefix: 'ET_' + year,
    region: studyArea.geometry(),
    scale: 500,
    crs: 'EPSG:4326',
    maxPixels: 1e13
  });
});


// === STEP 3: Export Time Series as CSV ===

// Convert years to a list
var years = ee.List.sequence(startYear, endYear);

// Function to extract mean GPP and ET for each year
var annualStats = years.map(function(year) {
  year = ee.Number(year);
  
  var gppYear = annualGPP.filter(ee.Filter.eq('year', year)).first();
  var etYear = annualET.filter(ee.Filter.eq('year', year)).first();
  
  var gppMean = gppYear.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: studyArea.geometry(),
    scale: 500,
    maxPixels: 1e13
  }).get('Gpp');
  
  var etMean = etYear.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: studyArea.geometry(),
    scale: 500,
    maxPixels: 1e13
  }).get('ET');
  
  return ee.Feature(null, {
    'year': year,
    'mean_GPP': gppMean,
    'mean_ET': etMean
  });
});

// Convert to FeatureCollection
var statsFC = ee.FeatureCollection(annualStats);

// Print to check
print('Annual GPP & ET Stats:', statsFC);

// Export as CSV to Google Drive
Export.table.toDrive({
  collection: statsFC,
  description: 'GPP_ET_TimeSeries',
  fileFormat: 'CSV',
  folder: 'GEE_Exports'
});

