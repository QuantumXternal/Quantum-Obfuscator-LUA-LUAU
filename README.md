<div align="center">

# Quantum Obfuscator

**Advanced Luau Obfuscator with Dual-VM Protection, Guaranteed Determinism, and Executor Hardening**

A from-scratch Luau obfuscation engine in TypeScript: complete Lexer → Parser → AST → Obfuscator → VM pipeline with no external parsing dependencies, two virtual machine architectures, a layered protection envelope, and byte-identical reproducible builds.

[![Version](https://img.shields.io/badge/version-3.0.0-66bb6a?style=flat-square)](../../releases/tag/v3.0.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/QuantumXternal/Quantum-Obfuscator-LUA-LUAU?style=flat-square)](https://github.com/QuantumXternal/Quantum-Obfuscator-LUA-LUAU/stargazers)

</div>

---

## v3.0.0 Release Highlights

- **Executor hardening (new)** — output runs on restricted executors: pcall-guarded `getfenv` resolvers with `_G` fallback, `loadstring or load` boot paths, and an anti-tamper probe that only fires on a **positive** hook detection (a real installed tracer) instead of false-positiving on stripped debug libraries.
- **Guaranteed wrapper determinism (new)** — `wrapCustomCipher`, `wrapNestedVM`, and `wrapStubVM` accept a `seed` (number or string); the pipeline and every wrapper layer are byte-identical across repeated builds with the same seed.
- **Adversarial re-verification** — ClydeDeobfuscator: **5/5 REFUSE**; Luraph V15: **5/5 GARBAGE** (no source recovered). See the [resistance matrix](#deobfuscation-resistance-matrix) and [SECURITY.md](./SECURITY.md).
- **556 tests / 42 suites green**, 24/24 dual-VM execution matrix on Luau 0.742 + PUC-Lua 5.4.8.

---

## Overview

Quantum Obfuscator implements a complete obfuscation pipeline — tokenization, full Luau grammar parsing (including type annotations), composable AST transformations, bytecode compilation, VM code generation, and an optional protection envelope — all hand-written for maximum control and output quality.

### Key Features

- **Full Luau Support** — Complete lexer and parser covering the entire Luau grammar: type annotations, generics, if-else expressions, string interpolation, compound assignments, and `continue`
- **Dual VM Architectures** — Stack-based and register-based virtual machines; the register VM is the high-protection default with a sparse per-build opcode space, polymorphic dispatch, and fused super-ops
- **Quantum Protection Envelope** — Register-VM artifacts are wrapped in a layered state-machine loader with an encrypted + checksummed payload (XOR → 4-round Feistel → CBC), opaque predicates, and key/sbox integrity checks
- **Anti-Tamper** — Shadow PC/ip verification with polymorphic corruption on divergence; probes are calibrated to avoid false positives on stripped executors
- **Executor Hardening** — Graceful degradation when `getfenv` is blocked or `loadstring` is absent; no hard crashes on restricted environments
- **Guaranteed Determinism** — `polymorphicSeed` (number or 128-bit string path) plus optional per-wrapper seeds produce byte-identical builds on repeat
- **Dual-VM Nesting** — Register-VM payloads survive cipher/nested/stub wrapper layers and execute correctly on both Luau and PUC-Lua
- **MBA + CFF** — Mixed Boolean-Arithmetic constant encoding and a real state-machine control-flow flattening pass
- **Web UI + CLI + API** — Express server with an interactive dashboard, scriptable CLIs, and a JSON API with profiles and cached builds

---

## Performance Modes

Two complementary layers control protection strength. They land on the same VM modes — the API/UI profiles additionally set the AST passes.

### Performance Tiers (`performanceTier`, engine level)

| Tier | VM Stage | AST Passes | Character |
|------|----------|-----------|-----------|
| **Turbo** | none (AST only) | per flags | Fastest generation, smallest output, weakest structural protection |
| **Balanced** | Stack VM @ normal | per flags | Smaller artifacts with solid dispatch-level protection |
| **Maximum** | Register VM @ max | per flags | Strongest: polymorphic dispatch, sparse opcodes, envelope, anti-tamper checks |

### Protection Profiles (`profile`, API/UI level)

| Profile | AST Passes | VM | Notes |
|---------|-----------|-----|-------|
| `FAST` | Rename only | none | Smallest/fastest tier for build pipelines |
| `BALANCED` | Rename + string encoding + control-flow scramble | Register @ normal | **Web UI default** |
| `MAXIMUM` | Rename + string encoding + control-flow scramble + MBA constants | Register @ max | Roblox anti-tamper bootstrap only when `target: "roblox"`; fully generic otherwise |

---

## Deobfuscation Resistance Matrix

All results below are **MEASURED** on real tool runs (see [SECURITY.md](./SECURITY.md) for per-artifact evidence, tool commit hashes, and reproduction commands). No evaluated tool achieved SUCCESS or PARTIAL — every classified result is refusal, crash, or garbage output.

| Tool | Commit | Result | Detail |
|------|--------|--------|--------|
| `JamiesNolandGiggleShi1er/ClydeDeobfuscator` | `87102086` | **5/5 REFUSE** | Exit 1, explicit refusal, no `.clean.lua` written |
| `caomod2077/Deobfuscator-Luraph-V15` | `892b48ac` | **5/5 GARBAGE** | Trace sandbox aborts on missing `bit32`/`string.pack`; 270-byte harness stubs, no source recovered |
| `larpcorrupt/luraph-v15-v14.x-deobfuscator` | `ed79a86c` | **5/5 CRASH** | `LiftError: could not find the VM loader` (Phase 1 baseline) |
| `0x251/Prometheus-Deobfuscator` | `7d0582fc` | **5/5 GARBAGE** | Dispatch analysis finds zero; annotated original only (Phase 1 baseline) |

Additional standing evidence: 10 adversarial cells (seeds `5, 17, 777, 31337, 90210` × reg/stack) all REFUSE with verbatim output and exit 1.

---

## Architecture

### End-to-End Pipeline

```mermaid
graph LR
    A["Luau Source"] --> B["Lexer"]
    B --> C["Parser"]
    C --> D["AST Transforms<br/><i>rename / encode / scramble / MBA</i>"]
    D --> E{"Tier / Profile"}
    E -->|"Turbo"| F["Printer"]
    E -->|"Balanced"| G["Stack VM Generator"]
    E -->|"Maximum"| H["Register VM Generator"]
    H --> I["Quantum Protection Envelope<br/><i>state-machine loader + encrypted,<br/>checksummed payload + opaque predicates</i>"]
    I --> J["Optional Outer Wrappers<br/><i>custom cipher / nested VM / stub VM</i>"]
    G --> K["Self-Contained Luau Script"]
    F --> K
    J --> K

    style A fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style B fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style C fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style D fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style E fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style F fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style G fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style H fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style I fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style J fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style K fill:#0d3b0d,stroke:#66bb6a,color:#e0e0e0
```

### VM Compilation Flow

```mermaid
graph TD
    A["Obfuscated AST"] --> B["Bytecode Compiler"]
    B --> C["Instruction Stream<br/><i>opcodes + operands + constants</i>"]
    C --> D{"VM Architecture"}

    D -->|"Stack-Based"| E["Stack VM Generator"]
    D -->|"Register-Based"| F["Register VM Generator"]

    E --> G["Protection Level"]
    F --> G

    G -->|"Debug"| H["Readable output<br/><i>named opcodes, comments</i>"]
    G -->|"Normal"| I["Standard protection<br/><i>sparse shuffled opcodes,<br/>encoded constants, flattening</i>"]
    G -->|"Maximum"| J["Full protection<br/><i>polymorphic dispatch, fused ops,<br/>LZMA, envelope, anti-tamper</i>"]

    H --> K["Self-Contained Luau Script"]
    I --> K
    J --> K

    style A fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style B fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style C fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style D fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style E fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style F fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style G fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style H fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style I fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style J fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style K fill:#0d3b0d,stroke:#66bb6a,color:#e0e0e0
```

### Project Structure

```mermaid
graph TD
    ROOT["Quantum-Obfuscator-LUA-LUAU/"] --> SRC["src/"]
    ROOT --> PUB["public/"]
    ROOT --> TESTS["tests/<br/><i>42 suites / 556 tests</i>"]

    SRC --> LEX["lexer/<br/><i>Tokenizer + token types</i>"]
    SRC --> PAR["parser/<br/><i>Recursive descent parser + type parser</i>"]
    SRC --> AST2["ast/<br/><i>AST node type definitions</i>"]
    SRC --> OBF["obfuscator/<br/><i>Renamer, StringEncoder,<br/>ControlFlowScrambler, MBA, Printer</i>"]
    SRC --> ENG["engine/<br/><i>Pipeline + protection profiles</i>"]
    SRC --> VM["vm/<br/><i>Stack + Register compilers and<br/>generators, bootstrap envelope, LZMA</i>"]
    SRC --> CLI["cli/<br/><i>CLI entry points</i>"]
    SRC --> SRV["server.ts<br/><i>Express API server</i>"]

    PUB --> HTML["index.html"]
    PUB --> CSS["style.css"]
    PUB --> JS["app.js"]

    style ROOT fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style SRC fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style PUB fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style TESTS fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style LEX fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style PAR fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style AST2 fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style OBF fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style ENG fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style VM fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style CLI fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style SRV fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style HTML fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style CSS fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style JS fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher

### Installation

```bash
git clone https://github.com/QuantumXternal/Quantum-Obfuscator-LUA-LUAU.git
cd Quantum-Obfuscator-LUA-LUAU
npm install
npm run build
```

### Web UI

```bash
node dist/server.js
```

Open [http://localhost:3000](http://localhost:3000) to access the obfuscation dashboard (BALANCED default, profile selector, optional **Seed** field for byte-reproducible builds).

Input caps and worker isolation:

- Requests are capped at **20 MB** of source (`MAX_INPUT_BYTES=<bytes>` to raise/lower; over-cap requests get a `413` JSON envelope with `bytes`/`maxBytes`).
- Each obfuscation runs in a **worker thread** with its own heap limit (`MAX_OLD_GEN_MB`, default 2048) and timeout (`OBFUSCATE_TIMEOUT_MS`, default 15000); a timeout returns `504`, an OOM/crash returns `500`, and the API process itself stays alive.
- The client-side pre-check mirrors the 20 MB default (bump `CLIENT_MAX_INPUT_BYTES` in `public/app.js` if you raise the server cap).
- Set `PORT=<n>` to change the port and `NO_BROWSER=1` to skip auto-opening the browser.

### CLI Usage

**Obfuscate a file:**

```bash
npm run obfuscate -- input.lua
npm run obfuscate -- input.lua --profile=MAXIMUM --seed=1234 -o out.lua
```

The CLI shares the same byte cap; raise it with `--max-size=<bytes|KB|MB>` or the `MAX_INPUT_BYTES` environment variable. Optional flags:

| Flag | Description |
|------|-------------|
| `--profile=FAST\|BALANCED\|MAXIMUM` | Protection profile (same defaults as API/UI; explicit flags like `--encode-strings`/`--scramble`/`--vm` override profile fields) |
| `--seed=<number>` | Deterministic build seed; implies `polymorphicSeed` — CLI, UI seed field, and API `{seed}` produce **byte-identical** output (see `benchmarks/seed-parity.mjs`) |
| `--target=generic\|roblox` | Output environment for the profile (default `generic`) |

Without `--profile` the CLI keeps the legacy flag-driven behavior. Lexeme fidelity is preserved for constants that survive AST-only builds (`1e5`, `0xFF`, `1_000` print exactly as written).

**Lex tokens / Parse AST:**

```bash
npm run lex -- input.lua
npm run parse -- input.lua
```

---

## API Reference

The Express server exposes two endpoints:

### `POST /api/validate`

Validates Luau source code for syntax errors.

```json
{
  "code": "local x = 1 + 2"
}
```

### `POST /api/obfuscate`

Obfuscates Luau source with a protection profile and optional deterministic seed.

```json
{
  "code": "local function greet(name) print('Hello ' .. name) end",
  "options": {
    "profile": "BALANCED",
    "target": "generic",
    "seed": 1234,
    "polymorphicSeed": "build-2026-01"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `profile` | `"FAST" \| "BALANCED" \| "MAXIMUM"` | Protection profile (default `BALANCED`) |
| `target` | `"generic" \| "roblox"` | Output environment; `roblox` enables executor globals + anti-tamper bootstrap |
| `seed` | `number` | Deterministic build seed |
| `polymorphicSeed` | `number \| string` | Exact VM polymorphic seed (`string` ⇒ 128-bit path; ≥ 16 chars recommended) |
| `options` | `object` | Explicit per-field overrides (see below) |

Unknown profiles are rejected with `400`. Responses are always JSON.

### Pipeline Options (`runObfuscatePipeline`)

| Option | Type | Description |
|--------|------|-------------|
| `renameLocals` | `boolean` | Scope-aware identifier renaming |
| `preserveGlobals` | `boolean` | Preserve Roblox globals during renaming |
| `encodeStrings` | `boolean` | XOR-encoded string literals with runtime decoding |
| `scramble` | `boolean` | Control-flow scrambling (opaque predicates + dispatch) |
| `oneLine` | `boolean` | Minify output to a single line |
| `vmType` | `"none" \| "stack" \| "register"` | VM architecture |
| `vmLevel` | `"debug" \| "normal" \| "max"` | Protection level (debug = plaintext bypass) |
| `performanceTier` | `"turbo" \| "balanced" \| "maximum"` | Resolves the VM stage; overrides `vmType`/`vmLevel` when set |
| `seed` | `number` | Deterministic seed for encode/scramble/polymorphic generation |
| `polymorphicSeed` | `number \| string` | VM polymorphic seed override (defaults to `seed` or random) |
| `target` | `string` | `"roblox"` enables Roblox-specific bootstrap behavior |
| `mba` | `boolean` | Mixed Boolean-Arithmetic numeric-constant encoding |
| `disableFeatures` | `string[]` | Feature gates to disable (e.g. `["cff"]`, `["deadCodeInjection"]`) |
| `noVmFunctions` | `string[]` | Function names excluded from VM virtualization (macro) |
| `noCompression` | `boolean` | Stack VM only: skip bytecode compression |
| `debugTrace` | `boolean` | Register VM only: emit debug trace info |

---

## Programmatic Usage

```typescript
import {
  runObfuscatePipeline,
  resolveProfile,
  lex,
  parse,
  obfuscate,
  printChunk,
  compile,
  generateVM,
} from "quantum-obfuscator";

// High-level: profile-driven, deterministic
const opts = resolveProfile({
  profile: "MAXIMUM",
  target: "generic",
  polymorphicSeed: "release-2026-01",
});
const output = runObfuscatePipeline("local x = 1 + 2 print(x)", opts);

// Low-level: explicit pipeline options
const output2 = runObfuscatePipeline('print("hello")', {
  renameLocals: true,
  preserveGlobals: true,
  encodeStrings: true,
  scramble: true,
  oneLine: false,
  vmType: "register",
  vmLevel: "max",
  polymorphicSeed: "build-1",
});

// AST-only building blocks
const { tokens } = lex('local x = "hello world"');
const ast = parse(tokens);
const obfuscated = obfuscate(ast, { renameLocals: true, preserveGlobals: true });
const printed = printChunk(obfuscated);
```

**Determinism contract**: same source + same options + same `polymorphicSeed` ⇒ byte-identical output. This holds for the whole pipeline and for each outer wrapper layer (`wrapCustomCipher`, `wrapNestedVM`, `wrapStubVM` accept an optional `seed`). Without a seed, output is intentionally random per build.

---

## How It Works

### 1. Lexer

Tokenizes raw Luau into typed tokens: long strings/comments (`[==[...]==]`), string interpolation (`` `Hello {name}` ``), type-annotation tokens (`::`, `->`, `?`), and compound operators (`+=`, `-=`, …).

### 2. Parser

Hand-written recursive descent producing a complete AST: full statement/expression grammar, generics (`Array<{key: string}>`), if-else expressions, type function statements, and export type declarations.

### 3. Obfuscation Passes

| Pass | Description |
|------|-------------|
| **Identifier Renaming** | Scope-aware renaming of locals, parameters, and loop variables; Roblox globals preserved by default |
| **String Encoding** | XOR-encoded literals + injected runtime decoding |
| **Control Flow Scrambling** | Real state-machine CFF (while/break dispatch) with fake branches |
| **MBA** | Numeric constants rewritten as Mixed Boolean-Arithmetic expressions |
| **Macro no-VM** | Named functions bypass virtualization (`noVmFunctions`) |

### 4. Virtual Machines

| Architecture | Backend | Key Traits |
|-------------|---------|------------|
| **Stack-Based** | `vm-gen.ts` | Push/pop operand stack, hardened code stream, hot-subset dispatch chain at max level |
| **Register-Based** | `reg-vm-gen.ts` | Sparse per-build opcode space, polymorphic dispatch, fused super-ops, per-build constant-bank offset, Quantum Protection envelope |

Both VMs support three protection levels: **Debug** (plaintext bypass for development), **Normal** (sparse shuffled opcodes, encoded constants, flattening), and **Maximum** (full polymorphic dispatch, LZMA, envelope, anti-tamper).

### 5. Executor Hardening (v3.0.0)

Standard script executors frequently restrict the environment. Quantum output degrades gracefully instead of crashing:

- `getfenv` present-but-blocked or absent ⇒ pcall-guarded resolvers fall back to `_G`
- `loadstring` absent ⇒ `loadstring or load` boot paths; hosts with neither loader exit cleanly
- Stripped `debug` libraries ⇒ anti-tamper probe requires positive tracer detection, so restricted executors are never false-positived into corruption

---

## Verification & Trust

- **556 tests across 42 suites** green, including RNG draw-order canaries that pin byte-identity of legacy unseeded paths
- **24/24 dual-VM execution matrix** on Luau 0.742 and PUC-Lua 5.4.8 (with a compat shim), covering plain, custom-cipher, nested, stub, and triple-stacked configurations
- **Determinism measured**: pipeline (seed `1234`) `f9fef00e…856c`; seeded cipher wrapper `33276098…8f01`; seeded triple-stack chain `b638694e…bd67` — all byte-identical on repeated builds
- **Adversarial**: ClydeDeobfuscator 5/5 REFUSE, Luraph V15 5/5 GARBAGE — full evidence in [SECURITY.md](./SECURITY.md)

---

## Star History

<a href="https://star-history.com/#QuantumXternal/Quantum-Obfuscator-LUA-LUAU&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=QuantumXternal/Quantum-Obfuscator-LUA-LUAU&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=QuantumXternal/Quantum-Obfuscator-LUA-LUAU&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=QuantumXternal/Quantum-Obfuscator-LUA-LUAU&type=Date" />
  </picture>
</a>

---

## License

This project is licensed under the [MIT License](./LICENSE).
