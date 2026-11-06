# CDN URLs that are not rewritten

An older major of a known library stays on the CDN (the bundled copy is a different major):

<script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>

A library Inlay does not bundle also stays on the CDN (allowed by the policy, needs network):

<script src="https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css">

<p id="passthrough">Rendered.</p>
<script>
  document.getElementById('passthrough').dataset.lodash = typeof _ === 'function' ? 'loaded' : 'missing';
</script>
