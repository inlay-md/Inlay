# ECharts from cdnjs

<div id="echart" style="width: 480px; height: 260px;"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/6.0.0/echarts.min.js"></script>
<script>
  const el = document.getElementById('echart');
  el.dataset.echarts = typeof echarts === 'object' ? 'loaded' : 'missing';
  if (typeof echarts === 'object') {
    const chart = echarts.init(el, null, { renderer: 'svg' });
    chart.setOption({
      animation: false,
      xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: [5, 20, 36, 10, 10] }],
    });
    el.dataset.rendered = 'true';
  }
</script>
