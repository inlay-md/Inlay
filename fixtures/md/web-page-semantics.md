# Web page semantics

Scripts run in document order with access to the whole page, `document.currentScript` works, and load events fire.

<output id="order"></output>
<output id="current-script"></output>
<output id="dom-ready"></output>
<output id="loaded"></output>
<output id="style-applied"></output>

<script>
  window.__inlayOrder = ['a'];
  document.getElementById('current-script').textContent = document.currentScript ? 'yes' : 'no';
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('dom-ready').textContent = 'yes';
  });
  window.addEventListener('load', () => {
    document.getElementById('loaded').textContent = 'yes';
    document.getElementById('style-applied').textContent = getComputedStyle(document.getElementById('order')).fontWeight;
  });
</script>

<style>output#order { font-weight: 700; }</style>

<script>
  window.__inlayOrder.push('b');
  document.getElementById('order').textContent = window.__inlayOrder.join(',');
</script>

A paragraph with a [link to the Inlay site](https://inlay.live) that opens in the default browser.
