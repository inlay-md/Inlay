# Inline SVG

A block-level SVG with a gradient, its own `<style>` and an animation:

<svg id="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100" role="img" aria-label="Inlay logo">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0" stop-color="#0a84ff"/>
      <stop offset="1" stop-color="#ff9f0a"/>
    </linearGradient>
    <style>.label { font: 14px sans-serif; fill: white; }</style>
  </defs>
  <rect x="10" y="10" width="180" height="80" rx="12" fill="url(#g)"/>
  <circle cx="50" cy="50" r="20" fill="white" opacity="0.9">
    <animate attributeName="r" values="20;24;20" dur="2s" repeatCount="indefinite"/>
  </circle>
  <text x="90" y="56" class="label">Inlay</text>
</svg>

An inline <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="tomato"/></svg> icon inside a sentence, and a second paragraph.
