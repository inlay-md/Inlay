// SPDX-License-Identifier: Apache-2.0
/**
 * Mermaid renders client-side (it needs a DOM). The vendored UMD bundle is
 * injected only when the document has `pre.mermaid` blocks, so plain documents
 * never pay for it. Sources are kept on the element so diagrams can be
 * re-rendered when the theme changes.
 */

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  run(options: { nodes: Iterable<Element>; suppressErrors?: boolean }): Promise<void>;
  parse?(text: string, options?: { suppressErrors?: boolean }): Promise<unknown>;
}

declare global {
  interface Window {
    mermaid?: MermaidApi;
  }
}

let loading: Promise<MermaidApi> | null = null;

export function loadMermaid(runtimeBaseURL: string): Promise<MermaidApi> {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  loading ??= new Promise<MermaidApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${runtimeBaseURL}vendor/mermaid/mermaid.min.js`;
    script.async = true;
    script.onload = () => {
      if (window.mermaid) resolve(window.mermaid);
      else reject(new Error('mermaid did not register a global'));
    };
    script.onerror = () => reject(new Error(`could not load ${script.src}`));
    document.head.append(script);
  });
  return loading;
}

export function isDarkTheme(): boolean {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Renders (or re-renders) every `pre.mermaid` under `root`; returns how many succeeded. */
export async function renderMermaid(root: ParentNode, runtimeBaseURL: string): Promise<number> {
  const nodes = [...root.querySelectorAll<HTMLElement>('pre.mermaid')];
  if (nodes.length === 0) return 0;
  const mermaid = await loadMermaid(runtimeBaseURL);
  mermaid.initialize({
    startOnLoad: false,
    theme: isDarkTheme() ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit',
  });
  let ok = 0;
  for (const node of nodes) {
    // Keep the source for re-renders; restore it if this is one.
    let source = node.dataset.inlayMermaidSrc;
    if (source === undefined) {
      source = node.textContent ?? '';
      node.dataset.inlayMermaidSrc = source;
    } else {
      node.textContent = source;
    }
    node.removeAttribute('data-processed');
    try {
      await mermaid.run({ nodes: [node], suppressErrors: false });
      ok++;
    } catch (error) {
      node.replaceChildren();
      const pre = document.createElement('pre');
      pre.className = 'inlay-mermaid-error';
      pre.textContent = `Mermaid: ${error instanceof Error ? error.message : String(error)}\n\n${source}`;
      node.append(pre);
      node.dataset.processed = 'error';
    }
  }
  return ok;
}
