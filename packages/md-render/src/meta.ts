// SPDX-License-Identifier: Apache-2.0
/**
 * remark plugin: collects document metadata from the mdast tree. Runs before
 * remark-rehype so it sees the `yaml` front-matter node, raw `html` nodes and
 * fenced-code info strings.
 */
import type { Code, Html, Root as MdastRoot, Yaml } from 'mdast';
import { toString as mdastText } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';

export interface CollectedMeta {
  frontMatter: string | null;
  title: string | null;
  hasScripts: boolean;
  hasRawHtml: boolean;
  codeLanguages: string[];
  hasMermaid: boolean;
  hasMath: boolean;
}

const SCRIPT_RE = /<script[\s>]/i;

/** The first word of a fence info string, lower-cased: ```ts title="x" → "ts". */
export function codeLanguage(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const first = lang.trim().split(/\s+/)[0] ?? '';
  const id = first.toLowerCase().replace(/^\{|\}$/g, '');
  return id.length > 0 ? id : null;
}

/** `title:` from YAML front matter without a YAML parser: plain or quoted scalar on one line. */
export function frontMatterTitle(yaml: string): string | null {
  const m = /^title:[ \t]*(.*?)[ \t]*$/m.exec(yaml);
  if (!m?.[1]) return null;
  let value = m[1];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.length > 0 ? value : null;
}

export function countLines(markdown: string): number {
  return markdown.length === 0 ? 0 : markdown.split(/\r\n|\r|\n/).length;
}

export function collectMeta(tree: MdastRoot): CollectedMeta {
  const meta: CollectedMeta = {
    frontMatter: null,
    title: null,
    hasScripts: false,
    hasRawHtml: false,
    codeLanguages: [],
    hasMermaid: false,
    hasMath: false,
  };
  const langs = new Set<string>();
  let headingTitle: string | null = null;
  visit(tree, (node) => {
    switch (node.type) {
      case 'yaml': {
        const yaml = node as Yaml;
        if (meta.frontMatter === null) {
          meta.frontMatter = yaml.value;
          meta.title = frontMatterTitle(yaml.value);
        }
        break;
      }
      case 'heading':
        if (headingTitle === null) {
          const text = mdastText(node).trim();
          if (text) headingTitle = text;
        }
        break;
      case 'html': {
        meta.hasRawHtml = true;
        if (SCRIPT_RE.test((node as Html).value)) meta.hasScripts = true;
        break;
      }
      case 'code': {
        const lang = codeLanguage((node as Code).lang);
        if (lang) {
          if (lang === 'mermaid') meta.hasMermaid = true;
          else langs.add(lang);
        }
        break;
      }
      case 'math':
      case 'inlineMath':
        meta.hasMath = true;
        break;
      default:
        break;
    }
  });
  meta.codeLanguages = [...langs].sort();
  if (meta.title === null) meta.title = headingTitle;
  return meta;
}
