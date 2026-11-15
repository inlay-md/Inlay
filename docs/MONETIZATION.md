# Inlay — monetization plan and roadmap

**Status: proposal for the product owner, 2026-11-12.** Nothing here is decided. The brief says nothing about revenue, so every item is a product decision that waits for approval; the decisions are listed in section 11 and in `docs/BRIEF-AMENDMENTS.md`. Prices and market facts were checked on 2026-11-12 and carry their sources; anything not confirmed from a primary source is marked.

This is a plan, not financial or legal advice. Tax, company structure and trademark registration need a professional.

## 1. Summary

- **Keep the app free and open source (Apache-2.0).** Reading, editing, saving, Quick Look and every security feature stay free for good. This is the audience, the trust and the moat against a bare Quick Look utility.
- **Sell Inlay Pro:** a paid licence for the official build that unlocks features for people who turn documents into deliverables (Present, the export suite, automation, cross-file tools). One-time price with a year of updates. Starts with release 1.2, not before.
- **Open the store channels** once the sandboxed build exists: Mac App Store and Setapp.
- **Sell to teams** what only organizations need: volume licences, invoices, priority support, help with managed policies.
- **Consider a hosted service** (Publish) only after people ask for it in numbers. It is the one line with real operating cost and abuse risk.
- **Validate before building:** a founding-supporter licence at 1.0 measures willingness to pay months before Pro exists.

Honest expectation: in its first year Pro is likely to cover costs and prove demand, not pay a salary. The upside case is a sustainable independent product, and it depends on one thing above all: becoming the default way people open the Markdown their AI tools write.

## 2. The market on 2026-11-12

### What comparable apps charge

| App | Model | Price (USD) | Source |
| --- | --- | --- | --- |
| Typora | One-time, 3 devices | $14.99 | typora.io |
| iA Writer (Mac) | One-time per platform | $49.99 | ia.net/writer/buy |
| Obsidian | Free app; optional commercial licence; paid services | Commercial $50 per user per year; Sync from $4 per month; Publish from $8 per site per month | obsidian.md/pricing |
| Ulysses | Subscription | $5.99 per month, $39.99 per year | ulysses.app/pricing |
| Bear | Freemium subscription | $2.99 per month, $29.99 per year | bear.app |
| Marked 2 | One-time (legacy) | $14.99 | markedapp.com/pricing |
| Marked 3 (May 2026) | Subscription or permanent unlock; Setapp | $4.99 per month, $49.99 per year, $89.99 permanent | markedapp.com/pricing |
| Marked QL | Paid Quick Look extension | $9.99 | markedapp.com |
| MacMD Viewer | One-time; direct, Setapp, Mac App Store | $19.99; 3 Macs $39.99 | macmdviewer.com |
| Other "viewer for AI output" apps (2026) | One-time | about $4 to $20 (secondary sources) | product pages and roundups |
| Nova | One-time with a year of updates; renewal | $99; $49 per year | nova.app/buy |
| BBEdit 16 | One-time, paid upgrades | $59.99 | barebones.com/store |
| MarkEdit, Mark Text, Zettlr, QLMarkdown, MDHero | Free and open source | $0 | project pages |

Price corridor: **$10 to $20 one-time for viewers, $15 to $50 for editors.** A licence with a year of updates and an optional renewal is the norm for developer tools (Proxyman $89 and $49, TablePlus $99 and $59, Nova $99 and $49).

### How open-source desktop apps earn

- **A closed Pro beside a free app:** Rectangle (free, MIT) and Rectangle Pro (about $9.99).
- **The Mac App Store as paid convenience:** Maccy is free on GitHub and $9.99 in the store.
- **Paid services on a free app:** Obsidian (Sync, Publish), Excalidraw+ ($6 per user per month), Zed (Pro $10 per month).
- **Paid official binaries:** Ardour (pay what you want). Aseprite did this but moved to a non-open licence in 2016.
- **Donations:** rarely more than the developer-programme fee. A 2024 Tidelift survey found 60% of maintainers unpaid.

No Mac writing or Markdown app publishes its free-to-paid conversion rate. The founder-reported range for independent Mac utilities is wide: Xnapper about $4,000 per month, RocketSim $62,000 per year (2023), BoltAI $15,000 to $30,000 per month (stealwhatworks.com, September 2026).

### Signals that change the plan

1. **Apple is adding basic Markdown rendering to Quick Look.** The macOS 27.3 beta (3 November 2026) previews `.md` files with styled headings, bold, lists and links (9to5mac.com, macrumors.com). Plain Markdown preview is becoming a system feature. What Apple's preview does not do is what Inlay is for: SVG, math, Mermaid, tables of charts, HTML and scripts.
2. **Third-party Quick Look precedence is a risk.** On iOS 27, third-party data-based Markdown preview extensions are reported as no longer invoked (Apple Developer Forums thread 843292). The reporter says macOS still works. Whether a third-party extension still wins over the system renderer on macOS 27.3 has to be tested before M4 is built (see `docs/PLAN.md`).
3. **A wave of paid viewers for AI output shipped in 2026** at $4 to $20. The category is validated and getting crowded at the simple end. None of them offers a lossless editor or runs document scripts in an isolated view.
4. **Agents write Markdown at scale, and some now write HTML.** `AGENTS.md` and `CLAUDE.md` files are in a large share of popular repositories (arxiv.org/abs/2602.14690), and there is a public argument for HTML over Markdown in agent reports. A Markdown app that renders embedded HTML safely sits exactly on that seam.
5. **Developer ID certificates:** the original Developer ID intermediate authority expires on 1 February 2027; new certificates must be issued from the G2 authority (developer.apple.com/news/?id=w4atic4c). Create the signing certificate for M5 from G2.

### What this means for positioning

Do not sell "Quick Look for Markdown". Sell **"Markdown that runs, and a file that stays yours"**: the only app that renders everything in the document safely and edits it without rewriting it. Quick Look is how people meet Inlay, not what they pay for.

## 3. Principles

1. **Never charge for safety or fidelity.** Isolation, trust controls, byte-exact saving and input-method correctness are free in every edition, forever.
2. **Never move a feature from free to paid.** What ships free stays free.
3. **Never hold a file hostage.** Documents are plain Markdown and HTML. Nothing Pro writes needs Pro to read.
4. **No account, no telemetry, no advertising.** A licence is checked on the Mac. The app does not call home.
5. **Pay once is the default.** Subscriptions only for things that cost money to run every month.
6. **Open source means open source.** The public repository builds a complete, useful app under Apache-2.0. Pro is an addition, not a removal.

## 4. Editions

| | **Inlay** | **Inlay Pro** | **Inlay for Teams** |
| --- | --- | --- | --- |
| Price | Free | One-time, a year of updates | Per seat, per year |
| Source | Apache-2.0, public | Closed add-on modules | Same as Pro |
| Read, Edit, Source, Split; raw islands; byte-exact saving | ✓ | ✓ | ✓ |
| Quick Look, all tiers | ✓ | ✓ | ✓ |
| Trust, permissions, folder trust, managed policies | ✓ | ✓ | ✓ |
| Themes, custom CSS, HTML and PDF export, print | ✓ | ✓ | ✓ |
| Outline, find, focus modes, status bar, image paste, localization | ✓ | ✓ | ✓ |
| `inlay file.md`, starter snippets, templates | ✓ | ✓ | ✓ |
| Workspace basics, Changes view, command palette | ✓ | ✓ | ✓ |
| Present (slides with live charts) | | ✓ | ✓ |
| Export suite: PDF with outline and page furniture, frozen HTML, DOCX, chart and diagram images | | ✓ | ✓ |
| Snippet gallery | starter set | ✓ | ✓ |
| Automation: batch export from the command line, Shortcuts | | ✓ | ✓ |
| Cross-file search and replace, backlinks, Git awareness | | ✓ | ✓ |
| Assistant (on device or your own key) | | ✓ | ✓ |
| Volume licences, one invoice, priority support, policy set-up help | | | ✓ |

**The rule:** if a feature is needed to read, edit or keep a file safely, it is free. If it turns a document into a deliverable or saves a professional repeated work, it can be Pro.

## 5. Pricing proposal

| Product | Price | Notes |
| --- | --- | --- |
| Inlay | Free | Direct download, Homebrew, later the Mac App Store |
| **Founding supporter** (from 1.0, first 500) | $19 once | Becomes a Pro licence with updates through all of 1.x and 2.x. Sold before Pro exists, clearly labelled as support now and Pro later |
| **Inlay Pro** | **$29** once | 3 Macs per person. Includes every update released within 12 months. The licence never expires for those versions |
| Pro update renewal | $15 per year, optional | Another 12 months of updates. Skipping it keeps what you have |
| Education | 50% off | Students and teachers |
| **Inlay for Teams** | $39 per seat per year | From 5 seats; 20% off from 25. Updates and priority support included while subscribed |
| Mac App Store | Free with Pro as a $29.99 one-time in-app purchase | After the sandboxed build (1.3) |
| Setapp | Included in the Setapp subscription | After 1.3; Setapp requires a Developer ID build, which Inlay has |
| Publish (if built) | $5 per month or $48 per year | Section 7 |

Why $29: above the viewer corridor ($10 to $20) because Pro is an authoring tool, below iA Writer ($49.99) and Marked 3 ($89.99) because Inlay is new and the free edition is generous, and about twice Typora ($14.99) for clearly more. Review the price at 2.0, when Pro has grown.

Trial: 14 days of Pro, started by the user, tracked on the Mac, no account.

## 6. How it works technically

- **Where Pro lives.** A private repository holds the Pro modules: extra web bundles and a Swift package. The official release workflow builds with them; the public repository builds without them and is complete. The core exposes internal extension points (commands, exporters, panes, snippet providers; ADR-0039) that Pro plugs into. Apache-2.0 allows this combination, and the DCO needs no change because community code is never relicensed.
- **The licence.** A small signed file: product, edition, licensee name, issue date, updates-until date, seats. Signed with Ed25519; the public key ships in the app; verification uses CryptoKit on the Mac, offline (ADR-0040). Activation is opening the file or pasting the key. No device binding at first: "3 Macs" is on trust.
- **Updates-until.** A build unlocks Pro if its release date is on or before the licence's updates-until date. Sparkle offers the newest eligible build to an expired licence and says why. Free features never depend on a licence.
- **Selling.** A merchant of record handles checkout, tax and invoices. On purchase, a webhook calls a small function that signs the licence and emails it. Candidates: **Paddle** (5% + 50¢) and **Polar** (5% + 50¢ for new organizations; its own licence keys need online validation, so use it for checkout only). Lemon Squeezy is being folded into Stripe and admits slower support; Stripe Managed Payments has no licence keys and accepts sellers from a short list of countries. Confirm that the chosen provider onboards sellers in the owner's country before anything else.
- **Mac App Store.** StoreKit in-app purchase unlocks the same Pro modules; Apple's commission is 15% under the Small Business Program. The store requires the App Sandbox, which is why this waits for 1.3 (ADR-0038).
- **What is not built:** copy protection beyond the signature. Someone determined will get around it; the people who pay are not those people.

## 7. Publish: a service to consider, not to assume

**Idea:** one click turns a document into a link. The page is a frozen or live copy, served from a separate domain, sandboxed, optionally password-protected.

**Why it is attractive:** recurring revenue, and it spreads Inlay with every shared link.

**Why to be careful:** hosting other people's HTML and JavaScript is hosting a phishing kit until proven otherwise. It needs a separate registrable domain, strict sandboxing, takedown handling, abuse monitoring and someone on call. For a one-person company that is the largest operating risk in this plan.

**Gate:** build only if (a) at least 500 people join a waiting list from inside the app's Share menu, and (b) single-file HTML export is used by a meaningful share of Pro users. Until then, "Export frozen HTML" plus the user's own hosting (GitHub Pages, any static host) covers the need at no risk.

## 8. Go to market

**Message.** Three lines, in this order:
1. *Markdown that runs.* Charts, diagrams, SVG and HTML render as on a web page.
2. *Nothing escapes.* Documents get no route to your Mac and none to the network unless you allow it.
3. *Your file stays yours.* Open and save changes nothing. An edit changes only what you edited.

Line 2 may be used in public only after the security work of MH-B has shipped (`docs/ARCHITECTURE.md` S1 to S3); until then the honest claim is "no route to native code".

**The asset nobody else has:** the web core runs in a plain browser. Put a live playground on inlay.live where a visitor pastes Markdown and sees it render with islands and charts, with no download.

**Channels, in order of expected return:**
- People using AI coding tools: a one-line recipe (`open -a Inlay report.md`, and Inlay refreshes as the agent writes) for READMEs, `AGENTS.md` files and forum posts.
- Hacker News (Show HN), r/macapps, Product Hunt, Mac news sites, at 1.0.
- Homebrew cask, `awesome-mac` and Markdown tool lists.
- Vietnamese and CJK developer communities: correct Telex, VNI and CJK input is a real, rarely met need.
- Three articles that are worth reading on their own: why editors rewrite your file and how Inlay does not; how to run untrusted JavaScript safely on a Mac; a viewer for what your agent writes.
- Honest comparison pages against Typora, Marked and the AI-output viewers.

**What is measured, without telemetry:** downloads (GitHub Releases, website), update-feed requests counted in aggregate on the server, Homebrew's public install counts, stars and issues, licence sales, refunds and support volume. The app itself reports nothing.

## 9. Scenarios

No comparable app publishes conversion rates, so these are assumptions to test, not forecasts. "Active" means Macs that fetched the update feed in a month, 12 months after Pro launches. Net per Pro licence after a 5% + 50¢ fee is about $27.

| | Cautious | Base | Strong |
| --- | --- | --- | --- |
| Active Macs | 3,000 | 10,000 | 30,000 |
| Pro licences sold in the year (share of active) | 30 (1%) | 250 (2.5%) | 1,200 (4%) |
| Pro revenue, net | about $800 | about $6,800 | about $32,000 |
| Teams seats | 0 | 40 | 300 |
| Teams revenue, net | $0 | about $1,500 | about $11,000 |
| Store and Setapp | $0 | about $1,500 | about $8,000 |
| **Year total, net** | **under $1,000** | **about $10,000** | **about $50,000** |

Costs are small and mostly fixed: the Apple Developer Program ($99 per year), the domain, hosting for a static site and one function, payment fees (already netted above). The real cost is time.

Reading the table: the licence price barely matters next to the number of active users. The first year's job is distribution.

## 10. Roadmap

| Phase | When | Product | Business actions | Gate to the next phase |
| --- | --- | --- | --- | --- |
| **0. Foundations** | now to 1.0 | M4, M5, hardening | Decide the model (section 11). Create the G2 Developer ID certificate. Open GitHub Sponsors and add `FUNDING.yml`. Choose the merchant of record and confirm seller eligibility. Have "Inlay" checked for trademark conflicts. Write the "free for good" pledge. Build the playground and a waiting list on inlay.live | Decisions D1 to D6 made |
| **1. Adoption** | 1.0 and 1.1, H1 2027 | Everything free | Public launch. Founding-supporter licence on sale. The three articles. Homebrew cask. Count downloads and feed requests | 5,000 active Macs **or** 200 founding supporters. If neither within 6 months of 1.0, revisit the plan before building Pro |
| **2. Pro** | 1.2, Q3 2027 | Present, export suite, automation, licence system | Private Pro repository and build. Checkout and licence signing live. Founding supporters converted. Pricing page | 2% of active Macs on Pro, refund rate under 5% |
| **3. Channels** | 1.3, Q4 2027 | Sandboxed build, trust features | Mac App Store edition. Setapp. Teams licence and a page for administrators | Store and Setapp together at least a quarter of new revenue, or drop the weaker one |
| **4. Depth** | 2.0, H1 2028 | Workspace, Pro cross-file tools | Price review. Case studies. Waiting list for Publish in the Share menu | Publish gate (section 7) |
| **5. Service** | 2.x, 2028 | Publish, assistant | Subscription, abuse process, separate domain | — |

## 11. Decisions for the product owner

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Does Inlay earn money at all, and how? | Open core: free Apache-2.0 app, paid closed Pro add-on, later channels and teams |
| D2 | Where is the free line? | The rule in section 4; publish it as a pledge |
| D3 | Price and licence terms for Pro | $29 once, a year of updates, $15 renewal, 3 Macs |
| D4 | Sell a founding-supporter licence at 1.0? | Yes, $19, first 500 |
| D5 | Merchant of record | Paddle, or Polar for checkout; decide after confirming seller-country support |
| D6 | Open sponsorship now? | Yes; expect it to cover fees, not more |
| D7 | Mac App Store edition (lifts a v1 non-goal after v1) | Yes, at 1.3, on the sandboxed build |
| D8 | Teams offering | Yes, at 1.3; keep it a licence and support product, no server |
| D9 | Publish | Not now; gate in section 7 |
| D10 | Assistant features (lifts a v1 non-goal after v1) | Pro, on device first, at 2.x |
| D11 | Trademark | Get a clearance search for "Inlay" in software before the public launch; register if clear |

## 12. Risks

| Risk | Likelihood | Effect | Answer |
| --- | --- | --- | --- |
| Apple's built-in Markdown preview makes Quick Look utilities redundant | High, already in beta | The simple end of the category loses its reason to exist | Position on rich rendering, safety and editing; test extension precedence on 27.3 before M4 |
| The system stops invoking third-party Markdown Quick Look extensions | Unknown; happened on iOS 27 | Inlay loses its discovery surface | The app must stand without Quick Look: default-app prompt, "Open with", the command line; file feedback with Apple early |
| A security escape from the Read view | Low, but it is the brand | Existential | Tests, the probe, `SECURITY.md`, the sandboxed build, fast patch releases |
| Open-core resentment | Medium | Noise, forks | The pledge; never move a feature to paid; Pro is new work, not removed work |
| A fork gives Pro away | Low for a niche app | Some lost sales | Pro is closed; the trademark and official updates stay with Inlay; ship faster than a fork |
| Too few users for Pro to matter | Medium | The cautious column | The phase 1 gate; keep costs near zero; decide at the gate, not after building Pro |
| Support load on one person | Medium | Slower releases | Documentation in the app; GitHub issues for free users; email for Pro and Teams only |
| Payment provider changes terms or leaves | Medium (Lemon Squeezy is mid-migration) | Checkout disruption | Own the licence format and signing key; the provider only takes payment |
| Publish abuse | High if built | Legal and reputation | The gate; separate domain; frozen pages first |
| Dependence on Milkdown Crepe | Medium | Editor work blocked by upstream | ADR-0035: own the editor chrome on ProseMirror over time |
