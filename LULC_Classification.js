

// Load MODIS dataset and filter by date & study area with cloud masking
var dataset = ee.ImageCollection('MODIS/061/MOD09A1')
                  .filter(ee.Filter.date('start', 'end')) // Specific to the study time period
                  .filterBounds(roi)
                  .map(function(image) {
                    var QA = image.select('StateQA'); // Use StateQA instead of QC_500m
                    var mask = QA.bitwiseAnd(1).eq(0); // Cloud mask using StateQA
                    return image.updateMask(mask);
                  })
                  .median()
                  .clip(roi);

// Function to calculate NDVI
function addNDVI(image) {
  var ndvi = image.normalizedDifference(['sur_refl_b02', 'sur_refl_b01']).rename('NDVI');
  return image.addBands(ndvi);
}

// Function to calculate NDBI (Built-up Index)
function addNDBI(image) {
  var ndbi = image.normalizedDifference(['sur_refl_b06', 'sur_refl_b02']).rename('NDBI');
  return image.addBands(ndbi);
}

// Load and add elevation and terrain data
var dem = ee.Image('USGS/SRTMGL1_003').clip(roi);
var terrain = ee.Terrain.products(dem);
var slope = terrain.select('slope');
var aspect = terrain.select('aspect');

// Distance to Wetlands class (as water proxy)
var waterMask = Wetlands.map(function(feature) {
  return feature.set('landcover', 1);
});
var waterRaster = waterMask.reduceToImage(['landcover'], ee.Reducer.first()).eq(1);
var distToWater = waterRaster.fastDistanceTransform(1000).sqrt().rename('distToWater');

// Add distance to coastline
var coastline = ee.FeatureCollection('projects/sat-io/open-datasets/shoreline/mainlands');
var coastRaster = coastline.map(function(f) {
  return f.set('presence', 1);
}).reduceToImage({
  properties: ['presence'],
  reducer: ee.Reducer.first()
}).rename('coastMask').clip(roi);
var distToCoast = coastRaster.fastDistanceTransform(1000).sqrt().rename('distToCoast');


// Load and rename SOC
var SOCS = ee.Image("image").rename('SOCS');

// Create a full unmasked image with 500
var socFull = ee.Image.constant(500).clip(roi).rename('SOCS');

// Combine real SOC where it exists, fallback to 500 where it's missing
var socFilled = socFull.where(SOCS.mask(), SOCS);


// Apply NDVI, NDBI, and terrain bands to dataset
var datasetWithIndices = addNDVI(dataset);   // only once
datasetWithIndices = addNDBI(datasetWithIndices); // only once
datasetWithIndices = datasetWithIndices
  .addBands(dem.rename('elevation'))
  .addBands(slope)
  .addBands(aspect)
  .addBands(distToWater)
  .addBands(distToCoast)
  .addBands(socFilled);


// Visualization Parameters
var visParams = {
  bands: ['sur_refl_b02', 'sur_refl_b04', 'sur_refl_b03'], 
  min: -100.0,
  max: 3000.0,
  gamma: 1.4
};

Map.setCenter(31.18, 31.05);
Map.addLayer(dataset, visParams, 'MODIS Image');

// Define training data (adjusted classes)
var classNames = Agriculture.merge(SandPlains).merge(Wetlands).merge(Urban).merge(ReclaimedLand)
.merge(SaltMarsh).merge(Water).merge(ReedVegetation).merge(BareRock).merge(GSFlattes);
print('Class Names:', classNames);

// Update classification bands
var bands = ['sur_refl_b01', 'sur_refl_b02', 'sur_refl_b03', 
             'sur_refl_b04', 'sur_refl_b05', 'sur_refl_b06', 
             'sur_refl_b07', 'NDVI', 'NDBI', 'elevation', 'slope', 
             'aspect', 'distToWater','distToCoast','SOCS'];

// Sample training points
var training = datasetWithIndices.select(bands).sampleRegions({
  collection: classNames,
  properties: ['landcover'],
  scale: 500
});
print('Training Data:', training);
print('Class Distribution:', training.aggregate_histogram('landcover'));
print('Unique Labels in Training Data:', training.distinct(['landcover']));

// Train a Random Forest classifier with 100 trees
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 100, 
  minLeafPopulation: 2
}).train({
  features: training,
  classProperty: 'landcover',
  inputProperties: bands
});

// Run the classification
var classified = datasetWithIndices.select(bands).classify(classifier);

// Apply post-classification mode filter (removes noise)
var filtered = classified.focalMode(1.5);

// Display the classification results
Map.centerObject(classNames, 11);
Map.addLayer(filtered,
  {min: 0, max: 11, palette: ['33A02C','1F78B4', '66C2A5','FF7F00','FDBF6F',
  'B3B3B3', '984EA3','8DA0CB','98fb98','a0522d','c04000']},
  'Filtered Classification');

  // Manually define land cover class labels and corresponding colors
var classLabels = [
  'Agriculture',    
  'Urban' ,  
  'Wetlands',        
  'Reclaimed Land', 
  'SandPlains', 
  'Saltmarshes', 
  'Reed Vegetation',
  'Water',
  'BareRock',
  'GSFlattes'   
];

var classColors = [
  '#33A02C', // Agriculture
  '#1F78B4', // Urban
  '#66C2A5', // Wetlands
  '#FF7F00', // Reclaimed Land
  '#FDBF6F', // SandPlains
  '#B3B3B3', // Saltmarshes
  '#984EA3', // Reed Vegetation
  '#8DA0CB',   // Water
  '#98fb98', //BareRock
  '#a0522d'  //GSFlattes 
];

  
// 2. Create a panel for the legend
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

// 3. Create title for the legend
var legendTitle = ui.Label({
  value: 'Land Cover Legend',
  style: {
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0 0 6px 0',
    padding: '0'
  }
});
legend.add(legendTitle);

for (var i = 0; i < classLabels.length; i++) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: classColors[i],
      padding: '8px',
      margin: '0 8px 4px 0',
      border: '1px solid black'
    }
  });

  var description = ui.Label({
    value: classLabels[i],
    style: {margin: '0 0 4px 0'}
  });

  var legendItem = ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });

  legend.add(legendItem);
}

// 5. Add legend to the map
Map.add(legend);

 print('Band names:', datasetWithIndices.bandNames());
 
Export.image.toDrive({
  image: classified.toInt8(),
  description: 'LULC_Classification_year',
  scale: 500,
  region: roi,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e13
});
// ==========================
// Calculate area per class
// ==========================

// Use filtered classification result
var classifiedImage = filtered;

// Compute pixel area and add classification band
var areaImage = ee.Image.pixelArea().addBands(classifiedImage);

// Reduce region by class
var areas = areaImage.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,          // band index (classified image)
    groupName: 'landcover'
  }),
  geometry: roi,
  scale: 500,               // resolution of your MODIS dataset
  maxPixels: 1e13
});

// Extract groups
var classAreas = ee.List(areas.get('groups'));

// Convert to FeatureCollection with readable areas
var fc = ee.FeatureCollection(classAreas.map(function(f) {
  f = ee.Dictionary(f);
  return ee.Feature(null, {
    landcover: f.get('landcover'),
    area_m2: f.get('sum'),
    area_ha: ee.Number(f.get('sum')).divide(10000),
    area_km2: ee.Number(f.get('sum')).divide(1e6)
  });
}));

print("Landcover areas", fc);

// ==========================
// Export to Excel-readable CSV
// ==========================
Export.table.toDrive({
  collection: fc,
  description: 'LULC_Areas_year',
  fileFormat: 'CSV'
});

