// SPDX-License-Identifier: Apache-2.0
import type { Mode } from './host.ts';

export const SETTINGS_VERSION = 1 as const;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  /** Appearance: follow the system or force one. */
  theme: 'system' | 'light' | 'dark';
  editor: {
    defaultMode: Mode;
    fontSize: number;
    /** Documents with more lines than this open in Source mode (safety net). */
    largeDocumentSourceFallbackLines: number;
  };
  readView: {
    /** Default for the per-document "Allow network" toggle. */
    allowNetworkByDefault: boolean;
  };
  quickLook: {
    /** Tier 2: include raw HTML and run document scripts in Quick Look. */
    runScripts: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  version: SETTINGS_VERSION,
  theme: 'system',
  editor: {
    defaultMode: 'wysiwyg',
    fontSize: 15,
    largeDocumentSourceFallbackLines: 50_000,
  },
  readView: { allowNetworkByDefault: false },
  quickLook: { runScripts: false },
}) as Settings;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeInto<T extends Record<string, unknown>>(base: T, patch: unknown): T {
  if (!isRecord(patch)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in base)) continue; // unknown keys are dropped
    const current = base[key];
    if (isRecord(current)) {
      out[key] = mergeInto(current, value);
    } else if (value !== undefined && typeof value === typeof current) {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Builds a complete Settings object from defaults plus an untrusted partial
 * (stored preferences or a patch). Unknown keys and wrongly typed values are ignored.
 */
export function resolveSettings(partial: DeepPartial<Settings> | unknown): Settings {
  const merged = mergeInto(DEFAULT_SETTINGS as unknown as Record<string, unknown>, partial);
  return { ...(merged as unknown as Settings), version: SETTINGS_VERSION };
}

export type SettingsPatch = DeepPartial<Settings>;
