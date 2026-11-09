# gVisor + Docker on WSL2: evidence report

Date: 2026-10-08. Host: WSL2 distro `Ubuntu-24.04` (Ubuntu 24.04.4, kernel 6.18.33.1-microsoft-standard-WSL2, cgroup v2, systemd, 32 CPUs, 16 GB). Docker Desktop was not used or reconfigured.

Status: all steps done. Headline: runsc and runsc-trace work with the full SPEC 6.3 flags; the trace needs a syscall filter to stay under the 20 MB cap; `--pids-limit` does not give `EAGAIN` under gVisor; **Wine does not run under gVisor** (details in section 8, recommendation for SPEC open item 11 at the end).

## Versions

| Component | Version | Source |
|---|---|---|
| docker-ce / docker-ce-cli | 5:29.8.2-1~ubuntu.24.04~noble (Docker 29.8.2, build 7fc2dff) | download.docker.com apt repo |
| containerd.io | 2.3.6-1~ubuntu.24.04~noble | same |
| runc (bundled) | 1.5.1 | same |
| gVisor `runsc` | 20260928.0 (`runsc version release-20260928.0`, spec 1.2.1, go1.26.3) | storage.googleapis.com/gvisor/releases apt repo (`release main`) |
| gVisor platform | `systrap` (default; KVM not used) | runsc boot log |
| Docker cgroup driver | systemd, cgroup v2 | `docker info` |

`docker-ce`, `docker-ce-cli` and `runsc` are held (`apt-mark hold`). `type -a docker` lists `/usr/bin/docker` first; the Docker Desktop shim under `/mnt/c/...` comes last and is never reached by `/usr/bin/docker`.

## Install (files)

- `deploy/local-wsl/setup.sh`: idempotent, pins `DOCKER_VERSION` and `RUNSC_VERSION`, adds both apt repos, installs, copies `deploy/vultr-vm/daemon.json` to `/etc/docker/daemon.json`, restarts Docker only when the file changed or Docker is down. Run twice; second run changed nothing and `cmp` showed the files identical.
- `deploy/vultr-vm/daemon.json`: registers `runsc` and `runsc-trace` (below).

Run it from Windows: `wsl -d Ubuntu-24.04 -- bash /mnt/c/abysscan/deploy/local-wsl/setup.sh` (with `MSYS_NO_PATHCONV=1` under Git Bash).

## daemon.json (final)

```json
{
  "runtimes": {
    "runsc": { "path": "/usr/bin/runsc" },
    "runsc-trace": {
      "path": "/usr/bin/runsc",
      "runtimeArgs": [
        "--debug-log=/var/log/runsc/%ID%/",
        "--strace",
        "--strace-syscalls=openat,creat,read,pread64,readv,write,pwrite64,writev,unlink,unlinkat,rmdir,rename,renameat,renameat2,execve,execveat,clone,clone3,fork,vfork,connect,sendto,sendmsg,sendmmsg",
        "--strace-log-size=128"
      ]
    }
  }
}
```

Changes from the SPEC 6.4 wording (`--strace` and `--debug-log=/var/log/runsc/%ID%/` only):

- `--strace-syscalls` limits the trace to the syscalls the parser needs (plus the `*at`, `*v`, `p*` and `2` variants that real programs use). Without it, one 30 s busy loop wrote 57 MB, which is 2.9x the 20 MB trace cap in SPEC 7.3.
- `--strace-log-size=128` truncates each logged data buffer to 128 bytes. The default is 1024.
- `--debug` is not needed. With `--strace` and `--debug-log`, the strace lines are written anyway.

## Results

### 1. runsc works

`docker run --rm --runtime runsc --network none debian:bookworm-slim sh -c 'cat /etc/os-release; ls /'` printed Debian 12 and the root listing. `uname -a` inside: `Linux <id> 4.19.0-gvisor #1 SMP Sun Jan 10 15:06:54 PST 2016 x86_64`.

### 2. runsc-trace writes one log directory per container ID

`/var/log/runsc/<64-hex container id>/` contains five files per container:

| File | Content | Size (tiny container) |
|---|---|---|
| `runsc.log.<YYYYMMDD-HHMMSS.micros>.boot.txt` | **The strace lines** (and sandbox boot/exit messages) | 0.3 to 0.6 MB unfiltered |
| `...create.txt`, `...gofer.txt`, `...start.txt`, `...delete.txt` | runtime lifecycle | 3 to 23 KB |

Heads-up: the `boot.txt` file name carries a start timestamp, so the parser must glob `*.boot.txt`. A stray `/var/log/runsc/<unknown>/` directory is created by runsc `features` queries from Docker at daemon start; ignore it.

### 3. Full SPEC 6.3 flag set works with both runtimes

```
--read-only --cap-drop ALL --security-opt no-new-privileges:true --user 10001:10001
--pids-limit 128 --memory 512m --memory-swap 512m --cpus 1 --tmpfs /tmp:rw,nosuid,nodev,size=64m --network none
```

A Python script (`tests/exercise.py`) created, read, renamed and deleted a file in `/tmp`, ran a child process, and attempted TCP connect, UDP sendto and a loopback connect. It exited 0 under `runsc` and `runsc-trace`. `docker inspect` showed `runtime=runsc-trace pids=128 mem=536870912 ro=true user=10001:10001 capdrop=[ALL] secopt=[no-new-privileges:true] cpus=1000000000`.

With `--network none`: TCP connect to 10.1.2.3 gives `ENETUNREACH` (errno 101); UDP sendto gives `ENETUNREACH`; loopback connect to 127.0.0.1:9 gives `ECONNREFUSED` in Python (the trace shows the connect return as `errno=115 (operation now in progress)` with no later error line, because the filtered trace does not include `getsockopt`).

### 4. Trace line format

Examples: `trace-samples.txt` (this directory), all copied from real runs. Every line:

```
<L><MMDD> <HH:MM:SS.micros> <tid-of-runsc> strace.go:<n>] [<pid>:<tid>] <comm> <E|X> <syscall>(<args>)[ = <ret> (<hex>) (<duration>)]
```

| Field | Notes |
|---|---|
| `I1008 00:01:07.824824` | glog prefix: level letter + `MMDD`, time with microseconds, host clock (local time zone). No year |
| `1` | Always 1 (the sentry's own thread) |
| `strace.go:NNN]` | NNN is 561 to 616 and varies by argument count; `E` and `X` lines use different numbers. Do not match on it |
| `[   1:   1]` | `[pid:tid]` inside the sandbox, right-aligned to width 4, so the brackets contain padding spaces. Regex: `\[\s*(\d+):\s*(\d+)\]` |
| `python3` | `comm` of the task at that moment (changes after `execve`) |
| `E` / `X` | **E** = syscall entry, no return. **X** = syscall exit, with return value and duration. A blocked syscall has E now and X later. Parse X lines for outcomes, E lines only when the process never returns |
| `= 3 (0x3) (45.549µs)` | decimal return, hex return, duration. Failure: `= -1 errno=2 (no such file or directory) (121.724µs)` |

Argument rendering (what a parser must handle):

- Pointer-to-string arguments print as `0x<addr> <string>`: `0x7ec06191ff80 /tmp/probe.txt`. A pointer that gave an empty string prints `0x7ea6000aadd5 ` (trailing space).
- File-descriptor arguments print as `0x3 /tmp/probe.txt` (fd, then the path the fd refers to). Sockets: `0x3 socket:[1]`. Host pipes: `0x1 host:[2]`. Bad fd: `0xffffffffffffffff (bad FD)`.
- `AT_FDCWD /` for the `dirfd` of `openat`.
- Flags are symbolic: `O_WRONLY|O_CLOEXEC|O_CREAT|O_TRUNC`, unknown bits as hex (`CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID|0x11`).
- Data buffers appear in double quotes with C-style `\x..` escapes. On `read`, the data is on the **X** line. On `write`, the data is on the **E** line and the X line shows `...`. Long buffers are cut and end in `"...`. EOF reads show an empty data field: `read(0x3 /tmp/probe.txt, , 0x1) = 0`.
- Quoted data can contain `"` (escaped as `\"`) and `\n` as the two characters `\` `n`; lines never contain a raw newline.
- Mode: octal `0o666`.
- `connect`/`sendto` address: `{Family: AF_INET, Addr: 10.1.2.3, Port: 80}`.
- `execve` prints `argv` and `envp` as JSON-like arrays: `["/bin/true"]`, `["PATH=...", "HOME=/"]`.

Examples per syscall (full set in `trace-samples.txt`):

```
# openat: create for write (E then X)
I1008 00:01:07.824824       1 strace.go:572] [   1:   1] python3 E openat(AT_FDCWD /, 0x7ec06191ff80 /tmp/probe.txt, O_WRONLY|O_CLOEXEC|O_CREAT|O_TRUNC, 0o666)
I1008 00:01:07.824958       1 strace.go:610] [   1:   1] python3 X openat(AT_FDCWD /, 0x7ec06191ff80 /tmp/probe.txt, O_WRONLY|O_CLOEXEC|O_CREAT|O_TRUNC, 0o666) = 3 (0x3) (45.549µs)
# openat: failure
I1008 00:01:23.707255       1 strace.go:610] [   2:   2] cat X openat(AT_FDCWD /, 0x7ef2caf6ef5e /nonexistent, O_RDONLY|0x0, 0o0) = -1 errno=2 (no such file or directory) (121.724µs)

# read (data on X line) and EOF
I1008 00:01:07.825680       1 strace.go:607] [   1:   1] python3 X read(0x3 /tmp/probe.txt, 0x7ec061737c50 "hello", 0x6) = 5 (0x5) (10.725µs)
I1008 00:01:07.825757       1 strace.go:607] [   1:   1] python3 X read(0x3 /tmp/probe.txt, , 0x1) = 0 (0x0) (5.005µs)

# write (data on E line, X shows ...)
I1008 00:01:07.825251       1 strace.go:569] [   1:   1] python3 E write(0x3 /tmp/probe.txt, 0xbc4d80 "hello", 0x5)
I1008 00:01:07.825388       1 strace.go:607] [   1:   1] python3 X write(0x3 /tmp/probe.txt, ..., 0x5) = 5 (0x5) (121.55µs)

# rename / unlink (path pointers, no fd)
I1008 00:01:07.827104       1 strace.go:604] [   1:   1] python3 X rename(0x7ec06191ff80 /tmp/probe.txt, 0x7ec061737c50 /tmp/probe2.txt) = 0 (0x0) (213.069µs)
I1008 00:01:07.827607       1 strace.go:601] [   1:   1] python3 X unlink(0x7ec061737c50 /tmp/probe2.txt) = 0 (0x0) (121.687µs)

# process creation: vfork (Python subprocess), clone (fork), clone3 (thread)
I1008 00:01:07.829040       1 strace.go:598] [   1:   1] python3 X vfork() = 2 (0x2) (175.825µs)
I1008 00:01:13.853685       1 strace.go:613] [   1:   1] python3 X clone(CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID|0x11, 0x0, 0x0, 0x7ea4bede2310, 0x0) = 2 (0x2) (4.324497ms)
I1008 00:01:18.875453       1 strace.go:604] [   1:   1] python3 X clone3(0x7ea8cf673570, 0x58) = 2 (0x2) (298.662µs)

# execve (note [pid 2] was created by vfork; exit line is '= 0')
I1008 00:01:07.829543       1 strace.go:607] [   2:   2] python3 X execve(0x7ec0618bc3c0 /bin/true, 0x7ec0618bc3d0 ["/bin/true"], 0xac47e0 ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "HOSTNAME=e5db4fc75567", "HOME=/", "LC_CTYPE=C.UTF-8"]) = 0 (0x0) (7.049µs)

# connect / sendto with --network none
I1008 00:01:07.846634       1 strace.go:607] [   1:   1] python3 X connect(0x3 socket:[1], 0x7ee8ca65b760 {Family: AF_INET, Addr: 10.1.2.3, Port: 80}, 0x10) = -1 errno=101 (network is unreachable) (298.544µs)
I1008 00:01:07.848437       1 strace.go:616] [   1:   1] python3 X sendto(0x4 socket:[2], 0xa59c50, 0x1, 0x0, 0x7ee8ca65b770 {Family: AF_INET, Addr: 10.1.2.3, Port: 53}, 0x10) = -1 errno=101 (network is unreachable) (929.451µs)
```

Parser pitfalls found in the real logs:

1. **`execve` exit lines always say `= 0`**, even when the path does not exist. Before the real image path is found, the shell tries each `PATH` entry; gVisor logs `= 0` for every attempt and reports the failure on a separate non-strace line: `I... loader.go:199] [   2:   2] Error opening /usr/local/sbin/sh: no such file or directory`. A parser must treat an `execve` as successful only if the process then continues with a new `comm` and no `loader.go ... Error opening` line follows. Use the `E` line plus the next line of that pid.
2. The `comm` column changes after `execve` (`python3` then `true`), and a forked child keeps the parent `comm` until it execs.
3. Non-strace lines are mixed into the same file (boot, `usertrap_amd64.go`, `task_exit.go`, `loader.go`, JSON blocks and panics). Filter on ` strace.go:`. In the filtered busy loop, 167 of 58435 lines were not strace lines.
4. The time stamp has no year and uses the host's local time zone.
5. `clone` flags can contain unknown bits as `0x..`.
6. `connect` on a non-blocking socket to loopback returns `errno=115 (operation now in progress)`, which is not a failure.
7. Python's `subprocess` uses `vfork`; shells use `clone`; threads use `clone3`. Count all of `clone`, `clone3`, `fork`, `vfork` as process or thread creation. The trace does not by itself say thread or process: `clone3` with `CLONE_THREAD` is a thread. The parser should read the flags where printed (`clone`), and treat `clone3` as unknown (arguments are a struct pointer).
8. `exit_group` and `wait4` are not in the filter, so the end of a process is not visible in the trace. Use the Docker exit code for the container end.

### 5. Trace volume, 30 s busy loop

Command: `timeout 30 sh -c 'while :; do ls / >/dev/null; done'` in `debian:bookworm-slim`, `--runtime <rt> --network none` + the 6.3 flags. About 1,000 to 1,700 `ls` runs per 30 s.

| Runtime variant | `boot.txt` size | Lines | Strace lines | `ls` runs |
|---|---|---|---|---|
| `--debug --strace` (first draft of SPEC) | 57.0 MB (`du` 57.05 MB for the dir) | 270,913 | 190,894 | about 1,085 |
| `--strace` without `--debug` | 46.7 MB | 189,975 | 189,808 | about 1,082 |
| `--debug` + `--strace-syscalls` (9 syscalls and variants) | 38.8 MB | 140,615 | 44,406 | about 1,310 |
| `--strace-syscalls`, no `--debug` | 28.4 MB | 47,389 | 47,222 | about 1,392 |
| + `--strace-log-size=256` | 14.9 MB | 49,077 | | 1,438 |
| + `--strace-log-size=64` | 9.5 MB | 49,487 | | 1,450 |
| **Final `runsc-trace`** (filter + `--strace-log-size=128`, no `--debug`) | **13.5 MB** | 58,435 | 58,268 | 1,713 |
| Same, but all syscalls and size 256 | 35.8 MB | 189,709 | | 1,076 |

Volume in the final config is about 0.45 MB/s for this deliberately worst-case process-spawn loop. Most of it is `read`/`pread64` of shared libraries (the loader reading each ELF), then `openat`. A real sample that does not fork in a loop will be much smaller. The default 20 MB cap in SPEC 7.3 is sufficient for 30 s of this loop with the final config, but not without the filter. Recommend keeping the filter and size flags; keep the 20 MB cap as a controller-side read limit, because a sample that forks faster or reads large files in small chunks can exceed it. The trace is written as it happens, so the controller must stop reading at the cap and mark the trace as truncated.

The busy loop ended with exit code 124 (the `timeout` command) and `OOMKilled=false`. Wall time was about 35 s because of container create and delete.

### 6. Memory balloon and OOM

Test: `tests/limits.py balloon` (allocates 10 MB `bytearray` chunks in a loop) with `--memory 512m --memory-swap 512m`.

| Runtime | Exit code | `State.OOMKilled` | `State.Error` | Time |
|---|---|---|---|---|
| runsc-trace | 137 | **true** | `""` | about 7 s |
| runc | 137 | (not inspected; exit 137) | | |

`docker events` shows `container oom` immediately followed by `container die (exitCode=137)`. This matches SPEC 6.4: `OOMKilled=true` plus exit 137 identifies a memory kill. The trace does **not** show the OOM: the log ends mid-stream with a normal `read` line and no error. The host kills the sandbox from outside, so there is no `ENOMEM` line in the trace for the balloon. A script that exits 137 *without* `OOMKilled` was killed by the controller's timer (`docker kill`).

### 7. pids-limit: SPEC 6.4 assumption is wrong under gVisor

SPEC 6.4 says "pids-limit `EAGAIN` on `clone` in the trace". That does not hold with runsc. Observed with `--pids-limit 128` (Docker sets cgroup `pids.max=128`):

| Test (`tests/limits.py`) | runc | runsc / runsc-trace |
|---|---|---|
| `threads 3000` | stops at 127 threads: `can't start new thread` (EAGAIN) | **all 3000 threads start, exit 0** |
| `fork 300` (plain `os.fork`) | `[Errno 11] Resource temporarily unavailable` after 127 children | **sandbox crashes at about child 49, container exit code 2** |
| `spawn 300` (`subprocess.Popen` of `sleep`, vfork+execve) | EAGAIN after 127 | `[Errno 12] Cannot allocate memory: '/bin/sleep'` after 49 children, exit 0 |

Why: gVisor's guest threads and processes are not host processes, so the host pids cgroup only counts the sandbox's own threads (`pids.current` was 28 for an idle container). The sandbox's host threads are consumed when it creates a new address space for a new process. Observed failure in the runsc boot log for `fork`:

```
panic: Unknown syscall 56 error: createSysmsgThread: failed to get clone
```

(syscall 56 is `clone`.) For `spawn`, the boot log has:

```
W1007 23:59:05.062038       1 task_image.go:145] Failed to create new memory manager: createSysmsgThread: failed to get clone
```

and the guest saw `ENOMEM`. Consequences:

- The container's guest process count is not limited to 128. Threads are not limited at all by `--pids-limit` under runsc. What is limited is how many *processes* (address spaces) the sandbox can create: about 49 at `--pids-limit 128`, after which it either returns `ENOMEM` (vfork/exec) or crashes (plain `fork`, exit code 2 and a Go panic in `boot.txt`).
- A fork bomb is contained: the crash is inside the sandbox (container exit 2, `OOMKilled=false`) and the host is not affected. With `--pids-limit 1024` the same fork test did not crash and ended in exit 137 (not inspected for `OOMKilled`; most likely the 512 MB memory limit).
- The controller should treat these as "resource limit hit" signals: (a) exit code 2 with `panic: ... createSysmsgThread: failed to get clone` in `boot.txt`; (b) `Failed to create new memory manager: createSysmsgThread: failed to get clone` lines (a non-strace `task_image.go` line) in `boot.txt`. The `spawn` trace shows **no** `errno` on the `vfork` or `execve` lines (the 50th `vfork` returned a pid and the `execve` exit line says `= 0`); the `ENOMEM` is only visible to the guest and in (b). The `clone` syscall in the trace therefore never shows `EAGAIN`.
- SPEC 6.4/7.3 should say "process creation failure: `ENOMEM`/sandbox crash", not `EAGAIN`, for runsc. `--pids-limit` is still worth keeping (it caps the sandbox's host threads and protects the host).

### 8. Wine inside gVisor (SPEC open item 11): does not work

Image: `debian:bookworm-slim` + Debian `wine`, `wine64`, `wine32:i386`, `libwine` (all `8.0~repack-4`), `xvfb 2:21.1.7-3+deb12u13`, `xauth`, `fonts-wine` (`tests/Dockerfile.wine`; image 2.47 GB on disk). Test scripts: `tests/wine-tests.sh`, `tests/wine-inner.sh`. Each step ran in its own container with the full SPEC 6.3 flags, `--network none`, a persistent 64-bit prefix volume (`WINEARCH=win64`), a 1280x800 Xvfb. Only Wine's own built-ins ran (`cmd`, `reg`, `notepad`, `wineboot`). No other Windows binary was run.

| Step | runc (control, same flags) | runsc (and runsc with `--platform=kvm`) |
|---|---|---|
| `/usr/lib/wine/wine64 --version` | `wine-8.0 (Debian 8.0~repack-4)` | same, works (it does not start ntdll) |
| `/usr/lib/wine/wine --version` (the 32-bit loader that Debian's `wine` command runs) | works | **fails**: `exec: /usr/lib/wine/wine: Exec format error`, exit 126 |
| `wineboot --init` (create prefix) under Xvfb | prefix created, `wineboot_exit=0` | **fails**, `wineboot_exit=1` |
| `wine cmd /c echo hi` | prints `hi`, `cmd_exit=0` | **fails**, `cmd_exit=1`, no output |
| `wine reg query HKCU\Software\Wine` | lists the keys, exit 0 | not reached |
| `xvfb-run wine notepad` for 5 s, then kill | `notepad.exe` is running at +5 s (with `wineserver64`, two `winedevice.exe`, `Xvfb`) | **fails**: no `notepad.exe` process; only `xvfb-run` and `Xvfb` exist at +5 s |

`wine` on Debian bookworm without X also fails under runc (`err:winediag:nodrv_CreateWindow ... The explorer process failed to start`, exit 53), so every step that starts Wine proper runs under `xvfb-run`.

Error text under runsc (`WINEDEBUG=err+all`; identical on `--platform=systrap` and `--platform=kvm`):

```
wine: created the configuration directory '/home/dana/.wine'
002c:err:seh:segv_handler Got unexpected trap 0          <- repeated about 1,870 times
002c:err:virtual:virtual_setup_exception stack overflow 1808 bytes addr 0x170057657 stack 0x708f0 (0x70000-0x71000-0x270000)
wineboot_exit=1
```

The wineserver starts and the first Wine process dies in its SIGSEGV handler, which loops on its own stack until it overflows. `--platform=ptrace` is worse: the container exits with code 2 and prints only the first line.

**Root cause (from the strace of the failing run):** gVisor logs

```
compat.go:130] Unsupported syscall arch_prctl(0x1001,0x67fe0000,0x0,0x0,0x0,0x0). It is likely that you can safely ignore this message ...
```

`0x1001` is `ARCH_SET_GS`. Wine's 64-bit `ntdll` sets the `%gs` base to the Windows TEB (here `0x67fe0000`) so Windows code can read `gs:[0x30]`. gVisor supports `ARCH_SET_FS` (`0x1002`, seen with `= 0` for every Linux process) but not `ARCH_SET_GS`. The first Windows-side access through `%gs` then faults, and Wine reports it as `unexpected trap 0`. The same `Unsupported syscall` line appears once for `rseq`, which is harmless.

A second, independent limit: gVisor cannot run 32-bit x86 ELF binaries (`Exec format error` for `/usr/lib/wine/wine` and `wineserver32`; `od` shows ELF class 1). That rules out Wine's 32-bit side (`wow64`, 32-bit Windows programs) even if the `%gs` problem were fixed. 64-bit-only prefixes are the only possible configuration.

This is a platform limit of gVisor release-20260928.0 with Wine 8.0, not a configuration error: it was tried on `systrap` (default), `kvm` (works in this WSL2 distro: `/dev/kvm` exists) and `ptrace`. Newer Wine builds (WineHQ 9/10) were not tried; they use the same `arch_prctl(ARCH_SET_GS)` path on x86_64 as far as this test shows, but that was not verified.

### 9. Recommendation for SPEC open item 11

**Drop the Wine step from the hackathon build** (option b), keep the "Windows files" path on emulation (Speakeasy, capa, static) and say so in the README and the coverage table of 6.6.

Why not option (a), Wine under `runc`:

- It works technically with all the 6.3 flags (control column above: `cmd`, `reg`, `notepad` all ran as user 10001, read-only root, caps dropped, `no-new-privileges`, Docker's default seccomp profile, `--network none`).
- But it runs unknown Windows code against the host kernel with only a seccomp filter between them. That breaks the project's central claim (SPEC 7.1: "gVisor runtime for every container") and the receipt would have to carry a weaker statement for exactly the riskiest file family.
- It also loses the gVisor syscall trace (6.4): the evidence for Wine runs would be `WINEDEBUG` logs and the file/registry diff only, and those are produced inside the sample's container.

If Windows execution is wanted later: run it on the stretch-goal second VM (7.1) with a throwaway VM per job, not as a weaker mode on the main VM.

SPEC sections that need the change: 6.6 "Run under Wine" (mark as not built; remove the Wine rows from the coverage table), 7.1 (second bullet), 14 item 11 (close with this result), 14 item 12 (Wine licence check no longer blocks).

## Leftovers in the WSL distro (throwaway)

Images `do-test-py` (216 MB) and `do-test-wine` (2.47 GB); volumes `do-wine-home-*` (6); stopped test containers; `/root/gv` (test inputs); `/var/log/runsc/` (23 container dirs, about 240 MB). A background `wsl ... sleep 14400` session kept the distro alive during the work. None of these are in the repo. Docker Desktop was untouched.

Note: another process in the distro (`apt-get install -y -qq nodejs`) held the dpkg lock during the final `setup.sh` run, so `setup.sh` now passes `-o DPkg::Lock::Timeout=600` to apt.

## Files

- `deploy/local-wsl/setup.sh`, `deploy/vultr-vm/daemon.json`
- `docs/evidence/gvisor-wsl/REPORT.md`, `trace-samples.txt`
- `docs/evidence/gvisor-wsl/tests/`: `exercise.py`, `limits.py`, `Dockerfile.wine`, `wine-tests.sh`, `wine-inner.sh`
