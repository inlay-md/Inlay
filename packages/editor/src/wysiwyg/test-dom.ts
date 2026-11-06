// SPDX-License-Identifier: Apache-2.0
/** DOM APIs ProseMirror needs that jsdom lacks (layout queries return zeros). */
const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
const zeroRect = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
});

export function installDomShims(): void {
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
  for (const proto of [Element.prototype, Range.prototype]) {
    Object.defineProperty(proto, 'getClientRects', { value: emptyRects, configurable: true });
    Object.defineProperty(proto, 'getBoundingClientRect', { value: zeroRect, configurable: true });
  }
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: () => {},
    configurable: true,
  });
}
