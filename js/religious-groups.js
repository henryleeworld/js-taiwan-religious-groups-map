var sidebar = new ol.control.Sidebar({
    element: 'sidebar',
    position: 'right'
});
var jsonFiles, filesLength, fileKey = 0;

var projection = ol.proj.get('EPSG:3857');
var projectionExtent = projection.getExtent();
var size = ol.extent.getWidth(projectionExtent) / 256;
var resolutions = new Array(20);
var matrixIds = new Array(20);
for (var z = 0; z < 20; ++z) {
    resolutions[z] = size / Math.pow(2, z);
    matrixIds[z] = z;
}

var cityList = {};
var filterCity = '',
    filterTown = '';
var filterExtent = false;
var selectedGod = '';
var emptyStyle = new ol.style.Style();

function pointStyle(f, resolution) {
    var p = f.getProperties(),
        color = '',
        stroke, size;
    if (selectedGod !== '' && (!p['主祀神祇'] || p['主祀神祇'] !== selectedGod)) {
        return emptyStyle;
    }

    var hasPhoto = photoMapping[p.uuid] ? true : false;

    switch (p['類型']) {
        case '寺廟':
        case '宗祠基金會':
        case '宗祠':
            color = hasPhoto ? '#32CD32' : '#ceaf30';
            break;
        case '教會':
            color = hasPhoto ? '#90EE90' : '#fff';
            break;
        case '基金會':
            color = hasPhoto ? '#98FB98' : '#00a6b5';
            break;
        default:
            color = hasPhoto ? '#3CB371' : '#ff0000';
            break;
    }

    if (false !== currentFeature && currentFeature.get('uuid') == p.uuid) {
        stroke = new ol.style.Stroke({
            color: '#000',
            width: 3
        });
        size = 30;
    } else {
        stroke = new ol.style.Stroke({
            color: '#000',
            width: 1
        });
        size = 15;
    }

    let pointStyle = new ol.style.Style({
        image: new ol.style.RegularShape({
            points: 3,
            radius: size,
            fill: new ol.style.Fill({
                color: color
            }),
            stroke: stroke,
            rotation: Math.PI / 4
        })
    });

    var zoom = map.getView().getZoomForResolution(resolution);
    if (zoom > 14 && p['主祀神祇']) {
        pointStyle.setText(new ol.style.Text({
            text: p['主祀神祇'],
            font: '12px Arial',
            fill: new ol.style.Fill({
                color: '#000'
            }),
            stroke: new ol.style.Stroke({
                color: '#fff',
                width: 2
            }),
            offsetY: -size - 5
        }));
    }

    return pointStyle;
}
var sidebarTitle = document.getElementById('sidebarTitle');
var content = document.getElementById('infoBox');

var appView = new ol.View({
    center: ol.proj.fromLonLat([121.563900, 25.034030]),
    zoom: 9
});

var pointFormat = new ol.format.GeoJSON({
    featureProjection: appView.getProjection()
});

var clusterSource = new ol.source.Cluster({
    distance: 40,
    source: new ol.source.Vector({
        format: pointFormat
    })
});

function vectorPointsStyle(feature, resolution) {
    var size = feature.get('features').length;
    if (size > 1) {
        if (selectedGod !== '') {
            var matchingFeatures = feature.get('features').filter(function(f) {
                var mainGod = f.getProperties()['主祀神祇'];
                return mainGod && mainGod === selectedGod;
            });
            if (matchingFeatures.length === 0) {
                return emptyStyle;
            }
            size = matchingFeatures.length;
        }

        var countWithoutPhoto = feature.get('features').filter(function(f) {
            return !photoMapping[f.get('uuid')];
        }).length;

        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 10 + Math.min(size, 20),
                fill: new ol.style.Fill({
                    color: 'rgba(255, 153, 0, 0.8)'
                }),
                stroke: new ol.style.Stroke({
                    color: '#fff',
                    width: 2
                })
            }),
            text: new ol.style.Text({
                text: countWithoutPhoto + '/' + size,
                fill: new ol.style.Fill({
                    color: '#fff'
                })
            })
        });
    } else {
        return pointStyle(feature.get('features')[0], resolution);
    }
}

var vectorPoints = new ol.layer.Vector({
    source: clusterSource,
    style: vectorPointsStyle
});

var baseLayer = new ol.layer.Tile({
    source: new ol.source.WMTS({
        matrixSet: 'EPSG:3857',
        format: 'image/png',
        url: 'https://wmts.nlsc.gov.tw/wmts',
        layer: 'EMAP',
        tileGrid: new ol.tilegrid.WMTS({
            origin: ol.extent.getTopLeft(projectionExtent),
            resolutions: resolutions,
            matrixIds: matrixIds
        }),
        style: 'default',
        wrapX: true,
        attributions: '<a href="http://maps.nlsc.gov.tw/" target="_blank">國土測繪圖資服務雲</a>'
    }),
    opacity: 0.8
});

function countyStyle(f) {
    var p = f.getProperties();
    if (selectedCounty === p.COUNTYNAME) {
        return null;
    }
    var color = 'rgba(255,255,255,0.6)';
    var strokeWidth = 1;
    var strokeColor = 'rgba(0,0,0,0.3)';
    var cityKey = p.COUNTYNAME;
    var textColor = '#000000';
    var baseStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: strokeColor,
            width: strokeWidth
        }),
        fill: new ol.style.Fill({
            color: color
        }),
        text: new ol.style.Text({
            font: '14px "Open Sans", "Arial Unicode MS", "sans-serif"',
            text: p.COUNTYNAME + "\n(請點選)",
            fill: new ol.style.Fill({
                color: textColor
            })
        })
    });
    return baseStyle;
}

var county = new ol.layer.Vector({
    source: new ol.source.Vector({
        url: 'data/20200820.json',
        format: new ol.format.TopoJSON({
            featureProjection: appView.getProjection()
        })
    }),
    style: countyStyle,
    zIndex: 50
});


var map = new ol.Map({
    layers: [baseLayer, county, vectorPoints],
    target: 'map',
    view: appView
});

map.addControl(sidebar);
var pointClicked = false;
var selectedCounty = '';
var pointsPool = {};
map.on('singleclick', function(evt) {
    content.innerHTML = '';
    pointClicked = false;
    map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
        if (false === pointClicked) {
            if (feature.get('features')) {
                var features = feature.get('features');
                if (features.length === 1) {
                    pointClicked = true;
                    var p = features[0].getProperties();
                    if (p.uuid) {
                        var timestamp = Date.now();
                        setTimeout(function() {
                            routie('point/' + p['行政區'] + '/' + p.uuid);
                        }, 1);
                    }
                } else if (features.length > 1) {
                    sidebarTitle.innerHTML = '';
                    content.innerHTML = '';
                    sidebar.close();

                    var extent = ol.extent.createEmpty();
                    features.forEach(function(f) {
                        ol.extent.extend(extent, f.getGeometry().getExtent());
                    });

                    var currentZoom = map.getView().getZoom();
                    var newZoom = currentZoom + Math.log2(features.length);
                    newZoom = Math.min(newZoom, 20);

                    map.getView().fit(extent, {
                        duration: 1000,
                        padding: [50, 50, 50, 50],
                        maxZoom: newZoom
                    });

                    pointClicked = true;
                }
            } else if (feature.get('COUNTYNAME')) {
                pointClicked = true;
                routie('county/' + feature.get('COUNTYNAME'));
            }
        }
    });
    if (false === pointClicked) {
        sidebarTitle.innerHTML = '';
        content.innerHTML = '';
        sidebar.close();
    }
});

var previousFeature = false;
var currentFeature = false;

var geolocation = new ol.Geolocation({
    projection: appView.getProjection()
});

geolocation.setTracking(true);

geolocation.on('error', function(error) {
    console.log(error.message);
});

var positionFeature = new ol.Feature();

positionFeature.setStyle(new ol.style.Style({
    image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({
            color: '#3399CC'
        }),
        stroke: new ol.style.Stroke({
            color: '#fff',
            width: 2
        })
    })
}));

var firstPosDone = false;
geolocation.on('change:position', function() {
    var coordinates = geolocation.getPosition();
    positionFeature.setGeometry(coordinates ? new ol.geom.Point(coordinates) : null);
    if (false === firstPosDone) {
        map.dispatchEvent({
            type: 'singleclick',
            coordinate: coordinates,
            pixel: map.getPixelFromCoordinate(coordinates)
        });
        appView.setCenter(coordinates);
        firstPosDone = true;
    }
});

new ol.layer.Vector({
    map: map,
    source: new ol.source.Vector({
        features: [positionFeature]
    })
});

$('#btn-geolocation').click(function() {
    var coordinates = geolocation.getPosition();
    if (coordinates) {
        appView.setCenter(coordinates);
    } else {
        alert('目前使用的設備無法提供地理資訊');
    }
    return false;
});

var gods = '福德正神,釋迦牟尼佛,天上聖母,玄天上帝,關聖帝君,觀世音菩薩,觀音佛祖,保生大帝,五府千歲,池府千歲,三山國王,明明上帝,中壇元帥,清水祖師,三官大帝,神農大帝,李府千歲,觀音菩薩,瑤池金母,北極玄天上帝,阿彌陀佛,廣澤尊王,土地公,開漳聖王,三寶佛,地藏王菩薩,玉皇大帝,朱府千歲,媽祖,吳府千歲,西方三聖,玉皇上帝,大眾爺,真武大帝,文衡聖帝,孚佑帝君,溫府千歲,觀音大士,九天玄女,西王金母,濟公活佛,王母娘娘,三府王爺,池府王爺,太子爺';
var godsList = gods.split(',');
var godsOptions = '<option value="">顯示全部</option>';
for (k in godsList) {
    godsOptions += '<option value="' + godsList[k] + '">' + godsList[k] + '</option>';
}
$('#selectGod').html(godsOptions).change(function() {
    $('#findGod').val($(this).val());
    $('#findGod').trigger('change');
});
$('#findGod').change(function() {
    selectedGod = $(this).val();
    clusterSource.refresh();
}).val('');

var searchData = [];

var photoMapping = {};

function loadPhotoMapping() {
    $.ajax({
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgdBZV-REAiv3B356dc_IMZcA1ZNoqpXFFvRjzRe0HcNW5dcBc53zyejsWLxpf10Ulp65LuCJUBPnD/pub?gid=681007359&single=true&output=csv',
        success: function(csvData) {
            const rows = csvData.split('\n');
            rows.shift();
            rows.forEach(row => {
                const [timestamp, driveUrl, uuid] = row.split(',');
                if (uuid && driveUrl) {
                    const idMatch = driveUrl.match(/[-\w]{25,}/);
                    const driveId = idMatch ? idMatch[0] : null;
                    if (driveId) {
                        photoMapping[uuid.trim()] = driveId;
                    }
                }
            });

            routie({
                'county/:countyName': function(countyName) {
                    selectedCounty = countyName;
                    clusterSource.getSource().clear();
                    searchData = [];
                    if (!pointsPool[selectedCounty]) {
                        $.getJSON('data/' + selectedCounty + '.json', function(c) {
                            pointsPool[selectedCounty] = c;
                            var features = pointFormat.readFeatures(pointsPool[selectedCounty]);
                            clusterSource.getSource().addFeatures(features);
                            populateSearchData(features);
                        });
                    } else {
                        var features = pointFormat.readFeatures(pointsPool[selectedCounty]);
                        clusterSource.getSource().addFeatures(features);
                        populateSearchData(features);
                    }
                    county.getSource().refresh();
                },

                'point/:county/:uuid': function(countyName, uuid) {
                    if (!pointsPool[countyName]) {
                        searchData = [];
                        clusterSource.getSource().clear();
                        selectedCounty = countyName;
                        county.getSource().refresh();
                        $.getJSON('data/' + countyName + '.json', function(c) {
                            pointsPool[countyName] = c;
                            var features = pointFormat.readFeatures(pointsPool[selectedCounty]);
                            clusterSource.getSource().addFeatures(features);
                            populateSearchData(features);
                            displayPointInfo(countyName, uuid);
                        });
                    } else if (selectedCounty != countyName) {
                        clusterSource.getSource().clear();
                        selectedCounty = countyName;
                        county.getSource().refresh();
                        clusterSource.getSource().addFeatures(pointFormat.readFeatures(pointsPool[countyName]));
                        displayPointInfo(countyName, uuid);
                    } else {
                        displayPointInfo(countyName, uuid);
                    }
                }
            });
        }
    });
}

loadPhotoMapping();

$(document).ready(function() {
    $('#searchPoint').autocomplete({
        source: function(request, response) {
            var results = $.ui.autocomplete.filter(searchData, request.term);
            response(results.slice(0, 10));
        },
        minLength: 1,
        select: function(event, ui) {
            var features = clusterSource.getSource().getFeatures();
            var feature = features.find(f => f.get('uuid') === ui.item.id);
            if (feature) {
                var county = feature.get('行政區');
                var uuid = feature.get('uuid');
                routie('point/' + county + '/' + uuid);
            }
        }
    });
});

function populateSearchData(features) {
    features.forEach(function(feature) {
        var props = feature.getProperties();
        searchData.push({
            label: props['名稱'] + ' (' + props['地址'] + ') ' + props['電話'],
            value: props['名稱'],
            id: props['uuid']
        });
    });
}

function displayPointInfo(county, uuid) {
    var features = pointFormat.readFeatures(pointsPool[county]);
    var feature = features.find(f => f.get('uuid') === uuid);

    if (feature) {
        feature.setId(uuid);
        currentFeature = feature;

        var p = feature.getProperties();
        var lonLat = ol.proj.toLonLat(p.geometry.getCoordinates());
        var message = '';

        if (photoMapping[uuid]) {
            message += '<iframe src="https://drive.google.com/file/d/' + photoMapping[uuid] + '/preview" style="width:100%; height:400px; border:none; margin-bottom:10px;"></iframe>';
        } else {
            message += '<div class="btn-group-vertical" role="group" style="width: 100%;"><a href="https://docs.google.com/forms/d/e/1FAIpQLSdvPybiyuuiTDSk3cuoU_fECQyEqlqCEawzdp12gHkVpLzSmA/viewform?usp=pp_url&entry.2072773208=' + uuid + '" target="_blank" class="btn btn-warning btn-lg btn-block">提供照片</a></div>';
        }

        message += '<table class="table table-dark">';
        message += '<tbody>';
        for (k in p) {
            if (k != 'geometry' && k != 'uuid' && k != 'WGS84X' && k != 'WGS84Y') {
                message += '<tr><th scope="row" style="width: 100px;">' + k + '</th><td>' + p[k] + '</td></tr>';
            }
        }
        message += '<tr><td colspan="2">';
        message += '<hr /><div class="btn-group-vertical" role="group" style="width: 100%;">';

        message += '<a href="https://www.google.com/maps/dir/?api=1&destination=' + lonLat[1] + ',' + lonLat[0] + '&travelmode=driving" target="_blank" class="btn btn-info btn-lg btn-block">Google 導航</a>';
        message += '<a href="https://wego.here.com/directions/drive/mylocation/' + lonLat[1] + ',' + lonLat[0] + '" target="_blank" class="btn btn-info btn-lg btn-block">Here WeGo 導航</a>';
        message += '<a href="https://bing.com/maps/default.aspx?rtp=~pos.' + lonLat[1] + '_' + lonLat[0] + '" target="_blank" class="btn btn-info btn-lg btn-block">Bing 導航</a>';
        message += '</div></td></tr>';
        message += '</tbody></table>';
        sidebarTitle.innerHTML = p['名稱'];
        content.innerHTML = message;
        sidebar.open('home');

        appView.setCenter(feature.getGeometry().getCoordinates());
        if (appView.getZoom() < 14) {
            appView.setZoom(14);
        }
        clusterSource.refresh();
    }
}