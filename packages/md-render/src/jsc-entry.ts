// SPDX-License-Identifier: Apache-2.0
// Entry for the JavaScriptCore IIFE. Everything exported here becomes a
// property of the global `InlayRender`. No DOM APIs may be referenced.
export { MD_RENDER_VERSION as version, render } from './index.ts';
