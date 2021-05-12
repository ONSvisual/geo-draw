<script>
	import mapbox from 'mapbox-gl';
	import { bbox } from '@turf/turf';
	import { getContext } from 'svelte';
	
	export let id;
	export let source;
	export let sourceLayer = null;
	export let type;
	export let layout = {};
	export let paint = {};
	export let selected = [];
	export let hovered = null;
	export let click = false;
	export let hover = false;
	export let order = null;
	export let drawing = false;
	export let maxzoom;
	export let minzoom;
	
	export let lookup = null;
	export let population = 0;
	
	const { getMap } = getContext('map');
	const map = getMap();
	
	let selectedPrev = [];
	
	if (map.getLayer(id)) {
    map.removeLayer(id);
	}
	
	let options = {
		'id': id,
		'type': type,
		'source': source,
		'paint': paint,
		'layout': layout
	};
	
	if (sourceLayer) {
		options['source-layer'] = sourceLayer;
	}
	if (maxzoom) {
		options['maxzoom'] = maxzoom;
	}
	if (minzoom) {
		options['minzoom'] = minzoom;
	}
	
	map.addLayer(options, order);
	
	$: if (lookup && selected !== selectedPrev) {
		let pop = 0;
		selectedPrev.forEach(d => {
			map.setFeatureState(
				{ source: source, sourceLayer: sourceLayer, id: d },
				{ selected: false }
			);
		});
		selected.forEach(d => {
			map.setFeatureState(
				{ source: source, sourceLayer: sourceLayer, id: d },
				{ selected: true }
			);
			pop += +lookup[d].pop;
		});
		selectedPrev = selected;
		population = pop;
	}
	
	if (lookup && click && Array.isArray(selected)) {
		map.on('click', id, (e) => {
      if (!drawing && e.features.length > 0) {
				let clicked = e.features[0].id;
				let index = selected.indexOf(clicked);
				
				if (index > -1) {
					selected.splice(index, 1);
					map.setFeatureState(
            { source: source, sourceLayer: sourceLayer, id: clicked },
            { selected: false }
          );
					population -= +lookup[clicked].pop;
				} else {
					selected.push(clicked);
					map.setFeatureState(
            { source: source, sourceLayer: sourceLayer, id: clicked },
            { selected: true }
          );
					population += +lookup[clicked].pop;
				}
      }
			selectedPrev = selected = [...selected];
    });
	}
	
	if (hover) {
		map.on('mousemove', id, (e) => {
      if (!drawing && e.features.length > 0) {
        if (hovered) {
          map.setFeatureState(
            { source: hovered.source, sourceLayer: hovered.layer, id: hovered.id },
            { hovered: false }
          );
        }
        hovered = {
          source: e.features[0].layer.source,
          layer: e.features[0].layer['source-layer'],
          id: e.features[0].id
        };
        map.setFeatureState(
          { source: hovered.source, sourceLayer: hovered.layer, id: hovered.id },
          { hovered: true }
        );

        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';
      }
    });
	}
	
</script>