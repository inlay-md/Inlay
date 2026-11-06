# Network access toggle

Documents cannot reach the network unless "Allow Network for This Document" is on.

<output id="fetch-remote">pending</output> / <output id="fetch-local">pending</output>

<script>
  const report = (id, promise) =>
    promise
      .then((r) => { document.getElementById(id).textContent = `allowed:${r.status}`; })
      .catch((e) => { document.getElementById(id).textContent = `blocked:${e.name}`; });
  report('fetch-remote', fetch('https://example.com/'));
  report('fetch-local', fetch('assets/sample.svg'));
</script>
