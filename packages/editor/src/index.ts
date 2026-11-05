// SPDX-License-Identifier: Apache-2.0
export {
  countSourceLines,
  type DecodedDocument,
  decodeDocument,
  encodeDocument,
  hasBom,
} from './document.ts';
export { buildLineMap, editorLineStarts, type LineMap } from './line-map.ts';
export {
  createSourceState,
  getText,
  offsetToStringIndex,
  type SourceStateOptions,
  stringIndexToOffset,
  textOf,
} from './source-state.ts';
