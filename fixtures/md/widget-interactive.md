# Interactive widget

Buttons and a slider wired with plain DOM scripting.

<div id="widget" class="widget">
  <button id="inc" type="button">+1</button>
  <button id="dec" type="button">−1</button>
  <output id="count" for="inc dec">0</output>
  <label>Scale <input id="scale" type="range" min="1" max="10" value="3"></label>
  <output id="scaled">3</output>
</div>

<style>
  .widget { display: flex; gap: 0.75rem; align-items: center; padding: 0.75rem; border: 1px solid #ccc; border-radius: 8px; }
  .widget output { min-width: 2ch; text-align: center; font-weight: 600; }
</style>

<script>
  let count = 0;
  const show = () => {
    document.getElementById('count').textContent = String(count);
    document.getElementById('scaled').textContent = String(count * Number(document.getElementById('scale').value));
  };
  document.getElementById('inc').addEventListener('click', () => { count += 1; show(); });
  document.getElementById('dec').addEventListener('click', () => { count -= 1; show(); });
  document.getElementById('scale').addEventListener('input', show);
  document.getElementById('widget').dataset.ready = 'true';
</script>

Markdown continues after the widget with **emphasis**.
