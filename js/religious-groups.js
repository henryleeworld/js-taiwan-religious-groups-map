var map;
var markersLayer;
var clusterGroup;
var selectedCounty = '';
var selectedGod = '';
var currentFeature = false;
var selectedMarkerUuid = null;
var pointsPool = {};
var searchData = [];
var photoMapping = {};
var countyBoundaryLayer = null;
var countyLabels = {};

var SACRED_COLORS = {
    gold: '#D4AF37',
    deepGold: '#B8860B',
    lightGold: '#F4E7B1',
    purple: '#6B46C1',
    deepPurple: '#553C9A',
    lightPurple: '#E0E7FF',
    warmWhite: '#FEFCF8',
    photoGold: '#FFD700',
    crimson: '#DC143C',
    emerald: '#50C878'
};

var pointPopup = new bootstrap.Modal(document.getElementById('point-popup'));
var settingsPopup = new bootstrap.Modal(document.getElementById('settings-popup'));
var helpPopup = new bootstrap.Modal(document.getElementById('help-popup'));
var content = document.getElementById('infoBox');

function initMap() {
    map = L.map('map', {
        center: [25.034030, 121.563900],
        zoom: 9,
        zoomControl: false
    });

    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', {
        attribution: '<a href="http://maps.nlsc.gov.tw/" target="_blank">國土測繪圖資服務雲</a>',
        maxZoom: 18,
        opacity: 0.8
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 60,
        iconCreateFunction: function(cluster) {
            return createClusterIcon(cluster);
        },
        spiderfyOnMaxZoom: false,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 16,
        maxZoom: 15,
        animateAddingMarkers: false,
        chunkedLoading: true,
        chunkInterval: 50,
        chunkProgress: function(processed, total) {
            if (processed === total) {
                console.log('Finished loading ' + total + ' markers');
            }
        }
    });

    map.addLayer(clusterGroup);

    map.on('click', function(e) {
        setTimeout(function() {
            var currentTime = Date.now();
            if (!window.lastMarkerClickTime || (currentTime - window.lastMarkerClickTime) > 200) {
                clearSelectedMarker();
            }
        }, 150);
    });
    loadCountyBoundaries();
}

function createClusterIcon(cluster) {
    var childCount = cluster.getChildCount();
    var photoCount = 0;
    cluster.getAllChildMarkers().forEach(function(marker) {
        if (marker.options.hasPhoto) {
            photoCount++;
        }
    });

    var withoutPhoto = childCount - photoCount;
    var size = Math.min(30 + Math.log(childCount) * 8, 50);
    var className = 'marker-cluster';
    if (childCount < 10) {
        className += ' marker-cluster-small';
    } else if (childCount < 100) {
        className += ' marker-cluster-medium';
    } else {
        className += ' marker-cluster-large';
    }
    return L.divIcon({
        html: `<div class="${className}" style="width: ${size}px; height: ${size}px; line-height: ${size}px;">
             <span class="cluster-count">${withoutPhoto}/${childCount}</span>
           </div>`,
        className: 'marker-cluster-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

function createSacredIcon(type, hasPhoto, isSelected) {
    var size = isSelected ? 20 : 16;
    var typeClass = 'temple';
    if (type === '教會') {
        typeClass = 'church';
    } else if (type === '基金會') {
        typeClass = 'foundation';
    }

    var className = `simple-marker marker-${typeClass}`;
    if (hasPhoto) className += ' has-photo';
    if (isSelected) className += ' selected';

    return L.divIcon({
        html: `<div class="${className}" style="width: ${size}px; height: ${size}px;"></div>`,
        className: 'marker-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2]
    });
}

function loadCountyBoundaries() {
    if (typeof topojson === 'undefined') {
        console.log('TopoJSON library not available, using fallback');
        loadFallbackBoundaries();
        return;
    }

    fetch('data/20200820.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            try {
                if (!data || !data.objects) {
                    throw new Error('Invalid TopoJSON structure');
                }
                var objectKey = null;
                var possibleKeys = ['county', '20200820', 'counties', 'taiwan', 'boundaries'];

                for (var i = 0; i < possibleKeys.length; i++) {
                    if (data.objects[possibleKeys[i]]) {
                        objectKey = possibleKeys[i];
                        break;
                    }
                }
                if (!objectKey) {
                    var availableKeys = Object.keys(data.objects);
                    console.log('Available TopoJSON objects:', availableKeys);
                    if (availableKeys.length > 0) {
                        objectKey = availableKeys[0];
                    } else {
                        throw new Error('No objects found in TopoJSON');
                    }
                }
                console.log('Using TopoJSON object:', objectKey);
                var geojson = topojson.feature(data, data.objects[objectKey]);
                renderCountyBoundaries(geojson);

            } catch (conversionError) {
                console.error('Error converting TopoJSON:', conversionError);
                loadFallbackBoundaries();
            }
        })
        .catch(error => {
            console.error('Error loading county boundaries:', error);
            loadFallbackBoundaries();
        });
}

function renderCountyBoundaries(geojson) {
    if (!geojson || !geojson.features) {
        console.error('Invalid GeoJSON for rendering');
        loadFallbackBoundaries();
        return;
    }

    if (countyBoundaryLayer) {
        map.removeLayer(countyBoundaryLayer);
    }

    countyBoundaryLayer = L.geoJSON(geojson, {
        style: function(feature) {
            var countyName = getCountyName(feature);
            var isSelected = selectedCounty === countyName;

            return {
                fillColor: isSelected ? SACRED_COLORS.lightGold : SACRED_COLORS.warmWhite,
                weight: isSelected ? 3 : 1,
                opacity: isSelected ? 0.8 : 0.3,
                color: isSelected ? SACRED_COLORS.gold : SACRED_COLORS.lightGold,
                fillOpacity: isSelected ? 0.1 : 0.6
            };
        },
        onEachFeature: function(feature, layer) {
            var countyName = getCountyName(feature);
            if (!countyName) {
                return;
            }

            layer.on({
                click: function(e) {
                    selectCounty(countyName);
                }
            });

            createCountyLabel(countyName, layer.getBounds().getCenter());
        }
    }).addTo(map);

    if (selectedCounty) {
        console.log('Applying initial county selection styling for:', selectedCounty);
        countyBoundaryLayer.setStyle(function(feature) {
            var fCountyName = getCountyName(feature);
            var isSelected = selectedCounty === fCountyName;

            return {
                fillColor: isSelected ? SACRED_COLORS.lightGold : SACRED_COLORS.warmWhite,
                weight: isSelected ? 3 : 1,
                opacity: isSelected ? 0.8 : 0.3,
                color: isSelected ? SACRED_COLORS.gold : SACRED_COLORS.lightGold,
                fillOpacity: isSelected ? 0.1 : 0.6
            };
        });
    }
}

function createCountyLabel(countyName, position) {
    if (countyLabels[countyName]) {
        map.removeLayer(countyLabels[countyName]);
    }

    if (selectedCounty !== countyName) {
        var labelMarker = L.marker(position, {
            icon: L.divIcon({
                html: `<div class="county-label">${countyName}<br/>(請點選)</div>`,
                className: 'county-label-container',
                iconSize: [100, 40],
                iconAnchor: [50, 20]
            })
        });

        labelMarker.on('click', function(e) {
            console.log('County label clicked:', countyName);
            selectCounty(countyName);
        });

        countyLabels[countyName] = labelMarker;
        labelMarker.addTo(map);
    }
}

function selectCounty(countyName, skipRouteUpdate) {
    console.log('Selecting county:', countyName, 'skipRouteUpdate:', skipRouteUpdate);
    var wasAlreadySelected = selectedCounty === countyName;
    selectedCounty = countyName;
    if (countyLabels[countyName]) {
        map.removeLayer(countyLabels[countyName]);
        delete countyLabels[countyName];
    }
    if (countyBoundaryLayer) {
        countyBoundaryLayer.setStyle(function(feature) {
            var fCountyName = getCountyName(feature);
            var isSelected = selectedCounty === fCountyName;

            return {
                fillColor: isSelected ? SACRED_COLORS.lightGold : SACRED_COLORS.warmWhite,
                weight: isSelected ? 3 : 1,
                opacity: isSelected ? 0.8 : 0.3,
                color: isSelected ? SACRED_COLORS.gold : SACRED_COLORS.lightGold,
                fillOpacity: isSelected ? 0.1 : 0.6
            };
        });
    } else {
        console.log('Boundaries not loaded yet, will retry highlighting');
        setTimeout(function() {
            if (countyBoundaryLayer && selectedCounty === countyName) {
                countyBoundaryLayer.setStyle(function(feature) {
                    var fCountyName = getCountyName(feature);
                    var isSelected = selectedCounty === fCountyName;

                    return {
                        fillColor: isSelected ? SACRED_COLORS.lightGold : SACRED_COLORS.warmWhite,
                        weight: isSelected ? 3 : 1,
                        opacity: isSelected ? 0.8 : 0.3,
                        color: isSelected ? SACRED_COLORS.gold : SACRED_COLORS.lightGold,
                        fillOpacity: isSelected ? 0.1 : 0.6
                    };
                });
            }
        }, 1000);
    }

    if (!wasAlreadySelected) {
        loadCountyData(countyName);
    } else {
        console.log('County already selected, skipping data reload');
    }

    if (typeof routie !== 'undefined' && !wasAlreadySelected && !skipRouteUpdate) {
        routie('county/' + countyName);
    }
}

function getCountyName(feature) {
    if (!feature.properties) {
        return null;
    }

    return feature.properties.COUNTYNAME ||
        feature.properties.name ||
        feature.properties.Name ||
        feature.properties.縣 ||
        null;
}

function loadFallbackBoundaries() {
    console.log('Loading fallback county boundaries...');
    var taiwanCounties = [
        '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣',
        '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市',
        '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
        '臺東縣', '澎湖縣', '金門縣', '連江縣'
    ];
    var countyListHtml = '<div class="county-selection"><h3>選擇縣市：</h3><div class="county-grid">';
    taiwanCounties.forEach(function(county, index) {
        console.log('Creating button for county:', county, 'at index:', index);
        countyListHtml += `<button class="county-btn" data-county="${county}" data-index="${index}">${county}</button>`;
    });
    countyListHtml += '</div></div>';

    console.log('County selection HTML created:', countyListHtml);
    var countyControl = L.control({
        position: 'topleft'
    });
    countyControl.onAdd = function() {
        var div = L.DomUtil.create('div', 'county-control');
        div.innerHTML = countyListHtml;
        var buttons = div.querySelectorAll('.county-btn');
        console.log('Found', buttons.length, 'county buttons to attach listeners to');

        buttons.forEach(function(button, btnIndex) {
            console.log('Attaching listener to button', btnIndex, 'for county:', button.getAttribute('data-county'));
            button.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var countyName = this.getAttribute('data-county');
                console.log('County button clicked:', countyName);
                console.log('Using selectCounty function for:', countyName);
                selectCounty(countyName);
                try {
                    map.removeControl(countyControl);
                } catch (removeError) {
                    console.log('Could not remove county control:', removeError);
                }
            });
        });
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        return div;
    };
    countyControl.addTo(map);
}

function loadCountyData(countyName) {
    console.log('Loading county data for:', countyName);

    if (!pointsPool[countyName]) {
        console.log('Fetching new data for county:', countyName);

        fetch(`data/${countyName}.json`)
            .then(response => {
                console.log('Fetch response status:', response.status);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('County data loaded:', data);
                console.log('Number of features:', data.features ? data.features.length : 'No features property');

                pointsPool[countyName] = data;
                addMarkersToMap(data);
                populateSearchData(data.features || []);
            })
            .catch(error => {
                console.error('Error loading county data:', error);
                console.error('Failed URL:', `data/${countyName}.json`);
                alert(`無法載入 ${countyName} 的宗教場所資料。請稍後再試。`);
            });
    } else {
        console.log('Using cached data for county:', countyName);
        console.log('Cached data:', pointsPool[countyName]);

        addMarkersToMap(pointsPool[countyName]);
        populateSearchData(pointsPool[countyName].features || []);
    }
}

function addMarkersToMap(geojsonData) {
    console.log('Adding markers to map. Data:', geojsonData);

    if (!geojsonData || !geojsonData.features) {
        console.error('Invalid geojsonData:', geojsonData);
        return;
    }

    clusterGroup.clearLayers();
    console.log('Cleared existing layers');

    var features = geojsonData.features;
    var batchSize = 50;
    var currentIndex = 0;
    var addedCount = 0;
    var skippedCount = 0;

    function processBatch() {
        var endIndex = Math.min(currentIndex + batchSize, features.length);

        for (var i = currentIndex; i < endIndex; i++) {
            var feature = features[i];

            if (!feature || !feature.properties || !feature.geometry) {
                console.warn('Invalid feature at index', i, feature);
                skippedCount++;
                continue;
            }

            var props = feature.properties;
            var coords = feature.geometry.coordinates;

            if (!coords || coords.length < 2) {
                console.warn('Invalid coordinates for feature:', props.uuid || i);
                skippedCount++;
                continue;
            }

            if (selectedGod !== '' && (!props['主祀神祇'] || props['主祀神祇'] !== selectedGod)) {
                skippedCount++;
                continue;
            }

            try {
                var hasPhoto = photoMapping[props.uuid] ? true : false;
                var isSelected = selectedMarkerUuid === props.uuid;
                var icon = createSacredIcon(props['類型'], hasPhoto, isSelected);

                var marker = L.marker([coords[1], coords[0]], {
                    icon: icon,
                    hasPhoto: hasPhoto,
                    uuid: props.uuid,
                    properties: props
                });

                marker.on('click', (function(markerProps) {
                    return function(e) {
                        window.lastMarkerClickTime = Date.now();
                        L.DomEvent.stopPropagation(e);

                        var timestamp = Date.now();
                        if (typeof routie !== 'undefined') {
                            routie('refresh/' + timestamp);
                            setTimeout(function() {
                                routie('point/' + markerProps['行政區'] + '/' + markerProps.uuid);
                            }, 1);
                        } else {
                            displayPointInfo(selectedCounty, markerProps.uuid);
                        }
                    };
                })(props));

                clusterGroup.addLayer(marker);
                addedCount++;

            } catch (markerError) {
                console.error('Error creating marker for feature:', props.uuid || i, markerError);
                skippedCount++;
            }
        }

        currentIndex = endIndex;

        if (currentIndex < features.length) {
            setTimeout(processBatch, 10);
        } else {
            console.log(`Markers processing complete. Added: ${addedCount}, Skipped: ${skippedCount}`);
            console.log('Total markers in cluster:', clusterGroup.getLayers().length);

            if (addedCount > 0) {
                try {
                    map.fitBounds(clusterGroup.getBounds(), {
                        padding: [20, 20]
                    });
                    console.log('Map bounds updated to fit markers');
                } catch (boundsError) {
                    console.warn('Could not fit bounds:', boundsError);
                }
            } else {
                console.warn('No markers were added to the map');
            }
        }
    }
    processBatch();
}

function displayPointInfo(county, uuid) {
    if (!pointsPool[county] || !pointsPool[county].features) {
        console.log('County data not loaded yet for:', county);
        setTimeout(function() {
            displayPointInfo(county, uuid);
        }, 500);
        return;
    }

    var features = pointsPool[county].features;
    var feature = features.find(f => f.properties.uuid === uuid);

    if (feature) {
        currentFeature = feature;
        var p = feature.properties;
        var coords = feature.geometry.coordinates;
        var message = '';
        if (photoMapping[uuid]) {
            message += '<iframe src="https://drive.google.com/file/d/' + photoMapping[uuid] + '/preview" style="width:100%; height:400px; border:none; margin-bottom:10px; border-radius: 8px;"></iframe>';
        } else {
            message += '<div class="text-center mb-3 p-3" style="background: var(--gradient-light); border-radius: 12px; border: 1px solid var(--primary-gold);">';
            message += '<p style="margin-bottom: 12px; color: var(--text-dark); font-weight: 500;"><i class="fa fa-camera" style="margin-right: 8px; color: var(--primary-gold);"></i>幫助我們記錄這個神聖的地方</p>';
            message += '<a href="https://docs.google.com/forms/d/e/1FAIpQLSdvPybiyuuiTDSk3cuoU_fECQyEqlqCEawzdp12gHkVpLzSmA/viewform?usp=pp_url&entry.2072773208=' + uuid + '" target="_blank" class="btn btn-primary"><i class="fa fa-camera" style="margin-right: 8px;"></i>提供照片</a>';
            message += '</div>';
        }

        message += '<table class="table table-sacred">';
        message += '<tbody>';
        var priorityFields = ['名稱', '類型', '主祀神祇', '地址', '電話', '負責人', '登記日期'];
        var displayedFields = new Set();
        for (var i = 0; i < priorityFields.length; i++) {
            var field = priorityFields[i];
            if (p[field] && p[field] !== '') {
                var icon = '';
                switch (field) {
                    case '名稱':
                        icon = '<i class="fa fa-home" style="margin-right: 8px; color: var(--primary-gold);"></i>';
                        break;
                    case '類型':
                        icon = '<i class="fa fa-tag" style="margin-right: 8px; color: var(--sacred-purple);"></i>';
                        break;
                    case '主祀神祇':
                        icon = '<i class="fa fa-star" style="margin-right: 8px; color: var(--primary-gold);"></i>';
                        break;
                    case '地址':
                        icon = '<i class="fa fa-map-marker" style="margin-right: 8px; color: var(--sacred-purple);"></i>';
                        break;
                    case '電話':
                        icon = '<i class="fa fa-phone" style="margin-right: 8px; color: var(--primary-gold);"></i>';
                        break;
                    case '負責人':
                        icon = '<i class="fa fa-user" style="margin-right: 8px; color: var(--sacred-purple);"></i>';
                        break;
                    case '登記日期':
                        icon = '<i class="fa fa-calendar" style="margin-right: 8px; color: var(--primary-gold);"></i>';
                        break;
                }
                message += '<tr><th scope="row" style="width: 120px; font-weight: 500;">' + icon + field + '</th><td style="font-weight: 400;">' + p[field] + '</td></tr>';
                displayedFields.add(field);
            }
        }
        for (var k in p) {
            if (k !== 'uuid' && !displayedFields.has(k) && p[k] !== '') {
                message += '<tr><th scope="row" style="width: 120px; font-weight: 500;"><i class="fa fa-info-circle" style="margin-right: 8px; color: var(--text-light);"></i>' + k + '</th><td style="font-weight: 400;">' + p[k] + '</td></tr>';
            }
        }

        message += '<tr><td colspan="2" style="border-top: 2px solid var(--primary-gold); padding-top: 20px;">';
        message += '<div class="btn-group-vertical" role="group" style="width: 100%; gap: 8px;">';

        message += '<a href="https://www.google.com/maps/dir/?api=1&destination=' + coords[1] + ',' + coords[0] + '&travelmode=driving" target="_blank" class="btn btn-info"><i class="fa-brands fa-google" style="margin-right: 8px;"></i>Google 導航</a>';
        message += '<a href="https://wego.here.com/directions/drive/mylocation/' + coords[1] + ',' + coords[0] + '" target="_blank" class="btn btn-info"><i class="fa fa-location-arrow" style="margin-right: 8px;"></i>Here WeGo 導航</a>';
        message += '<a href="https://bing.com/maps/default.aspx?rtp=~pos.' + coords[1] + '_' + coords[0] + '" target="_blank" class="btn btn-info"><i class="fa fa-compass" style="margin-right: 8px;"></i>Bing 導航</a>';
        message += '</div></td></tr>';
        message += '</tbody></table>';

        document.getElementById('pointPopupLabel').innerHTML = '<i class="fa fa-map-marker" style="margin-right: 8px;"></i>' + p['名稱'];
        content.innerHTML = message;

        pointPopup.show();
        updateSelectedMarker(uuid);
    }
}

function updateSelectedMarker(uuid) {
    selectedMarkerUuid = uuid;

    clusterGroup.eachLayer(function(marker) {
        var props = marker.options.properties;
        var hasPhoto = marker.options.hasPhoto;
        var isSelected = marker.options.uuid === uuid;
        var icon = createSacredIcon(props['類型'], hasPhoto, isSelected);
        marker.setIcon(icon);
    });
}

function clearSelectedMarker() {
    selectedMarkerUuid = null;

    clusterGroup.eachLayer(function(marker) {
        var props = marker.options.properties;
        var hasPhoto = marker.options.hasPhoto;
        var normalIcon = createSacredIcon(props['類型'], hasPhoto, false);
        marker.setIcon(normalIcon);
    });
}

function populateSearchData(features) {
    searchData = [];
    features.forEach(function(feature) {
        var props = feature.properties;
        searchData.push({
            label: props['名稱'] + ' (' + props['地址'] + ') ' + props['電話'],
            value: props['名稱'],
            id: props['uuid']
        });
    });
}

function loadPhotoMapping() {
    fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vQgdBZV-REAiv3B356dc_IMZcA1ZNoqpXFFvRjzRe0HcNW5dcBc53zyejsWLxpf10Ulp65LuCJUBPnD/pub?gid=681007359&single=true&output=csv')
        .then(response => response.text())
        .then(csvData => {
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
            initializeRouting();
        });
}

function initializeRouting() {
    routie({
        'county/:countyName': function(countyName) {
            selectCounty(countyName);
        },

        'point/:county/:uuid': function(countyName, uuid) {
            if (selectedCounty !== countyName) {
                selectCounty(countyName, true);
            }

            var checkDataAndDisplay = function() {
                if (pointsPool[countyName] && pointsPool[countyName].features) {
                    displayPointInfo(countyName, uuid);
                } else {
                    setTimeout(checkDataAndDisplay, 200);
                }
            };
            setTimeout(checkDataAndDisplay, 100);
        },
    });
}

function initializeGodSearch() {
    var gods = '福德正神,釋迦牟尼佛,天上聖母,玄天上帝,關聖帝君,觀世音菩薩,觀音佛祖,保生大帝,五府千歲,池府千歲,三山國王,明明上帝,中壇元帥,清水祖師,三官大帝,神農大帝,李府千歲,觀音菩薩,瑤池金母,北極玄天上帝,阿彌陀佛,廣澤尊王,土地公,開漳聖王,三寶佛,地藏王菩薩,玉皇大帝,朱府千歲,媽祖,吳府千歲,西方三聖,玉皇上帝,大眾爺,真武大帝,文衡聖帝,孚佑帝君,溫府千歲,觀音大士,九天玄女,西王金母,濟公活佛,王母娘娘,三府王爺,池府王爺,太子爺';
    var godsList = gods.split(',');
    var godsOptions = '<option value="">顯示全部</option>';
    for (var k in godsList) {
        godsOptions += '<option value="' + godsList[k] + '">' + godsList[k] + '</option>';
    }

    $('#selectGod').html(godsOptions).change(function() {
        $('#findGod').val($(this).val());
        $('#findGod').trigger('change');
    });

    $('#findGod').change(function() {
        selectedGod = $(this).val();
        if (selectedCounty && pointsPool[selectedCounty]) {
            addMarkersToMap(pointsPool[selectedCounty]);
        }
    }).val('');
}

function initializeGeolocation() {
    $('#btn-geolocation').click(function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(function(position) {
                var lat = position.coords.latitude;
                var lng = position.coords.longitude;
                map.setView([lat, lng], 14);
                L.marker([lat, lng], {
                    icon: L.divIcon({
                        html: '<div class="current-location-marker"><i class="fa fa-location-arrow"></i></div>',
                        className: 'current-location-container',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(map);
            }, function() {
                alert('目前使用的設備無法提供地理資訊');
            });
        } else {
            alert('目前使用的設備無法提供地理資訊');
        }
        return false;
    });
}

$(document).ready(function() {
    initMap();
    loadPhotoMapping();
    initializeGodSearch();
    initializeGeolocation();

    var fabMenuVisible = false;

    $('#main-fab').click(function() {
        var fabMenu = $('#fab-menu');
        if (fabMenuVisible) {
            fabMenu.addClass('d-none');
            $(this).find('i').removeClass('fa-times').addClass('fa-bars');
        } else {
            fabMenu.removeClass('d-none');
            $(this).find('i').removeClass('fa-bars').addClass('fa-times');
        }
        fabMenuVisible = !fabMenuVisible;
    });

    $('#fab-settings').click(function() {
        settingsPopup.show();
        $('#fab-menu').addClass('d-none');
        $('#main-fab').find('i').removeClass('fa-times').addClass('fa-bars');
        fabMenuVisible = false;
    });

    $('#fab-help').click(function() {
        helpPopup.show();
        $('#fab-menu').addClass('d-none');
        $('#main-fab').find('i').removeClass('fa-times').addClass('fa-bars');
        fabMenuVisible = false;
    });

    $(document).click(function(e) {
        if (!$(e.target).closest('#fab-container').length && fabMenuVisible) {
            $('#fab-menu').addClass('d-none');
            $('#main-fab').find('i').removeClass('fa-times').addClass('fa-bars');
            fabMenuVisible = false;
        }
    });

    $('#searchPoint').autocomplete({
        source: function(request, response) {
            var results = $.ui.autocomplete.filter(searchData, request.term);
            response(results.slice(0, 10));
        },
        minLength: 1,
        select: function(event, ui) {
            if (selectedCounty && pointsPool[selectedCounty]) {
                var feature = pointsPool[selectedCounty].features.find(f => f.properties.uuid === ui.item.id);
                if (feature) {
                    var county = feature.properties['行政區'];
                    var uuid = feature.properties.uuid;
                    routie('point/' + county + '/' + uuid);
                }
            }
        }
    });
});