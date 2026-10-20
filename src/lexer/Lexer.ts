import type {
  Token,
  KeywordToken,
  IdentifierToken,
  NumberToken,
  StringToken,
  InterpPartToken,
  PunctuatorToken,
  EOFToken,
  SourceLocation,
} from "../tokens.js";
import {
  KEYWORDS,
  MULTI_CHAR_OPERATORS,
  SINGLE_CHAR_OPERATORS,
} from "../tokens.js";
import type { Position, LexError } from "./types.js";

export interface SourceComment {
  text: string;
  loc: SourceLocation;
  long: boolean;
}

export interface LexResult {
  tokens: Token[];
  errors: LexError[];
  comments: SourceComment[];
}

export class Lexer {
  private source: string;
  private pos: Position;
  private tokens: Token[] = [];
  private errors: LexError[] = [];
  private comments: SourceComment[] = [];

  constructor(source: string) {
    this.source = source;
    this.pos = { line: 1, column: 1, offset: 0 };
  }

  lex(): LexResult {
    while (this.pos.offset < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos.offset >= this.source.length) break;

      const start = this.clonePos();
      const token = this.readToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    const end = this.clonePos();
    this.tokens.push({
      type: "EOF",
      loc: { start: end, end },
    } as EOFToken);

    return { tokens: this.tokens, errors: this.errors, comments: this.comments };
  }

  private clonePos(): Position {
    return { ...this.pos };
  }

  private loc(start: Position, end: Position): SourceLocation {
    return { start, end };
  }

  private peek(offset = 0): string {
    const i = this.pos.offset + offset;
    return i < this.source.length ? this.source[i]! : "\0";
  }

  private advance(): string {
    if (this.pos.offset >= this.source.length) return "\0";
    const ch = this.source[this.pos.offset]!;
    this.pos.offset++;
    if (ch === "\n") {
      this.pos.line++;
      this.pos.column = 1;
    } else {
      this.pos.column++;
    }
    return ch;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos.offset < this.source.length) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        this.advance();
        continue;
      }
      if (ch === "-" && this.peek(1) === "-") {
        this.skipComment();
        continue;
      }
      break;
    }
  }

  private skipComment(): void {
    const start = this.clonePos();
    const startOffset = this.pos.offset;
    this.advance();
    this.advance();
    const ch = this.peek();
    if (ch === "[") {
      const eqCount = this.readLongBracketStart();
      if (eqCount >= 0) {
        this.skipLongComment(eqCount);
        this.recordComment(start, startOffset, true);
        return;
      }
    }
    while (this.pos.offset < this.source.length && this.peek() !== "\n") {
      this.advance();
    }
    this.recordComment(start, startOffset, false);
  }

  private recordComment(start: Position, startOffset: number, long: boolean): void {
    this.comments.push({
      text: this.source.slice(startOffset, this.pos.offset),
      loc: this.loc(start, this.clonePos()),
      long,
    });
  }

  private readLongBracketStart(): number {
    let eqCount = 0;
    let i = 1;
    while (this.peek(i) === "=") {
      eqCount++;
      i++;
    }
    if (this.peek(i) !== "[") return -1;
    for (let j = 0; j < i + 1; j++) this.advance();
    return eqCount;
  }

  private skipLongComment(eqCount: number): void {
    const endSeq = "]" + "=".repeat(eqCount) + "]";
    let i = 0;
    while (this.pos.offset < this.source.length) {
      if (this.source[this.pos.offset] === endSeq[i]) {
        i++;
        this.advance();
        if (i === endSeq.length) return;
      } else if (i > 0) {
        i = 0;
        // Don't advance — re-check current char against endSeq[0]
      } else {
        this.advance();
      }
    }
    this.addError("Unclosed long comment");
  }

  private addError(message: string): void {
    const start = this.clonePos();
    this.errors.push({
      message,
      loc: { start, end: start },
      code: "E001",
    });
  }

  private readToken(): Token | null {
    const start = this.clonePos();
    const ch = this.peek();

    if (this.isLetter(ch) || ch === "_") {
      return this.readIdentifierOrKeyword(start);
    }
    if (this.isDigit(ch) || (ch === "." && this.isDigit(this.peek(1)))) {
      const num = this.readNumber(start);
      if (num) return num;
      return null;
    }
    if (ch === '"' || ch === "'") {
      return this.readShortString(start);
    }
    if (ch === "[" && (this.peek(1) === "[" || this.peek(1) === "=")) {
      return this.readLongString(start);
    }
    if (ch === "`") {
      return this.readBacktickString(start);
    }

    const op = this.tryReadOperator(ch);
    if (op) {
      const end = this.clonePos();
      return { type: "Punctuator", value: op, loc: this.loc(start, end) } as PunctuatorToken;
    }

    this.addError(`Unexpected character: ${JSON.stringify(ch)}`);
    this.advance();
    return null;
  }

  private isLetter(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isIdentCont(ch: string): boolean {
    return this.isLetter(ch) || this.isDigit(ch) || ch === "_";
  }

  private readIdentifierOrKeyword(start: Position): IdentifierToken | KeywordToken {
    const startOff = this.pos.offset;
    while (this.pos.offset < this.source.length && this.isIdentCont(this.source[this.pos.offset]!)) {
      this.pos.offset++;
      this.pos.column++;
    }
    const value = this.source.substring(startOff, this.pos.offset);
    const end = { line: this.pos.line, column: this.pos.column, offset: this.pos.offset };

    if (KEYWORDS.has(value)) {
      return {
        type: "Keyword",
        value,
        loc: this.loc(start, end),
      } as KeywordToken;
    }

    return {
      type: "Identifier",
      value,
      loc: this.loc(start, end),
    } as IdentifierToken;
  }

  private readNumber(start: Position): NumberToken | null {
    let raw = "";
    const ch = this.peek();

    if (ch === "0" && (this.peek(1) === "x" || this.peek(1) === "X")) {
      raw += this.advance();
      raw += this.advance();
      while (
        this.pos.offset < this.source.length &&
        (this.isHexDigit(this.peek()) || this.peek() === "_")
      ) {
        raw += this.advance();
      }
      if (this.peek() === "." && this.isHexDigit(this.peek(2))) {
        raw += this.advance();
        while (
          this.pos.offset < this.source.length &&
          (this.isHexDigit(this.peek()) || this.peek() === "_")
        ) {
          raw += this.advance();
        }
      }
      if (this.peek() === "p" || this.peek() === "P") {
        raw += this.advance();
        if (this.peek() === "+" || this.peek() === "-") raw += this.advance();
        while (this.pos.offset < this.source.length && this.isDigit(this.peek())) {
          raw += this.advance();
        }
      }
    } else if (ch === "0" && (this.peek(1) === "b" || this.peek(1) === "B")) {
      raw += this.advance();
      raw += this.advance();
      while (
        this.pos.offset < this.source.length &&
        (this.isBinaryDigit(this.peek()) || this.peek() === "_")
      ) {
        raw += this.advance();
      }
    } else {
      while (
        this.pos.offset < this.source.length &&
        (this.isDigit(this.peek()) || this.peek() === "_")
      ) {
        raw += this.advance();
      }
      if (this.peek() === "." && this.isDigit(this.peek(1))) {
        raw += this.advance();
        while (
          this.pos.offset < this.source.length &&
          (this.isDigit(this.peek()) || this.peek() === "_")
        ) {
          raw += this.advance();
        }
      }
      if (this.peek() === "e" || this.peek() === "E") {
        raw += this.advance();
        if (this.peek() === "+" || this.peek() === "-") raw += this.advance();
        while (this.pos.offset < this.source.length && this.isDigit(this.peek())) {
          raw += this.advance();
        }
      }
    }

    if (raw === "") {

      this.advance();
      return null;
    }
    const end = this.clonePos();
    const valueStr = raw.replace(/_/g, "");
    return {
      type: "Number",
      value: valueStr,
      raw,
      loc: this.loc(start, end),
    } as NumberToken;
  }

  private isHexDigit(ch: string): boolean {
    return (
      (ch >= "0" && ch <= "9") ||
      (ch >= "a" && ch <= "f") ||
      (ch >= "A" && ch <= "F")
    );
  }

  private isBinaryDigit(ch: string): boolean {
    return ch === "0" || ch === "1";
  }

  private readShortString(start: Position): StringToken {
    const quote = this.advance();
    let value = "";
    let raw = quote;

    while (this.pos.offset < this.source.length) {
      const ch = this.peek();
      if (ch === quote) {
        raw += this.advance();
        break;
      }
      if (ch === "\\") {
        const escaped = this.readEscapeSequence(quote === '"');
        value += escaped.value;
        raw += escaped.raw;
        continue;
      }
      if (ch === "\n" || ch === "\0") {
        this.addError("Unclosed string literal");
        break;
      }
      value += this.advance();
      raw += ch;
    }

    const end = this.clonePos();
    return {
      type: "String",
      value,
      raw,
      loc: this.loc(start, end),
    } as StringToken;
  }

  private readEscapeSequence(inDoubleQuote: boolean): { value: string; raw: string } {
    let raw = this.advance();
    const ch = this.peek();
    raw += this.advance();

    switch (ch) {
      case "n":
        return { value: "\n", raw };
      case "r":
        return { value: "\r", raw };
      case "t":
        return { value: "\t", raw };
      case "a":
        return { value: "\x07", raw };
      case "b":
        return { value: "\b", raw };
      case "f":
        return { value: "\f", raw };
      case "v":
        return { value: "\v", raw };
      case "\\":
        return { value: "\\", raw };
      case '"':
        return { value: '"', raw };
      case "'":
        return { value: "'", raw };
      case "z":
        while (this.pos.offset < this.source.length) {
          const c = this.peek();
          if (c === " " || c === "\t" || c === "\n" || c === "\r") {
            raw += this.advance();
          } else break;
        }
        return { value: "", raw };
      case "x": {
        let hex = "";
        for (let i = 0; i < 2 && this.isHexDigit(this.peek()); i++) {
          hex += this.advance();
          raw += this.source[this.pos.offset - 1];
        }
        const code = parseInt(hex, 16);
        return { value: isNaN(code) ? "\\x" + hex : String.fromCharCode(code), raw };
      }
      case "u": {
        if (this.peek() !== "{") {
          return { value: "\\u", raw };
        }
        raw += this.advance();
        let hex = "";
        while (this.isHexDigit(this.peek())) {
          hex += this.advance();
          raw += this.source[this.pos.offset - 1];
        }
        if (this.peek() !== "}") {
          this.addError("Invalid \\u{...} escape");
          return { value: "", raw };
        }
        raw += this.advance();
        const code = parseInt(hex, 16);
        // String.fromCodePoint throws above 0x10FFFF (e.g. \u{110000}).
        // Report instead of throwing so callers (CLI exit codes, server 400
        // mapping, validate()) see a normal LexError. The pre-existing
        // isNaN path below is left exactly as-is; values above the domain
        // stay unsupported, consistent with it.
        if (code > 0x10FFFF) {
          this.addError("Invalid \\u{...} escape");
          return { value: "", raw };
        }
        return {
          value: isNaN(code) ? "" : String.fromCodePoint(code),
          raw,
        };
      }
      default:
        if (ch >= "0" && ch <= "9") {
          let dec = ch;
          for (let i = 0; i < 2 && this.isDigit(this.peek()); i++) {
            const d = this.advance();
            dec += d;
            raw += d;
          }
          const code = parseInt(dec, 10);
          if (code <= 255) {
            return { value: String.fromCharCode(code), raw };
          }
        }
        return { value: ch, raw };
    }
  }

  private readLongString(start: Position): StringToken {
    this.advance();
    let eqCount = 0;
    while (this.peek() === "=") {
      eqCount++;
      this.advance();
    }
    if (this.peek() !== "[") {
      this.addError("Invalid long string start");
      return {
        type: "String",
        value: "",
        raw: "",
        loc: this.loc(start, this.clonePos()),
      } as StringToken;
    }
    this.advance();
    if (this.peek() === "\n") this.advance();

    const endSeq = "]" + "=".repeat(eqCount) + "]";
    let value = "";
    let i = 0;

    while (this.pos.offset < this.source.length) {
      const ch = this.peek();
      if (ch === endSeq[i]) {
        i++;
        this.advance();
        if (i === endSeq.length) break;
      } else {
        if (i > 0) {
          value += endSeq.slice(0, i);
          i = 0;
          // Don't advance — re-check current char against endSeq[0]
        } else if (ch !== "\0") {
          value += this.advance();
        } else {
          this.addError("Unclosed long string");
          break;
        }
      }
    }

    if (i < endSeq.length && this.pos.offset >= this.source.length) {
      this.addError("Unclosed long string");
    }

    const end = this.clonePos();
    return {
      type: "String",
      value,
      raw: `[${"=".repeat(eqCount)}[${value}]${"=".repeat(eqCount)}]`,
      loc: this.loc(start, end),
    } as StringToken;
  }

  private readBacktickString(start: Position): StringToken | null {
    this.advance();
    let value = "";
    let raw = "`";
    let hasInterpolation = false;

    while (this.pos.offset < this.source.length) {
      const ch = this.peek();
      if (ch === "`") {
        raw += this.advance();
        break;
      }
      if (ch === "{") {
        if (this.peek(1) === "{") {
          this.addError("{{ is invalid in interpolated string");
          raw += this.advance();
          raw += this.advance();
          value += "{{";
        } else {
          hasInterpolation = true;
          break;
        }
        continue;
      }
      if (ch === "\\") {
        const next = this.peek(1);
        if (next === "`" || next === "{" || next === "\\") {
          raw += this.advance();
          raw += this.advance();
          value += next;
          continue;
        }
        if (next === "\n") {
          raw += this.advance();
          raw += this.advance();
          value += "\n";
          continue;
        }
        raw += this.advance();
        raw += this.advance();
        value += next || "";
        continue;
      }
      if (ch === "\0") {
        this.addError("Unclosed backtick string");
        break;
      }
      value += this.advance();
      raw += ch;
    }

    if (!hasInterpolation) {
      const end = this.clonePos();
      return {
        type: "String",
        value,
        raw,
        loc: this.loc(start, end),
      } as StringToken;
    }

    this.readBacktickStringWithInterpolation(start, value);
    return null;
  }

  private readBacktickStringWithInterpolation(outerStart: Position, firstPart: string): void {
    const partStart = { ...this.pos, offset: this.pos.offset - firstPart.length };
    this.tokens.push({
      type: "InterpPart",
      value: firstPart,
      loc: this.loc(partStart, this.clonePos()),
    } as InterpPartToken);

    while (this.pos.offset < this.source.length) {
      const ch = this.peek();
      if (ch === "`") {
        this.advance();
        return;
      }
      if (ch === "{") {
        if (this.peek(1) === "{") {
          this.addError("{{ is invalid in interpolated string");
          this.advance();
          this.advance();
          this.tokens.push({
            type: "InterpPart",
            value: "{{",
            loc: this.loc(this.clonePos(), this.clonePos()),
          } as InterpPartToken);
          continue;
        }
        const braceStart = this.clonePos();
        this.advance();
        this.tokens.push({
          type: "Punctuator",
          value: "{",
          loc: this.loc(braceStart, this.clonePos()),
        } as PunctuatorToken);

        const expEnd = this.findMatchingBrace();
        if (expEnd < 0) {
          this.addError("Unclosed { in interpolated string");
          return;
        }
        const expSource = this.source.slice(this.pos.offset, expEnd);
        const baseOffset = this.pos.offset;
        const baseLine = this.pos.line;
        const baseColumn = this.pos.column;
        const subLex = new Lexer(expSource);
        const subResult = subLex.lex();

        for (const err of subResult.errors) {
          err.loc.start.offset += baseOffset;
          err.loc.end.offset += baseOffset;
          if (err.loc.start.line === 1) {
            err.loc.start.column += baseColumn - 1;
          }
          err.loc.start.line += baseLine - 1;
          if (err.loc.end.line === 1) {
            err.loc.end.column += baseColumn - 1;
          }
          err.loc.end.line += baseLine - 1;
          this.errors.push(err);
        }

        for (const t of subResult.tokens) {
          if (t.type === "EOF") continue;

          t.loc.start.offset += baseOffset;
          t.loc.end.offset += baseOffset;
          if (t.loc.start.line === 1) {
            t.loc.start.column += baseColumn - 1;
          }
          t.loc.start.line += baseLine - 1;
          if (t.loc.end.line === 1) {
            t.loc.end.column += baseColumn - 1;
          }
          t.loc.end.line += baseLine - 1;
          this.tokens.push(t);
        }

        for (let ci = this.pos.offset; ci < expEnd; ci++) {
          if (this.source[ci] === '\n') {
            this.pos.line++;
            this.pos.column = 1;
          } else {
            this.pos.column++;
          }
        }
        this.pos.offset = expEnd;
        const closeStart = this.clonePos();
        this.advance();
        this.tokens.push({
          type: "Punctuator",
          value: "}",
          loc: this.loc(closeStart, this.clonePos()),
        } as PunctuatorToken);
        continue;
      }
      if (ch === "\\") {
        const next = this.peek(1);
        if (next === "`" || next === "{" || next === "\\") {
          this.advance();
          this.advance();
          const partStart2 = this.clonePos();
          this.tokens.push({
            type: "InterpPart",
            value: next,
            loc: this.loc(partStart2, this.clonePos()),
          } as InterpPartToken);
          continue;
        }
        if (next === "\n") {
          this.advance();
          this.advance();
          const partStart2 = this.clonePos();
          this.tokens.push({
            type: "InterpPart",
            value: "\n",
            loc: this.loc(partStart2, this.clonePos()),
          } as InterpPartToken);
          continue;
        }
        this.advance();
        this.advance();
        continue;
      }
      let partValue = "";
      const partStart3 = this.clonePos();
      while (this.pos.offset < this.source.length) {
        const c = this.peek();
        if (c === "`" || c === "{" || c === "\\") break;
        if (c === "\0") break;
        partValue += this.advance();
      }
      if (partValue) {
        this.tokens.push({
          type: "InterpPart",
          value: partValue,
          loc: this.loc(partStart3, this.clonePos()),
        } as InterpPartToken);
      }
    }
  }

  private findMatchingBrace(): number {
    let depth = 1;
    let i = this.pos.offset;
    while (i < this.source.length) {
      const ch = this.source[i];
      if (ch === "-" && this.source[i + 1] === "-") {
        i += 2;
        if (this.source[i] === "[") {
          const eqCount = this.readLongBracketStartAt(i);
          if (eqCount >= 0) {
            i = this.findLongBracketEnd(i, eqCount);
            continue;
          }
        }
        while (i < this.source.length && this.source[i] !== "\n") {
          i++;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < this.source.length) {
          const c = this.source[i];
          if (c === "\\") {
            i += 2;
            continue;
          }
          if (c === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }
      if (ch === "`") {
        i++;
        while (i < this.source.length && this.source[i] !== "`") {
          if (this.source[i] === "\\") {
            i += 2;
            continue;
          }
          if (this.source[i] === "{") {
            i++;
            let nestedDepth = 1;
            while (i < this.source.length && nestedDepth > 0) {
              const c = this.source[i];
              if (c === '"' || c === "'") {
                const quote = c;
                i++;
                while (i < this.source.length) {
                  const sc = this.source[i];
                  if (sc === "\\") { i += 2; continue; }
                  if (sc === quote) { i++; break; }
                  i++;
                }
                continue;
              }
              if (c === "-" && this.source[i + 1] === "-") {
                i += 2;
                if (this.source[i] === "[") {
                  const eq = this.readLongBracketStartAt(i);
                  if (eq >= 0) { i = this.findLongBracketEnd(i, eq); continue; }
                }
                while (i < this.source.length && this.source[i] !== "\n") i++;
                continue;
              }
              if (c === "{") nestedDepth++;
              else if (c === "}") nestedDepth--;
              else if (c === "\\") i++;
              if (nestedDepth > 0) i++;
            }
            if (i < this.source.length) i++;
            continue;
          }
          i++;
        }
        if (i < this.source.length) i++;
        continue;
      }
      if (ch === "[" && (this.source[i + 1] === "[" || this.source[i + 1] === "=")) {
        const eqCount = this.readLongBracketStartAt(i);
        if (eqCount >= 0) {
          i = this.findLongBracketEnd(i, eqCount);
          continue;
        }
      }
      if (ch === "{") {
        depth++;
        i++;
        continue;
      }
      if (ch === "}") {
        depth--;
        if (depth === 0) return i;
        i++;
        continue;
      }
      if (ch === "(" || ch === "[") {
        const open = ch;
        const close = ch === "(" ? ")" : "]";
        let d = 1;
        i++;
        while (i < this.source.length && d > 0) {
          const c = this.source[i];
          if (c === open) d++;
          else if (c === close) d--;
          i++;
        }
        continue;
      }
      i++;
    }
    return -1;
  }

  private tryReadOperator(ch: string): string | null {
    const c2 = this.peek(1);
    switch (ch) {
      case "+": this.advance(); if (c2 === "=") { this.advance(); return "+="; } return "+";
      case "-": this.advance(); if (c2 === "=") { this.advance(); return "-="; } if (c2 === ">") { this.advance(); return "->"; } return "-";
      case "*": this.advance(); if (c2 === "=") { this.advance(); return "*="; } return "*";
      case "/": this.advance(); if (c2 === "/") { this.advance(); if (this.peek() === "=") { this.advance(); return "//="; } return "//"; } if (c2 === "=") { this.advance(); return "/="; } return "/";
      case "%": this.advance(); if (c2 === "=") { this.advance(); return "%="; } return "%";
      case "^": this.advance(); if (c2 === "=") { this.advance(); return "^="; } return "^";
      case "<": this.advance(); if (c2 === "=") { this.advance(); return "<="; } return "<";
      case ">": this.advance(); if (c2 === "=") { this.advance(); return ">="; } return ">";
      case "=": this.advance(); if (c2 === "=") { this.advance(); return "=="; } return "=";
      case "~": this.advance(); if (c2 === "=") { this.advance(); return "~="; } return "~";
      case ".": this.advance(); if (c2 === ".") { this.advance(); const c3 = this.peek(); if (c3 === ".") { this.advance(); return "..."; } if (c3 === "=") { this.advance(); return "..="; } return ".."; } return ".";
      case ":": this.advance(); if (c2 === ":") { this.advance(); return "::"; } return ":";
      case "#": this.advance(); return "#";
      case ",": this.advance(); return ",";
      case ";": this.advance(); return ";";
      case "(": this.advance(); return "(";
      case ")": this.advance(); return ")";
      case "[": this.advance(); return "[";
      case "]": this.advance(); return "]";
      case "{": this.advance(); return "{";
      case "}": this.advance(); return "}";
      case "|": this.advance(); return "|";
      case "&": this.advance(); return "&";
      case "?": this.advance(); return "?";
      case "@": this.advance(); return "@";
      default: return null;
    }
  }

  private readLongBracketStartAt(offset: number): number {
    let eqCount = 0;
    let i = offset + 1;
    while (this.source[i] === "=") {
      eqCount++;
      i++;
    }
    return this.source[i] === "[" ? eqCount : -1;
  }

  private findLongBracketEnd(offset: number, eqCount: number): number {
    const endSeq = "]" + "=".repeat(eqCount) + "]";
    let i = offset;
    while (i < this.source.length) {
      if (this.source.slice(i, i + endSeq.length) === endSeq) {
        return i + endSeq.length;
      }
      i++;
    }
    return this.source.length;
  }
}

export function lex(source: string): LexResult {
  return new Lexer(source).lex();
}
