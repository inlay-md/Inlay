# Syntax highlighting

```ts
export interface RenderResult {
  html: string;
  meta: { title: string | null };
}
const render = (md: string): RenderResult => ({ html: md, meta: { title: null } });
```

```python
def greet(name: str) -> str:
    """Return a greeting."""
    return f"Xin chào, {name}!"
```

```swift
struct Document: Sendable {
    let text: String
    var lines: Int { text.split(separator: "\n").count }
}
```

```bash
#!/usr/bin/env bash
set -euo pipefail
pnpm build && xcodebuild -scheme Inlay test
```

```json
{ "name": "inlay", "private": true, "features": ["svg", "html", "js"] }
```

```rust
fn main() {
    let words = vec!["inlay", "markdown"];
    println!("{}", words.join(" "));
}
```

```diff
- old line
+ new line
  unchanged
```

```html
<div class="card"><p>Hello <b>world</b></p></div>
```

```css
.card { color: tomato; padding: 1rem; }
```

```yaml
title: Inlay
tags: [markdown, svg]
```

```jsx
const App = () => <button onClick={() => alert("hi")}>Click</button>;
```

```golang
package main
func main() {}
```

```foo-unknown
This language has no grammar and stays plain.
```

```
No language at all.
```
