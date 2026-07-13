<div align="center">

# The theory behind the calculator

**English** | [한국어](THEORY.ko.md) | [日本語](THEORY.ja.md) | [中文](THEORY.zh.md)

</div>

No statistics background assumed. Every idea below opens with a plain-language story;
the formulas are optional asides you can skip entirely and still understand what the
calculator does and why. The running example is real data: Base mainnet feedback for
agents 0–9, frozen in [`vectors/base-2026-07-13.json`](../vectors/base-2026-07-13.json)
and summarized in [`vectors/README.md`](../vectors/README.md).

## 1. Why averages lie

Here are two real agents from the snapshot:

- **Agent #0**: average score **87.3**, from **57** feedback entries.
- **Agent #1**: average score **70.7**, from **39** feedback entries.

By the numbers, agent #0 looks much better. But look closer: those 57 entries for
agent #0 came from only **8 distinct addresses**, and one of them alone submitted 18 of
the 57 (32% of everything). Agent #1's 39 entries came from **20 distinct addresses**,
spread far more evenly (the busiest one submitted only 6, or 15%).

So which agent would you actually trust more? A near-90 average that's mostly one
enthusiastic (or self-interested) submitter repeating itself, or a high-60s/low-70s
average backed by twenty independent opinions that mostly agree?

A plain average can't tell the difference — it only sees numbers, not _who_ is
speaking. Feeding it 18 copies of the same opinion moves it exactly as much as 18
independent opinions would, even though the two situations tell you very different
things about how much to trust the result. That's why this library never returns a
plain average as "the" reputation number, and why the rest of this document is about
what it computes instead.

## 2. Counting evidence, not computing scores

Instead of an average, imagine two counters attached to every agent: a **good-experience
counter** and a **bad-experience counter**. Before any feedback exists, both counters
are effectively empty, which we treat as "no idea yet" — a 50/50 coin flip, not a
verdict.

Every piece of feedback nudges one counter or the other (a high score mostly feeds the
good counter, a low score mostly feeds the bad one — a feedback entry of 70/100 counts
as 0.7 units of "good" evidence and 0.3 units of "bad" evidence, not a single vote).
Two things fall out of this naturally, without anyone hand-tuning them:

- **The more evidence you have, the more confident the estimate gets.** Ten pieces of
  consistent feedback pull the estimate much further from 50/50 than one piece does.
- **Uncertainty is a first-class output, not an afterthought.** A brand-new agent with
  one glowing review and an agent with five hundred consistently-good reviews can have
  the _same_ expectation but wildly different confidence — and the library reports
  both numbers, always.

<details>
<summary>The math, if you want it</summary>

This is the **Beta reputation system** (Jøsang & Ismail, 2002). Accumulate good
evidence $r$ and bad evidence $s$ from feedback (each entry of value $v \in [0,1]$
contributes $v$ to $r$ and $1-v$ to $s$). The expected trust and its uncertainty are:

$$E = \frac{r+1}{r+s+2}, \qquad u = \frac{2}{r+s+2}$$

The "+1"/"+2" terms are a Laplace-style prior (Laplace, 1774, "rule of succession"):
with zero evidence, $E = 0.5$ and $u = 1$ — total uncertainty, not a score of zero. As
$r+s$ grows, $u$ shrinks toward 0 and $E$ converges to the true good/(good+bad) ratio.
Primary source: Jøsang & Ismail (2002), _The Beta Reputation System_, 15th Bled
eConference —
[ji2002-bled.pdf](https://www.mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf).

</details>

## 3. One witness, one voice

Counter-based evidence still has the same flaw as the plain average if you let it: an
address that submits 50 pieces of feedback contributes 50× the evidence of an address
that submits one. Fifty entries from one address is not the same thing as fifty
independent witnesses agreeing — it might be one witness saying the same thing fifty
times.

The library's fix is a policy switch called `witnessCap`. Uncapped (variant A), it
pools all evidence as-is, unscaled — good for "what does the raw record say." Capped
at 1 (variant B), every address's _total_ evidence is squeezed down to at most one
unit before anything else happens, so one prolific submitter can never outweigh a
witness who only spoke once.

Watch what this does to the real numbers:

- **Agent #0**: uncapped, expectation **0.847**, uncertainty **0.075**. Capped,
  expectation drops to **0.660**, uncertainty balloons to **0.338**. The confident,
  favorable-looking number was mostly an artifact of one address repeating itself —
  capping it exposes how thin the real evidence actually is.
- **Agent #1**: uncapped, expectation **0.700**, uncertainty **0.096**. Capped,
  expectation barely moves to **0.665**, uncertainty rises modestly to **0.179**.

Agent #1's near-indifference to the capping rule is itself informative: a result that
barely changes when you switch policies is telling you it was never resting on one
loud voice in the first place. That robustness — not the raw number — is the real
trust signal here.

## 4. Whose word counts

Counting witnesses instead of entries is progress, but it still treats every witness
as equally credible. The library lets you go one step further with a `credibility`
function: a `(client) => weight in [0,1]` that discounts each witness's evidence before
it's summed.

The built-in `activitySqrt` strategy weights a witness by the square root of how many
_distinct agents_ it has rated elsewhere in the same dataset, relative to the most
active witness (so a witness who has rated many different agents counts for more than
one who has only ever rated a single agent once). It's a reasonable, cheap proxy for
"this address looks like a real participant, not a single-use throwaway" — but it is
only a proxy. It doesn't know who anyone really is, can't detect a well-funded Sybil
ring that rates several different agents to look active, and the square root is a
judgment call about how fast credibility should grow with activity, not a law of
nature.

That judgment call — which credibility function to trust, and how much weight to put
on it — is deliberately left to you, the caller. The library ships `uniform()` (equal
weight for everyone) and `activitySqrt()` as starting points, not as an endorsed
"correct" answer, because there isn't a universally correct answer: the right anchor
depends on what you already know about the population of witnesses you're reading
feedback from, and that context lives with the consumer, not the library.

## 5. What this library deliberately does NOT do

- **No global score.** There is no "agent #1's reputation is 0.665" fact anywhere in
  this system — only "under _this_ policy, on _this_ evidence, the estimate is 0.665
  ± 0.179." Change the policy, get a different, equally valid answer.
- **No rater-credibility graph propagation.** Real trust networks can go further:
  weight a witness by _its own_ reputation, computed recursively from who trusts the
  witness, and so on (EigenTrust and related graph-propagation methods do exactly
  this). That's out of scope here by design — it requires assumptions about network
  structure and attack models this library refuses to bake in silently. If you need it,
  build it on top, with your eyes open about the assumptions you're adding.
- **Judgment stays with the consumer.** Every result the library returns is a bundle
  of evidence and caveats, not a verdict. Deciding "is 0.665 ± 0.179 good enough for me
  to delegate this task" is a decision only you can make, because only you know what's
  at stake.

## 6. Don't trust us — recompute

Nothing above should be taken on faith:

- [`vectors/base-2026-07-13.json`](../vectors/base-2026-07-13.json) is the exact raw
  feedback data behind every number in this document, plus the exact expected output —
  recompute it yourself.
- Every result echoes back the **policy** that produced it (`witnessCap`, the named
  credibility strategy) — the reproducibility manifest. Nothing about how a number was
  produced is hidden from you.
- The calculator is implemented three times — TypeScript, Python, Rust — and all three
  must reproduce the golden vectors bit-for-bit (3-decimal tolerance) or they don't
  ship. See [`conformance/README.md`](../conformance/README.md) and the root
  [README](../README.md#-the-golden-vectors--a-conformance-challenge).

## 7. References

- Jøsang, A. & Ismail, R. (2002). _The Beta Reputation System._ 15th Bled eConference.
  [ji2002-bled.pdf](https://www.mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf)
  — primary source for the expectation/uncertainty formulas and witness fusion.
- Jøsang, A. _Subjective Logic: A Formalism for Reasoning Under Uncertainty._ Springer,
  2016 — the general framework the Beta model is a special case of (opinions as
  belief/disbelief/uncertainty triples).
- Jøsang, A., Ismail, R. & Boyd, C. (2007). _A Survey of Trust and Reputation Systems
  for Online Service Provision._ Decision Support Systems, 43(2), 618–644 — surveys the
  broader landscape, including graph-propagation methods (EigenTrust and family)
  mentioned in §5.
