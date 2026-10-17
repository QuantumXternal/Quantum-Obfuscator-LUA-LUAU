<div align="center">

# Quantum Obfuscator

**Advanced Luau Obfuscator with VM-Based Protection**

A high-performance Luau obfuscation toolkit featuring full language support, multi-pass AST transformations, and dual virtual machine architectures for maximum code protection.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/QuantumXternal/Quantum-Obfuscator-LUA-LUAU?style=flat-square)](https://github.com/QuantumXternal/Quantum-Obfuscator-LUA-LUAU/stargazers)

</div>

---

## Overview

Quantum Obfuscator is a from-scratch Luau obfuscator built entirely in TypeScript. It implements a complete **Lexer > Parser > AST > Obfuscator > VM** pipeline with no external parsing dependencies. Every stage — tokenization, full Luau grammar parsing (including type annotations), AST transformations, bytecode compilation, and VM code generation — is hand-written for maximum control and output quality.

### Key Features

- **Full Luau Support** — Complete lexer and parser covering the entire Luau grammar including type annotations, generics, if-else expressions, string interpolation, compound assignments, and `continue`
- **Multi-Pass Obfuscation** — Identifier renaming, string encoding, and control flow scrambling applied as composable AST passes
- **Dual VM Architectures** — Both stack-based and register-based virtual machines with configurable protection levels
- **Web UI** — Built-in Express server with a browser-based interface for interactive obfuscation
- **CLI Tools** — Scriptable command-line interface for batch processing and CI/CD integration
- **Validation** — Pre-obfuscation syntax validation to catch errors early

---

## Architecture

### High-Level Pipeline

```mermaid
graph LR
    A["Luau Source"] --> B["Lexer"]
    B --> C["Parser"]
    C --> D["AST Transforms"]
    D --> E{"Output Mode"}
    E -->|"Direct"| F["Printer"]
    E -->|"Stack VM"| G["Stack Compiler"]
    E -->|"Register VM"| H["Register Compiler"]
    G --> I["VM Generator"]
    H --> J["Reg-VM Generator"]
    F --> K["Obfuscated Luau"]
    I --> K
    J --> K

    style A fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style B fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style C fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style D fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style E fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style F fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style G fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style H fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style I fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style J fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style K fill:#0d3b0d,stroke:#66bb6a,color:#e0e0e0
```

### Obfuscation Passes

```mermaid
graph TD
    AST["Parsed AST"] --> R{"Rename Locals?"}
    R -->|Yes| REN["Identifier Renaming<br/><i>Scope-aware variable renaming</i>"]
    R -->|No| SE
    REN --> SE{"Encode Strings?"}
    SE -->|Yes| STR["String Encoding<br/><i>XOR / dynamic decoding stubs</i>"]
    SE -->|No| CF
    STR --> CF{"Scramble Control Flow?"}
    CF -->|Yes| CFS["Control Flow Scrambling<br/><i>Opaque predicates + dispatch tables</i>"]
    CF -->|No| OUT["Transformed AST"]
    CFS --> OUT

    style AST fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style R fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style REN fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style SE fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style STR fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style CF fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style CFS fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style OUT fill:#0d3b0d,stroke:#66bb6a,color:#e0e0e0
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
    G -->|"Normal"| I["Standard protection<br/><i>shuffled opcodes, encoded constants</i>"]
    G -->|"Maximum"| J["Full protection<br/><i>polymorphic dispatch, LZMA compression</i>"]
    
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
    
    SRC --> LEX["lexer/<br/><i>Tokenizer + token types</i>"]
    SRC --> PAR["parser/<br/><i>Recursive descent parser + type parser</i>"]
    SRC --> AST2["ast/<br/><i>AST node type definitions</i>"]
    SRC --> OBF["obfuscator/<br/><i>Renamer, StringEncoder, ControlFlowScrambler, Printer</i>"]
    SRC --> CMP["compiler/<br/><i>Luau syntax validator</i>"]
    SRC --> VM["vm/<br/><i>Stack + Register compilers, VM generators, LZMA</i>"]
    SRC --> CLI["cli/<br/><i>CLI entry points</i>"]
    SRC --> SRV["server.ts<br/><i>Express API server</i>"]
    
    PUB --> HTML["index.html"]
    PUB --> CSS["style.css"]
    PUB --> JS["app.js"]

    style ROOT fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style SRC fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style PUB fill:#1a1a2e,stroke:#4fc3f7,color:#e0e0e0
    style LEX fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style PAR fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style AST2 fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style OBF fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
    style CMP fill:#0d2137,stroke:#81d4fa,color:#e0e0e0
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

Start the built-in server with live browser interface:

```bash
node dist/server.js
```

Open [http://localhost:3000](http://localhost:3000) to access the obfuscation dashboard.

### CLI Usage

**Obfuscate a file:**

```bash
npm run obfuscate -- input.lua
```

**Lex tokens:**

```bash
npm run lex -- input.lua
```

**Parse AST:**

```bash
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

Obfuscates Luau source code with configurable options.

```json
{
  "code": "local function greet(name) print('Hello ' .. name) end",
  "options": {
    "noRename": false,
    "noPreserve": false,
    "encodeStrings": true,
    "scramble": true,
    "oneLine": false,
    "vmType": "register",
    "vmLevel": "normal"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `noRename` | `boolean` | `false` | Skip identifier renaming |
| `noPreserve` | `boolean` | `false` | Don't preserve Roblox globals |
| `encodeStrings` | `boolean` | `false` | Enable string encoding pass |
| `scramble` | `boolean` | `false` | Enable control flow scrambling |
| `oneLine` | `boolean` | `false` | Minify output to a single line |
| `vmType` | `string` | `"none"` | VM type: `"none"`, `"stack"`, or `"register"` |
| `vmLevel` | `string` | `"normal"` | Protection level: `"debug"`, `"normal"`, or `"maximum"` |

---

## Programmatic Usage

```typescript
import {
  lex,
  parse,
  obfuscate,
  printChunk,
  compile,
  generateVM,
} from "quantum-obfuscator";

// Basic obfuscation
const { tokens } = lex('local x = "hello world"');
const ast = parse(tokens);
const obfuscated = obfuscate(ast, { renameLocals: true, preserveGlobals: true });
const output = printChunk(obfuscated);

// VM-protected obfuscation
const bytecode = compile(obfuscated);
const vmOutput = generateVM(bytecode, { level: "normal" });
```

---

## How It Works

### 1. Lexer

The lexer tokenizes raw Luau source into a stream of typed tokens. It handles all Luau-specific syntax including:
- Long strings and comments (`[==[...]==]`)
- String interpolation (`` `Hello {name}` ``)
- Type annotation tokens (`::`, `->`, `?`)
- Compound operators (`+=`, `-=`, `*=`, etc.)

### 2. Parser

A hand-written recursive descent parser converts the token stream into a complete AST. It supports:
- Full statement and expression grammar
- Type annotations with generics (`Array<{key: string}>`)
- If-else expressions (`if cond then a else b`)
- Type function statements
- Export type declarations

### 3. Obfuscation Passes

| Pass | Module | Description |
|------|--------|-------------|
| **Identifier Renaming** | `Obfuscator.ts` | Scope-aware renaming of local variables, function parameters, and loop variables. Preserves Roblox globals by default. |
| **String Encoding** | `StringEncoder.ts` | Replaces string literals with XOR-encoded equivalents and injects runtime decoding logic. |
| **Control Flow Scrambling** | `ControlFlowScrambler.ts` | Restructures linear control flow into dispatch-table loops with opaque predicates. |

### 4. Virtual Machines

The VM layer compiles the obfuscated AST into bytecode and wraps it in a self-contained Luau script that executes at runtime:

| Architecture | Compiler | Generator | Key Traits |
|-------------|----------|-----------|------------|
| **Stack-Based** | `Compiler.ts` | `vm-gen.ts` | Push/pop operand stack, simpler instruction set |
| **Register-Based** | `RegCompiler.ts` | `reg-vm-gen.ts` | Register allocation, fewer instructions, polymorphic dispatch |

Both VMs support three protection levels:

- **Debug** — Readable output with named opcodes for development
- **Normal** — Shuffled opcode mapping, encoded constants, flattened control flow
- **Maximum** — Full polymorphic dispatch, LZMA-compressed bytecode, anti-tamper checks

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
