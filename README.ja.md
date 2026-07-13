<div align="center">

# agent-reputation-sdk

### スコアを配布するのではなく、自分で計算し、誰でも検証できるようにする。

[English](README.md) | [한국어](README.ko.md) | **日本語** | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Python >= 3.10](https://img.shields.io/badge/python-%3E%3D3.10-blue)](https://www.python.org)
[![Tests](https://img.shields.io/badge/tests-205%20passing%20%C2%B7%203%20languages%20%C2%B7%201%20contract-success)](conformance/)
[![Golden vectors](https://img.shields.io/badge/golden--vectors-cross--language-orange)](vectors/)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-627EEA)](https://eips.ethereum.org/EIPS/eip-8004)
[![web3-agents-mcp](https://img.shields.io/badge/sibling-web3--agents--mcp-8A2BE2)](https://github.com/hanjoonchoe/web3-agents-mcp)

**[ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) のための
イーサリアム SDK 拡張** —
型付きのレジストリ読み取りと、ポリシー駆動型の評判計算機を、各エコシステムの
標準的なイーサリアム SDK への拡張として提供します。

</div>

---

## 📋 目次

- [なぜ作ったか](#-なぜ作ったか)
- [クイックスタート](#-クイックスタート)
- [2 層構造の契約(すべての言語で同一)](#-2-層構造の契約すべての言語で同一)
- [パッケージ](#-パッケージ)
- [設計原則](#-設計原則)
- [ゴールデンベクター — コンフォーマンスへの挑戦](#-ゴールデンベクター--コンフォーマンスへの挑戦)
- [新しい言語への移植](#-新しい言語への移植)
- [ライブ数値に関する注意](#-ライブ数値に関する注意)
- [なぜスコアがないのか? 理論を読む](#-なぜスコアがないのか-理論を読む)
- [開発](#-開発)
- [ステータス](#-ステータス)
- [姉妹プロジェクト](#-姉妹プロジェクト)
- [ライセンス](#-ライセンス)

## 🤔 なぜ作ったか

AI エージェントは、他のエージェントを雇い、報酬を支払い、業務を委任し始めています。
ERC-8004 はそのためのオンチェーン信頼レイヤー — アイデンティティ、評判、検証の
各レジストリ — を提供しますが、そのデータを読み取れることは問題の半分でしか
ありません。残り半分は、生の、Sybil 攻撃に弱く、スケールもばらばらなフィードバックを、
実際に行動へつなげられる数値に変換することです。しかもその判断をサードパーティの
ブラックボックスに委ねることなく、です。

多くの「評判」ツールは、これを単一の不透明なスコアへと圧縮してしまいます。この
SDK はそれを拒みます。事実だけを渡し、集約ポリシーは自分で宣言してもらい、常に
不確実性(uncertainty)と注意事項(caveats)を伴った結果を返します — この計算は、
提供されるどの言語であっても同じ方法で行われます。

## 🚀 クイックスタート

好きなスタックを選んでください — 3 言語とも同一のゴールデンベクター
([下記参照](#-ゴールデンベクター--コンフォーマンスへの挑戦))に対して同一の
計算機を実行します。

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
alloy-agent-reputation = "0.1"
```

```rust
use alloy_agent_reputation::Erc8004ProviderExt;
use alloy_agent_reputation::calculator::{calculate_reputation, Policy};

let feedback = provider.get_agent_feedback(agent_id, 200, 0).await?;
let rep = calculate_reputation(&feedback, Policy { witness_cap: Some(1.0), ..Default::default() })?;
```

各言語の実行可能な「委任前チェック(pre-delegation guard)」のサンプルスクリプトは
[`examples/`](examples/)(TypeScript)、
[`packages/py/examples/`](packages/py/examples/)、
[`packages/rs/examples/`](packages/rs/examples/) を参照してください。

## 🧱 2 層構造の契約(すべての言語で同一)

**ファクト層** — 既存クライアントを通じた薄い型付き読み取り。意見は含まない:

```ts
const client = createPublicClient({ chain: base, transport: http() }).extend(
  erc8004Actions(),
);
await client.getAgent({ agentId: 1n });
await client.getAgentFeedback({ agentId: 1n });
await client.getRegistrationFile({ agentId: 1n }); // verified: true | false | null
```

**計算機層** — 純粋関数。あなたのポリシーを入力すると、根拠の豊富な結果が
出力されます:

```ts
const rep = calculateReputation(feedback, {
  witnessCap: 1,
  credibility: activitySqrt(distinctCounts),
});
// → { expectation: 0.665, uncertainty: 0.179, witnesses: 20,
//     topWitnessShare: 0.15, caveats: [...], policy: { ...echoed } }
```

どちらの層も、単純な pass/fail や「このエージェントを信頼せよ」という単一の真偽値を
返すことはありません — 詳しくは[設計原則](#-設計原則)を参照してください。

## 📦 パッケージ

| 言語       | ホスト SDK                                               | パッケージ                                          | ステータス                                      |
| ---------- | -------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| TypeScript | [viem](https://viem.sh) actions                          | [`agent-reputation`](packages/ts) (npm)             | **実装済み** — 名前確保済み、0.1.0 リリース予定 |
| Python     | [web3.py](https://web3py.readthedocs.io) external module | [`web3-agent-reputation`](packages/py) (PyPI)       | **実装済み** — 名前確保済み、0.1.0 リリース予定 |
| Rust       | [alloy](https://alloy.rs) extension trait                | [`alloy-agent-reputation`](packages/rs) (crates.io) | **実装済み** — 0.1.0 リリース予定               |

3 パッケージとも同一の[ゴールデンベクター](vectors/)と同一の
[コンフォーマンススイート](conformance/)に合格しています — リリースごとの詳細は
[CHANGELOG.md](CHANGELOG.md) を参照してください。

## 🛡️ 設計原則

> ### 🔒 永久に読み取り専用
>
> どの言語でも、署名なし、書き込みなし。`WalletClient`(または Python/Rust の
> 相当物)は、この SDK のどこにも import・許可されません。もし将来、書き込み可能な
> 拡張が存在するとしても、それは明示的なオプトインを持つ別パッケージに置かれます。

> ### ⚖️ 単一のスカラー値では決して終わらせない
>
> すべての評判結果には、`uncertainty`、証人(witness)統計、必須の注意事項
> (caveats)、そしてその結果を生んだポリシーのエコー(再現性マニフェスト)が
> 常に付随します。「20 人の証人のうち 1 人が全エントリの 15% を提出した」という
> 事実を、黙って単一の数値に圧縮するライブラリは、消費者に代わって行うべきでない
> 判断を下していることになります。

> ### 🔁 言語間の決定論的一致
>
> すべての実装は同じ決定論的な順序で累積計算を行い、[`vectors/`](vectors/) の
> ゴールデンテストベクターを正確に(小数点第 3 位までの許容誤差で)再現しなければ
> なりません。2 番目の言語は、CI でこれに合格して初めてリリースされます —
> 詳細は以下を参照してください。

> ### 🧭 判断は常に利用者の側に残る
>
> このライブラリは、*あなたが*宣言したポリシーのもとで、*あなたが*要求したものを
> 計算するだけです。どのエージェントについても「唯一の」スコアを定義することは
> なく、これからもありません。

## 🧪 ゴールデンベクター — コンフォーマンスへの挑戦

[`vectors/`](vectors/) は、実際の ERC-8004 フィードバック(Base メインネット、
エージェント 0–9)の固定スナップショットと、2 つのポリシーバリアントに対する
リファレンス計算機の正確な期待出力を、小数点第 3 位まで含んでいます。これが、
viem 向けの「agent-reputation」、web3.py 向けの「web3-agent-reputation」、alloy
向けの「alloy-agent-reputation」を、3 つの独立した再実装ではなく、3 つの異なる
ホスト SDK をまとった*同一*の計算機にしている、言語間の契約です。

## 🌐 新しい言語への移植

**新しい言語は [`vectors/`](vectors/) と
[`conformance/`](conformance/README.md) の両方に合格して初めてリリースできます。**
ゴールデンベクターをビット単位で再現し、注意事項の文字列・検証ケース・API 表面
([`conformance/README.md`](conformance/README.md) 参照)をバイト単位で一致させる
ことは、努力目標ではなく合格ラインです。別のチェーン SDK や別のエコシステムに
対してこの計算機を実装し、
[`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json) のすべての行を
再現できたら、ぜひ issue を開いてください — それが上記[パッケージ表](#-パッケージ)
に 4 つ目のエントリが加わる基準です。

## 📈 ライブ数値に関する注意

実際の `getAgentFeedback` 呼び出しで得られる数値は、時間とともに変化します —
オンチェーンのフィードバックは増え続けるだけなので、あるエージェントの
`witnesses`、`expectation`、`uncertainty` は、今日この README やサンプルの
キャプチャされた実行結果と一致しないだけでなく、1 時間後の自分自身とすら
一致しないことがあります。これはバグではなく、想定された挙動です。変化**しない**
唯一のものが [`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json) です
— ファイル名自体にタイムスタンプが刻まれた固定スナップショットであり、すべての
言語のコンフォーマンススイートは、ライブのチェーンではなくこのファイルと
照合します。

## 📖 なぜスコアがないのか? 理論を読む

なぜこの SDK が、単一の「信頼スコア」ではなく `expectation` + `uncertainty` +
注意事項にこだわるのか気になる方へ — 統計の予備知識を前提としない説明を
[`docs/THEORY.md`](docs/THEORY.md) に用意しています。

## 🛠️ 開発

```sh
pnpm install
pnpm run lint         # 3 言語すべて: eslint+prettier, ruff check+format, fmt+clippy
pnpm -r typecheck     # tsc --noEmit, TypeScript パッケージ
pnpm -r test          # vitest + pytest + cargo test、ゴールデンベクターのコンフォーマンステスト含む
pnpm -r test:live     # 公開 Base RPC に対するライブスモークテスト(CI では実行しない)
pnpm -r build         # TypeScript を dist/ にコンパイル
```

プロジェクト構成:

- `packages/ts` — TypeScript パッケージ(`agent-reputation`): ファクト層
  (viem actions) + 計算機層 + ゴールデンベクターのコンフォーマンステスト。
- `packages/py` — Python パッケージ(`web3-agent-reputation`): ファクト層
  (web3.py external module) + 計算機層。`packages/ts` と数値的に同一。
- `packages/rs` — Rust パッケージ(`alloy-agent-reputation`): ファクト層
  (alloy provider 拡張トレイト) + 計算機層。同じゴールデンベクターを使用。
- `vectors/` — 言語間のゴールデンベクターコンフォーマンスフィクスチャ。
- `conformance/` — 言語間契約のもう半分: 標準の注意事項文字列、検証テストケース、
  API 表面マニフェスト — [`conformance/README.md`](conformance/README.md) 参照。
- `docs/THEORY.md` — 計算機の背景理論。統計の予備知識がない読者向けに執筆。
- `examples/` — すべての言語向けの実行可能で文書化されたサンプルスクリプト
  ([`examples/README.md`](examples/README.md) 参照)。
- `.github/workflows/` — CI(`ci.yml`)と、ドライランのみの手動リリースワークフロー
  (`release.yml`)。「リリース時に切り替える」というメモは
  [CHANGELOG.md](CHANGELOG.md) を参照。

## 📊 ステータス

**v0.1.0 — 3 言語、1 つの契約。** `agent-reputation`(npm)、
`web3-agent-reputation`(PyPI)、`alloy-agent-reputation`(crates.io)の 3
パッケージすべてが、同一のファクト層 + 計算機層を実装し、同一のゴールデン
ベクターとコンフォーマンススイート(3 言語合計 205 テスト、1 つの共有契約)に
合格しています。レジストリごとのリリース状況は[パッケージ](#-パッケージ)表を、
全履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。

## 🔗 姉妹プロジェクト

[web3-agents-mcp](https://github.com/hanjoonchoe/web3-agents-mcp) は、同じ
ERC-8004 レジストリの上に構築された MCP サーバーです — 同じ事実データを、SDK
拡張としてではなく、MCP を話すエージェントのためのツールとして公開します。この
SDK と同様に、事実と注意事項のみを渡し、エージェントをスコア化することは
ありません。

## 📄 ライセンス

MIT — [LICENSE](LICENSE) を参照してください。
