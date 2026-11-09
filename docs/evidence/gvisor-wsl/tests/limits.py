# Harmless resource-limit probes for the container flags of SPEC 6.3.
# usage: limits.py balloon | spawn [max] | fork [max] | threads [max] | badexec
# Every loop is bounded by max (default 400) and stops at the first failure.
import os, signal, subprocess, sys, threading, time

mode = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 400

if mode == "balloon":
    # Allocate 10 MB chunks until the 512 MB memory limit kills the container.
    b = []
    while True:
        b.append(bytearray(10**7))

elif mode == "spawn":
    # Start up to `limit` sleeping /bin/sleep children (vfork + execve).
    kids = []
    try:
        for i in range(limit):
            kids.append(subprocess.Popen(["/bin/sleep", "20"]))
    except OSError as e:
        print("spawn failed after", len(kids), "children:", e, flush=True)
    else:
        print("spawn ok:", len(kids), "children", flush=True)
    for k in kids:
        k.kill()
    for k in kids:
        k.wait()

elif mode == "fork":
    # Start up to `limit` forked children that sleep (plain fork, no execve).
    pids = []
    try:
        for i in range(limit):
            pid = os.fork()
            if pid == 0:
                time.sleep(20)
                os._exit(0)
            pids.append(pid)
    except OSError as e:
        print("fork failed after", len(pids), "children:", e, flush=True)
    else:
        print("fork ok:", len(pids), "children", flush=True)
    for p in pids:
        os.kill(p, signal.SIGKILL)
    for p in pids:
        os.waitpid(p, 0)

elif mode == "threads":
    # Start up to `limit` sleeping threads.
    stop = threading.Event()
    n = 0
    try:
        for i in range(limit):
            threading.Thread(target=stop.wait, daemon=True).start()
            n += 1
    except RuntimeError as e:
        print("thread start failed after", n, "threads:", e, flush=True)
    else:
        print("threads ok:", n, flush=True)
    stop.set()

elif mode == "badexec":
    # execve of a path that does not exist, then of a real one.
    try:
        os.execv("/nonexistent/binary", ["binary"])
    except OSError as e:
        print("execv:", e, flush=True)
    subprocess.run(["/bin/true"])
