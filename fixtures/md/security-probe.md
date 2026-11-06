# Security probe

This document tries to reach native code, the network and other origins. Every attempt must be blocked; the results are written as JSON below for the automated tests.

<pre id="probe-results">running…</pre>
<img id="probe-img-traversal" src="../../etc/hosts" alt="" width="1" height="1">
<form id="probe-form" action="https://example.com/submit" method="post" target="_self"><input type="hidden" name="x" value="1"></form>

<script>
(() => {
  const results = {};
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    violations.push(`${e.violatedDirective.split(' ')[0]} ${e.blockedURI}`);
  });
  const settle = (name, promise) =>
    Promise.resolve()
      .then(() => promise)
      .then((v) => { results[name] = `allowed:${String(v).slice(0, 60)}`; })
      .catch((e) => { results[name] = `blocked:${e && e.name ? e.name : String(e)}`; });

  // 1. Native bridge.
  results['native-bridge'] =
    typeof window.webkit === 'undefined' || typeof window.webkit.messageHandlers === 'undefined'
      ? 'blocked:no-bridge' : 'allowed:webkit.messageHandlers';
  // 2. eval / Function.
  try { results['eval'] = `allowed:${eval('1+1')}`; } catch (e) { results['eval'] = `blocked:${e.name}`; }
  try { results['function-ctor'] = `allowed:${new Function('return 2')()}`; } catch (e) { results['function-ctor'] = `blocked:${e.name}`; }
  // 3. Network.
  const pending = [
    settle('fetch-remote', fetch('https://example.com/')),
    settle('fetch-same-origin', fetch('assets/sample.svg')),
    settle('fetch-traversal', fetch('../../package.json')),
    settle('xhr-remote', new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://example.com/');
        xhr.onload = () => resolve(xhr.status);
        xhr.onerror = () => reject(new Error('NetworkError'));
        xhr.send();
      } catch (e) { reject(e); }
    })),
    settle('websocket', new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket('wss://example.com/');
        ws.onopen = () => resolve('open');
        ws.onerror = () => reject(new Error('WebSocketError'));
      } catch (e) { reject(e); }
    })),
  ];
  // sendBeacon reports "queued" before CSP rejects the request; the violation event decides.
  try { results['beacon'] = navigator.sendBeacon('https://example.com/beacon', 'x') ? 'pending' : 'blocked:refused'; } catch (e) { results['beacon'] = `blocked:${e.name}`; }
  // 4. Frames and popups (popups are refused natively by the app; browsers may open one).
  const frame = document.createElement('iframe');
  frame.src = 'https://example.com/';
  frame.width = '1'; frame.height = '1';
  document.body.append(frame);
  try { results['window-open'] = window.open('https://example.com/', '_blank') ? 'allowed:window' : 'blocked:null'; } catch (e) { results['window-open'] = `blocked:${e.name}`; }
  // 5. Form submission to another origin.
  try { document.getElementById('probe-form').submit(); results['form-submit'] = 'pending'; } catch (e) { results['form-submit'] = `blocked:${e.name}`; }
  // 6. Image traversal.
  const img = document.getElementById('probe-img-traversal');
  pending.push(new Promise((resolve) => {
    const done = (v) => { results['img-traversal'] = v; resolve(); };
    if (img.complete) done(img.naturalWidth > 0 ? 'allowed:loaded' : 'blocked:error');
    img.onload = () => done(img.naturalWidth > 0 ? 'allowed:loaded' : 'blocked:error');
    img.onerror = () => done('blocked:error');
  }));

  const finish = () => {
    if (results['beacon'] === 'pending') {
      results['beacon'] = violations.some((v) => v === 'connect-src https://example.com/beacon') ? 'blocked:csp' : 'allowed:no-violation';
    }
    if (results['form-submit'] === 'pending') {
      results['form-submit'] = violations.some((v) => v.startsWith('form-action')) ? 'blocked:csp' : 'allowed:no-violation';
    }
    results['iframe'] = violations.some((v) => v.startsWith('frame-src') || v.startsWith('child-src')) ? 'blocked:csp' : 'allowed:no-violation';
    const pre = document.getElementById('probe-results');
    pre.textContent = JSON.stringify({ results, violations }, null, 2);
    pre.dataset.complete = 'true';
  };
  Promise.allSettled(pending).then(() => setTimeout(finish, 300));
  setTimeout(finish, 4000);
})();
</script>
