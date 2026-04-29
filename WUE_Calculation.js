
var gpp = ee.ImageCollection('MODIS/061/MOD17A2HGF')
            .select('Gpp')
            .filterDate('2023-01-01', '2023-12-31')// change the date for each year
            .sum()
            .clip(roi)
            .multiply(0.0001); // scale factor for GPP

var et = ee.ImageCollection('MODIS/061/MOD16A2GF')
            .select('ET')
            .filterDate('2023-01-01', '2023-12-31')// change the date for each year
            .sum()
            .clip(roi)
            .multiply(0.1); // scale factor for ET

var wue = gpp.divide(et); // gC per mm of H2O

Map.centerObject(roi, 7); // Adjust zoom level
Map.addLayer( wue.clip(roi), {
  min: 0,
  max: 1, // Adjust based on your region's WUE values
  palette: ['red', 'orange', 'yellow', 'green', 'blue']
}, 'Water Use Efficiency');

Export.image.toDrive({
  image: wue.clip(roi),
  description: 'WUE_2023',
  scale: 500,
  region: roi,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e13
});


var legend = ui.Panel({style: {position: 'bottom-left'}});
legend.add(ui.Label('WUE (gC/mm H₂O)'));

var palette = ['red', 'orange', 'yellow', 'green', 'blue'];
var min = 0;
var max = 0.1;

palette.forEach(function(color, index) {
  var label = min + ((max - min) / (palette.length - 1)) * index;
  var row = ui.Panel({
    widgets: [
      ui.Label(label.toFixed(2), {margin: '4px 8px'}),
      ui.Label('', {
        backgroundColor: color,
        padding: '8px',
        margin: '4px'
      })
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
  legend.add(row);
});
Map.add(legend);


Map.addLayer(gpp.clip(roi), {
  min: 0,
  max: 0.0001,
  palette: ['white', 'green']
}, 'GPP');

Map.addLayer(et.clip(roi), {
  min: 0,
  max: 1,
  palette: ['white', 'blue']
}, 'ET');

