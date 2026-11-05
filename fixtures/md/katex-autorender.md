# KaTeX auto-render from the CDN

Documents that bring their own KaTeX keep working offline because the URLs are rewritten to the bundled copy.

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.getElementById('autorender'), { delimiters: [{ left: '\\(', right: '\\)', display: false }] }); document.getElementById('autorender').dataset.rendered = 'true';"></script>

<div id="autorender">Auto-rendered: \(a^2 + b^2 = c^2\) and \(\sqrt{2}\).</div>

Native math still renders too: $\pi \approx 3.14159$.
