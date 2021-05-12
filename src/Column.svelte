<script>
	import { getContext } from 'svelte';

	const { data, xGet, yGet, yRange, yDomain, xScale } = getContext('LayerCake');
	
	const min = $yDomain[0] < 0 ? {value: 0} : {value: $yDomain[0]};
	
	export let selected = null;

	$: columnWidth = d => {
		const vals = $xGet(d);
		return Math.max(0, (vals[1] - vals[0]));
	};

	$: columnHeight = d => {
		return $yGet(min) - $yGet(d) < 0 ? $yGet(d) - $yGet(min): $yGet(min) - $yGet(d);
	};
	
	$: columnPos = d => {
		return $yGet(d) > $yGet(min) ? $yGet(min) : $yGet(d);
	}

	/* --------------------------------------------
	 * Default styles
	 */
	export let fill = 'rgb(0, 97, 180)';
	export let stroke = '';
	export let strokeWidth = 0;
	
	function textAnchor(i) {
		if (i === 0) {
			return 'start';
		}
		if (i === $data.length - 1) {
			return 'end';
		}
		return 'middle';
	}

</script>

<g class="column-group" opacity=0.8>
	{#each $data as d, i}
		<rect
			class='group-rect'
			data-id="{i}"
			x="{$xScale.bandwidth ? $xGet(d) : $xGet(d)[0]}"
			y="{columnPos(d)}"
			width="{$xScale.bandwidth ? $xScale.bandwidth() : columnWidth(d)}"
			height="{columnHeight(d)}"
			fill="{d.color ? d.color : fill}"
			{stroke}
			stroke-width="{strokeWidth}"
		/>
	{/each}
</g>
{#if selected}
<g class="column-group">
{#each $data as d, i}
	{#if d.geocode == selected.geocode}
	  <rect
			class='group-rect'
	  	data-id="{i}"
		  x="{$xScale.bandwidth ? $xGet(d) : $xGet(d)[0]}"
		  y="{columnPos(d) - 0.5}"
		  width="{$xScale.bandwidth ? $xScale.bandwidth() + 1 : columnWidth(d) + 1}"
		  height="{columnHeight(d)}"
		  fill="rgb(0, 0, 0)"
		  {stroke}
		  stroke-width="{strokeWidth}"
	  />
	  <text
			x="{$xScale.bandwidth ? $xGet(d) : $xGet(d)[0]}"
			y='{columnPos(d)}'
			dx=0
			dy=-3
			text-anchor='{textAnchor(i)}'>{selected.name}</text>
	{/if}
{/each}
</g>
{/if}