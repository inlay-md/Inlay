// SPDX-License-Identifier: Apache-2.0
/**
 * Curated grammar set bundled statically into the JavaScriptCore build (Quick
 * Look has no lazy loading). The browser build never imports this file: read-view
 * loads the same ids lazily (packages/read-view/src/languages.ts) and a test keeps
 * the two lists identical.
 */

import c from '@shikijs/langs/c';
import cpp from '@shikijs/langs/cpp';
import csharp from '@shikijs/langs/csharp';
import css from '@shikijs/langs/css';
import dart from '@shikijs/langs/dart';
import diff from '@shikijs/langs/diff';
import dockerfile from '@shikijs/langs/dockerfile';
import elixir from '@shikijs/langs/elixir';
import go from '@shikijs/langs/go';
import graphql from '@shikijs/langs/graphql';
import haskell from '@shikijs/langs/haskell';
import html from '@shikijs/langs/html';
import ini from '@shikijs/langs/ini';
import java from '@shikijs/langs/java';
import javascript from '@shikijs/langs/javascript';
import json from '@shikijs/langs/json';
import jsonc from '@shikijs/langs/jsonc';
import jsx from '@shikijs/langs/jsx';
import kotlin from '@shikijs/langs/kotlin';
import latex from '@shikijs/langs/latex';
import lua from '@shikijs/langs/lua';
import makefile from '@shikijs/langs/makefile';
import markdown from '@shikijs/langs/markdown';
import objectiveC from '@shikijs/langs/objective-c';
import perl from '@shikijs/langs/perl';
import php from '@shikijs/langs/php';
import powershell from '@shikijs/langs/powershell';
import python from '@shikijs/langs/python';
import r from '@shikijs/langs/r';
import ruby from '@shikijs/langs/ruby';
import rust from '@shikijs/langs/rust';
import scss from '@shikijs/langs/scss';
import shellscript from '@shikijs/langs/shellscript';
import sql from '@shikijs/langs/sql';
import swift from '@shikijs/langs/swift';
import toml from '@shikijs/langs/toml';
import tsx from '@shikijs/langs/tsx';
import typescript from '@shikijs/langs/typescript';
import xml from '@shikijs/langs/xml';
import yaml from '@shikijs/langs/yaml';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import type { LanguageRegistration } from '@shikijs/types';
import { type CodeHighlighter, createSyncHighlighter } from './highlight.ts';

/** Shiki language ids available in the JavaScriptCore build (and lazily in the browser). */
export const BUNDLED_LANGUAGE_IDS = [
  'c',
  'cpp',
  'csharp',
  'css',
  'dart',
  'diff',
  'dockerfile',
  'elixir',
  'go',
  'graphql',
  'haskell',
  'html',
  'ini',
  'java',
  'javascript',
  'json',
  'jsonc',
  'jsx',
  'kotlin',
  'latex',
  'lua',
  'makefile',
  'markdown',
  'objective-c',
  'perl',
  'php',
  'powershell',
  'python',
  'r',
  'ruby',
  'rust',
  'scss',
  'shellscript',
  'sql',
  'swift',
  'toml',
  'tsx',
  'typescript',
  'xml',
  'yaml',
] as const;

const BUNDLED_GRAMMARS: LanguageRegistration[][] = [
  c,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  elixir,
  go,
  graphql,
  haskell,
  html,
  ini,
  java,
  javascript,
  json,
  jsonc,
  jsx,
  kotlin,
  latex,
  lua,
  makefile,
  markdown,
  objectiveC,
  perl,
  php,
  powershell,
  python,
  r,
  ruby,
  rust,
  scss,
  shellscript,
  sql,
  swift,
  toml,
  tsx,
  typescript,
  xml,
  yaml,
];

let cached: CodeHighlighter | null = null;

/** Synchronous highlighter over the curated set; built once per realm. */
export function createBundledHighlighter(): CodeHighlighter {
  if (!cached) cached = createSyncHighlighter(BUNDLED_GRAMMARS, [githubLight, githubDark]);
  return cached;
}
