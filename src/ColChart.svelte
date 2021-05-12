<script>
	// 	Note: Due to REPL limitations, full responsiveness may not work here. Download the example from here or from the website (https://layercake.graphics/example/Column) and run locally to get all features.
	
	import { LayerCake, Svg, Html } from 'layercake';
	import { scaleBand } from 'd3-scale';

	import Column from './Column.svelte';
	import AxisX from './AxisX.svelte';
	import AxisY from './AxisY.svelte';

	export let data;
	export let yMax = null;
	export let yMin = 0;
	export let selected = null;
	
	$: yMin = yMin > 0 ? 0 : yMin;

	const xKey = 'decile';
	const yKey = 'value';
	
	let xDomain = [];

	data.forEach(d => {
		xDomain.push(d[xKey]);
		d[yKey] = +d[yKey];
	});
</script>

<style>
	.chart-container {
		width: 100%;
		height: 200px;
		margin-top: 25px;
	}
</style>

<div class="chart-container">
	<LayerCake
		padding={{ top: 0, right: 0, bottom: 20, left: 30 }}
		x={xKey}
		y={yKey}
		xScale={scaleBand()}
	  xDomain={xDomain}
		yDomain={[yMin, yMax]}
		data={data}
	>
		<Svg>
			<Column
				{selected}
			/><AxisX
				gridlines={false}
			/>
			<AxisY
				ticks={4}
				formatTick="{d => d + '%'}"
			/>
		</Svg>
	</LayerCake>
</div>