<script>
	import { union, buffer, bbox, simplify, within } from '@turf/turf';
	import { csvParse, autoType } from 'd3-dsv';
	import Map from './map/Map.svelte';
	import MapSource from './map/MapSource.svelte';
	import MapLayer from './map/MapLayer.svelte';
	import MapDraw from './map/MapDraw.svelte';
	import Panel from './layout/Panel.svelte';
	import Profile from './layout/Profile.svelte';
	import Select from './ui/Select.svelte';
	import Loader from './ui/Loader.svelte';
	import { getData, getPlaces, getBoundary, getPoints, makeLookup, inPolygon, compressCodes, urlCodes, addBoundary, download, sleep, setUnion, setDiff } from './utils.js';
	
	// CONFIG
	const mapstyle = 'https://bothness.github.io/ons-basemaps/data/style-omt.json';
	const oalatlngurl = './data/oalatlng.csv';
	const lookupurl = './data/lookup.json';
	const vector = {
		url: 'https://cdn.ons.gov.uk/maptiles/t9/{z}/{x}/{y}.pbf',
		layer: 'OA_bound_ethnicity',
		id: 'oa11cd'
	}
	const apiurl = 'https://www.nomisweb.co.uk/api/v01/dataset/';
	const apitables = [
		{
			query: 'NM_144_1.data.csv?date=latest&rural_urban=0&measures=20100&select=geography_code,cell,obs_value&rows=geography_code&cols=cell&cell=',
			cells: {
				'1': 'male',
				'2': 'female',
				'6': 'area'
			},
			year: '2011'
		},
		{
			query: 'NM_145_1.data.csv?date=latest&rural_urban=0&measures=20100&select=geography_code,cell,obs_value&rows=geography_code&cols=cell&cell=',
			cells: {
				'0': 'pop',
				'17': 'age'
			},
			year: '2011'
		},
		{
			query: 'NM_1634_1.data.csv?date=latest&measures=20100&select=geography_code,cell,obs_value&rows=geography_code&cols=cell&cell=',
			cells: {
				'1': 'male',
				'2': 'female'
			},
			year: '2001'
		},
		{
			query: 'NM_1602_1.data.csv?date=latest&measures=20100&select=geography_code,cell,obs_value&rows=geography_code&cols=cell&cell=',
			cells: {
				'0': 'pop',
				'17': 'age'
			},
			year: '2001'
		}
	];
	const formats = {
		dp0: d => d.toLocaleString(),
		dp1: d => d.toFixed(1),
		dp1plus: d => d > 0 ? '+' + d.toFixed(1) : d.toFixed(1)
	}
	const profilerows = [
		{
			label: 'Total population',
			value: 'abs',
			cell: 'pop',
			change: 'perc',
			suffixes: ['', '%'],
			formats: [formats.dp0, formats.dp1plus]
		},
		{
			label: 'Density (people per hectare)',
			value: 'abs',
			cell: 'density',
			change: 'perc',
			suffixes: ['', '%'],
			formats: [formats.dp1, formats.dp1plus]
		},
		{
			label: 'Average (mean) age',
			value: 'abs',
			cell: 'age',
			change: 'abs',
			suffixes: ['', 'yrs'],
			formats: [formats.dp1, formats.dp1plus]
		},
		{
			label: 'Female',
			value: 'perc',
			cell: 'female',
			change: 'abs',
			suffixes: ['%', 'pp'],
			formats: [formats.dp1, formats.dp1plus]
		},
		{
			label: 'Male',
			value: 'perc',
			cell: 'male',
			change: 'abs',
			suffixes: ['%', 'pp'],
			formats: [formats.dp1, formats.dp1plus]
		}
	];
	
	// DOM ELEMENTS
	let map = null;
	let draw = null;
	let uploadElem = {
		lookup: null,
		boundary: null
	};
	
	// DATA VARIABLES
	let centroids;
	let lookup;
	let poplookup;
	let places;
	
	// APP STATE
	let selectedPlace = null;
	let selected = new Set();
	let codes = {
		"2001": [],
		"2011": []
	};
	let pop = {
		"2001": 0,
		"2011": 0
	}
	let geoname = null;
	let profile = null;
	let hovered = null;
	let mapZoom = null;
	let loaded = false;
	let boundary = null;
	let drawing = false;
	let polygons = 0;
	let footerHeight = 0;
	let year = "2011";
	
	// FUNCTIONS

	// Get boundary for named area + select centroids inside it
	function doSelect(ev) {
		let code = ev.detail.value;
		if (code == null) {
			let id = 'boundary';
			if (map.getLayer(id)) {
				map.removeLayer(id);
				map.removeSource(id);
			}
		} else {
			loaded = false;
			// Get geographic boundary of selected place
			getBoundary(code)
			.then(result => {
				boundary = result.geometry;
				addBoundary(map, boundary);

				// Select OAs within boundary
				inPolygon(centroids, boundary)
				.then(points => {
					selected = new Set(points.features.map(d => d.properties));
					updateCodes();
					loaded = true;
				});

				// Fit map to boundary
				map.fitBounds(result.bounds, { padding: 20 });
			});
		}
	}
	
	// Unselect all centroids + reset population counts
	function clearData() {
		selected = new Set();
		codes['2001'] = [];
		codes['2011'] = [];
		pop['2001'] = 0;
		pop['2011'] = 0;
		year = '2011';
	}

	// Functions for buttons to interact with MapDraw component
	function drawEdit() {
		if (!drawing) {
			draw.changeMode('draw_polygon');
			drawing = true;
		} else {
			draw.changeMode('simple_select');
			drawing = false;
		}
	}
	function drawDelete() {
		draw.deleteAll();
		polygons = 0;
		draw.changeMode('simple_select');
	}

	// Download + process data from Nomis
	async function makeProfile() {
		loaded = false;

		let newcodes = {};

		// Reduce OA codes to combination of complete MSOAs, LSOAs and OAs
		newcodes['2011'] = compressCodes(codes['2011'], lookup.c11.lsoa);
		newcodes['2011'] = compressCodes(newcodes['2011'], lookup.c11.msoa);

		newcodes['2001'] = compressCodes(codes['2001'], lookup.c01.lsoa);
		newcodes['2001'] = compressCodes(newcodes['2001'], lookup.c01.msoa);
		console.log(codes['2001'].length + ' OA 2001 codes compressed to ' + newcodes['2001'].length + ' MSOA/LSOA/OA codes');
		console.log(codes['2011'].length + ' OA 2011 codes compressed to ' + newcodes['2011'].length + ' MSOA/LSOA/OA codes');

		// Compress code list for Nomis API query
		// newcodes['2011'] = urlCodes(newcodes['2011']);
		// newcodes['2001'] = urlCodes(newcodes['2001']);

		// Get data for OA, LSOA, MSOA codes
		let indexed = {
			'2001': {},
			'2011': {}
		};

		for (let table of apitables) {
			let cells = Object.keys(table.cells);
			let data = await getData(apiurl + table.query + cells.join(',') + '&geography=' + newcodes[table.year].join(','));
			data.forEach(d => {
				if (!indexed[table.year][d['GEOGRAPHY_CODE']]) {
					indexed[table.year][d['GEOGRAPHY_CODE']] = {};
				}
				cells.forEach(cell => {
					indexed[table.year][d['GEOGRAPHY_CODE']][table.cells[cell]] = d[cell];
				});
			});
		}

		// Aggregate data and do calcs
		let dataset = {
			area: 0
		};

		['2011', '2001'].forEach(year => {
			let arr = [];
			let codes = Object.keys(indexed[year]);
			codes.forEach(code => arr.push(indexed[year][code]));
			
			let cells = Object.keys(arr[0]);
			cells = cells.filter(cell => cell != 'pop');
			cells.unshift('pop');
			cells.forEach(cell => {
				if (cell == 'area' && year == '2011') {
					dataset.area = 0;
				} else {
					dataset[cell + '_' + year] = 0;
				}
			  arr.forEach(d => {
					if (cell == 'age') {
						dataset[cell + '_' + year] += (d.age * d.pop) / dataset['pop_' + year];
					} else if (cell == 'area') {
						dataset.area += d.area;
					} else {
						dataset[cell + '_' + year] += d[cell];
					}
				});
			});

			dataset['density_' + year] = dataset['pop_' + year] / dataset.area;
		});

		profile = dataset;
		loaded = true;
	}

	// Export lookup as CSV
	function dwnLookup() {
		// Convert selected OA codes to string
		let string = `oa${year.slice(-2)}cd,lat,lng\n`;
		codes[year].forEach(code => {
			string += `${code},${poplookup[code].lat},${poplookup[code].lng}\n`;
		});
		
		// Convert CSV string to data blob
    let blob = new Blob([string], { type: "text/csv;charset=utf-8" });
		
		// Activate download
		let name = geoname ? geoname : 'lookup';
		download(blob, `${name}.csv`);
	}

	// Generate and export boundary as GeoJSON
	async function dwnBoundary() {
		loaded = false;

		// Set name of boundary
		let name = geoname ? geoname : 'boundary';

		// Merge output areas to create polygon
		console.log('generating polygon...');
		let features = map.querySourceFeatures('oa', {sourceLayer: vector.layer});
		let filtered = features.filter(d => codes['2011'].includes(d.id));
		let json = filtered.map(d => d.toJSON());
		let polygon = union(...json);

		// Offset polygon +/- to remove unwanted areas (clean up)
		console.log('cleaning up polygon...');
		polygon = buffer(polygon, 5, {units: 'meters'});
		polygon = buffer(polygon, -5, {units: 'meters'});

		// Add metadata to polygon
		polygon.properties = {
			name: name,
			description: `Approximate boundary of the 2011 output areas contained within the custom geography ${name}`
		};

		// Fit polygon to view
		let bounds = bbox(polygon);
		map.fitBounds(bounds, { padding: 20 });

		let geojson = {
			'type': 'FeatureCollection',
			'features': [polygon]
		};

		// Show boundary on map
		let id = 'polygon';

		if (map.getLayer(id)) {
			map.removeLayer(id);
			map.removeSource(id);
		}

		map.addSource(id, {
			'type': 'geojson',
			'data': geojson
		});
		map.addLayer({
			'id': id,
			'type': 'line',
			'source': id,
			'layout': {},
			'paint': {
				'line-color': 'orange',
				'line-width': 2
			}
		}, 'boundary_country');
		loaded = true;

		// Convert geojson to data blob
		let string = JSON.stringify(geojson);
		let blob = new Blob([string], { type: "	application/geo+json;charset=utf-8" });
		
		// Activate download
		download(blob, `${name}.geojson`);

		// Wait 2 seconds and then remove boundary from map
		await sleep(5000);
		map.removeLayer(id);
		map.removeSource(id);
	}
	
	// Functions to open upload dialogues
	function clickBoundary() {
		if (uploadElem.boundary) {
			uploadElem.boundary.click();
		}
	}
	function clickLookup() {
		if (uploadElem.lookup) {
			uploadElem.lookup.click();
		}
	}
	
	// Process uploaded boundary + select centroids inside it
  function gotBoundary() {
		let file = uploadElem.boundary.files[0] ? uploadElem.boundary.files[0] : null;
		
		if (file) {
			var reader = new FileReader();
			reader.onload = function(evt) {

				// Read + simplify the boundary
				let raw = JSON.parse(evt.target.result);
				boundary = simplify(raw, { tolerance: 0.001, highQuality: true, mutate: true });
				let bounds = bbox(boundary);

				// Add the boundary to the map
				addBoundary(map, boundary);

				// Select OAs within boundary
				inPolygon(centroids, boundary)
				.then(points => {
				  selected = new Set(points.features.map(d => d.properties));
					updateCodes();
					loaded = true;
				});

				// Fit map to boundary
				map.fitBounds(bounds, { padding: 20 });
			};
			reader.readAsText(file);
		} else {
			loaded = true;
		}
	}

	// Process uploaded CSV + select the listed centroids
  function gotLookup() {
		let file = uploadElem.lookup.files[0] ? uploadElem.lookup.files[0] : null;
		
		if (file) {
			var reader = new FileReader();
			reader.onload = function(evt) {

				// Read the file
				let areas = csvParse(evt.target.result, autoType);
				let codes = areas.map(d => d.oa11cd);
				selected = new Set(centroids.features.filter(d => codes.includes(d.properties.id)).map(d => d.properties));

				let points = {
					'type': 'FeatureCollection',
					'features': []
				};
				areas.forEach(d => {
					let feature = {
						'type': 'Feature',
						'geometry': {
							'type': 'Point',
							'coordinates': [
								d.lng,
								d.lat
							]
						}
					}
					points.features.push(feature);
				});

				let bounds = bbox(points);

				// Fit map to boundary
				map.fitBounds(bounds, { padding: 100 });
				loaded = true;
			};
			reader.readAsText(file);
		} else {
			loaded = true;
		}
	}

	// Remove selected named area boundary
	function clearBounds() {
		boundary = null;

		let id = 'boundary';
		if (map.getLayer(id)) {
			map.removeLayer(id);
			map.removeSource(id);
		}
	}

	// Update selected areas on map click
	// !! This is complex as it needs to also select/deselect 2001 centroids based on the clicked polygon
	async function clickSelect(ev) {
		let code = ev.detail.code;
		let newcode = ev.detail.newcode;
		let geometry = ev.detail.geometry;

		let points = map.queryRenderedFeatures({layers: ['centroids01']});
		points = {type: "FeatureCollection", features: points.map(d => ({
			type: "Feature",
			geometry: d.geometry,
			properties: d.properties
		}))};
		points = await within(points, geometry);
		points = points.features ? points.features.map(d => poplookup[d.properties.id]) : [];

		let newPoints = new Set([poplookup[code], ...points]);

		if (newcode) {
			selected = setUnion(selected, newPoints);
			updateCodes();
		} else {
			selected = setDiff(selected, newPoints);
			updateCodes();
		}
	}

	// Select centroids within a drawn boundary
	async function drawSelect(ev) {
		let bounds = ev.detail.polygons;
		let clear = ev.detail.clear;
		
		// Select OAs within boundary
		if (centroids && !clear) {
      let points = await within(centroids, bounds);
      let newPoints = await points.features.map((d) => d.properties);
			newPoints = new Set(newPoints);
      selected = setUnion(selected, newPoints);
			updateCodes();
    }
	}

	// Update 2001 + 2011 codes and populations (called when selected centroids change)
	function updateCodes() {
		let arr = Array.from(selected);
		let c01 = arr.filter(d => d.c01 == true);
		let c11 = arr.filter(d => d.c11 == true);
		codes['2001'] = c01.map(d => d.id);
		codes['2011'] = c11.map(d => d.id);
		pop['2001'] = c01.map(d => d.pop01).reduce((a, b) => a + b, 0);
		pop['2011'] = c11.map(d => d.pop11).reduce((a, b) => a + b, 0);
	}
	
  // RUN THE CODE

	// Get list of codes and names for standard geographies
	getPlaces()
	.then(data => {
		places = data;
		if (centroids && lookup && poplookup) {
			loaded = true;
		}
	});
	
	// Load centroid codes, coordinates + populations from CSV
	getPoints(oalatlngurl)
	.then(data => {
		centroids = data.geometry;
		poplookup = data.lookup;
		if (places && lookup) {
			loaded = true;
		}
	});

	// Load lookups from OA to LSOA to MSOA from JSON
	makeLookup(lookupurl)
	.then(data => {
		lookup = data;
		if (places && centroids && poplookup) {
			loaded = true;
		}
	});
</script>

<Panel>
<div class="container" style="padding-bottom: {footerHeight + 20}px">
	<h1>Draw your own geography</h1>
	{#if mapZoom && mapZoom < 8 }
	<div class="infobox">
		<img src="./img/icon-zoom.svg" alt="zoom" class="inline-icon" on:click={() => map.flyTo({zoom: 9})} />
		<strong>Zoom in to draw an area, select output areas</strong>, or choose a pre-defined geography below.
	</div>
	{:else if mapZoom}
	<p>
		{#if !drawing}
		<button on:click={drawEdit} class="icon-pen">Draw an area</button>
		{:else}
		<button on:click={drawEdit} class="icon-stop">Stop drawing</button>
		{/if}
		{#if polygons > 0}<button on:click={drawDelete} class="icon-cancel">Clear drawn areas</button>{/if}
		<small class="muted"><br/>You can also click areas on the map to select or deselect.</small>
	</p>
	{/if}
	{#if selected.size > 0}
	<h3>
		Population {pop['2011'].toLocaleString()} 
		<small class="muted">in 2011 ({pop['2011'] - pop['2001'] > 0 ? '+' : ''}{(((pop['2011'] / pop['2001']) - 1) * 100).toFixed(1)}% since 2001)</small>
	</h3>
	{/if}
	{#if profile}
	<button on:click={makeProfile} class="icon-refresh">Update profile</button>
	<button on:click={() => {profile = null}} class="icon-cancel">Clear profile</button>
	{:else if selected.size > 0}
	<button on:click={makeProfile} class="icon-people">Make profile</button>
	{/if}
	{#if profile}
	<Profile data={profile} rows={profilerows}/>
	{/if}
	{#if selected.size > 0}
	<h3>
		{codes[year].length.toLocaleString()} output areas selected
		<small>
		<select bind:value={year}>
			<option value="2011">2011 census</option>
			<option value="2001">2001 census</option>
		</select>
	  </small>
	</h3>
	<button on:click={clearData} class="icon-cancel">Clear output areas</button>
	<textarea readonly>{codes[year].join(', ')}</textarea>
	<input type="text" bind:value={geoname} placeholder="Name your geography..." />
	<button on:click={dwnLookup} class="icon-download">Get lookup</button>
	<button on:click={dwnBoundary} class="icon-download">Get boundary</button>
	{#if selected.size > 500}
	<small class="alert"><br/>Warning: Using 'get boundary' function for 500+ output areas may take a long time or cause the browser to stall.</small>
	{/if}
	{/if}

	<div class="bottom" bind:clientHeight={footerHeight}>
	{#if places}
	<Select options={places} bind:selected={selectedPlace} search={true} placeholder="Find a named area..." on:select={doSelect} />
	{:else}
	<Loader small={true}/>
	{/if}
	<p>
		<input type="file" accept=".csv" style="display:none" bind:this={uploadElem.lookup} on:change={() => {loaded = false; gotLookup()}}>
		<input type="file" accept=".geojson,.json" style="display:none" bind:this={uploadElem.boundary} on:change={() => {loaded = false; gotBoundary()}}>
		<button on:click={clickLookup} class="icon-upload">Upload lookup</button>
		{#if boundary}
		<button on:click={clearBounds} class="icon-cancel">Clear boundary</button>
		{:else}
		<button on:click={clickBoundary} class="icon-upload">Upload boundary</button>
		{/if}
		<small class="muted"><br/>Lookups must be for 2011 output areas. Boundaries must be GeoJSON format.</small>
	</p>
	</div>
</div>
</Panel>

{#if !loaded}
<Loader height="100vh" width="100vw" position="fixed" bgcolor="rgba(255, 255, 255, 0.7)"/>
{/if}
<Map bind:map={map} style={mapstyle} minzoom={4} maxzoom={14} bind:zoom={mapZoom}>
	<MapSource id="oa" type="vector" url={vector.url} layer={vector.layer} promoteId={vector.id} minzoom={8} >
		{#if poplookup}
		<MapLayer
		  id="oa_fill"
			source="oa"
			sourceLayer={vector.layer}
			type="fill"
			click={true}
			hover={true}
			selected={codes['2011']}
			bind:drawing={drawing}
			on:click={clickSelect}
			{hovered}
			paint="{{
			'fill-color': ['case',
				['==', ['feature-state','selected'], true], 'rgba(0, 0, 0, 0.2)',
				'rgba(0, 0, 0, 0)'
			],
		}}" order="boundary_state" />
		{/if}
		<MapLayer id="oa_boundary" source="oa" sourceLayer={vector.layer} type="line" paint="{{
			'line-color': ['case',
				['==', ['feature-state','hovered'], true], 'rgb(0, 0, 0)',
				'rgb(128, 128, 128)'
			],
			'line-width': ['case',
				['==', ['feature-state','hovered'], true], 1,
				0.25
			],
		}}" order="boundary_country" />
	</MapSource>
	{#if centroids}
	<MapDraw on:draw={drawSelect} bind:draw={draw} bind:polygons={polygons} bind:drawing={drawing} bind:loaded={loaded} {centroids}/>
	{/if}
	{#if centroids}
	<MapSource id="centroids" type="geojson" data={centroids} promoteId="id">
		<MapLayer
		  id="centroids11"
			source="centroids"
			type="circle"
			filter={["==", "c11", true]}
			paint="{{
			'circle-color':  'rgba(0,0,0,0.5)',
			'circle-radius': [
				"interpolate", ["linear"], ["zoom"],
				9, 0.3, 14, 2
			]
		}}" minzoom={8} />
		<MapLayer
		  id="centroids01"
			source="centroids"
			type="circle"
			filter={[
				"all",
				["==", "c01", true],
				["==", "c11", false]
			]}
			paint="{{
			'circle-color':  'rgba(255,0,0,0.5)',
			'circle-radius': [
				"interpolate", ["linear"], ["zoom"],
				9, 0.3, 14, 2
			]
		}}" minzoom={8} />
	</MapSource>
	{/if}
</Map>



<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}
	h1 {
		margin-top: 0.5rem;
	}
	h3 {
		margin-bottom: 0.5rem;
	}
	h3 small {
		font-size: 0.8rem;
		font-weight: normal;
	}
	textarea {
		width: 100%;
		height: 100px;
		resize: vertical;
		font-size: 0.8rem;
		color: #555;
	}
	button {
		padding-left: 28px;
		background-repeat: no-repeat;
		background-position-x: 6px;
		background-position-y: center;
		background-size: 18px 18px;
		cursor: pointer;
	}
	.icon-cancel {
		background-image: url('../img/icon-cancel.svg');
	}
	.icon-download {
		background-image: url('../img/icon-download.svg');
	}
	.icon-pen {
		background-image: url('../img/icon-pen.svg');
	}
	.icon-people {
		background-image: url('../img/icon-people.svg');
	}
	.icon-refresh {
		background-image: url('../img/icon-refresh.svg');
	}
	.icon-stop {
		background-image: url('../img/icon-stop.svg');
	}
	.icon-upload {
		background-image: url('../img/icon-upload.svg');
	}
	.inline-icon {
		display: inline-block;
		float: left;
		margin-right: 4px;
		width: 2.2rem;
		height: 2.2rem;
		cursor: pointer;
	}
	.container {
		box-sizing: border-box;
		position: relative;
		min-height: 100vh;
		padding: 20px;
	}
	@media (max-width: 600px) {
		.container {
			min-height: 0;
		}
	}
	.bottom {
		width: calc(100% - 40px);
		position: absolute;
		bottom: 0;
	}
	.muted {
		color: #777;
	}
	.alert {
		color: red;
	}
	.infobox {
		padding: 10px 0;
	}
</style>