# Demo and Mock Data

**Owner: Engineer B**, with Engineer A on beats 5 and 7. This is the thing judges actually score, and it is 25% Execution + 10% Presentation + most of how Technical Difficulty gets read.

> **The problem this solves:** the claim is "we found failures across N users nobody reported." One person clicking a button demonstrates n=1, the weakest possible version of the argument.

---

## 1. Three populations, one screen

| Population | Source | What the audience sees |
|---|---|---|
| **Seeded cohort** — 50 sessions, 12 hit the defect | replayed from fixtures at boot, through the **real** pipeline | the inbox already says "12 users affected" before you touch anything |
| **Live reporter** — 1 session | a real browser | the loop closing in real time |
| **Live control** — 1 session | a second browser | isolation, provably |

The seeded cohort is **real data through the real pipeline**, replayed rather than faked. Nothing is inserted into `incidents` by hand. When the live reporter fails, they join the existing cluster and the counter ticks **12 → 13** while the audience watches.

---

## 2. The mock world

Fictional but coherent. **Never lorem, never `foo`/`bar`, never a placeholder on screen.** A judge who sees `test_user_1` stops believing the rest.

**The customer:** Ledgerline, a B2B SaaS company.
**Their agent:** *Ops Copilot* — an internal RevOps assistant over their CRM. This is the profile from `MASTERPLANHACKATHON.md` §4: the agent is the product, outcomes are checkable, 20–100 named accounts so every complaint is felt.

**The CRM** — `fixtures/agent/seed.sql`, 50 opportunities:

```
id            OPP-1001 … OPP-1050
account       Brightwell Foods · Castellan Logistics · Merrow Health · Padgett Legal · …  (20 names)
owner         8 names, matching the 8 personas
stage         Discovery · Qualified · Negotiation · Closed Won · Closed Lost
amount        $4,200 – $310,000, realistic distribution, no round thousands
close_date    computed at seed time as now() ± 90 days      ← never a hardcoded year
status        3 of 50 are New
```

**Dates are always computed relative to seed time.** A demo that shows "Aug 2024" in August 2026 reads as a dead project. This is a five-line rule in the generator and it is not optional.

**Three tools** — `fixtures/src/agent/tools.ts`:

```ts
search_records(query, filters?)   → Opportunity[]
export_records(filters?)          → { rowCount, url }        ◀── the defect lives here
update_record(id, fields)         → Opportunity
```

**Eight personas** — `fixtures/personas/personas.json`. Distinct behaviour so 50 sessions read as traffic rather than fifty copies of one script:

```json
{ "id": "p3", "name": "terse power user", "rephraseRate": 0.10,
  "givesUpAfter": 2, "escalates": false, "statesConstraints": true }
```

Beyond realism, this is a real feature: **per-user baselining.** A rephrase from `p3` (rate 0.10) scores far higher than one from `p6` (rate 0.55) who rephrases constantly. Varied personas are what let A demonstrate that on stage.

---

## 3. The defect catalog

`fixtures/defects/OC-00{1,2,3,4}.json`. Each is a **mutation** applied to the base config at reset — the product's job is to find its way back.

| Defect | Layer | Expected verdict | Demonstrates |
|---|---|---|---|
| **OC-001** | tool description | `CONFIG_DEFECT` | **the main demo path** |
| OC-002 | missing rule | `PREFERENCE` | per-user rule, auto-apply |
| **OC-003** | flaky model output | `VARIANCE` | **the discard path** |
| OC-004 | broken tool impl | `CODE_DEFECT` | Codex handoff |

```json
{
  "id": "OC-001",
  "title": "Export ignores active filters",
  "layer": "tool_description",
  "mutation": {
    "path": "tools.export_records.description",
    "from": "Exports records. Pass the caller's active view filters in `filters` so the export matches what the user currently sees.",
    "to":   "Exports records from the current object."
  },
  "expected": {
    "signal": "RETRY_REQUEST",
    "verdict": "CONFIG_DEFECT",
    "assertion": { "kind": "TOOL_ARG_EQUALS", "tool": "export_records",
                   "arg": "filters", "expected": { "$ref": "session.viewFilters" } },
    "variance": "consistent"
  }
}
```

**`OC-003` is the one that impresses technical judges.** Showing the system correctly **refusing to act** is more convincing than showing it act. Do not cut it to save time.

---

## 4. The inbox at boot

This is the first thing anyone sees. It must look like a week of real operation, not a fresh install — and it must be **uncluttered**: six rows, one number, no chart.

```
Silent failure rate
4.2%   ▾ 0.3 from last week

INCIDENT                                  USERS   FIRST SEEN   STATE
Export ignores active filters                12   2h ago       CANDIDATE
Search returns closed opportunities           7   9h ago       DISCARDED
Summary drops the date range                  4   1d ago       APPLIED
Refund tool runs without confirmation         3   1d ago       HUMAN_REVIEW
Owner field reset on bulk update              2   3d ago       CONFIRMED
Stage change skips the required note          1   4d ago       PARKED
```

Six rows is deliberate. It shows the **full state vocabulary** — including two refusals (`DISCARDED`, `HUMAN_REVIEW`) and a park — without a scrollbar. Every row is a sentence a RevOps lead would recognise. Nothing is truncated. There is no chart, no filter bar, no search field, no "welcome" card.

Rows 2–6 are seeded ledger state; **row 1 is live** and is the one you drive.

---

## 5. The 90-second runbook

Two browsers side by side, one terminal, one inbox tab. Nothing else open.

| # | Beat | What you say | Proves |
|---|---|---|---|
| 0 | Inbox open, `Export ignores active filters · 12 users` | "This ran overnight on their real traffic." | detection at population scale |
| 1 | Reporter filters to *Stage = Negotiation*, asks "export these to csv" | | |
| 2 | Agent exports all 50. User: "no, just the ones I have filtered." Wrong again. User stops. | **"They clicked nothing. They reported nothing. Today that failure exists in no system anywhere."** | **the wedge — under 3% report** |
| 3 | Inbox counter ticks **12 → 13** | "They just joined an incident we already knew about." | clustering, and that this is one loop not a demo script |
| 4 | Open the incident | "Classified as a config defect. Here's the evidence." | the Intent Gate, auditable evidence hierarchy |
| 5 | `BEFORE ●●●●● 0/5` | *(A speaks)* "We wrote a test from their real session and ran it five times. Failed five times. That's how we know it's a defect and not the model having a bad day." | **hard problem 1 + 2** |
| 6 | The diff, six lines | "Six lines of tool description. Not code." | config-tier fixes, no deploy |
| 7 | `AFTER ○○○○○ 5/5 · suite 41/41 green` | *(A speaks)* "Fixed, and it didn't break the other forty-one things." | the positive suite, must-pass-after |
| 8 | Apply → scope `USER` | | blast radius one person |
| 9 | Reporter resends. **It works.** | | same-session recovery, 5s TTL |
| 10 | Control window sends the same thing. **Still broken.** | **"Same code. Same deploy. Different config row."** | **hard problem 3 — the moat** |
| 11 | `Assertion Verified ✓ · User Outcome Confirmed ✓` | "That last line is the part nobody else can print." | **confirmation as a release gate** |

**The two window headers carry beat 10 on their own** (`UI-SPEC.md` §14): each shows the user hash and the **resolved config version**, live. At beat 8 the reporter's header ticks `v1 → v2` and the control's does not.

### The 30-second hallway version

Beats 0, 2, 10, 11. Inbox → "nobody reported this" → two windows, one fixed one not → the confirmed line. That is the whole product.

### The optional beat: OC-003

If you have 20 seconds and a technical judge, open **Search returns closed opportunities · DISCARDED**:

```
BEFORE   ●●○●○   2/5 passed
Passed 2 of 5 runs against the unchanged config.
Intermittent, not a defect. Nothing was applied.
```

> "It ran the test five times, got two passes, and concluded the model was just being flaky. It refused to act. That path fires more often than the fix path — and it's why we can report our own precision, which nobody else in this space can do."

---

## 6. Clean, not cluttered — stage discipline

Ten minutes of setup that decides how the whole thing reads.

- **Two browser windows, 1280×800 each**, side by side. Nothing maximised, no third window.
- **Browser zoom 125%.** Row text at 14px is unreadable from twenty feet. Verify from the back of the room, not from your seat.
- **No bookmarks bar, no extensions, no tab strip clutter.** One tab per window.
- **A clean OS profile.** No notifications, no Slack, no calendar popups. Do Not Disturb on, verified.
- **Terminal:** one window, large font, one command visible. Never scroll it during the demo.
- **Light theme on a projector, dark theme in a dark room.** Both are first-class; decide when you see the room.
- **No slides during the demo.** The two windows and the inbox are the deck.
- **Nothing on screen is truncated or empty.** Every visible field has realistic content.

**55% of the score rides on "you built something hard and it works."** Presentation is 10%. Do not spend the last hour on slides — spend it on three clean consecutive runs.

---

## 7. Cassettes — the single most important demo-safety decision

```ts
const res = await recorded(cassetteKey, () => model.generate(req))
```

- `MODE=record` hits the real API and writes `fixtures/cassettes/<sha256(request)>.json`
- `MODE=replay` (default) reads from disk and **never touches the network**
- An unknown key in replay **throws loudly at boot**, not mid-demo

**Zero network dependency, byte-deterministic, real code end to end.** Nothing is stubbed except the model boundary.

**Preserving the variance gate under replay** — the detail that keeps OC-003 honest:

```json
{ "key": "abc123", "responses": [r1, r2, r3, r4, r5] }
```

Five recorded responses per key, popped in order by `sample: i`. You recorded five real runs; replay plays back those same five; the gate sees genuine flakiness. **If replay returns the same response five times, the gate is theatre** — `describeAgentRunner` asserts five distinct decisions for a variance key so this cannot regress silently (`ARCHITECTURE.md` §12.2).

---

## 8. Reset

```bash
pnpm demo:reset      # < 30s, three times consecutively
pnpm demo:up
```

Reset does: drop db → migrate → insert org + agent + base config → apply the OC-001 mutation → load `seed.sql` → **replay 50 sessions through the real `POST /v1/events`** → wait for the pipeline to settle → assert `1 incident · 12 user_hashes · state=CANDIDATE`.

That final assertion is what makes reset safe to run 30 seconds before you present. If it fails, it fails **loudly, at the terminal**, not silently into a demo.

```bash
pnpm fixtures:generate --defect OC-001 --sessions 50 --hit-rate 0.24
```

**Run once. Commit the output. Never run the generator on demo day.**

---

## 9. Failure drills

Rehearse these, not just the happy path.

| Breaks | Recovery | What you say |
|---|---|---|
| Wifi dies | nothing, you're in replay | *(keep going, do not mention it)* |
| Fix agent produces a bad diff | stage 7 rejects, incident `PARKED` | "That's the gate working. Nothing gets applied that didn't pass." |
| Assertion passes 5/5 on the first run | it discards | "It just told us our read was wrong. That's the precision story." |
| Reporter window hangs | `demo:reset`, 30s | "Fresh environment every run." |
| Agent returns something odd | shrug | "That's the point, they're nondeterministic. Watch what the gate does with it." |
| Counter doesn't tick 12 → 13 | open the incident anyway | "The overnight cohort is the story; this session joins it in the ledger." |

**Never apologise for the system doing its job. A discard is a feature. Say so.**

---

## 10. The leave-behind

The **Outcomes** screen exports a PDF (`UI-SPEC.md` §8) — confirmed incidents, each with its assertion, its before/after dots, and its confirming user count. That is the artifact a design partner forwards to their VP, and it takes twenty minutes because the print styles are three rules.

Second leave-behind, zero build cost: the **pilot kit**. Point the fixture generator at a prospect's redacted trace export, replay it offline, and hand them a populated inbox before they write a line of integration code. It turns "prove this would find anything in *our* product" into a two-day turnaround.

---

## 11. Assets to capture

Screenshot in **both themes**, after the final rehearsal, before anyone touches the code:

1. Inbox at boot — the six rows and the one number
2. The incident, full proof, `CANDIDATE`
3. The `DISCARDED` incident — `●●○●○ 2/5`, the refusal sentence
4. The two windows at beat 10, headers showing `v2` and `v1`
5. `CONFIRMED` — `Assertion Verified ✓ · User Outcome Confirmed ✓`
6. The terminal after `pnpm test:pipeline` — four defects, four expected verdicts

Screenshots 3 and 5 are the two nobody else in the category can produce.

---

## 12. Demo ship checklist

- [ ] `pnpm demo:reset` under 30s, three times consecutively, with the network off
- [ ] Cold clone → populated inbox in under 2 minutes, **no API keys**
- [ ] All six inbox rows render with realistic content, nothing truncated
- [ ] All dates relative to seed time — nothing shows a stale year
- [ ] Counter ticks 12 → 13 live
- [ ] Reporter recovers in-session; control provably does not
- [ ] `OC-003` renders as a clean refusal, not an error page
- [ ] Both window headers show the resolved config version, live
- [ ] Failure drills rehearsed, not just the happy path
- [ ] Three consecutive clean runs
- [ ] "What was hardest" answer memorised (`MASTERPLAN-A.md` §6)
