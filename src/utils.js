import { csvParse, autoType } from 'd3-dsv';
import { bbox, simplify, pointsWithinPolygon } from '@turf/turf';
import { parse } from './wellknown.js';

const apiurl = 'https://pmd3-production-drafter-onsgeo.publishmydata.com/v1/sparql/live?query=';

export async function getPlaces() {
	let query = `PREFIX entity: <http://statistics.data.gov.uk/id/statistical-entity/>
PREFIX entdef: <http://statistics.data.gov.uk/def/statistical-entity#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX foi: <http://publishmydata.com/def/ontology/foi/>
PREFIX statdef: <http://statistics.data.gov.uk/def/statistical-geography#>
SELECT DISTINCT ?code ?name ?group
WHERE {
  VALUES ?types { entity:E06 entity:E07 entity:E08 entity:E09 entity:E10 entity:E14 entity:E30 entity:E34 entity:E35 entity:W06 entity:W07 entity:W22 entity:W37 entity:W38 entity:K01 entity:K05 entity:K06 }
  ?area entdef:code ?types ;
        statdef:status "live" ;
        foi:code ?code ;
        statdef:officialname ?name ;
        foi:memberOf ?type .
  ?type rdfs:label ?group .
}
LIMIT 10000`;
	let data = await getData(apiurl + encodeURIComponent(query));
	data.forEach(d => { d.group = d.group.substring(4) })
	data.sort((a, b) => a.name.localeCompare(b.name));
	return data;
}

export async function getPostcode(code) {
	code = code.replace(/ /g, '').toUpperCase();
	let query = `PREFIX entity: <http://statistics.data.gov.uk/id/statistical-entity/>
PREFIX entdef: <http://statistics.data.gov.uk/def/statistical-entity#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX postcode: <http://statistics.data.gov.uk/id/postcode/unit/>
PREFIX foi: <http://publishmydata.com/def/ontology/foi/>
PREFIX statdef: <http://statistics.data.gov.uk/def/statistical-geography#>
SELECT DISTINCT ?code ?name ?group
WHERE {
  BIND ( postcode:${code} as ?pcode )
  VALUES ?types { entity:E06 entity:E07 entity:E08 entity:E09 entity:E10 entity:E05 entity:E14 entity:E30 entity:E34 entity:E35 entity:W06 entity:W05 entity:W07 entity:W22 entity:W37 entity:W38 entity:K01 entity:K05 entity:K06 }
  ?pcode foi:within ?area .
  ?area entdef:code ?types ;
        foi:code ?code ;
        statdef:officialname ?name ;
        foi:memberOf ?type .
  ?type rdfs:label ?group .
}
LIMIT 10`;
	let data = await getData(apiurl + encodeURIComponent(query));
	return data;
}

export async function getBoundary(code) {
	let query = `PREFIX geosparql: <http://www.opengis.net/ont/geosparql#>
SELECT ?geometry
WHERE {
  <http://statistics.data.gov.uk/id/statistical-geography/${code}/geometry> geosparql:asWKT ?geometry
}
LIMIT 1`;
	let data = await getData(apiurl + encodeURIComponent(query));

	// Convert polygon from WKT to geojson format
	let geojson = await parse(data[0].geometry);
	console.log('polygon loaded')

	// Simplify the polygon if it's a large BUA or BUASD
	let type = code.substring(0, 3);
	if (type == 'E34' || type == 'E35' || type == 'W37' || type == 'W38' || type == 'K05' || type == 'K06') {
		if (JSON.stringify(geojson).length > 20000) {
			console.log('trying to simplify polygon')
			geojson = simplify(geojson, { tolerance: 0.001, highQuality: true, mutate: true });
		}
	}

	// Get the lon/lat bounding box of the polygon
	let bounds = await bbox(geojson);

	return {
		geometry: geojson,
		bounds: bounds
	};
}

export async function getPoints(url) {
	let geojson = {
		'type': 'FeatureCollection',
		'features': []
	};

	let points = await getData(url);
	let poplookup = {};

	points.forEach(loc => {
		let feature = {
			'type': 'Feature',
			'geometry': {
				'type': 'Point',
				'coordinates': [
					loc.lng,
					loc.lat
				]
			},
			'properties': {
				'id': loc.code,
				'parent': loc.parent,
				'pop': loc.pop
			}
		};
		geojson.features.push(feature);
		poplookup[loc.code] = {
			'pop': loc.pop,
			'lat': loc.lat,
			'lng': loc.lng
		};
	});

	let lookup = makeLookup(points);

	return {
		geometry: geojson,
		lookup: lookup,
		poplookup: poplookup
	};
}

export async function getData(url) {
	let response = await fetch(url);
	let string = await response.text();
	let data = await csvParse(string, autoType);
	return data;
}

export function makeLookup(data) {
	let forward = {};
	let reverse = {};

	data.forEach(d => {
		forward[d.code] = d.parent
		if (!reverse[d.parent]) {
			reverse[d.parent] = [d.code];
		} else {
			reverse[d.parent].push(d.code);
		}
	});

	return {
		forward: forward,
		reverse: reverse
	}
}

export async function inPolygon(centroids, boundary) {
	let points = await pointsWithinPolygon(centroids, boundary);
	return points;
}

export async function addBoundary(map, boundary) {
	let id = 'boundary';

	// Remove previous boundary from the map
	if (map.getLayer(id)) {
		map.removeLayer(id);
		map.removeSource(id);
	}

	// Add new boundary to the map
	map.addSource(id, {
		'type': 'geojson',
		'data': boundary
	});
	map.addLayer({
		'id': id,
		'type': 'line',
		'source': id,
		'layout': {},
		'paint': {
			'line-color': '#3bb2d0',
			'line-width': 2
		}
	}, 'boundary_country');
}

export function compressCodes(codes, lookup) {
	let newcodes = [...codes];
	let parents = [];

	codes.forEach(code => {
		if (lookup.forward[code] && !parents.includes(lookup.forward[code])) {
			parents.push(lookup.forward[code]);
		}
	});
	parents.forEach(parent => {
		if (lookup.reverse[parent].every(val => codes.includes(val))) {
			newcodes = newcodes.filter(code => !lookup.reverse[parent].includes(code));
			newcodes.push(parent);
		}
	});
	return newcodes;
}

export function download(blob, filename) {
	let url = window.URL || window.webkitURL || window;
	let link = url.createObjectURL(blob);

	let a = document.createElement("a");
	a.download = filename;
	a.href = link;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}