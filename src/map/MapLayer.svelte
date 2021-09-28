<script>
	import mapbox from 'mapbox-gl';
	import { bbox } from '@turf/turf';
	import { getContext, createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();
	
	export let id;
	export let source;
	export let sourceLayer = null;
	export let type;
	export let layout = {};
	export let paint = {};
	export let filter = null;
	export let selected = [];
	export let hovered = null;
	export let click = false;
	export let hover = false;
	export let order = null;
	export let drawing = false;
	export let maxzoom;
	export let minzoom;
	
	const { getMap } = getContext('map');
	const map = getMap();
	
	let selectedPrev = [...selected];
	
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

	if (filter) {
		options['filter'] = filter;
	}
	
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
	
	$: if (selected.length !== selectedPrev.length) {
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
		});
		selectedPrev = selected;
	}
	
	if (click && Array.isArray(selected)) {
		map.on('click', id, (e) => {
      if (!drawing && e.features.length > 0) {
				let clicked = e.features[0].id;
				let index = selected.indexOf(clicked);

				let visibleFeatures = map.queryRenderedFeatures({layers: [id]});
				let geometry = visibleFeatures.filter(d => d.id == clicked);
				geometry = {type: "FeatureCollection", features: geometry.map(d => ({
					type: "Feature",
					geometry: d.geometry,
					properties: d.properties
				}))};
				
				if (index > -1) {
					dispatch('click', {
					  code: clicked,
						newcode: false,
						geometry: geometry
				  });
					// selected.splice(index, 1);
					// map.setFeatureState(
          //   { source: source, sourceLayer: sourceLayer, id: clicked },
          //   { selected: false }
          // );
				} else {
					dispatch('click', {
					  code: clicked,
						newcode: true,
						geometry: geometry
				  });
				}
      }
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