# tool-truth on real agent conversations (τ-bench)

**Why:** the corpus that ships with tool-truth is synthetic, and I wrote it alongside the
checker. That's the README's biggest caveat. This study runs the checker on real agent
conversations it was never tuned on, and reports what happened, including how badly the
first version did.

**Data:** the published GPT-4o trajectories from [τ-bench](https://github.com/sierra-research/tau-bench)
(Yao et al., 2024; MIT licensed): customer-service agents in an airline and a retail domain,
using real tools against a simulated customer. **660 conversations, 4,937 agent turns.**
Every agent turn is checked against only what came before it (`checkTurns`).

**Reproduce:** `npx tsx study/tau-bench.ts --dump` (downloads the trajectories), then
`npx tsx study/review.ts 36 1` to see every flagged turn with evidence. `sh study/run-all.sh`
re-runs every study in this file against pinned commits of the τ-bench and τ²-bench data
(`study/fetch-cached.ts`), and CI runs it on every change: it fails if a committed result
file changes or one of the five hand-confirmed real catches stops being flagged.

## 1. The first version was unusable on real logs

| Version | Flagged turns | Notes |
|---|---|---|
| v0.2.0 as released | **776** (15.7%) | I hand-reviewed a random 30: **none** were real problems |
| + list numbers, quoted punctuation, letter-digit codes, two-value arithmetic, identifier-only entity check | 228 | |
| + time and timestamp normalization, quoted phrases found in context, ID suffixes, composed values | 91 | |
| + written-out dates, partial dates ("May 26", "the 6th"), sentence-ending days | **36** (0.7%) | every one hand-reviewed below |

What broke it, in the order it was found: markdown list numbers read as facts ("4."),
punctuation inside quotes ("delivered,"), digits pulled out of codes (`M20IZO` → 20), price
differences treated as invented, wrong-entity firing on update calls, `9:00 AM` vs `09:00:00`,
dates inside timestamps, "Gift Card 7091239" vs `gift_card_7091239`, and "May 19, 2024" vs
`2024-05-19`. None of these showed up in the synthetic corpus, which still scores 100% / 93.8%
after every fix.

## 2. All 36 remaining flags, classified by hand

| Category | Count | What it means |
|---|---|---|
| **Real problems** | **5** | The agent stated something nothing supports |
| Calculations it can't verify | 16 | Totals or differences over three or more prices, and item counts. Probably correct (one was confirmed by a later calculator call), but not traceable |
| Correct off-topic trivia | 4 | The simulated user asked about poems ("The Raven"). True, but not from any tool |
| **Checker errors** | **11** | The value *was* grounded and the checker missed it |

**Real problems found:**
1. **Invented a website.** Asked about brighter desk lamps, the agent told the customer to
   "go to our website, navigate to the 'Desk Lamps' section, filter by 'Brightness'". No tool
   or policy describes a website. (retail task 8)
2. **Invented a checkout flow** for expedited shipping ("click 'Place Order'"). (retail task 50)
3. **Invented a round trip.** The user asked for a flight on May 26; the agent booked a "Round
   Trip" returning May 27. The user's next message: *"Actually, I only need a one-way ticket,
   not round trip."* (airline task 32)
4. **Wrong return date.** The user asked to "return on May 25"; the agent presented a return
   flight on May 26 that no tool returned. (airline task 10)
5. **Misquoted an order ID:** `#5565470` instead of `#W5565470`. Not an invention, but a
   wrong value that could act on the wrong order. (retail task 28)

**Checker errors (11):** the order status quoted as "pending (items modified)" when the policy
says "pending (item modified)" (4), "May 10th and 11th" shorthand (2), a date one day after a
returned date when the user asked to "move it back a day" (2), a `#W0000000` format example (1),
a refund stated as 86.55 when the calculator returned −86.55 (1), and an item description
assembled from option values (1).

## 3. How to read these numbers

- **Precision, strictly:** 5 of 36 flags were real problems (14%). Leaving out the 16
  calculations nobody can verify without recomputing them: 5 of 20 (25%).
- **What the checker claims to detect** is "a value not traceable to what the agent saw". By
  that definition 25 of 36 flags were correct (69%), and 11 were checker errors (31%).
- **Recall is unknown.** τ-bench has no labels for fabricated values, so I can't say how many
  real problems the checker missed. "5 problems in 4,937 turns" is a lower bound, not a rate.
- **The thresholds were tuned on this same data** while fixing false alarms. Every fix is a
  general normalization rule with a unit test, not a special case, but the numbers above are
  still in-sample. Section 4 tests that on held-out data, and the answer is that they don't
  carry over well.

## 4. Held-out test: Claude 3.5 Sonnet (the rules were never tuned on this)

τ-bench also publishes Claude 3.5 Sonnet trajectories: **1,320 conversations, 13,419 agent
turns.** I ran the checker on them with the GPT-4o-tuned rules unchanged
(`npx tsx study/tau-bench.ts --held-out`).

**First run: 38% of turns flagged, in every conversation.** That was a format problem, not
the checker's logic: Claude writes its tool calls into the message text as XML (with a
namespace prefix on the tags), so tool names like `get_user_details` were read as claims. I
fixed that one thing in the OpenAI adapter, because tool-call markup is an action, not a
statement to the user. The GPT-4o numbers are identical before and after that fix.

**After that fix: 251 flagged turns (1.9%)**, higher than GPT-4o's 0.7%. I hand-reviewed a
random 30 (seed 2026) without changing any rule:

| Category | Count |
|---|---|
| **Real problems confirmed** | **0** |
| Unresolved (value appears nowhere, but I couldn't pin the exact trial) | 2 |
| Correct multi-step arithmetic. Three checked by hand, e.g. $561.05 + $342.81 + $381.26 = $1,285.12 | 9 |
| **Checker errors** | **19** |

The 19 checker errors are mostly writing styles GPT-4o didn't use: **date ranges** ("May
28-29" read "-29" as a number, 8 cases), **example formats** ("a code like 'ABC123'", 4),
**rounded figures** ("prices from about $46 to $54", 3), and a name assembled from a user ID
(`omar_rossi_1241` → "Omar Rossi").

**What that means:** on a second model, held-out precision for real problems is near zero in
this sample, and the false-alarm rate is high. The GPT-4o fixes were general rules, but
general to the patterns GPT-4o happened to produce. Each new model brings new ways of
writing the same values. I haven't tuned on the held-out set. A fair next round fixes these
categories, then tests on a third set nobody has looked at.

## 5. Round 2, then a third test set nobody had looked at

**Method.** I fixed the round-2 categories using **only** the Claude 3.5 set as a dev set:
date ranges, example formats, hedged approximations, names built from user IDs, and totals
(a sum of numbers stated in the same answer, or a price times a small count). Then I froze the
rules and ran them **once** on a third set: τ²-bench's published o4-mini trajectories
(airline and retail, 656 conversations, 4,431 agent turns, `npx tsx study/tau2-bench.ts`).
Before freezing, I looked only at that file's structure (keys and roles), never its text.

**Dev set (Claude 3.5) after round 2:** 251 → 130 flagged turns. **All five real GPT-4o catches
still flagged** (`npx tsx study/real-catches.ts` checks this). GPT-4o: 36 → 35 flags.

**Test set (o4-mini, rules frozen): 135 flagged turns (3.0%).** A random 30 (seed 99), by hand:

| Category | Count |
|---|---|
| **Real problems confirmed** | **2** |
| Unclear | 1 |
| Computations: totals and multi-step arithmetic, plausibly correct | 7 |
| **Checker errors** | **20** |

**The two real problems:**
1. **Invented order and item IDs.** The agent told the customer they had "Order #B1234567"
   with items `300112233`, `400445566`, `500778899` and "Order #C7654321". None of these exist;
   the customer's real orders are `#W…`. The customer believed it and repeated the fake number
   back later, and the agent then **called `get_order_details` with the invented ID**.
   (retail task 99, trial 2)
2. **An invented product variant**: "Item 7696410293, $269.16, clicky, no backlight", listed
   among real variants. That ID appears nowhere in any tool result. (retail task 89, trial 0)

**The checker errors were, again, mostly a style the earlier models didn't use:** o4-mini
writes units with a space ("750 ml", "512 GB") where the catalog has `750ml` and `512GB` (11
cases), joins numbers to words ("5x-zoom", "within-24-hour", 3), puts examples in backticks
(3), writes dates as "5/12" (1), and states item counts (1).

**What that means:** precision on an unseen model was 2/30 (7%), up from 0/30 on the previous
held-out set, but still low, and each model so far has brought its own way of writing values
that broke deterministic matching. Three rounds is enough evidence to say it plainly:
**hand-written normalization will keep chasing each new model's style.** The catches it does
make are real and serious (an invented order the customer then relied on), which is why it's
useful as a triage filter, but it isn't a reliable automatic verdict.

## 6. What it says about the approach

Exact-match provenance works for what it was built for: concrete values (dates, prices, IDs)
that an agent states with nothing behind them. The hard part on real logs is normalization.
Agents rewrite every value into prose ("May 19, 2024", "9:00 AM", "Gift Card 7091239") and
compute new ones, and the held-out tests show each model does that differently. The biggest
remaining gaps are unit and format normalization, multi-step arithmetic, approximation, and
paraphrase, which is where a model-assisted matching step (deciding whether "750 ml" and
`750ml` are the same value) would earn its cost. As it stands, the checker is most useful as
a **triage filter** that surfaces turns for a human to read, not as an automatic verdict, and
the turns it surfaces have included genuinely harmful fabrications on every dataset tried.

## 7. A high-confidence view: invented IDs (rounds 3 and 4)

**Question.** Both real problems in the o4-mini sample were invented IDs. An ID has no
formatting variants ("750 ml" vs `750ml` can't happen to `#W5565470`), and an invented one
does the most harm: the customer writes it down and the agent may act on it. So: are the flags
about an ID-shaped value (`isIdShaped`: 6+ digits, or 5+ letters and digits that aren't a
number with a unit) much more often real?

**Dev sets (in-sample; rules developed here).** Reviewing every ID flag in context
(`npx tsx study/id-context.ts study/flagged-tau2.json`) showed two noise classes: examples the
example filter missed (backticks, guillemets, "e.g. A or B", and "in a format like 'X'", where the
cue `format` swallowed the word "like" as if it were the example), and field names
(`Address1`). Fixing those (general rules, each with a test):

| Set | All flags | ID flags | Real among ID flags |
|---|---|---|---|
| GPT-4o (τ-bench) | 35 | 1 | 1 (misquoted order ID) |
| Claude 3.5 (τ-bench) | 123 | 1 | 1 (`KIN1W8N` for the real `K1NW8N`) |
| o4-mini (τ²-bench) | 126 | 10 | **8** |

The 8 on o4-mini: invented order and item IDs presented as the customer's (retail tasks 98,
99, 100, 107; in 98, 100 and 107 the agent then called `get_order_details` with its own
invention), invented catalog variants (task 4; task 110, where it incremented a real item ID
to make four more; task 89), and an exchange "submitted" for an item ID that appears nowhere
(task 8). The 2 misses: a French "par exemple ... « prenom_nom_123 »" and "a reference like
“Order #W0001234.”". For comparison, a random 30 of all o4-mini flags had 2 real (section 5).

**Independent check on recall (retail only).** `study/id-oracle.ts` scans every agent turn for
retail-format IDs (`#W` + 7 digits, 10-digit items) never seen earlier in the conversation. On
o4-mini, its non-example hits are 7 turns; the ID view flags all 7 (and the `#B1234567` case,
which isn't retail-format).

**Held-out, round 3 (frozen, run once): Claude 3.7 Sonnet and GPT-4.1** (τ²-bench, airline and
retail). Claude 3.7: 44 flags, **3 ID flags, 0 real**. All three were the agent adding the
standard `#W` to digits the user had typed ("Would the order ID be #W9502127?"). GPT-4.1: 25
flags, 0 ID flags.

**Round 4 (dev: Claude 3.7):** a 1–2 letter prefix on 5+ digits counts as grounded when exactly
those digits were already said. Claude 3.7: 0 ID flags. The o4-mini 8 and the GPT-4o 5 still fire.

**Held-out, round 4 (frozen, run once): GPT-4.1-mini** (`--setting base`): 72 flags, **0 ID
flags.** The independent scan finds one retail-format ID in GPT-4.1-mini's turns, an example
("for example, #W0000000"), and none in Claude 3.7's or GPT-4.1's, so on these three models
there were no invented retail IDs for the ID view to miss.

**What that means.** The ID view is a short, high-yield list: 8 of 10 real on the one model in
this data that invents IDs, and silent, with no false alarms after round 4, on three models that
don't. What it can't show yet is precision on an *unseen* model that invents IDs, because none of
the held-out models did. Its recall outside retail-format IDs isn't measured.

## 8. A new kind of conversation: τ²-bench telecom (round 5, rules frozen)

**Question.** Every set so far was airline or retail: the agent looks things up and states
facts (dates, prices, order numbers). τ²-bench's telecom domain is tech support. The agent
walks a customer through fixing their phone, and the customer's phone has tools of its own
(`check_network_status`, `toggle_airplane_mode`). How does a value checker do when most of what
the agent says is instructions, not facts?

**One fix first.** Those phone tools return their results to the *user*, not the agent. The
adapter used to feed them in as agent evidence, which would hide an invented value that happened
to match. They're dropped now (`study/tau2-format.ts`, 4 tests, 2 of which fail without the
fix). On this data it changed nothing: 80 flags before and after. Airline and retail have no user
tools, and every committed result file re-ran identical.

**Run once, rules frozen:** o4-mini, 456 conversations, 4,474 agent turns
(`npx tsx study/tau2-bench.ts --domain telecom --dump`). **80 flagged turns (1.8%).** I read all
80 (`npx tsx study/review-tau2.ts 80 99 study/flagged-tau2-telecom.json`); labels are in
`study/labels-tau2-telecom.json`.

| Category | Turns |
|---|---|
| **Real problem: invented settings** | **1** |
| Network-mode wording ("4G/5G-preferred", "2G-only"; the tool says `4g_5g_preferred`) | 38 |
| Numbers in instructions ("wait 10 seconds", "your 10-digit number", "30–60 seconds") | 25 |
| Phone diagnostic codes (`*#*#4636#*#*`, `*3001#12345#*`) | 9 |
| Examples and placeholders ("e.g. 0.5 GB, 1 GB, 2 GB", `<permission>`, "IPv4/IPv6") | 4 |
| Part of a value it was given ("your line ending in 2002") | 2 |
| Correct arithmetic (15 + 2 − 15.1 = "1.9 GB remaining") | 1 |

**The real one:** asked to fix MMS, the agent told the customer to write a full APN config
it made up: name "Carrier MMS", APN `mms.carrier.com`, an MMSC URL, proxy and port. None of it came
from any tool, and the customer's phone would have saved it. (mms_issue task, trial 2)

**The ID view:** 0 flags. To check that it wasn't missing anything, `study/id-oracle.ts` now
also scans for telecom IDs (one letter plus four digits: C1001, L1002, P1002, D1001). 31 agent
turns name such an ID (41 mentions), and **every one was seen earlier**, so o4-mini invented no
telecom IDs for the view to catch.

**What that means.** Precision here is 1 in 80, the lowest of any set. The cause is different
this time, and so is the lesson: it's not a new writing style, it's a new *kind* of answer. In tech
support most numbers are instructions ("wait 10 seconds"), which are neither grounded nor
invented, and a provenance check has no way to tell them from claims. The one real catch (a
made-up configuration the customer would type in) is exactly the harm the tool exists for, so
the full checker is still a triage list here, but a noisy one. The ID view stayed silent and
correct. Outside lookup-and-answer domains, read value flags with that in mind.

## 9. Telecom on two more models (round 6, rules frozen)

**Question.** Is round 5's telecom result (1 real catch in 80 flags, ID view silent) about
o4-mini, or about the domain? Same rules, run once on the two other models τ²-bench published
for telecom.

| Model | Agent turns | Flagged | ID flags | Invented telecom IDs (oracle) |
|---|---|---|---|---|
| o4-mini (round 5) | 4,474 | 80 (1.8%) | 0 | 0 of 41 mentions |
| GPT-4.1 | 5,440 | 280 (5.1%) | 0 | none to find: it never names a telecom ID |
| Claude 3.7 Sonnet | 7,426 | 1,084 (14.6%) | 0 | 0 of 72 mentions |

**By hand:** too many flags to read them all this time, so a seeded random 30 from **all** flags
per model (`npx tsx study/sample-flags.ts <file> 30 99`). **0 of 30 real on GPT-4.1, 0 of 30 on
Claude 3.7.**

What the flags are, by value across the whole file:

- **`15GB`** (169 GPT-4.1 turns, 172 Claude 3.7): the plan's `"data_limit_gb": 15.0`, restated.
  The checker reads `15GB` as an ID-like token, while `8.7GB` in the same sentence passes. A checker
  error.
- **"your line ending in 2002"** (109 GPT-4.1 turns): the last digits of the number the customer gave.
- **Quoted phone menu labels** (most Claude 3.7 flags): "Network & Internet", "Preferred Network
  Type", "Reset to default". Claude walks people through settings screens and quotes every label.
- **Quote pairing:** with mixed straight and curly quotes, the checker sometimes pairs the wrong
  marks and flags the text *between* two quotes (`), or if it simply shows`). A checker bug.
- Correct arithmetic (15 + 2 = "17GB", "1.9 GB remaining"), generic advice ("peak hours 12pm to
  2pm", carrier dialer codes).

**A caution on bucketing.** Sorting flags by pattern is how the table above was built, but it isn't
a verdict: the same rules applied to o4-mini file its one real invention ("Carrier MMS") under
"quoted menu label". That's why the hand review samples from all flags, not from what's left over.

**What that means.** Round 5 wasn't about o4-mini. On tech support the full checker is noise on
every model tried, and the noise grows with how much the model quotes the screen (Claude 3.7: 1 in 7
turns flagged). The ID view stayed silent and correct on all three: 0 flags, and the oracle confirms
no telecom ID was invented. Two concrete checker bugs came out of this (`15GB` as a token, quote
pairing). Fixing them would mean tuning on these files, so a fix needs fresh data to be tested on.
