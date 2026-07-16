<div align="center">

# agent-reputation-sdk

### 점수를 내놓지 마세요. 직접 계산하고, 누구나 검증할 수 있게 하세요.

[English](README.md) | **한국어** | [日本語](README.ja.md) | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Python >= 3.10](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://www.python.org)
[![Tests](https://img.shields.io/badge/tests-236%20passing%20%C2%B7%203%20languages%20%C2%B7%201%20contract-success)](conformance/)
[![npm](https://img.shields.io/badge/npm-agent--reputation%400.2.0-CB3837)](https://www.npmjs.com/package/agent-reputation)
[![PyPI](https://img.shields.io/badge/PyPI-web3--agent--reputation%400.2.0-3775A9)](https://pypi.org/project/web3-agent-reputation/)
[![crates.io](https://img.shields.io/badge/crates.io-alloy--agent--reputation%400.2.0-E43717)](https://crates.io/crates/alloy-agent-reputation)
[![Golden vectors](https://img.shields.io/badge/golden--vectors-cross--language-orange)](vectors/)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-627EEA)](https://eips.ethereum.org/EIPS/eip-8004)
[![web3-agents-mcp](https://img.shields.io/badge/sibling-web3--agents--mcp-8A2BE2)](https://github.com/hanjoonchoe/web3-agents-mcp)

**[ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)를 위한 이더리움 SDK 확장** —
타입이 지정된 레지스트리 조회 기능과 정책 기반 평판 계산기를, 각 생태계의 정통
이더리움 SDK에 대한 확장 형태로 제공합니다.

</div>

---

## 📋 목차

- [왜 만들었나](#-왜-만들었나)
- [퀵스타트](#-퀵스타트)
- [2계층 계약 (모든 언어에서 동일)](#-2계층-계약-모든-언어에서-동일)
- [패키지](#-패키지)
- [설계 원칙](#-설계-원칙)
- [골든 벡터 — 정합성 도전 과제](#-골든-벡터--정합성-도전-과제)
- [새 언어로 포팅하기](#-새-언어로-포팅하기)
- [라이브 수치에 대한 안내](#-라이브-수치에-대한-안내)
- [왜 점수가 없나요? 이론을 읽어보세요](#-왜-점수가-없나요-이론을-읽어보세요)
- [개발](#-개발)
- [상태](#-상태)
- [자매 프로젝트](#-자매-프로젝트)
- [라이선스](#-라이선스)

## 🤔 왜 만들었나

AI 에이전트들이 서로를 고용하고, 대금을 지불하고, 업무를 위임하기 시작했습니다.
ERC-8004는 이를 위한 온체인 신뢰 계층 — 아이덴티티, 평판, 검증 레지스트리 — 을
제공하지만, 그 데이터를 읽는 것은 절반의 해결책일 뿐입니다. 나머지 절반은 원본의,
Sybil 공격에 취약하고, 척도가 제각각인 피드백을 실제로 행동에 옮길 수 있는 숫자로
바꾸는 일입니다 — 그것도 그 판단을 제3자 블랙박스에 맡기지 않고서요.

대부분의 "평판" 도구는 이를 하나의 불투명한 점수로 뭉개버립니다. 이 SDK는 그렇게
하지 않습니다. 사실 데이터를 그대로 건네주고, 여러분이 직접 집계 정책을 선언하게
하며, 항상 자신의 불확실성과 주의사항(caveats)을 함께 담아 반환합니다 — 이 계산은
어떤 언어로 제공되든 동일한 방식으로 수행됩니다.

## 🚀 퀵스타트

원하는 스택을 고르세요 — 세 언어 모두 동일한 골든 벡터([아래](#-골든-벡터--정합성-도전-과제)
참고)에 대해 동일한 계산기를 실행합니다.

### TypeScript

```sh
npm install agent-reputation viem
```

```ts
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { erc8004Actions, calculateReputation } from "agent-reputation";

const client = createPublicClient({ chain: base, transport: http() }).extend(
  erc8004Actions(),
);
const feedback = await client.getAgentFeedback({ agentId: 1n });
const rep = calculateReputation(feedback, { witnessCap: 1 });
```

### Python

```bash
pip install web3-agent-reputation
```

```python
from web3 import Web3
from web3_agent_reputation import ERC8004Module, calculate_reputation

w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"), external_modules={"erc8004": ERC8004Module})
feedback = w3.erc8004.get_agent_feedback(1)
rep = calculate_reputation(feedback, witness_cap=1)
```

### Rust

```toml
[dependencies]
alloy-agent-reputation = "0.2"
```

```rust
use alloy_agent_reputation::Erc8004ProviderExt;
use alloy_agent_reputation::calculator::{calculate_reputation, Policy};

let feedback = provider.get_agent_feedback(agent_id, 200, 0).await?;
let rep = calculate_reputation(&feedback, Policy { witness_cap: Some(1.0), ..Default::default() })?;
```

각 언어의 완전히 실행 가능한 위임 전 검증(pre-delegation guard) 예제 스크립트는
[`examples/`](examples/)(TypeScript), [`packages/py/examples/`](packages/py/examples/),
[`packages/rs/examples/`](packages/rs/examples/)에서 확인하세요.

## 🧱 2계층 계약 (모든 언어에서 동일)

**사실 계층(Facts layer)** — 기존 클라이언트를 통한 얇은 타입 조회, 의견 없음:

```ts
const client = createPublicClient({ chain: base, transport: http() }).extend(
  erc8004Actions(),
);
await client.getAgent({ agentId: 1n });
await client.getAgentFeedback({ agentId: 1n });
await client.getRegistrationFile({ agentId: 1n }); // verified: true | false | null
```

**계산기 계층(Calculator layer)** — 순수 함수; 여러분의 정책을 입력하면, 근거가 풍부한
결과를 출력합니다:

```ts
const rep = calculateReputation(feedback, {
  witnessCap: 1,
  credibility: activitySqrt(distinctCounts),
});
// → { expectation: 0.665, uncertainty: 0.179, witnesses: 20,
//     topWitnessShare: 0.15, caveats: [...], policy: { ...echoed } }
```

두 계층 모두 단순한 pass/fail이나 "이 에이전트를 신뢰하라"는 단일 불리언 값을
반환하지 않습니다 — [설계 원칙](#-설계-원칙)을 참고하세요.

## 📦 패키지

| 언어       | 호스트 SDK                                               | 패키지                                              | 상태                                         |
| ---------- | -------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| TypeScript | [viem](https://viem.sh) actions                          | [`agent-reputation`](https://www.npmjs.com/package/agent-reputation) (npm)             | **배포됨 — v0.2.0** |
| Python     | [web3.py](https://web3py.readthedocs.io) external module | [`web3-agent-reputation`](https://pypi.org/project/web3-agent-reputation/) (PyPI)       | **배포됨 — v0.2.0** |
| Rust       | [alloy](https://alloy.rs) extension trait                | [`alloy-agent-reputation`](https://crates.io/crates/alloy-agent-reputation) (crates.io) | **배포됨 — v0.2.0** |

세 패키지 모두 동일한 [골든 벡터](vectors/)와 동일한 [정합성 스위트](conformance/)를
통과합니다 — 릴리스별 세부 내용은 [CHANGELOG.md](CHANGELOG.md)를 참고하세요.

## 🛡️ 설계 원칙

> ### 🔒 영원히 읽기 전용
>
> 어떤 언어에서도 서명 없음, 쓰기 없음. `WalletClient`(혹은 Python/Rust의 동등한
> 개념)는 이 SDK 어디에서도 import되거나 허용되지 않습니다. 쓰기 기능을 가진 확장이
> 언젠가 생긴다면, 그것은 명시적인 별도 옵트인을 가진 다른 패키지에 있게 될
> 것입니다.

> ### ⚖️ 절대 단일 스칼라 값으로 끝내지 않는다
>
> 모든 평판 결과는 `uncertainty`, 증인(witness) 통계, 필수 주의사항(caveats), 그리고
> 결과를 만들어낸 정책의 에코(재현성 매니페스트)를 함께 담습니다. "증인 20명 중
> 한 명이 전체 항목의 15%를 제출했다"는 사실을 조용히 하나의 숫자로 압축하는
> 라이브러리는, 소비자를 대신해 내릴 자격이 없는 판단을 내리고 있는 것입니다.

> ### 🔁 언어 간 결정론적 동일성
>
> 모든 구현은 동일한 결정론적 순서로 누적 계산하며, [`vectors/`](vectors/)의 골든
> 테스트 벡터를 정확히(소수점 3자리 허용 오차) 재현해야 합니다. 두 번째 언어는
> CI에서 이를 통과한 뒤에야 출시됩니다 — 아래를 참고하세요.

> ### 🧭 판단은 항상 소비자의 몫
>
> 이 라이브러리는 _여러분이_ 선언한 정책 아래, _여러분이_ 요청한 것을 계산할
> 뿐입니다. 어떤 에이전트에 대해서도 "그" 점수를 정의하지 않으며, 앞으로도 그럴
> 것입니다.

## 🧪 골든 벡터 — 정합성 도전 과제

[`vectors/`](vectors/)는 실제 ERC-8004 피드백(Base 메인넷, 에이전트 0–9)의 고정
스냅샷과, 두 가지 정책 변형에 대한 참조 계산기의 정확한 기대 출력값을 소수점 3자리
까지 담고 있습니다. 이것이 바로 "viem을 위한 agent-reputation", "web3.py를 위한
web3-agent-reputation", "alloy를 위한 alloy-agent-reputation"을 서로 다른 세 개의
독립 재구현이 아니라, 세 개의 서로 다른 호스트 SDK를 입은 _동일한_ 계산기로 만들어주는
언어 간 계약입니다.

## 🌐 새 언어로 포팅하기

**새로운 언어는 [`vectors/`](vectors/) + [`conformance/`](conformance/README.md)를
통과해야만 출시할 수 있습니다.** 골든 벡터를 비트 단위로 재현하고, 주의사항 문자열·
검증 케이스·API 표면([`conformance/README.md`](conformance/README.md) 참고)을
바이트 단위로 일치시키는 것은 지향점이 아니라 합격 기준입니다. 다른 체인 SDK나
다른 생태계에 대해 이 계산기를 구현하고
[`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json)의 모든 행을
재현했다면, 이슈를 열어주세요 — 그것이 위 [패키지 표](#-패키지)에 네 번째 항목이
추가되는 기준입니다.

## 📈 라이브 수치에 대한 안내

실제 `getAgentFeedback` 호출로 얻는 수치는 시간이 지나면서 변합니다 — 온체인
피드백은 계속 늘어나기만 하므로, 어떤 에이전트의 `witnesses`, `expectation`,
`uncertainty`는 오늘 이 README나 예제의 캡처된 실행 결과와 다를 뿐 아니라, 한 시간
후의 자기 자신과도 달라질 수 있습니다. 이는 버그가 아니라 예상된 동작입니다. 변하지
**않는** 유일한 것은 [`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json)
입니다 — 파일 이름에 타임스탬프가 박힌 고정 스냅샷으로, 모든 언어의 정합성 스위트가
라이브 체인 대신 이 파일을 기준으로 검증합니다.

## 📖 왜 점수가 없나요? 이론을 읽어보세요

이 SDK가 왜 단일 "신뢰 점수" 대신 `expectation` + `uncertainty` + 주의사항을
고집하는지 궁금하다면 — 베타 분포·켤레성·주관 논리 등 수학적 배경까지 포함한 기술 문서가
[`docs/THEORY.md`](docs/THEORY.md)에 있습니다.

## 🛠️ 개발

```sh
pnpm install
pnpm run lint         # 세 언어 전부: eslint+prettier, ruff check+format, fmt+clippy
pnpm -r typecheck     # tsc --noEmit, TypeScript 패키지
pnpm -r test          # vitest + pytest + cargo test, 골든 벡터 정합성 테스트 포함
pnpm -r test:live     # 공개 Base RPC 대상 라이브 스모크 테스트 (CI에서는 실행 안 함)
pnpm -r build         # TypeScript를 dist/로 컴파일
```

프로젝트 구조:

- `packages/ts` — TypeScript 패키지(`agent-reputation`): 사실 계층(viem actions) +
  계산기 계층 + 골든 벡터 정합성 테스트.
- `packages/py` — Python 패키지(`web3-agent-reputation`): 사실 계층(web3.py external
  module) + 계산기 계층, `packages/ts`와 수치적으로 동일.
- `packages/rs` — Rust 패키지(`alloy-agent-reputation`): 사실 계층(alloy provider
  확장 trait) + 계산기 계층, 동일한 골든 벡터.
- `vectors/` — 언어 간 골든 벡터 정합성 픽스처.
- `conformance/` — 언어 간 계약의 나머지 절반: 표준 주의사항 문자열, 검증 테스트
  케이스, API 표면 매니페스트 — [`conformance/README.md`](conformance/README.md)
  참고.
- `docs/THEORY.md` — 계산기 뒤에 있는 배경 이론, 수학적 배경(베타 분포, 켤레성, 주관 논리) 포함
  작성됨.
- `examples/` — 모든 언어의 실행 가능하고 문서화된 예제 스크립트
  ([`examples/README.md`](examples/README.md) 참고).
- `.github/workflows/` — CI(`ci.yml`)와 드라이런 전용 수동 릴리스 워크플로
  (`release.yml`); "출시 시점에 전환"에 대한 메모는 [CHANGELOG.md](CHANGELOG.md)를
  참고하세요.

## 📊 상태

**v0.2.0 — 세 레지스트리에 배포 완료.** `agent-reputation`(npm), `web3-agent-reputation`
(PyPI), `alloy-agent-reputation`(crates.io) 세 패키지 모두 동일한 사실 + 계산기
계층을 구현하며, 동일한 골든 벡터와 정합성 스위트(세 언어 합쳐 236개 테스트, 하나의
공유 계약)를 통과합니다. 0.2.0은 **기저율(base rate)** 정책 필드(`baseRate`, Jøsang
의견의 네 번째 항)와 계산기 밖의 순수 충분성/집중도 게이트 **`shouldEscalate`**를
추가했으며, 둘 다 하위 호환입니다(모든 0.1.0 골든 벡터가 그대로 재현). 전체 이력은
[CHANGELOG.md](CHANGELOG.md)를, 이 게이트들의 한계를 규정하는 Cheng–Friedman 불가능성
결과는 [`docs/THEORY.md`](docs/THEORY.md) §3.1을 참고하세요.

## 🔗 자매 프로젝트

[web3-agents-mcp](https://github.com/hanjoonchoe/web3-agents-mcp)는 동일한 ERC-8004
레지스트리 위에 구축된 MCP 서버입니다 — 같은 사실 데이터를, SDK 확장이 아니라
MCP를 사용하는 에이전트를 위한 도구로 제공합니다. 이 SDK와 마찬가지로 사실과
주의사항만 전달하며, 에이전트를 점수화하지 않습니다.

## 📄 라이선스

MIT — [LICENSE](LICENSE) 참고.
