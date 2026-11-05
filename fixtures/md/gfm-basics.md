# GFM basics

A paragraph with **strong**, *emphasis*, ~~strikethrough~~, `inline code`, a [link](https://example.com "Title") and an autolink https://inlay.live.

> A blockquote with a nested list:
> - one
> - two

## Task list

- [x] Byte-identical round trip
- [ ] WYSIWYG islands
- [ ] Quick Look tiers

## Table with alignment

| Left | Center | Right |
|:-----|:------:|------:|
| a    |   b    |     c |
| long cell | *em* | `code` |

## Code

```ts
export function hello(name: string): string {
  return `Hello, ${name}!`;
}
```

    indented code block
    second line

## Image

![Sample](./assets/sample.svg)

Hard break with two trailing spaces  
next line. Backslash break\
next line.

---

Final paragraph.
