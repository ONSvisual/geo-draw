<script>
	import { onMount, setContext } from 'svelte';
	import mapbox from 'mapbox-gl';

	export let map;
	export let location = {
		bounds: [[-5.816, 49.864], [1.863, 55.872]] // England & Wales bounding box
	};
	export let style;
	export let minzoom = 0;
	export let maxzoom = 14;
	
	export let zoom;
	
	let container;
	let options;
	
	setContext('map', {
		getMap: () => map
	});
	
	if (location.bounds) {
		options = { bounds: location.bounds };
	} else if (location.lon && location.lat) {
		options = {
			center: [location.lon, location.lat]
		}
		if (location.zoom) {
			options.zoom = location.zoom;
		}
	};

	onMount(() => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://unpkg.com/mapbox-gl/dist/mapbox-gl.css';

		link.onload = () => {
			map = new mapbox.Map({
				container,
				style: style,
				minZoom: minzoom,
				maxZoom: maxzoom,
				...options
			});
			
			// Get initial zoom level
			map.on('load', () => {
				zoom = map.getZoom();
			})
		
			// Update zoom level when the view zooms
			map.on('zoom', () => {
				zoom = map.getZoom();
			});
		};

		document.head.appendChild(link);

		return () => {
			map.remove();
			link.parentNode.removeChild(link);
		};
	});
</script>

<style>
	div {
		width: 60%;
		height: 100%;
		position: fixed;
		right: 0;
	}

	@media (max-width: 900px) {
		div {
			width: 50%;
		}
	}
	@media (max-width: 600px) {
		div {
			width: 100%;
			height: 65%;
			position: absolute;
		}
	}
</style>

<div bind:this={container}>
	{#if map}
		<slot></slot>
	{/if}
</div>