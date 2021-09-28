<style>
	main {
		box-sizing: border-box;
		padding: 0;
		margin: 0;
		z-index: 2;
		width: 40%;
		min-height: 100vh;
		position: absolute;
	}
	@media (max-width: 900px) {
		main {
			width: 50%;
		}
	}
	@media (max-width: 600px) {
		main {
			width: 100%;
			min-height: 0;
			top: 65%;
		}
	}
</style>

<main>
	<slot></slot>
</main>