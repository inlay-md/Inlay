// SPDX-License-Identifier: Apache-2.0
/**
 * IME safety for WYSIWYG (brief: correct Vietnamese Telex/VNI and CJK input).
 * ProseMirror lets the browser own a composition and reads the result back, which
 * is right. Milkdown's input rules, however, also run on `compositionend` against
 * the text before the caret, so a composed `*` or `#` could turn a word into
 * emphasis or a heading the moment the IME commits. The guard keeps the rules for
 * typed text and the Enter rule, but never runs them while composing or when a
 * composition ends.
 */
import { type EditorState, Plugin, type PluginSpec } from '@milkdown/kit/prose/state';

const INPUT_RULES_KEY = 'MILKDOWN_CUSTOM_INPUTRULES';

function isInputRulesPlugin(plugin: Plugin): boolean {
  const key = (plugin.spec as { key?: { key?: string } }).key?.key ?? '';
  return key.startsWith(INPUT_RULES_KEY);
}

/** Returns the plugin list with Milkdown's input-rules plugin wrapped by the composition guard. */
export function guardInputRules(plugins: readonly Plugin[]): Plugin[] {
  return plugins.map((plugin) => (isInputRulesPlugin(plugin) ? guard(plugin) : plugin));
}

function guard(original: Plugin): Plugin {
  const props = original.spec.props ?? {};
  const textInput = props.handleTextInput;
  const keyDown = props.handleKeyDown;
  const spec: PluginSpec<unknown> & { isInputRules: boolean } = {
    // prosemirror-inputrules' undoInputRule looks for this flag and the plugin state.
    isInputRules: true,
    props: {
      handleTextInput(view, ...args) {
        if (view.composing) return false;
        return textInput ? textInput.call(this, view, ...args) : false;
      },
      handleKeyDown(view, event) {
        if (view.composing || event.isComposing) return false;
        return keyDown ? keyDown.call(this, view, event) : false;
      },
      // No `compositionend` handler: rules never fire on the text an IME just committed.
    },
  };
  if (original.spec.key) spec.key = original.spec.key;
  if (original.spec.state) spec.state = original.spec.state;
  return new Plugin(spec);
}

/** True while the view is inside an IME composition (tests and the position reporter). */
export function isComposing(view: { composing: boolean }, _state?: EditorState): boolean {
  return view.composing;
}
