<div align="center">

# Theory

**English** | [한국어](THEORY.ko.md) | [日本語](THEORY.ja.md) | [中文](THEORY.zh.md)

</div>

Mathematical background and design rationale for the reputation calculator. The
normative algorithm specification lives in
[`packages/ts/src/calculator/index.ts`](../packages/ts/src/calculator/index.ts); this
document states the theory it instantiates. Empirical figures are from the frozen Base
mainnet snapshot [`vectors/base-2026-07-13.json`](../vectors/base-2026-07-13.json)
(summarized in [`vectors/README.md`](../vectors/README.md)).

Notation: $r$ — accumulated positive evidence; $s$ — accumulated negative evidence;
$\theta$ — an agent's unknown success probability; $E$ — posterior expectation of
$\theta$; $u$ — uncertainty mass; $c_k \in [0,1]$ — credibility weight of witness $k$;
$W$ — witness cap.

## 1. Preliminaries

**Bernoulli trials and the estimation problem.** Model each interaction with an agent
as a Bernoulli trial with unknown success probability $\theta \in [0,1]$. Reputation
estimation is the problem of inferring $\theta$ from observed outcomes, together with a
quantified statement of how much evidence supports the inference.

**Beta distribution.** The Beta distribution on $[0,1]$ with parameters
$\alpha, \beta > 0$ has density

$$f(\theta;\alpha,\beta)=\frac{\theta^{\alpha-1}(1-\theta)^{\beta-1}}{B(\alpha,\beta)},$$

where $B(\alpha,\beta)$ is the Beta function. Its mean is
$\mathbb{E}[\theta]=\frac{\alpha}{\alpha+\beta}$ and its variance is
$\frac{\alpha\beta}{(\alpha+\beta)^2(\alpha+\beta+1)}$. $\alpha$ and $\beta$ act as
pseudo-counts of prior successes and failures: increasing either concentrates the
density around the corresponding ratio.

**Conjugacy.** The Beta distribution is the conjugate prior of the Bernoulli
likelihood: a $\mathrm{Beta}(\alpha,\beta)$ prior updated with $r$ observed successes
and $s$ observed failures yields the posterior

$$\mathrm{Beta}(\alpha,\beta) \xrightarrow{(r,s)} \mathrm{Beta}(\alpha+r,\;\beta+s).$$

Conjugacy is what reduces the entire inference to two counters: the posterior is fully
determined by the running totals $(r,s)$, so evidence can be accumulated by addition
with no loss of information.

**Laplace's rule of succession.** Under the uniform prior $\mathrm{Beta}(1,1)$
(Laplace, 1774), the posterior mean after $(r,s)$ observations is

$$E[\theta]=\frac{r+1}{r+s+2}.$$

At $r=s=0$ this gives $E=0.5$: absence of evidence yields the prior mean, not a zero
score.

**Subjective-logic opinions.** Jøsang's subjective logic represents an opinion as a
triple $(b,d,u)$ — belief, disbelief, uncertainty — with $b+d+u=1$. The bijection to
Beta parameters under the $\mathrm{Beta}(1,1)$ prior is

$$b=\frac{r}{r+s+2},\qquad d=\frac{s}{r+s+2},\qquad u=\frac{2}{r+s+2}.$$

$u$ is the uncertainty mass: it equals $1$ at zero evidence and decreases
monotonically toward $0$ as $r+s$ grows. The Beta reputation system (Jøsang & Ismail, 2002) is this construction applied to accumulated feedback.

A full subjective-logic opinion carries a fourth term, the **base rate** $a\in[0,1]$ —
the prior probability assigned to the proposition before any evidence. The expectation
is then $E=b+a\,u$, so under total ignorance ($u=1$) the estimate is exactly $a$, and as
evidence accumulates ($u\to 0$) the base rate's influence vanishes. Laplace's rule is
the special case $a=\tfrac12$: $E=\frac{r}{r+s+2}+\tfrac12\cdot\frac{2}{r+s+2}=\frac{r+1}{r+s+2}$.
The calculator exposes $a$ as the `baseRate` policy field (default $\tfrac12$), so a
caller can declare whether a high-uncertainty result should lean optimistic or
conservative — the choice is echoed and thus recomputable like any other policy term.

### The Beta Reputation System (Jøsang & Ismail, 2002)

The calculator is a direct implementation of the Beta Reputation System (BRS),
proposed by Jøsang & Ismail at the 15th Bled eConference (2002). BRS defines an
agent's reputation as the Beta posterior over accumulated feedback: given positive
evidence $r$ and negative evidence $s$, the reputation function is
$\mathrm{Beta}(r+1,\, s+1)$, summarized by the probability expectation
$E=\frac{r+1}{r+s+2}$. Three mechanisms from the paper map onto this library:

| BRS (paper)                                                                             | This library                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Ratings as continuous degrees of satisfaction contributing fractional $(r, s)$ evidence | score normalization $v = \mathit{score}/100$ → evidence $(v,\, 1-v)$ (§2) |
| Reputation discounting — feedback weighted by the credibility of its source             | discount operator $\otimes$ with $c_k$ (§2, §5)                           |
| Forgetting factor $\lambda$ — geometric down-weighting of older feedback                | decay: reserved, not in v0.1 (§6; v1 read functions expose no timestamps) |

One structural deviation: BRS pools all feedback into a single $(r, s)$ pair,
whereas this library first accumulates evidence per witness and optionally caps
each witness's evidence mass before fusing (§3) — a response to Sybil-style
repetition that the 2002 setting did not need to address.

## 2. The model

Each feedback entry with a raw score on a nominal 0–100 scale is normalized to

$$v=\mathrm{clamp}(\mathit{score},0,100)/100 \in [0,1],$$

and contributes fractional evidence $v$ to the positive counter and $1-v$ to the
negative counter. Entries are grouped by witness (client address, compared
case-insensitively); witness $k$ with entries $v_1,\dots,v_n$ accumulates

$$r_k=\sum_i v_i,\qquad s_k=\sum_i (1-v_i).$$

Two subjective-logic operators combine the per-witness evidence:

- **Consensus ($\oplus$)** — evidence addition: $r=\sum_k r_k$, $s=\sum_k s_k$. Its
  precondition is that the fused opinions come from independent witnesses; §3
  addresses the violation of this precondition and its mitigation.
- **Discount ($\otimes$)** — scalar multiplication of a witness's evidence by its
  credibility: $r_k \mapsto c_k r_k$, $s_k \mapsto c_k s_k$ with $c_k \in [0,1]$. §5
  gives the credibility strategies shipped.

The result is read off the Beta posterior over the fused totals, with the base rate $a$
(default $\tfrac12$) setting the prior:

$$E=b+a\,u=\frac{r+2a}{r+s+2},\qquad u=\frac{2}{r+s+2}.$$

At $a=\tfrac12$ this is the $\mathrm{Beta}(1,1)$ / Laplace posterior $\frac{r+1}{r+s+2}$,
reproducing every golden vector. Every returned result carries $E$, $u$, witness
statistics, mandatory caveats, and the echoed policy; the library never emits $E$ alone.

## 3. Witness independence and the cap

The consensus operator assumes independent observers. $n$ entries from one address are
$n$ repeated observations by a single witness, not $n$ independent witnesses: they
share the submitter's bias and incentives, and under uncapped accumulation a single
address controls an unbounded share of the total evidence mass.

The `witnessCap` policy parameter bounds this. With cap $W$, each witness's evidence
pair is scaled before discounting and fusion:

$$(r_k,s_k) \mapsto (r_k,s_k)\cdot\min\!\left(1,\;\frac{W}{r_k+s_k}\right),$$

so no witness contributes more than $W$ units of total evidence. $W=1$ (variant B in
the golden vectors) equalizes all witnesses at one evidence unit; `witnessCap = null`
(variant A) pools evidence unscaled. The cap is a declared policy, not a mathematical
necessity: the correct trade-off between per-witness volume and witness count depends
on the deployment's Sybil-cost assumptions, which the library does not fix.

### What the cap does *not* do (a Sybil-resistance bound)

The cap bounds a *repeated* witness, but it does not make the aggregate
Sybil-resistant, and no policy on this aggregate can. Cheng & Friedman (2005) prove
that **no symmetric reputation function is Sybilproof**: if the score is invariant
under relabeling identities — as any pure feedback-summation is, including this one and
its capped variant — an attacker always benefits from splitting its influence across
fresh identities. Concretely, capping pushes a would-be ballot-stuffer from *one loud
address* toward *many quiet ones*, which lowers `topWitnessShare` and, because it
raises the effective witness count, *lowers* $u$ — the aggregate looks better, not
worse. The only class that escapes the impossibility is asymmetric,
source-relative propagation (flow / random-walk reputation seeded from a trusted
anchor set), because there "reputation" is defined relative to who is asking. This
library keeps aggregation symmetric by design and offloads Sybil resistance to two
places: the identity layer (staking / proof-of-personhood — the authentication
assumption the BRS paper itself makes explicit), and, optionally, a caller-supplied
trust anchor threaded through the credibility function (§5, §6). Uncertainty and
concentration gates (§6) therefore filter *weak* evidence, not *adversarial* evidence;
conflating the two is the central error this section exists to prevent.

## 4. Empirical validation

Measurements from the frozen snapshot (Base mainnet, agents 0–9, retrieved
2026-07-13), `activity-sqrt` credibility, variants A ($W=\text{null}$) and B ($W=1$):

| agent | entries | witnesses | top-witness entries | $E \pm u$ (A)     | $E \pm u$ (B)     |
| ----- | ------- | --------- | ------------------- | ----------------- | ----------------- |
| #0    | 57      | 8         | 18/57 (32%)         | $0.847 \pm 0.075$ | $0.660 \pm 0.338$ |
| #1    | 39      | 20        | 6/39 (15%)          | $0.700 \pm 0.096$ | $0.665 \pm 0.179$ |

Agent #0's evidence is concentrated (8 addresses, one submitting 32% of entries):
under the independence correction its expectation drops by 0.187 and its uncertainty
increases by a factor of 4.5, i.e. the uncapped result was dominated by repeated
observations from few witnesses. Agent #1's evidence is distributed (20 witnesses,
maximum share 15%): its expectation moves by 0.035 under the same rule change, and
this invariance under policy perturbation is itself a robustness indicator.

## 5. Credibility strategies

The discount operator takes $c_k$ from a caller-supplied function. Two strategies ship:

- **uniform** — $c_k = 1$ for all $k$: no discounting.
- **activity-sqrt** — $c_k=\sqrt{d_k}/\sqrt{d_{\max}}$, where $d_k$ is the number of
  distinct agents witness $k$ has rated in the caller-supplied dataset and
  $d_{\max}=\max_k d_k$. Rating activity across distinct agents is used as a proxy for
  being an established participant.

The stated limitation of activity-sqrt: activity is a weak proxy for credibility. It
observes only on-chain rating behavior, is Sybil-able by an attacker who rates many
agents to appear active, and the square-root growth rate is a modeling choice, not a
derived quantity. Anchor selection — which credibility function, and how much weight
to give it — is a policy choice the library exposes but does not make.

## 6. Scope boundaries

- **No global score.** The library computes $E \pm u$ under a caller-declared policy;
  it defines no canonical per-agent value. Distinct policies yield distinct, equally
  well-formed results.
- **No transitive credibility propagation.** Recursive schemes that derive a witness's
  credibility from the credibility of those who trust it (EigenTrust-family methods)
  require global graph computation and explicit attack-model assumptions; they are out
  of scope by design and can be layered on top via the credibility function.
- **No decay in v0.1.** Time-weighting is reserved in the `Policy` shape but
  unimplemented: the v1 read functions expose no per-entry timestamp, so there is no
  quantity to decay against.
- **Gating is a separate predicate.** The library computes $E\pm u$; it does not decide
  whether that is good enough to act on. `shouldEscalate(rep, thresholds)` — a pure
  predicate *outside* the calculator — checks caller-declared sufficiency
  (`minWitnesses`, `maxUncertainty`) and concentration (`maxTopWitnessShare`) thresholds
  and returns an escalate/reasons verdict. Per §3.1 these are weak-evidence filters, not
  Sybil defenses. Keeping the predicate out of the pure calculator lets the
  consume-the-output policy vary independently of aggregation, and makes "insufficient
  support → route to a live check" an explicit, recomputable decision rather than an
  implicit reading of the point estimate.

## 7. Reproducibility

- **Golden vectors** —
  [`vectors/base-2026-07-13.json`](../vectors/base-2026-07-13.json) contains the raw
  feedback behind every figure in §4 plus exact expected outputs; every claim here is
  recomputable.
- **Policy echo** — every result embeds the policy that produced it ($W$, the named
  credibility strategy), making each output a self-contained reproduction recipe.
- **Deterministic accumulation** — witnesses are accumulated in ascending
  lowercase-address order in IEEE-754 f64 arithmetic, so floating-point summation is
  bit-for-bit reproducible across runs and languages.
- **Cross-language conformance** — the TypeScript, Python, and Rust implementations
  must all reproduce the golden vectors (3-decimal tolerance) and the byte-level
  contract in [`conformance/`](../conformance/README.md) before release.

## 8. References

- Jøsang, A. & Ismail, R. (2002). _The Beta Reputation System._ 15th Bled eConference.
  [ji2002-bled.pdf](https://www.mn.uio.no/ifi/english/people/aca/josang/publications/ji2002-bled.pdf)
  — primary source: expectation/uncertainty formulas, consensus and discount operators.
- Jøsang, A. (2016). _Subjective Logic: A Formalism for Reasoning Under Uncertainty._
  Springer — the $(b,d,u)$ opinion representation and its Beta bijection.
- Jøsang, A., Ismail, R. & Boyd, C. (2007). _A Survey of Trust and Reputation Systems
  for Online Service Provision._ Decision Support Systems, 43(2), 618–644 — survey
  including the graph-propagation methods excluded in §6.
- Cheng, A. & Friedman, E. (2005). _Sybilproof Reputation Mechanisms._ ACM SIGCOMM
  Workshop on Economics of P2P Systems, 128–132 — the impossibility result in §3.1: no
  symmetric reputation function is Sybilproof; only asymmetric flow/path-based schemes
  can be.
- Jøsang, A. (2016). _Subjective Logic_, ch. 3 — the base rate $a$ and the
  $E=b+a\,u$ expectation used in §1–§2.
