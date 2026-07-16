<div align="center">

# agent-reputation-sdk

### 不要直接提供一个分数,自己计算,并让任何人都能验证。

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | **中文**

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

**面向 [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) 的以太坊 SDK 扩展** —
以类型化的注册表读取,加上策略驱动的信誉计算器,作为各生态系统权威以太坊 SDK 的
扩展形式提供。

</div>

---

## 📋 目录

- [为什么做这个](#-为什么做这个)
- [快速开始](#-快速开始)
- [双层契约(所有语言完全一致)](#-双层契约所有语言完全一致)
- [软件包](#-软件包)
- [设计原则](#-设计原则)
- [黄金向量 —— 一致性挑战](#-黄金向量--一致性挑战)
- [移植到新语言](#-移植到新语言)
- [关于实时数据的说明](#-关于实时数据的说明)
- [为什么不给分数?阅读理论](#-为什么不给分数阅读理论)
- [开发](#-开发)
- [状态](#-状态)
- [姊妹项目](#-姊妹项目)
- [许可证](#-许可证)

## 🤔 为什么做这个

AI 智能体开始互相雇佣、支付报酬、委托任务。ERC-8004 为此提供了链上信任层 ——
身份、信誉与验证注册表 —— 但读取这些数据只解决了一半的问题。另一半是把原始的、
可被 Sybil 攻击的、评分尺度不一致的反馈,转化为一个真正可以据以行动的数字 ——
而且不能把这个判断交给某个第三方黑箱来做。

大多数所谓的"信誉"工具都把这一切压缩成一个不透明的单一分数。本 SDK 拒绝这样做:
它把事实原原本本地交给你,让你自己声明聚合策略,并始终返回一个自带不确定性
(uncertainty)和注意事项(caveats)的结果 —— 无论以哪种语言提供,计算方式都完全
相同。

## 🚀 快速开始

选择你的技术栈 —— 三种语言都针对同一份黄金向量(见[下文](#-黄金向量--一致性挑战))
运行完全相同的计算器。

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

每种语言完整可运行的"委托前验证(pre-delegation guard)"示例脚本参见
[`examples/`](examples/)(TypeScript)、
[`packages/py/examples/`](packages/py/examples/)、
[`packages/rs/examples/`](packages/rs/examples/)。

## 🧱 双层契约(所有语言完全一致)

**事实层(Facts layer)** —— 通过你现有客户端进行的轻量类型化读取,不含任何观点:

```ts
const client = createPublicClient({ chain: base, transport: http() }).extend(
  erc8004Actions(),
);
await client.getAgent({ agentId: 1n });
await client.getAgentFeedback({ agentId: 1n });
await client.getRegistrationFile({ agentId: 1n }); // verified: true | false | null
```

**计算器层(Calculator layer)** —— 一个纯函数;输入你的策略,输出证据充分的结果:

```ts
const rep = calculateReputation(feedback, {
  witnessCap: 1,
  credibility: activitySqrt(distinctCounts),
});
// → { expectation: 0.665, uncertainty: 0.179, witnesses: 20,
//     topWitnessShare: 0.15, caveats: [...], policy: { ...echoed } }
```

这两层都绝不会返回简单的通过/失败,或者"信任这个智能体"这样的单一布尔值 ——
详见[设计原则](#-设计原则)。

## 📦 软件包

| 语言       | 宿主 SDK                                                 | 软件包                                              | 状态                                    |
| ---------- | -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| TypeScript | [viem](https://viem.sh) actions                          | [`agent-reputation`](https://www.npmjs.com/package/agent-reputation) (npm)             | **已发布 —— v0.2.0** |
| Python     | [web3.py](https://web3py.readthedocs.io) external module | [`web3-agent-reputation`](https://pypi.org/project/web3-agent-reputation/) (PyPI)       | **已发布 —— v0.2.0** |
| Rust       | [alloy](https://alloy.rs) extension trait                | [`alloy-agent-reputation`](https://crates.io/crates/alloy-agent-reputation) (crates.io) | **已发布 —— v0.2.0** |

三个软件包均通过了相同的[黄金向量](vectors/)与相同的[一致性测试套件](conformance/)
—— 各版本详情见 [CHANGELOG.md](CHANGELOG.md)。

## 🛡️ 设计原则

> ### 🔒 永久只读
>
> 无论哪种语言,都不签名、不写入。`WalletClient`(或 Python/Rust 中的等价物)
> 永远不会被本 SDK 的任何部分导入或接受。如果未来真的存在具备写入能力的扩展,
> 它会存在于一个不同的软件包中,并带有明确、独立的启用开关。

> ### ⚖️ 绝不返回单一标量值
>
> 每一个信誉结果都携带 `uncertainty`、证人(witness)统计数据、强制性的诚实
> 注意事项(caveats),以及产生该结果的策略回显(可复现性清单)。一个悄悄地把
> "20 位证人中有一位提交了全部条目的 15%"这种信息压缩成单一数字的库,是在替
> 使用者做出一个它无权做出的判断。

> ### 🔁 跨语言确定性
>
> 每个实现都以相同的确定性顺序进行累加计算,并且必须精确地(允许小数点后
> 三位的误差)复现 [`vectors/`](vectors/) 中的黄金测试向量。第二种语言只有在
> CI 中通过这些测试后才会发布 —— 详见下文。

> ### 🧭 判断始终留给使用者
>
> 本库只在*你*声明的策略下,计算*你*所要求的内容。它不会为任何智能体定义
> "唯一正确"的分数,将来也不会。

## 🧪 黄金向量 —— 一致性挑战

[`vectors/`](vectors/) 是一份真实 ERC-8004 反馈数据(Base 主网,智能体 0–9)的
冻结快照,以及参考计算器在两种策略变体下精确到小数点后三位的预期输出。正是
这份跨语言契约,让面向 viem 的 "agent-reputation"、面向 web3.py 的
"web3-agent-reputation"、面向 alloy 的 "alloy-agent-reputation" 成为披着三种不同
宿主 SDK 外衣的*同一个*计算器,而不是三个碰巧大多数时候结果一致的独立重新实现。

## 🌐 移植到新语言

**一门新语言只有通过 [`vectors/`](vectors/) 与
[`conformance/`](conformance/README.md) 才能发布。** 逐位复现黄金向量,以及
逐字节匹配注意事项字符串、验证用例和 API 表面(见
[`conformance/README.md`](conformance/README.md)),这不是一个愿景,而是及格线。
如果你针对另一个链 SDK 或另一个生态系统实现了这个计算器,并复现了
[`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json) 中的每一行,请
提交一个 issue —— 这就是在上方[软件包表](#-软件包)中新增第四个条目的标准。

## 📈 关于实时数据的说明

通过实时调用 `getAgentFeedback` 得到的数字会随时间漂移 —— 链上反馈只会不断增加,
因此某个智能体的 `witnesses`、`expectation`、`uncertainty` 今天不仅会与本
README 或示例中捕获的运行记录不同,甚至一小时后也可能与它自身不同。这是预期
行为,不是 bug。唯一**不会**漂移的是
[`vectors/base-2026-07-13.json`](vectors/base-2026-07-13.json) —— 一份文件名
本身就带有时间戳的冻结快照,所有语言的一致性测试套件都以它为基准,而不是以
实时链上数据为基准。

## 📖 为什么不给分数?阅读理论

如果你想知道本 SDK 为什么坚持返回 `expectation` + `uncertainty` + 注意事项,
而不是直接给你一个"信任分数",我们在
[`docs/THEORY.md`](docs/THEORY.md) 中给出了包含数学背景（Beta 分布、共轭性、主观逻辑）的技术性说明。

## 🛠️ 开发

```sh
pnpm install
pnpm run lint         # 三种语言全部: eslint+prettier, ruff check+format, fmt+clippy
pnpm -r typecheck     # tsc --noEmit, TypeScript 软件包
pnpm -r test          # vitest + pytest + cargo test,包含黄金向量一致性测试
pnpm -r test:live     # 针对公共 Base RPC 的实时冒烟测试(不在 CI 中运行)
pnpm -r build         # 将 TypeScript 编译到 dist/
```

项目结构:

- `packages/ts` —— TypeScript 软件包(`agent-reputation`):事实层
  (viem actions)+ 计算器层 + 黄金向量一致性测试。
- `packages/py` —— Python 软件包(`web3-agent-reputation`):事实层
  (web3.py external module)+ 计算器层,与 `packages/ts` 数值上完全一致。
- `packages/rs` —— Rust 软件包(`alloy-agent-reputation`):事实层
  (alloy provider 扩展 trait)+ 计算器层,使用相同的黄金向量。
- `vectors/` —— 跨语言黄金向量一致性测试固件。
- `conformance/` —— 跨语言契约的另一半:规范的注意事项字符串、验证测试用例,
  以及 API 表面清单 —— 见 [`conformance/README.md`](conformance/README.md)。
- `docs/THEORY.md` —— 计算器背后的理论背景，包含数学基础（Beta 分布、共轭性、主观逻辑）。
- `examples/` —— 每种语言下可运行、有文档说明的示例脚本(见
  [`examples/README.md`](examples/README.md))。
- `.github/workflows/` —— CI(`ci.yml`)以及仅执行 dry-run 的手动发布工作流
  (`release.yml`);关于"发布时切换"的说明见 [CHANGELOG.md](CHANGELOG.md)。

## 📊 状态

**v0.2.0 —— 已发布至三个注册表。** `agent-reputation`(npm)、
`web3-agent-reputation`(PyPI)、`alloy-agent-reputation`(crates.io)三个
软件包都实现了相同的事实层 + 计算器层,并通过了相同的黄金向量与一致性测试套件
(三种语言合计 236 个测试,共享同一份契约)。0.2.0 新增了**基准率(base rate)**
策略字段(`baseRate`,Jøsang 意见的第四项)以及位于计算器之外的纯充分性/集中度门控
**`shouldEscalate`**(二者均向后兼容,所有 0.1.0 黄金向量原样复现)。完整历史见
[CHANGELOG.md](CHANGELOG.md),界定这些门控能力上限的 Cheng–Friedman 不可能性结果见
[`docs/THEORY.md`](docs/THEORY.md) §3.1。

## 🔗 姊妹项目

[web3-agents-mcp](https://github.com/hanjoonchoe/web3-agents-mcp) 是构建在相同
ERC-8004 注册表之上的一个 MCP 服务器 —— 提供相同的事实数据,只是以工具的形式
面向使用 MCP 的智能体,而不是作为 SDK 扩展。它与本 SDK 一样,只提供事实和
注意事项,同样不会给智能体打分。

## 📄 许可证

MIT —— 见 [LICENSE](LICENSE)。
