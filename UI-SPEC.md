# UI Specification

This is the operator-product visual contract. Every screen follows the same keyboard,
accessibility, state, and evidence-presentation rules.

> **This is an inbox, not a dashboard.** One object (Incident), one action (approve or dismiss). If a screen does not help someone decide about a specific incident, it does not ship.

**References:** Linear for density and keyboard flow · Vercel for restraint · GitHub's PR files view for the diff. **Never use an AI product as a visual reference.** That is where the slop lives.

---

## 1. Tokens

Defined once in `apps/web/src/ui/tokens.css`. Nothing in the app uses a raw hex value.

```css
:root {
  --bg:            #ffffff;
  --bg-subtle:     #fafafa;   /* page chrome, table headers */
  --bg-inset:      #f4f4f5;   /* row hover, code blocks */
  --border:        #e4e4e7;
  --border-strong: #d4d4d8;   /* focused inputs, active row rule */
  --text:          #18181b;
  --text-muted:    #71717a;   /* meta, labels */
  --text-faint:    #a1a1aa;   /* disabled, expired */
  --accent:        #2563eb;   /* THE one accent. primary action + focus ring only. */
  --accent-fg:     #ffffff;
  --fail:          #dc2626;
  --pass:          #16a34a;
  --warn:          #b45309;   /* PARKED, HUMAN_REVIEW */
}

:root[data-theme="dark"] {
  --bg:            #0a0a0b;
  --bg-subtle:     #131315;
  --bg-inset:      #1b1b1f;
  --border:        #26262b;
  --border-strong: #3f3f46;
  --text:          #fafafa;
  --text-muted:    #a1a1aa;
  --text-faint:    #71717a;
  --accent:        #3b82f6;
  --accent-fg:     #0a0a0b;
  --fail:          #f87171;
  --pass:          #4ade80;
  --warn:          #fbbf24;
}
```

**Both themes are first-class.** Dark is not an afterthought filter; it is a second token set, and every screenshot in the deck is taken in both.

### Type

| Role | Size / line-height | Family | Notes |
|---|---|---|---|
| Display — the one number | 32 / 1.1 | system | `font-variant-numeric: tabular-nums` |
| Screen title | 20 / 1.3 | system | weight 600 |
| Body | 14 / 1.5 | system | weight 400 |
| Meta, labels | 12.5 / 1.4 | system | `--text-muted`, uppercase only for block labels in the incident proof |
| Mono | 13 / 1.5 | `ui-monospace, SFMono-Regular, Menlo, monospace` | **every identifier, diff, assertion, run, config path, version number** |

System font stack for prose. Monospace is not decoration — it is the signal that a string is an identifier you can copy.

### Space, shape, motion

- **Space:** 4px base — `4 · 8 · 12 · 16 · 24 · 32 · 48`. Nothing between.
- **Radius:** `4px`, everywhere. `6px` for the single primary button. Nothing larger.
- **Border:** `1px solid var(--border)`. **Zero box-shadows in the entire application.** No cards, no elevation, no glow.
- **Motion:** `120ms ease-out` on hover and focus. Nothing else animates. `@media (prefers-reduced-motion: reduce) { * { transition: none !important } }`.

### Banned, without exception

Gradients · glassmorphism · card shadows · glow · emoji in chrome · sparkle icons · "powered by AI" / "intelligent" / "smart" / "seamlessly" / "supercharge" / "leverage" / "unlock" · a chart that exists because dashboards have charts · more than one accent color · skeleton loaders under 300ms · animation beyond 150ms · lorem in production · modals except destructive confirmation · illustrations in empty states.

---

## 2. Layout

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │  Silent failure rate                                     │
│  Inbox   │  4.2%  ▾ 0.3 from last week                              │
│  Outcomes│                                                          │
│  Config  │  ─────────────────────────────────────────────────────   │
│  Settings│  INCIDENT                     USERS  FIRST SEEN   STATE  │
│          │  Export ignores active filt…     12  2h ago    CANDIDATE │
│  ? keys  │  Summary drops the date ra…       4  1d ago    APPLIED   │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
   200px      content, max-width 1080px, 32px padding
```

- **Left rail 200px, fixed.** Text only, no icons. Five items. Active item: `--text` on `--bg-inset`, 2px `--accent` left rule. Everything else `--text-muted`.
- **Content max-width 1080px, left-aligned.** Not centred — centred content in a tool reads as marketing.
- **No top bar, no breadcrumbs, no search field.** Navigation is four links and the keyboard.
- **Minimum viewport 1024px.** Below that, one line: *"Outcome is built for a desktop window."* This is an internal tool used at a desk; pretending otherwise costs real time for zero users.

---

## 3. Components

Fifteen. `apps/web/src/ui/`. A sixteenth means a screen is doing too much.

| Component | Contract | Notes |
|---|---|---|
| `Rail` | — | five links, active state, `?` hint at the bottom |
| `PageHeader` | `title, meta?, actions?` | 20px title, 12.5px meta line beneath |
| `Stat` | `value, deltaFrom, label` | the display number + `▾ 0.3 from last week`. Delta is `--pass` when down, `--fail` when up — **failure rate falling is good**, so the arrow direction and the color both invert from the naive default. |
| `Table` `Row` | `columns, rows, onSelect` | real `<table>`, `<th scope="col">`, 40px rows, 1px row rules, no zebra, hover `--bg-inset` |
| `StateBadge` | `state` | 12 states, §7 |
| `Dots` | `n, passCount` | **the signature visual**, §4 |
| `Diff` | `lines` | unified, mono, `+`/`−` gutter, `--pass`/`--fail` at 8% alpha background |
| `Assertion` | `kind, params` | one mono line: `TOOL_ARG_EQUALS  export_records.filters == view.activeFilters` |
| `Evidence` | `sessions` | transcript excerpts, signal turns marked with a 2px `--warn` left rule and the signal name in 12.5px mono |
| `Verdict` | `verdict, confidence, evidence[]` | `CONFIG_DEFECT · 0.86` + the ranked evidence list that produced it |
| `KeyHint` | `keys` | `<kbd>` styled: 11px mono, 1px border, 3px radius |
| `Empty` | `fact, action?` | one sentence of fact, one action. Never an illustration, never an apology. |
| `Confirm` | `title, body, destructive` | the only modal in the app. Used for global apply and revert. |
| `Toast` | `message` | bottom-left, 4s, one line, no icon, no close button |
| `CopyId` | `id` | mono, click copies, 120ms `--pass` flash, no toast |

### 4. `Dots` — get this one right

It is the entire proof, and the audience reads it in four seconds with no legend.

```
BEFORE   ●●●●●   0/5 passed
AFTER    ○○○○○   5/5 passed   ·   positive suite 41/41 green
```

- **Filled `●` = the run failed.** Color `--fail`.
- **Hollow `○` = the run passed.** Color `--pass`, 1.5px stroke.
- 10px diameter, 6px gap, 12px gap before the count.
- The count text is **always** present. Color is never the only channel.
- Rendered as inline SVG, not a font glyph — glyph metrics vary across platforms and this must be pixel-stable on a projector.
- `role="img"` with `aria-label="0 of 5 runs passed"`.
- **Never animates.** Not a progress bar, not a fill-in. It is a result, and a result appears.

Mixed results render honestly: `●●○●○  2/5 passed` — that is the `VARIANCE` case, and it is a headline, not an error.

---

## 5. Screen 1 — Inbox

**Purpose:** decide what to look at next. **Data:** `PipelineReader.listIncidents()`, `PipelineReader.silentFailureRate()`.

**The one number, above the list, never a chart row:**

```
Silent failure rate
4.2%   ▾ 0.3 from last week
```

Clickable through to the sessions that produced it. Every number in this application is clickable through to its evidence; a number you cannot interrogate is decoration.

**The list.** Columns: `INCIDENT` (title, truncated with `text-overflow`) · `USERS` (tabular) · `FIRST SEEN` (relative under 7 days, absolute after) · `STATE` (badge). **Sorted by users affected, descending.** No sort controls — the sort is a product decision, not a preference.

**Rows are 40px.** Twenty incidents visible without scrolling on a 900px-tall window. Density is the feature.

| State | Render |
|---|---|
| Loading < 300ms | nothing. No skeleton. |
| Loading ≥ 300ms | one 12.5px `--text-muted` line: `Loading…` |
| Empty (new org) | *"No incidents yet. Outcome needs about 500 sessions a month to find anything."* + `[ View integration guide ]` |
| Empty (all handled) | *"Nothing waiting. 14 incidents confirmed this month."* + `[ View outcomes ]` |
| Error | *"Couldn't load incidents."* + `[ Retry ]`. Inline, one line, no illustration. |

**Live counter.** When a live session joins an existing incident the users count updates in place — `12` → `13` — inside an `aria-live="polite"` region, with **no animation**. That tick is demo beat 3 and it must land as a fact, not an effect.

**Keyboard:** `j`/`k` move · `enter` open · `a` apply · `x` dismiss · `g o`/`g c`/`g s` navigate · `?` shortcuts.

---

## 6. Screen 2 — Incident

**The product.** Everything else is navigation to here. **Data:** `PipelineReader.getIncident(id)`. **Actions:** `PipelineCommands.apply()` / `.dismiss()` / `.handoff()`.

It reads top to bottom as a proof:

```
OC-1042   Export ignores active filters                7 users · 19 sessions

EVIDENCE      3 sessions, redacted, signal turns highlighted
CLASSIFIED    CONFIG_DEFECT · 0.86 · evidence: tool description ambiguity
ASSERTION     TOOL_ARG_EQUALS  export_records.filters == view.activeFilters
BEFORE        ●●●●●  0/5 passed
CHANGE        6-line diff · tools[export_records].description
AFTER         ○○○○○  5/5 passed  ·  positive suite 41/41 green
SCOPE         7 affected users        [ Apply ]   [ Dismiss ]
```

**Block labels** are 12.5px uppercase `--text-muted`, in a 110px left column. Content is left-aligned against a single vertical line. The eye goes straight down the labels and the reader never hunts.

**Red dots, diff, green dots.** That vertical rhythm — fail, change, pass — is the argument. Nothing may be inserted between `BEFORE` and `AFTER` that breaks it.

### 6.1 Every incident state renders

**A parked or discarded incident is a first-class view, not an error page.**

| State | Above the fold | Blocks shown | Actions |
|---|---|---|---|
| `OPEN` `CLUSTERED` | `Collecting evidence` badge | Evidence only | none |
| `CLASSIFIED` | verdict badge | Evidence, Classified | none |
| `ASSERTED` | `Verifying` badge | + Assertion, `BEFORE  ·····  running` | none |
| **`DISCARDED` (variance)** | **`Discarded — model variance`**, `--warn` | + `BEFORE ●●○●○ 2/5 passed` and the sentence *"Passed 2 of 5 runs against the unchanged config. Intermittent, not a defect. Nothing was applied."* | `[ Reopen ]` |
| `DISCARDED` (5/5) | `Discarded — our read was wrong` | + `BEFORE ○○○○○ 5/5 passed` + *"The assertion passed every run. The detection was a false positive."* | `[ Reopen ]` |
| **`HUMAN_REVIEW`** | **`Needs a human`**, `--warn` | + the gate's refusal reason verbatim | `[ Classify manually ]` `[ Dismiss ]` |
| `PARKED` | `Parked at <stage>` | + `state_reason` verbatim, + whatever completed | `[ Retry ]` `[ Dismiss ]` |
| `CANDIDATE` | full proof | all eight blocks | **`[ Apply ]` `[ Dismiss ]`** |
| `APPLIED` | `Applied to 7 users · confirming` | all + `CONFIRMATION  window ends in 21h` | `[ Revert ]` |
| **`CONFIRMED`** | **`Assertion Verified ✓ · User Outcome Confirmed ✓`** in `--pass` | all + who confirmed and when | `[ Revert ]` |
| `REVERTED` | `Reverted — signal fired again`, `--fail` | all + the refuting session | `[ Reopen ]` |
| `EXPIRED` | `Expired — no recurrence in 14 days`, `--text-faint` | all, dimmed | `[ Reopen ]` |
| `CODE_DEFECT` | `Handed off to Codex` | + the handoff payload, collapsed | `[ Copy payload ]` `[ Resend ]` |

**The `DISCARDED` view is not a dead end.** It proves the system can correctly refuse
to act when evidence is insufficient. Design it as carefully as an applied outcome.

### 6.2 Block details

**Evidence.** Three sessions, collapsed to the two turns around each signal. Signal turns carry a 2px `--warn` left rule and a 12.5px mono tag: `RETRY_REQUEST · 0.81 · baseline 0.12`. `e` expands to the full transcript. All text is the redacted text — say so, once, in 12.5px muted: *"Redacted in the customer's process before transmission."*

**Classified.** `CONFIG_DEFECT · 0.86` then the ranked evidence the gate actually used, in order: system prompt and policy → tool definitions → the user's rule set → prior successful traces → other sessions. Showing the hierarchy is what makes the verdict auditable rather than an oracle.

**Assertion.** One mono line. Hover reveals the raw params JSON. This is the reproduction, and it is the artifact that makes the whole claim work — give it room.

**Change.** Unified diff, GitHub gutter, mono, path label above in `--text-muted`. Line count in the label: `6-line diff · tools[export_records].description`. If the diff exceeds `max_diff_bytes` the block shows *"Diff exceeds the 4 KB cap. Human approval required regardless of scope."*

**Scope.** `USER` shows `[ Apply ]` as the single primary — no confirmation, blast radius is one person and revert is a pointer swap. `GLOBAL` shows `[ Apply globally ]` and **opens the one modal in the app**, because that one is not trivially reversible in the user's head even though it is in ours.

**Keyboard:** `a` apply · `x` dismiss · `e` expand evidence · `[` `]` previous/next incident · `c` copy incident id · `esc` back to inbox.

---

## 7. `StateBadge`

12.5px, 1px border, 4px radius, 2px/6px padding, mono. **No fills** except the three terminal states, which get an 8% alpha background.

| Badge | Color | Fill |
|---|---|---|
| `OPEN` `CLUSTERED` `CLASSIFIED` `ASSERTED` `CANDIDATE` | `--text-muted` | none |
| `APPLIED` | `--accent` | none |
| `CONFIRMED` | `--pass` | 8% |
| `DISCARDED` `EXPIRED` | `--text-faint` | none |
| `PARKED` `HUMAN_REVIEW` | `--warn` | 8% |
| `REVERTED` | `--fail` | 8% |

---

## 8. Screen 3 — Outcomes

**The artifact a customer shows their board.** `PipelineReader.listOutcomes()`.

A dense table: `INCIDENT` · `SCOPE` · `USERS` · `APPLIED` · `CONFIRMED` · `STATUS`. Above it, three numbers, no chart: **confirmed this month · confirmation rate · median detect-to-confirm**.

**PDF export is a real feature**, not a stub — `@media print` styles, rail hidden, one incident per block, the dots rendered as SVG so they survive printing. The value proposition of this screen is that someone forwards it.

Empty: *"No confirmed outcomes yet. The first one usually lands within a week of the first apply."*

---

## 9. Screen 4 — Config

`ConfigStore.listVersions()` + the override list.

- **Base config**, mono, collapsed.
- **Every version** with its originating incident linked. Select any two → diff between them. Same `Diff` component.
- **Per-user overrides**, listed, each individually revertable, each showing `last_resolved_at` — anything unexercised for 90 days is flagged stale in `--text-faint`.
- **Override count as a first-class number that should trend toward zero**, with the sentence that explains why: *"Overrides that prove out get promoted to global. A number that only grows means promotion is not happening."*

Revert opens `Confirm`. It is destructive from the user's point of view even though it is one UPDATE from ours.

---

## 10. Screen 5 — Settings

Keys · redaction allowlist · writable-field allowlist · permission tier (`observe` / `resolve` / `apply`) · Codex endpoint.

The writable-field allowlist is the most important control in the product and it should read that way: the paths as mono chips, and one line of plain English beneath — *"Outcome can never write outside these paths. Enforced in your process by the SDK before anything is sent."*

No account settings, no billing, no team management. Auth is on the do-not-build list.

---

## 11. Keyboard

Keyboard-first is not a flourish; the buyer lives in Linear and will notice within ten seconds.

| Key | Action |
|---|---|
| `j` / `k` | move down / up |
| `enter` | open |
| `esc` | back, or close the modal |
| `a` | apply |
| `x` | dismiss |
| `e` | expand evidence |
| `[` / `]` | previous / next incident |
| `c` | copy the id under the cursor |
| `g i` `g o` `g c` `g s` | inbox · outcomes · config · settings |
| `?` | shortcut sheet |

**Every action has a keyboard path and every keyboard action has a visible control.** No mouse-only features, no keyboard-only features. `?` opens a plain two-column list, not a modal with a search field.

---

## 12. Accessibility

Not a compliance checkbox — half of these are also what makes the demo readable on a projector from twenty feet.

- **Focus ring:** 2px `--accent`, 2px offset, on every interactive element. **Never removed**, not even on click.
- **Contrast:** body text ≥ 4.5:1 in both themes; dots and badges ≥ 3:1. Verified with a script in `pnpm check`, not by eye.
- **Never color alone.** Dots carry shape + color + count text. Badges carry text. The `Stat` delta carries an arrow glyph + text.
- **Live regions:** the inbox users-count and the incident state badge are `aria-live="polite"`. Nothing else announces.
- **Real semantics:** `<table>` with `<th scope="col">`, `<button>` for actions, `<kbd>` for keys. No `<div onClick>`.
- **`prefers-reduced-motion`** disables the only two transitions in the app.
- **Tab order follows visual order** on every screen. Verified by tabbing through, once, per screen.

---

## 13. Copy

- **Sentence case everywhere**, including buttons. `Apply`, not `APPLY`; `Apply globally`, not `Apply Globally`.
- **State a fact, offer one action.** Never apologise, never explain the technology in the interface.
- **Numbers:** tabular figures, thousands separators, never rounded when they are counts. `12 users`, not `~12 users`.
- **Dates:** relative under 7 days (`3h ago`), absolute after (`Aug 19`). Absolute dates on hover, always.
- **Identifiers** are always mono and always copyable.
- **The system's refusals are stated plainly and without hedging.** *"Passed 2 of 5 runs against the unchanged config. Intermittent, not a defect. Nothing was applied."* — that sentence is the product's character. It does not say "we couldn't determine."

---

## 14. Demo windows

Not a screen in the app — the two panes `pnpm demo:up` opens. They are 20% of the demo's persuasive weight and take twenty minutes.

```
┌─────────────────────────────┬─────────────────────────────┐
│ REPORTER   u_8f3a…  config v2│ CONTROL    u_1c9d…  config v1│
├─────────────────────────────┼─────────────────────────────┤
│                             │                             │
│  chat transcript            │  chat transcript            │
│                             │                             │
└─────────────────────────────┴─────────────────────────────┘
```

**The header line is the whole point.** User hash and **resolved config version**, in mono, live-updating. When the apply lands, the reporter's header ticks `v1 → v2` and the control's does not. That is beat 10 made literal:

> **"Same code. Same deploy. Different config row."**

No styling beyond this. Two panes, a header line each, monospace transcripts. It is explicitly on the do-not-build list to go further.

---

## 15. Build order

| # | Ship | Why this order |
|---|---|---|
| 1 | `tokens.css`, `Table`, `StateBadge`, `Dots` | `Dots` is the signature visual; build it before anything depends on it |
| 2 | Inbox against `fixtures/incidents/seed.json` | proves the reader contract before A's pipeline exists |
| 3 | Incident — `CANDIDATE` state only | the demo path |
| 4 | `Diff`, `Evidence`, `Verdict`, `Assertion` | the proof blocks |
| 5 | Incident — `DISCARDED` and `HUMAN_REVIEW` | refusal and escalation behavior |
| 6 | Demo windows | beat 10 |
| 7 | Incident — remaining states | after the demo path is safe |
| 8 | Outcomes, Config, Settings | first on the cut list |

**Cut from the top of 8, never from the middle of 1–6.**
