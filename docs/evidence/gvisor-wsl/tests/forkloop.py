# Harmless bounded process-creation probe for the container flags of SPEC 6.3 (investigation A).
# usage: forkloop.py fork|spawn|threads [max]        (default max 2000)
# Starts up to `max` children that sleep 20 s, stops at the first error, counts errors,
# prints one JSON line with its own counters, then kills and reaps every child it started.
# Children are only `sleep` (spawn) or a forked copy of this script that sleeps (fork).
import json, os, resource, signal, subprocess, sys, threading, time

mode = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
SLEEP = 20

result = {"mode": mode, "max": limit, "started": 0, "errors": 0, "errno": None, "error": None,
          "rlimit_nproc": list(resource.getrlimit(resource.RLIMIT_NPROC))}
kids = []
stop = threading.Event()
t0 = time.time()

try:
    for _ in range(limit):
        if mode == "fork":
            pid = os.fork()
            if pid == 0:
                time.sleep(SLEEP)
                os._exit(0)
            kids.append(pid)
        elif mode == "spawn":
            kids.append(subprocess.Popen(["/bin/sleep", str(SLEEP)]))
        elif mode == "threads":
            threading.Thread(target=stop.wait, daemon=True).start()
            kids.append(None)
        result["started"] += 1
except (OSError, RuntimeError) as e:
    result["errors"] += 1
    result["errno"] = getattr(e, "errno", None)
    result["error"] = str(e)

result["seconds"] = round(time.time() - t0, 2)
print(json.dumps(result), flush=True)

stop.set()
for k in kids:
    if k is None:
        continue
    if mode == "fork":
        os.kill(k, signal.SIGKILL)
        os.waitpid(k, 0)
    else:
        k.kill()
        k.wait()
