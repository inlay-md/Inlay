// SPDX-License-Identifier: Apache-2.0

export { Emitter } from './events.ts';
export type {
  ContentProvider,
  DocumentInfo,
  EditorPosition,
  Eol,
  Host,
  HostEvents,
  Mode,
} from './host.ts';
export { detectEol, MockHost, type MockHostOptions } from './mock.ts';
export { isTrustedOrigin, originOf } from './origin.ts';
export {
  DEFAULT_SETTINGS,
  resolveSettings,
  SETTINGS_VERSION,
  type Settings,
  type SettingsPatch,
} from './settings.ts';
export {
  createWebKitHost,
  type NativeCallbacks,
  WEBKIT_HANDLER_NAME,
  WebKitHost,
  type WebKitMessageHandler,
} from './webkit.ts';
