<script>
  export let color = '#999';
  export let bgcolor = null;
  export let height = null;
  export let width = null;
  export let position = null;
  export let small = false;

  let boxStyle = '';
  if (bgcolor) {
    boxStyle += `background-color: ${bgcolor};`;
  }
  if (height) {
    boxStyle += `height: ${height};`;
  }
  if (width) {
    boxStyle += `width: ${width};`;
  }
  if (width) {
    boxStyle += `position: ${position};`;
  } 
  let spinnerStyle = `color: ${color};`;
</script>

<style>
	.flexbox {
    z-index: 100;
  	display: flex;
  	align-items: center;
  	justify-content: center;
	}
	@keyframes spinner-border {
  	to {
    	transform: rotate(360deg);
  	}
	}
	.spinner-border {
  	display: inline-block;
  	width: 2rem;
  	height: 2rem;
  	vertical-align: text-bottom;
  	border: 0.25em solid currentColor;
  	border-right-color: transparent;
  	border-radius: 50%;
    animation: spinner-border .75s linear infinite;
  }
  .spinner-border-sm {
    width: 1rem;
    height: 1rem;
    border-width: 0.2em;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>

<div class="flexbox" style="{boxStyle}">
  <div class="spinner-border{small ? ' spinner-border-sm' : ''}" style="{spinnerStyle}">
    <span class="sr-only">Loading...</span>
  </div>
</div>