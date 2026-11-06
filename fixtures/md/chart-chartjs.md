# Chart.js from jsDelivr

The script below points at the CDN; Inlay serves its bundled copy so the chart renders offline.

<canvas id="sales" width="480" height="240"></canvas>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js" integrity="sha384-not-the-vendored-hash" crossorigin="anonymous"></script>
<script>
  const canvas = document.getElementById('sales');
  canvas.dataset.chartjs = typeof Chart === 'function' ? 'loaded' : 'missing';
  if (typeof Chart === 'function') {
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr'],
        datasets: [{ label: 'Sales', data: [12, 19, 7, 15], backgroundColor: '#0a84ff' }],
      },
      options: { animation: false, responsive: false },
    });
    canvas.dataset.rendered = 'true';
  }
</script>

Text after the chart.
