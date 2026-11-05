# D3 from unpkg

<svg id="bars" width="300" height="120"></svg>

<script src="https://unpkg.com/d3@7/dist/d3.min.js"></script>
<script>
  const svg = document.getElementById('bars');
  svg.dataset.d3 = typeof d3 === 'object' ? 'loaded' : 'missing';
  if (typeof d3 === 'object') {
    const data = [4, 8, 15, 16, 23];
    d3.select(svg)
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d, i) => i * 50 + 10)
      .attr('y', (d) => 120 - d * 4)
      .attr('width', 40)
      .attr('height', (d) => d * 4)
      .attr('fill', 'steelblue');
    svg.dataset.rendered = 'true';
  }
</script>
