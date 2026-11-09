// Calculator: Standard, Scientific and Programmer. Mode, angle unit, base, memory and history are
// the shared data.calculator store (macOS Calculator); the entry being typed is local UI state.
import React, { useState } from "react";
import { newId } from "../../../ocean/world-helpers";
import { syncedOp, useSynced } from "../../../ocean/synced";
import { Fa, OceanApp } from "./ocean/ui";
import "./ocean/calculator.scss";

const MODES = [
  ["basic", "Standard", "faCalculator"],
  ["scientific", "Scientific", "faFlask"],
  ["programmer", "Programmer", "faCode"],
];
const BASES = [
  [16, "HEX"],
  [10, "DEC"],
  [8, "OCT"],
  [2, "BIN"],
];
// Binary operators: [precedence, right-associative].
const OPS = { "|": [1], xor: [2], "&": [3], "<<": [4], ">>": [4], "+": [5], "-": [5], "×": [6], "÷": [6], mod: [6], "^": [7, true] };
const OP_LABEL = { "|": "OR", "&": "AND", xor: "XOR", "<<": "Lsh", ">>": "Rsh", "^": "^", mod: "mod" };

// Key layouts: [key, label, kind]. kind: num, op, fn, eq.
const K = (key, label = key, kind = /^[0-9A-F.]$/.test(key) ? "num" : "op") => [key, label, kind];
const LAYOUTS = {
  basic: [
    K("%"), K("CE"), K("C"), K("back", <Fa i="faDeleteLeft" key="b" />),
    K("inv", "¹⁄ₓ"), K("sq", "x²"), K("sqrt", "²√x"), K("÷"),
    K("7"), K("8"), K("9"), K("×"),
    K("4"), K("5"), K("6"), K("-", "−"),
    K("1"), K("2"), K("3"), K("+"),
    K("neg", "+/−", "num"), K("0"), K("."), K("=", "=", "eq"),
  ],
  scientific: [
    K("sin"), K("cos"), K("tan"), K("π"), K("e"),
    K("sq", "x²"), K("inv", "¹⁄ₓ"), K("abs", "|x|"), K("C"), K("back", <Fa i="faDeleteLeft" key="b" />),
    K("sqrt", "²√x"), K("("), K(")"), K("fact", "n!"), K("÷"),
    K("^", "xʸ"), K("7"), K("8"), K("9"), K("×"),
    K("pow10", "10ˣ"), K("4"), K("5"), K("6"), K("-", "−"),
    K("log"), K("1"), K("2"), K("3"), K("+"),
    K("ln"), K("neg", "+/−", "num"), K("0"), K("."), K("=", "=", "eq"),
  ],
  programmer: [
    K("&", "AND"), K("|", "OR"), K("xor", "XOR"), K("not", "NOT"), K("C"), K("back", <Fa i="faDeleteLeft" key="b" />),
    K("<<", "Lsh"), K(">>", "Rsh"), K("A"), K("B"), K("("), K(")"),
    K("C_", "C", "num"), K("D"), K("7"), K("8"), K("9"), K("÷"),
    K("E"), K("F"), K("4"), K("5"), K("6"), K("×"),
    K("mod"), K("CE"), K("1"), K("2"), K("3"), K("-", "−"),
    K("neg", "+/−", "num"), K("0"), K("00", "00", "num"), K("%"), K("+"), K("=", "=", "eq"),
  ],
};
const COLS = { basic: 4, scientific: 5, programmer: 6 };
const KEYMAP = { Enter: "=", "=": "=", Backspace: "back", Escape: "C", Delete: "CE", "*": "×", "/": "÷", "+": "+", "-": "-", ".": ".", "%": "%", "(": "(", ")": ")", "^": "^" };

const fact = (n) => (n < 0 || n > 170 || n % 1 ? NaN : Array.from({ length: n }, (_, i) => i + 1).reduce((a, b) => a * b, 1));
const int64 = (n) => Number(BigInt.asIntN(64, BigInt(Math.trunc(n))));
const toBase = (n, base) =>
  base == 10 ? String(Math.trunc(n)) : BigInt.asUintN(64, BigInt(Math.trunc(n))).toString(base).toUpperCase();
const fromBase = (s, base) => {
  if (base == 10) return parseInt(s, 10) || 0;
  return Number(BigInt.asIntN(64, BigInt((base == 16 ? "0x" : base == 8 ? "0o" : "0b") + (s.replace(/^-/, "") || "0")))) * (s[0] == "-" ? -1 : 1);
};

const binary = (op, a, b, prog) => {
  const r =
    op == "+" ? a + b : op == "-" ? a - b : op == "×" ? a * b : op == "÷" ? (b == 0 ? NaN : prog ? Math.trunc(a / b) : a / b)
      : op == "^" ? a ** b : op == "mod" ? (b == 0 ? NaN : a % b)
      : Number(op == "&" ? BigInt(a) & BigInt(b) : op == "|" ? BigInt(a) | BigInt(b) : op == "xor" ? BigInt(a) ^ BigInt(b)
        : op == "<<" ? BigInt.asIntN(64, BigInt(a) << BigInt(b)) : BigInt(a) >> BigInt(b));
  return prog && Number.isFinite(r) ? int64(r) : r;
};

// Shunting-yard over [{n}, {op}, {p: "("|")"}] tokens.
const evaluate = (tokens, prog) => {
  const out = [];
  const ops = [];
  const reduce = () => {
    const op = ops.pop();
    const b = out.pop();
    const a = out.pop();
    out.push(binary(op, a, b, prog));
  };
  for (const t of tokens) {
    if ("n" in t) out.push(t.n);
    else if (t.p == "(") ops.push("(");
    else if (t.p == ")") {
      while (ops.length && ops[ops.length - 1] != "(") reduce();
      ops.pop();
    } else {
      const [p, right] = OPS[t.op];
      while (ops.length && ops[ops.length - 1] != "(" && (OPS[ops[ops.length - 1]][0] > p || (!right && OPS[ops[ops.length - 1]][0] == p))) reduce();
      ops.push(t.op);
    }
  }
  while (ops.length) ops[ops.length - 1] == "(" ? ops.pop() : reduce();
  return out.length == 1 ? out[0] : NaN;
};

const CalculatorApp = () => {
  const calc = useSynced("calculator");
  const { mode, angle, base, memory } = calc;
  const prog = mode == "programmer";
  const radix = prog ? base : 10;
  const [tokens, setTokens] = useState([]);
  const [entry, setEntry] = useState("0");
  const [label, setLabel] = useState(null); // shown in the equation line for a function result
  const [fresh, setFresh] = useState(true);
  const [done, setDone] = useState(null); // equation line after "="
  const [err, setErr] = useState(null);
  const [nav, setNav] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  const fmt = (n) => (prog ? toBase(n, radix) : String(parseFloat(n.toPrecision(15))));
  const value = () => (prog ? fromBase(entry, radix) : parseFloat(entry) || 0);
  const setSettings = (patch) => syncedOp("calculator", "set", { mode, angle, base, memory, ...patch });
  const reset = () => (setTokens([]), setEntry("0"), setLabel(null), setFresh(true), setDone(null), setErr(null));
  const show = (n, lbl) => {
    if (!Number.isFinite(n)) return setErr(n == Infinity || n == -Infinity ? "Overflow" : "Invalid input");
    setEntry(fmt(n));
    setLabel(lbl);
    setFresh(true);
  };
  const tokenLabel = (t) => ("n" in t ? t.label : t.p || OP_LABEL[t.op] || t.op);
  const equation = (list) => list.map(tokenLabel).join(" ") + (prog && radix != 10 ? ` (${BASES.find((b) => b[0] == radix)[1]})` : "");
  // Tokens with the current entry appended, unless the last token already ends an operand.
  const withEntry = () => {
    const last = tokens[tokens.length - 1];
    if (last && ("n" in last || last.p == ")") && fresh && !done) return tokens;
    return [...tokens, { n: value(), label: label || entry }];
  };

  const unary = (key) => {
    const v = value();
    const rad = angle == "deg" ? (v * Math.PI) / 180 : v;
    const fns = {
      sq: [v * v, `sqr(${entry})`], sqrt: [v < 0 ? NaN : Math.sqrt(v), `√(${entry})`], inv: [v == 0 ? NaN : 1 / v, `1/(${entry})`],
      sin: [Math.sin(rad), `sin${angle == "deg" ? "₀" : "ᵣ"}(${entry})`], cos: [Math.cos(rad), `cos${angle == "deg" ? "₀" : "ᵣ"}(${entry})`],
      tan: [Math.tan(rad), `tan${angle == "deg" ? "₀" : "ᵣ"}(${entry})`], log: [Math.log10(v), `log(${entry})`], ln: [Math.log(v), `ln(${entry})`],
      fact: [fact(v), `fact(${entry})`], abs: [Math.abs(v), `abs(${entry})`], pow10: [10 ** v, `10^(${entry})`],
      not: [int64(Number(~BigInt(Math.trunc(v)))), `NOT(${entry})`],
      "%": [(() => { const left = [...tokens].reverse().find((t) => "n" in t); return left ? (left.n * v) / 100 : v / 100; })(), null],
    };
    const [r, lbl] = fns[key];
    if (done) setDone(null);
    show(Math.abs(r) < 1e-15 ? 0 : r, lbl);
  };

  const press = (key) => {
    if (err) {
      if (key != "C" && key != "CE") return;
      return reset();
    }
    if (key == "C") return reset();
    if (key == "CE") return (setEntry("0"), setLabel(null), setFresh(true));
    if (key == "back") {
      if (fresh) return;
      const next = entry.slice(0, -1);
      return setEntry(next == "" || next == "-" ? "0" : next);
    }
    const digit = key == "C_" ? "C" : key;
    if (/^([0-9A-F]|00|\.)$/.test(digit)) {
      if (/[A-F]/.test(digit) && radix != 16) return;
      if (/[2-9]/.test(digit) && radix == 2) return;
      if (/[89]/.test(digit) && radix == 8) return;
      if (digit == "." && prog) return;
      if (done) (setTokens([]), setDone(null));
      let next = fresh ? (digit == "." ? "0." : digit == "00" ? "0" : digit) : entry + digit;
      if (!fresh && entry == "0" && digit != ".") next = digit == "00" ? "0" : digit;
      if (digit == "." && !fresh && entry.includes(".")) return;
      if (next.replace(/^-/, "").length > (radix == 2 ? 64 : 16)) return;
      setEntry(next);
      setLabel(null);
      setFresh(false);
      return;
    }
    if (key == "neg") return show(-value(), label ? `negate(${label})` : null);
    if (key == "π" || key == "e") return show(key == "π" ? Math.PI : Math.E, key);
    if (key == "(") {
      if (done) (setTokens([]), setDone(null));
      return setTokens([...(done ? [] : tokens), { p: "(" }]);
    }
    if (key == ")") {
      const open = tokens.filter((t) => t.p == "(").length - tokens.filter((t) => t.p == ")").length;
      if (open <= 0) return;
      setTokens([...withEntry(), { p: ")" }]);
      return setFresh(true);
    }
    if (OPS[key]) {
      const base = done ? [{ n: value(), label: entry }] : withEntry();
      const last = tokens[tokens.length - 1];
      const list = !done && last && last.op && fresh && !label ? [...tokens.slice(0, -1), { op: key }] : [...base, { op: key }];
      setTokens(list);
      setDone(null);
      setFresh(true);
      setLabel(null);
      return;
    }
    if (key == "=") {
      if (done) return;
      let list = withEntry();
      const open = list.filter((t) => t.p == "(").length - list.filter((t) => t.p == ")").length;
      for (let i = 0; i < open; i++) list = [...list, { p: ")" }];
      if (list.length == 1) return;
      const r = evaluate(list, prog);
      const eq = equation(list);
      setTokens([]);
      setDone(eq + " =");
      if (!Number.isFinite(r)) return setErr(r == Infinity ? "Cannot divide by zero" : "Result is undefined");
      show(r, null);
      syncedOp("calculator", "record", { id: newId("c"), expr: eq.slice(0, 200), result: String(prog ? r : parseFloat(r.toPrecision(15))).slice(0, 80) });
      return;
    }
    unary(key);
  };

  const memoryKeys = {
    MC: () => setSettings({ memory: 0 }),
    MR: () => show(memory, null),
    "M+": () => setSettings({ memory: memory + value() }),
    "M−": () => setSettings({ memory: memory - value() }),
    MS: () => setSettings({ memory: value() }),
  };
  const switchBase = (b) => {
    const v = value();
    setSettings({ base: b });
    setEntry(toBase(v, b));
  };
  const switchMode = (m) => {
    setNav(false);
    reset();
    if (m != mode) setSettings({ mode: m });
  };

  const onKey = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const up = e.key.length == 1 ? e.key.toUpperCase() : e.key;
    const k = /^[0-9]$/.test(e.key) ? e.key : prog && /^[A-F]$/.test(up) ? (up == "C" ? "C_" : up) : KEYMAP[e.key];
    if (k) (e.preventDefault(), press(k));
  };
  const keys = LAYOUTS[mode] || LAYOUTS.basic;
  const current = prog ? value() : 0;

  return (
    <OceanApp className="cc-app" tabIndex={-1} onKeyDown={onKey} data-mode={mode}>
      <div className="oc-col oc-grow cc-main">
        <div className="cc-head oc-row">
          <button type="button" className="cc-ib" title="Open navigation" onClick={() => setNav(!nav)} data-testid="calc-nav">
            <Fa i="faBars" />
          </button>
          <span className="oc-h2 oc-grow">{MODES.find((m) => m[0] == mode)[1]}</span>
          <button type="button" className="cc-ib cc-hist-btn" title="History" onClick={() => setHistOpen(!histOpen)}>
            <Fa i="faClockRotateLeft" />
          </button>
        </div>
        {nav ? (
          <div className="cc-nav" onMouseLeave={() => setNav(false)}>
            <div className="oc-faint cc-nav-title">Calculator</div>
            {MODES.map(([id, name, icon]) => (
              <div key={id} className="cc-nav-item" data-active={id == mode} onClick={() => switchMode(id)} data-mode={id}>
                <Fa i={icon} />
                <span>{name}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="cc-display">
          <div className="cc-eq" data-testid="calc-eq">
            {done || [...tokens.map(tokenLabel), label].filter(Boolean).join(" ")}
          </div>
          <div className="cc-val" data-long={String(err || entry).length > 11} data-testid="calc-value">
            {err == null ? entry : err}
          </div>
        </div>
        {prog ? (
          <div className="cc-bases">
            {BASES.map(([b, name]) => (
              <div key={b} className="cc-base" data-active={b == radix} onClick={() => switchBase(b)}>
                <span className="cc-base-name">{name}</span>
                <span className="oc-ellipsis">{toBase(current, b)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="cc-mem oc-row">
            {mode == "scientific" ? (
              <button type="button" className="cc-mkey cc-angle" onClick={() => setSettings({ angle: angle == "deg" ? "rad" : "deg" })} title="Angle unit">
                {angle.toUpperCase()}
              </button>
            ) : null}
            {Object.entries(memoryKeys).map(([m, run]) => (
              <button key={m} type="button" className="cc-mkey" disabled={err != null || ((m == "MC" || m == "MR") && memory == 0)} onClick={run}>
                {m}
              </button>
            ))}
          </div>
        )}
        <div className="cc-keys" data-err={err != null} style={{ gridTemplateColumns: `repeat(${COLS[mode]}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${keys.length / COLS[mode]}, minmax(0, 1fr))` }}>
          {keys.map(([id, text, kind]) => {
            const disabled = (prog && /^[A-F]$|^C_$/.test(id) && radix != 16) || (prog && /^[89]$/.test(id) && radix < 10) || (prog && /^[2-7]$/.test(id) && radix == 2);
            return (
              <button key={id} type="button" className="cc-key" data-kind={kind} data-key={id} disabled={disabled} onClick={() => press(id)}>
                {text}
              </button>
            );
          })}
        </div>
      </div>
      <div className="cc-hist oc-col" data-open={histOpen}>
        <div className="oc-row">
          <div className="oc-h3 oc-grow">History</div>
          {calc.history.length ? (
            <button type="button" className="cc-ib" title="Clear history" onClick={() => syncedOp("calculator", "clear-history", {})}>
              <Fa i="faTrashCan" reg />
            </button>
          ) : null}
        </div>
        {calc.history.length ? (
          <div className="oc-scroll oc-grow" data-testid="calc-history">
            {calc.history.map((h) => (
              <div key={h.id} className="cc-hist-item" onClick={() => (reset(), show(Number(h.result), null), setHistOpen(false))}>
                <span className="oc-faint">{h.expr} =</span>
                <span className="cc-hist-val">{h.result}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="oc-faint cc-none">There's no history yet</div>
        )}
      </div>
    </OceanApp>
  );
};

export default CalculatorApp;
