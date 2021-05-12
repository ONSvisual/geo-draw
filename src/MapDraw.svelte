<script>
  import { onMount, getContext } from "svelte";
  import { within } from "@turf/turf";

  export let draw = null;
  export let drawing = false;
  export let polygons = 0;
  export let centroids;
  export let selected;
  export let loaded;

  const { getMap } = getContext("map");
  const map = getMap();

  function jsLoaded() {
    draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
    });
    map.addControl(draw);

    map.on("draw.create", updateArea);
    map.on("draw.delete", updateArea);
    map.on("draw.update", updateArea);

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function updateArea(e) {
      let data = draw.getAll();
      polygons = data.features.length;
      if (polygons > 0) {
        loaded = false;

        // Select OAs within boundary
        if (centroids) {
          let points = await within(centroids, data);
          let codes = await points.features.map((d) => d.properties.id);
          codes = codes.filter(code => !selected.includes(code))
          selected = [...selected, ...codes];
        }
        loaded = true;
      }
      await sleep(10);
      drawing = false;
    }
  }

  onMount(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://unpkg.com/@mapbox/mapbox-gl-draw@1.2.0/dist/mapbox-gl-draw.css";
    document.head.appendChild(link);

    return () => {
      link.parentNode.removeChild(link);
    };
  });
</script>

<svelte:head>
  <script
    src="https://unpkg.com/@mapbox/mapbox-gl-draw@1.2.0/dist/mapbox-gl-draw.js"
    on:load={jsLoaded}>
  </script>
</svelte:head>
