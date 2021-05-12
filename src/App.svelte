<script>
	import { union, buffer, bbox, simplify } from '@turf/turf';
	import { csvParse, autoType } from 'd3-dsv';
	import Map from './Map.svelte';
	import MapSource from './MapSource.svelte';
	import MapLayer from './MapLayer.svelte';
	import MapDraw from './MapDraw.svelte';
	import Panel from './Panel.svelte';
	import Select from './Select.svelte';
	import Loader from './Loader.svelte';
	import { getData, getPlaces, getBoundary, getPoints, makeLookup, inPolygon, compressCodes, addBoundary, download, sleep } from './utils.js';
	
	// Settings
	const mapstyle = 'https://bothness.github.io/ons-basemaps/data/style-omt.json';
	const oalatlng = './data/oalatlng.csv';
	const lsoalookup = './data/lsoalookup.csv';
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
				'0': 'All usual residents',
				'1': 'Males',
				'2': 'Females',
				'3': 'Lives in a household',
				'4': 'Lives in a communal establishment',
				'6': 'Area (Hectares)'
			}
		}
	];
	
	// Elements
	let map = null;
	let draw = null;
	let uploadElem = {
		lookup: null,
		boundary: null
	};
	
	// Data
	let centroids;
	let lookup = {
		oa: null,
		lsoa: null
	};
	let poplookup;
	let places;
	
	// State
	let selectedPlace = null;
	let selected = [];
	let geoname = null;
	let profile = null;
	let population = 0;
	let hovered = null;
	let mapZoom = null;
	let loaded = false;
	let boundary = null;
	let drawing = false;
	let polygons = 0;
	let footerHeight = 0;
	
	function doSelect(e) {
		let code = e.detail.value;
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
					selected = points.features.map(d => d.properties.id);
					loaded = true;
				});

				// Fit map to boundary
				map.fitBounds(result.bounds, { padding: 20 });
			});
		}
	}
	
	function clearData() {
		selected = [];
		population = 0;
	}

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
	
	getPlaces().then(data => {
		places = data;
		if (centroids && lookup) {
			loaded = true;
		}
	});
	
	getPoints(oalatlng).then(data => {
		centroids = data.geometry;
		lookup.oa = data.lookup;
		poplookup = data.poplookup;
		if (places) {
			loaded = true;
		}
	});

	getData(lsoalookup).then(data => {
		lookup.lsoa = makeLookup(data);
	});

	function makeProfile() {
		loaded = false;

		let newcodes = compressCodes(selected, lookup.oa);
		newcodes = compressCodes(newcodes, lookup.lsoa);

		let profilearray = [];

		apitables.forEach(table => {
			let newdata = {};
			let cells = Object.keys(table.cells);
			getData(apiurl + table.query + cells.join(',') + '&geography=' + newcodes.join(','))
			.then(data => {
				data.forEach(d => {
					cells.forEach(cell => {
						if(!newdata[cell]) {
							newdata[cell] = +d[cell];
						} else {
							newdata[cell] += +d[cell];
						}
					});
				});
				cells.forEach(cell => {
					profilearray.push([
						table.cells[cell],
						newdata[cell]
					]);
				});
				profile = profilearray;
				loaded = true;
			});
		});
	}

	function dwnLookup() {
		// Convert selected OA codes to string
		let string = 'oa11cd,lat,lng\n';
		selected.forEach(d => {
			string += `${d},${poplookup[d].lat},${poplookup[d].lng}\n`;
		});
		
		// Convert CSV string to data blob
    let blob = new Blob([string], { type: "text/csv;charset=utf-8" });
		
		// Activate download
		let name = geoname ? geoname : 'lookup';
		download(blob, `${name}.csv`);
	}

	async function dwnBoundary() {
		loaded = false;

		// Set name of boundary
		let name = geoname ? geoname : 'boundary';

		// Merge output areas to create polygon
		console.log('generating polygon...');
		let features = map.querySourceFeatures('oa', {sourceLayer: vector.layer});
		let filtered = features.filter(f => selected.includes(f.id));
		let json = filtered.map(f => f.toJSON());
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
					console.log(points);
					selected = points.features.map(d => d.properties.id);
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

  function gotLookup() {
		let file = uploadElem.lookup.files[0] ? uploadElem.lookup.files[0] : null;
		
		if (file) {
			var reader = new FileReader();
			reader.onload = function(evt) {

				// Read the file
				let areas = csvParse(evt.target.result, autoType);
				selected = areas.map(d => d.oa11cd);

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

	function clearBounds() {
		boundary = null;

		let id = 'boundary';
		if (map.getLayer(id)) {
			map.removeLayer(id);
			map.removeSource(id);
		}
	}
	
</script>

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
	table {
		width: 100%;
		border-collapse: collapse;
	}
	tr + tr {
		border-top: 1px solid #999;
	}
	td {
		padding: 0.3rem 0;
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
	.right {
		text-align: right;
	}
	.muted {
		color: #999;
	}
	.alert {
		color: red;
	}
	.infobox {
		padding: 10px 0;
	}
</style>

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
	{#if selected.length > 0}
	<h3>
		Population {population.toLocaleString()} 
		<small class="muted">(2011 Census)</small>
	</h3>
	{/if}
	{#if profile}
	<button on:click={makeProfile} class="icon-refresh">Update profile</button>
	<button on:click={() => {profile = null}} class="icon-cancel">Clear profile</button>
	{:else if selected.length > 0}
	<button on:click={makeProfile} class="icon-people">Make profile</button>
	{/if}
	{#if profile}
	<h3>
		Profile
		<small class="muted">(2011 Census)</small>
	</h3>
	<table>
		<tbody>
			{#each profile as row}
			<tr>
				<td>{row[0]}</td>
				<td class="right">{row[1].toLocaleString()}</td>
			</tr>
			{/each}
			<tr>
				<td>Density (number of persons per hectare)</td>
				<td class="right">{(profile[0][1] / profile[5][1]).toFixed(2)}</td>
			</tr>
		</tbody>
	</table>
	{/if}
	{#if selected.length > 0}
	<h3>{selected.length.toLocaleString()} output areas selected</h3>
	<button on:click={clearData} class="icon-cancel">Clear output areas</button>
	<textarea readonly>{selected.join(',')}</textarea>
	<input type="text" bind:value={geoname} placeholder="Name your geography..." />
	<button on:click={dwnLookup} class="icon-download">Get lookup</button>
	<button on:click={dwnBoundary} class="icon-download">Get boundary</button>
	{#if selected.length > 500}
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
		<small class="muted"><br/>Lookups must be as downloaded from this tool. Boundaries must be GeoJSON format.</small>
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
		<MapLayer id="oa_fill" source="oa" sourceLayer={vector.layer} type="fill" click={true} hover={true} bind:selected={selected} lookup={poplookup} bind:population={population} bind:drawing={drawing} {hovered} paint="{{
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
	<MapDraw bind:draw={draw} bind:polygons={polygons} bind:drawing={drawing} bind:selected={selected} bind:loaded={loaded} {centroids}/>
	{/if}
	{#if centroids}
	<!-- Optional section of code to display OA centroids -->
	<MapSource id="centroids" type="geojson" data={centroids} promoteId="id">
		<MapLayer id="centroids" source="centroids" type="circle" paint="{{
			'circle-color':  'rgb(168, 168, 168)',
			'circle-radius': [
				"interpolate", ["linear"], ["zoom"],
				9, 0.5, 14, 2
			]
		}}" minzoom={8} />
	</MapSource>
	{/if}
</Map>