<script>
  export let data;
  export let rows;
</script>

<h3>
  Profile
  <small class="muted">(Census 2001 and 2011)</small>
</h3>
<table>
  <thead>
    <tr>
      <th></th>
      <th class="right">2001</th>
      <th class="right">2011</th>
      <th class="right muted">+/-</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row}
    <tr>
      <td>{row.label}</td>
      {#if row.value == 'perc'}
        <td class="right">{row.formats[0]((data[row.cell + "_2001"] / data.pop_2001) * 100)}{row.suffixes[0]}</td>
        <td class="right">{row.formats[0]((data[row.cell + "_2011"] / data.pop_2011) * 100)}{row.suffixes[0]}</td>
        <td class="right muted">{row.formats[1](((data[row.cell + "_2011"] / data.pop_2011) - (data[row.cell + "_2001"] / data.pop_2001)) * 100)}{row.suffixes[1]}</td>
      {:else}
        <td class="right">{row.formats[0](data[row.cell + "_2001"])}{row.suffixes[0]}</td>
        <td class="right">{row.formats[0](data[row.cell + "_2011"])}{row.suffixes[0]}</td>
        {#if row.change == 'perc'}
          <td class="right muted">{row.formats[1]((data[row.cell + "_2011"] * 100 / data[row.cell + "_2001"]) - 100)}{row.suffixes[1]}</td>
        {:else}
          <td class="right muted">{row.formats[1](data[row.cell + "_2011"] - data[row.cell + "_2001"])}{row.suffixes[1]}</td>
        {/if}
      {/if}
    </tr>
    {/each}
  </tbody>
</table>

<p>Total area {data.area.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} hectares</p>

<style>
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
  th {
    border-bottom: 2px solid black;
  }
	.right {
		text-align: right;
	}
	.muted {
		color: #777;
	}
	h3 small {
		font-size: 0.8rem;
		font-weight: normal;
	}
</style>