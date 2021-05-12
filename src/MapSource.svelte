<script>
	import mapbox from 'mapbox-gl';
	import { getContext } from 'svelte';
	
	export let id;
	export let type;
	export let url = null;
	export let props = {};
	export let data = null;
	export let layer = null;
	export let promoteId = null;
	export let minzoom = null;
	export let maxzoom = null;
	
	let loaded = false;
	
	const { getMap } = getContext('map');
	const map = getMap();
	
	if (map.getSource(id)) {
    map.removeSource(id);
	}
	
	// Set optional source properties
	if (minzoom) {
    props.minzoom = minzoom;
	}
	if (maxzoom) {
    props.maxzoom = maxzoom;
	}
	if (layer && promoteId) {
		props.promoteId = {};
		props.promoteId[layer] = promoteId;
	} else if (promoteId) {
		props.promoteId = promoteId;
	}
	
	map.on('load', function() {
	
  	if (type == "geojson") {
	  	if (data) {
		  	map.addSource(id, {
	  		  type: type,
	  		  data: data,
					...props
	  		});
  		} else if (url) {
	  		map.addSource(id, {
	  		  type: type,
	  		  data: url,
					...props
		  	});
		  }
	  } else if (type == "vector") {
	  	map.addSource(id, {
	  		type: type,
	  		tiles: [ url ],
	  		...props
  		});
  	}
		loaded = true;
	});
	
</script>

{#if loaded}
	<slot></slot>
{/if}