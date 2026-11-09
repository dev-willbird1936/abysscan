// Windows Terminal (Command Prompt profile) over the shared world fs.
// File commands emit fs intents; nothing runs outside the world state.
import React, { useEffect, useRef, useState } from "react";
import { CANONICAL_APPS } from "../../../ocean/appRegistry";
import { childrenOf, emit, fileText, getNode, isInstalled, newId, openNode, resolveWinPath, useWorld, winPath } from "../../../ocean/world-helpers";
import { syncedOp, useSynced } from "../../../ocean/synced";
import { Fa, OceanApp } from "./ocean/ui";
import "./ocean/terminal.scss";

const ALIASES = { notepad: "texteditor", explorer: "files", msedge: "browser", edge: "browser", calc: "calculator", outlook: "mail", mail: "mail", teams: "messages", chat: "messages", taskmgr: "taskmanager", cmd: "terminal", wt: "terminal", photos: "photos", ms_settings: "settings", "ms-settings:": "settings", stikynot: "stickies", todo: "reminders", people: "contacts", onenote: "notes" };
const HELP = [
  ["CD", "Displays the name of or changes the current directory."],
  ["CLS", "Clears the screen."],
  ["DATE / TIME", "Displays the date or time."],
  ["DEL", "Moves one or more files to the Recycle Bin."],
  ["DIR", "Displays a list of files and subdirectories in a directory."],
  ["ECHO", "Displays messages. ECHO text > file writes a file, >> appends."],
  ["EXIT", "Closes this window."],
  ["HOSTNAME", "Prints the name of this computer."],
  ["MKDIR", "Creates a directory."],
  ["MOVE", "Moves a file or directory into another directory."],
  ["REN", "Renames a file or directory."],
  ["RMDIR", "Moves a directory to the Recycle Bin."],
  ["START", "Opens a file or app, e.g. START notepad or START Welcome.txt."],
  ["TREE", "Graphically displays the folder structure."],
  ["TYPE", "Displays the contents of a text file."],
  ["VER", "Displays the Windows version."],
  ["WHOAMI", "Displays the current user."],
];

const tokenize = (s) => (s.match(/"[^"]*"|\S+/g) || []).map((t) => t.replace(/^"|"$/g, ""));
const stamp = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : `${d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}  ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

// cwd (a folder id) and the command history are the shared data.terminal store; output is local.
// Runs one command line against a world snapshot. Returns { out: string[], cwd, clear?, exit? }.
const run = (world, cwd, line) => {
  const redirect = line.match(/^\s*echo\s+(.*?)\s*(>>?)\s*(.+)$/i);
  const [cmd0, ...args] = tokenize(line);
  const cmd = (cmd0 || "").toLowerCase();
  const out = [];
  const at = (p) => resolveWinPath(world, cwd, p);
  const parentAndName = (p) => {
    const i = p.replace(/\//g, "\\").lastIndexOf("\\");
    return i < 0 ? [cwd, p] : [at(p.slice(0, i) || "\\"), p.slice(i + 1)];
  };
  if (!cmd) return { out, cwd };

  if (redirect) {
    const [, text, op, target] = redirect;
    const [parentId, name] = parentAndName(target.replace(/^"|"$/g, ""));
    const existing = at(target.replace(/^"|"$/g, ""));
    const n = existing && getNode(world, existing);
    if (!parentId) return { out: ["The system cannot find the path specified."], cwd };
    if (n && n.kind !== "file") return { out: ["Access is denied."], cwd };
    const body = `${op === ">>" && n ? fileText(world, n) : ""}${text}\r\n`.replace(/\r\n/g, "\n");
    if (n) emit({ kind: "fs", op: "write", id: n.id, text: body });
    else emit({ kind: "fs", op: "touch", id: newId("f"), parentId, name, mime: "text/plain", text: body });
    return { out, cwd };
  }

  switch (cmd) {
    case "help":
      HELP.forEach(([c, d]) => out.push(`${c.padEnd(14)}${d}`));
      break;
    case "cls":
      return { out, cwd, clear: true };
    case "exit":
      return { out, cwd, exit: true };
    case "ver":
      out.push("", "Microsoft Windows [Version 10.0.26100.2033] (training desktop)", "");
      break;
    case "whoami":
      out.push(`northwind\\${world.user.short}`);
      break;
    case "hostname":
      out.push(`NW-${world.user.short.toUpperCase()}-LT`);
      break;
    case "date":
      out.push(`The current date is: ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "2-digit", day: "2-digit", year: "numeric" })}`);
      break;
    case "time":
      out.push(`The current time is: ${new Date().toLocaleTimeString("en-US")}`);
      break;
    case "echo":
      out.push(args.length ? line.replace(/^\s*echo\s?/i, "") : "ECHO is on.");
      break;
    case "cd":
    case "chdir": {
      if (!args.length) {
        out.push(winPath(world, cwd));
        break;
      }
      const id = at(args.join(" "));
      const n = id && getNode(world, id);
      if (!n || n.kind !== "folder") out.push("The system cannot find the path specified.");
      else return { out, cwd: id };
      break;
    }
    case "dir": {
      const id = args[0] ? at(args.join(" ")) : cwd;
      const n = id && getNode(world, id);
      if (!n) {
        out.push("File Not Found");
        break;
      }
      const list = n.kind === "folder" ? childrenOf(world, id) : [n];
      out.push(" Volume in drive C has no label.", " Volume Serial Number is 4E57-0C3A", "", ` Directory of ${winPath(world, n.kind === "folder" ? id : n.parentId)}`, "");
      let files = 0,
        bytes = 0;
      list.forEach((c) => {
        const isDir = c.kind === "folder";
        if (!isDir) (files += 1), (bytes += c.size || 0);
        out.push(`${stamp(c.modified)}    ${isDir ? "<DIR>         " : String(c.size || 0).padStart(14)} ${c.name}`);
      });
      out.push(`${String(files).padStart(16)} File(s) ${bytes.toLocaleString("en-US").padStart(14)} bytes`, `${String(list.length - files).padStart(16)} Dir(s)`);
      break;
    }
    case "tree": {
      const walk = (id, pre) =>
        childrenOf(world, id)
          .filter((c) => c.kind === "folder")
          .forEach((c, i, arr) => {
            const last = i === arr.length - 1;
            out.push(`${pre}${last ? "└───" : "├───"}${c.name}`);
            walk(c.id, pre + (last ? "    " : "│   "));
          });
      out.push(`Folder PATH listing`, winPath(world, cwd));
      walk(cwd, "");
      break;
    }
    case "type": {
      const n = args[0] && getNode(world, at(args.join(" ")));
      if (!n) out.push("The system cannot find the file specified.");
      else if (n.kind !== "file") out.push("Access is denied.");
      else out.push(...fileText(world, n).split("\n"));
      break;
    }
    case "mkdir":
    case "md": {
      if (!args.length) {
        out.push("The syntax of the command is incorrect.");
        break;
      }
      const [parentId, name] = parentAndName(args.join(" "));
      if (!parentId || !name) out.push("The system cannot find the path specified.");
      else if (childrenOf(world, parentId).some((c) => c.name.toLowerCase() === name.toLowerCase())) out.push(`A subdirectory or file ${name} already exists.`);
      else emit({ kind: "fs", op: "mkdir", id: newId("d"), parentId, name });
      break;
    }
    case "del":
    case "erase":
    case "rmdir":
    case "rd": {
      const n = args[0] && getNode(world, at(args.filter((a) => !/^\/[a-z]$/i.test(a)).join(" ")));
      const wantDir = cmd === "rmdir" || cmd === "rd";
      if (!n) out.push(wantDir ? "The system cannot find the file specified." : "Could Not Find " + (args[0] || ""));
      else if (wantDir !== (n.kind === "folder")) out.push(wantDir ? "The directory name is invalid." : "Access is denied.");
      else if (["root", "home", "desktop", "documents", "downloads", "pictures", "music", "trash"].includes(n.id)) out.push("Access is denied.");
      else {
        emit({ kind: "fs", op: "trash", id: n.id });
        out.push(`Moved ${n.name} to the Recycle Bin.`);
      }
      break;
    }
    case "ren":
    case "rename": {
      const n = args[0] && getNode(world, at(args[0]));
      if (!n || !args[1]) out.push("The system cannot find the file specified.");
      else emit({ kind: "fs", op: "rename", id: n.id, name: args[1] });
      break;
    }
    case "move": {
      const n = args[0] && getNode(world, at(args[0]));
      const dest = args[1] && getNode(world, at(args[1]));
      if (!n || !dest || dest.kind !== "folder") out.push("The system cannot find the file specified.");
      else {
        emit({ kind: "fs", op: "move", id: n.id, parentId: dest.id });
        out.push("        1 file(s) moved.");
      }
      break;
    }
    case "start": {
      const target = args.join(" ");
      const app = ALIASES[target.toLowerCase()] || (CANONICAL_APPS.includes(target.toLowerCase()) ? target.toLowerCase() : null);
      const n = !app && target ? getNode(world, at(target)) : null;
      if (app) isInstalled(world, app) ? emit({ kind: "open-app", app }) : out.push(`Windows cannot find '${target}'.`);
      else if (n) openNode(world, n) || out.push(`No app is associated with ${n.name}.`);
      else if (!target) emit({ kind: "open-app", app: "terminal" });
      else out.push(`The system cannot find the file ${target}.`);
      break;
    }
    case "ipconfig":
    case "ping":
    case "curl":
    case "nslookup":
      out.push("Networking is disabled on this training desktop.");
      break;
    default:
      out.push(`'${cmd0}' is not recognized as an internal or external command,`, "operable program or batch file.");
  }
  return { out, cwd };
};

const TerminalApp = ({ win }) => {
  const current = useWorld();
  const term = useSynced("terminal");
  const cwd = term.cwd;
  const setCwd = (id) => id !== term.cwd && syncedOp("terminal", "cd", { cwd: id });
  const [lines, setLines] = useState(["Microsoft Windows [Version 10.0.26100.2033]", "(c) Training desktop. All people and data are fictional.", ""]);
  const [input, setInput] = useState("");
  // Index into the shared history while recalling with the arrow keys; null = a new line.
  const [recall, setRecall] = useState(null);
  const endRef = useRef(null);
  const inRef = useRef(null);
  const payloadFolder = win && win.payload && win.payload.folderId;
  const world = () => current;

  useEffect(() => {
    if (payloadFolder && getNode(world(), payloadFolder)) setCwd(payloadFolder);
  }, [payloadFolder]);
  useEffect(() => {
    endRef.current && endRef.current.scrollIntoView({ block: "end" });
  }, [lines]);

  // Fall back to home if the working directory disappears from the world.
  const live = getNode(world(), cwd) && !getNode(world(), cwd).trashed ? cwd : "home";
  const prompt = `${winPath(world(), live)}>`;

  const submit = () => {
    const res = /^\s*(doskey\s+\/history|history)\s*$/i.test(input) ? { out: [...term.history], cwd: live } : run(world(), live, input);
    if (input.trim()) syncedOp("terminal", "record", { line: input.slice(0, 500) });
    setRecall(null);
    setInput("");
    if (res.exit) return win ? emit({ kind: "close-window", id: win.id }) : setLines([]);
    setCwd(res.cwd);
    setLines(res.clear ? [] : [...lines, `${prompt}${input}`, ...res.out, ...(res.out.length ? [""] : [])].slice(-500));
  };
  const keys = (e) => {
    if (e.key === "Enter") submit();
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const list = term.history;
      const i = Math.max(0, Math.min(list.length, (recall == null ? list.length : recall) + (e.key === "ArrowUp" ? -1 : 1)));
      setRecall(i);
      setInput(list[i] || "");
    } else if (e.key === "Tab") {
      e.preventDefault();
      const parts = input.split(" ");
      const last = parts.pop().replace(/^"/, "");
      const match = childrenOf(world(), live).find((c) => c.name.toLowerCase().startsWith(last.toLowerCase()));
      if (match) setInput([...parts, /\s/.test(match.name) ? `"${match.name}"` : match.name].join(" "));
    } else if (e.key === "l" && e.ctrlKey) (e.preventDefault(), setLines([]));
  };

  return (
    <OceanApp className="tm-app" data-theme="dark" onClick={() => inRef.current && inRef.current.focus()}>
      <div className="oc-col oc-grow">
        <div className="tm-tabs oc-row">
          <div className="tm-tab">
            <Fa i="faTerminal" />
            <span className="oc-ellipsis">Command Prompt</span>
          </div>
        </div>
        <div className="tm-screen oc-scroll oc-grow">
          {lines.map((l, i) => (
            <div key={i} className="tm-line">
              {l || "\u00a0"}
            </div>
          ))}
          <div className="tm-line tm-input-row">
            <span>{prompt}</span>
            <input ref={inRef} className="tm-input" value={input} autoFocus spellCheck={false} onChange={(e) => setInput(e.target.value)} onKeyDown={keys} aria-label="Command input" />
          </div>
          <div ref={endRef} />
        </div>
      </div>
    </OceanApp>
  );
};


export default TerminalApp;
