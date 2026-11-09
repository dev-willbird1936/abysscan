"""Windows PE emulation with Speakeasy (SPEC 6.6 "Emulate"): 30 s and 5 M instructions. The file is loaded, never executed natively.

Prints the Speakeasy report reduced to what the controller maps (backend/detonation/emulator.mjs): api calls, file, registry and
network events per entry point, the error that stopped each entry point, and the instruction and time totals.
"""
import json
import os
import subprocess
import time

import speakeasy
from runnerlib import finish, parse_args

TIMEOUT_SECONDS = 30
# Mono is a Linux runtime, not a Windows one: a managed .NET assembly can be executed instead of emulated, so the run
# produces real syscalls (file writes, sockets) in the trace instead of an API-level simulation. Native PEs keep the emulator.
MONO = "/usr/bin/mono"
MONO_TIMEOUT = 25
MONO_OUTPUT = 4000
MAX_INSTRUCTIONS = 5_000_000
MAX_API_COUNT = 10_000
MAX_LIST = 400
TEXT = 300


def configuration():
    with open(os.path.join(os.path.dirname(speakeasy.__file__), "configs", "default.json"), encoding="utf-8") as handle:
        config = json.load(handle)
    config.update({"timeout": TIMEOUT_SECONDS, "max_instructions": MAX_INSTRUCTIONS, "max_api_count": MAX_API_COUNT})
    config["user"] = {**config["user"], "name": "Dana", "is_admin": False}
    config["env"] = {**config["env"], "userprofile": "C:\\Users\\Dana", "temp": "C:\\Users\\Dana\\AppData\\Local\\Temp\\"}
    config["hostname"] = "dana-pc"
    return config


def text(value):
    return value if isinstance(value, str) else json.dumps(value, default=str)[:TEXT] if isinstance(value, (list, dict)) else str(value)


def reduce_entry(entry):
    network = entry.get("network_events") or {}
    return {
        "type": text(entry.get("ep_type", "")),
        "apis": [
            {"api": text(call.get("api_name", ""))[:80], "args": [text(arg)[:TEXT] for arg in (call.get("args") or [])][:12]}
            for call in (entry.get("apis") or [])[:MAX_LIST * 10]
        ],
        "files": [{key: text(event.get(key, ""))[:TEXT] for key in ("event", "path")} for event in (entry.get("file_access") or [])[:MAX_LIST]],
        "registry": [
            {key: text(event.get(key, ""))[:TEXT] for key in ("event", "path", "value_name", "data")}
            for event in (entry.get("registry_access") or [])[:MAX_LIST]
        ],
        "dns": [{"query": text(event.get("query", ""))[:TEXT]} for event in (network.get("dns") or [])[:MAX_LIST]],
        "traffic": [
            {key: text(event.get(key, ""))[:TEXT] for key in ("server", "port", "proto", "type", "method", "data", "headers")}
            for event in (network.get("traffic") or [])[:MAX_LIST]
        ],
        "instructions": entry.get("instr_count") or 0,
        "error": {key: text(error.get(key, ""))[:TEXT] for key in ("type", "api_name", "last_api", "pc")} if (error := entry.get("error")) else None,
    }


def managed(path):
    """True when the PE declares a CLR header, which is what lets `mono` run it."""
    try:
        import pefile

        # The CLR header is directory 14 of the optional header; pefile only follows it when asked, so read its address directly.
        pe = pefile.PE(path, fast_load=True)
        directory = pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_COM_DESCRIPTOR"]]
        return bool(getattr(directory, "VirtualAddress", 0))
    except Exception:
        return False


def run_mono(args):
    """Runs the assembly under Mono. Returns the block the controller maps, or None when Mono cannot start the file."""
    if not (os.path.isfile(MONO) and managed(args.file)):
        return None
    environment = dict(os.environ, TMPDIR="/tmp/dt/tmp", XDG_CONFIG_HOME="/tmp/dt/xdg/config", XDG_CACHE_HOME="/tmp/dt/xdg/cache")
    try:
        done = subprocess.run([MONO, args.file], capture_output=True, timeout=MONO_TIMEOUT, env=environment, cwd="/tmp/dt/tmp")
    except subprocess.TimeoutExpired as timeout:
        return {"engine": "mono", "exitCode": None, "stopped": "killed after %d s" % MONO_TIMEOUT,
                "stdout": (timeout.stdout or b"")[-MONO_OUTPUT:].decode("utf-8", "replace"),
                "stderr": (timeout.stderr or b"")[-MONO_OUTPUT:].decode("utf-8", "replace")}
    except OSError:
        return None
    stdout = done.stdout[-MONO_OUTPUT:].decode("utf-8", "replace")
    stderr = done.stderr[-MONO_OUTPUT:].decode("utf-8", "replace")
    # Mono exits 1 with this wording when the assembly needs something the runtime does not have: the emulator still gets a turn.
    if done.returncode == 1 and ("Cannot open assembly" in stderr or "does not contain a valid CIL image" in stderr):
        return None
    return {"engine": "mono", "exitCode": done.returncode, "stdout": stdout, "stderr": stderr}


def main():
    args = parse_args()
    started = time.monotonic()
    mono = run_mono(args)
    if mono is not None:
        emulation = {"entryPoints": [], "instructions": 0, "seconds": round(time.monotonic() - started, 1),
                     "timeoutSeconds": MONO_TIMEOUT, "maxInstructions": 0, "failure": None, "mono": mono}
        finish(args, emulation=emulation)
        return
    try:
        emulator = speakeasy.Speakeasy(config=configuration())
        module = emulator.load_module(args.file)
        emulator.run_module(module, all_entrypoints=False)
        report = emulator.get_report()
        entries = [reduce_entry(entry) for entry in report.get("entry_points", [])]
        failure = None
    except Exception as error:  # an unsupported PE, a corrupt one or an emulator fault: reported, never fatal
        entries, failure = [], f"{error.__class__.__name__}: {str(error)[:TEXT]}"
    emulation = {"entryPoints": entries, "instructions": sum(entry["instructions"] for entry in entries), "seconds": round(time.monotonic() - started, 1), "timeoutSeconds": TIMEOUT_SECONDS, "maxInstructions": MAX_INSTRUCTIONS, "failure": failure}
    finish(args, emulation=emulation)


main()
