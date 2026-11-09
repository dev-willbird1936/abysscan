// Builds deploy/detonation/seccomp-wine.json from Docker's default seccomp profile (investigation B, runc fallback).
// usage: curl -sLO https://raw.githubusercontent.com/moby/profiles/main/seccomp/default.json
//        node make-seccomp-wine.mjs default.json ../../../../deploy/detonation/seccomp-wine.json
// Tested 2026-10-08 against Wine 11.0 built-ins + Xvfb under runc (PIDS-AND-WINE.md section B.5). Every removal below is
// a candidate for "restore if a Wine built-in fails"; strace -f -c of the real runs showed Xvfb needs setuid/setgid/
// setresuid (to its own uid), so those three are re-added below with a uid condition.
// Restore procedure and measurement: docs/evidence/gvisor-wsl/PIDS-AND-WINE.md section B.
import { readFileSync, writeFileSync } from "node:fs";

const [src, dst] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(src, "utf8"));

// Removed from the unconditional allow list (entry 0), grouped by reason.
const removed = {
  "SysV message queues, semaphores and POSIX queues: Wine and Xvfb use neither (SysV shm stays for MIT-SHM)": [
    "msgctl", "msgget", "msgrcv", "msgsnd", "semctl", "semget", "semop", "semtimedop", "semtimedop_time64",
    "mq_getsetattr", "mq_notify", "mq_open", "mq_timedreceive", "mq_timedreceive_time64", "mq_timedsend",
    "mq_timedsend_time64", "mq_unlink", "ipc",
  ],
  "kernel AIO: Wine does its own async I/O": ["io_setup", "io_destroy", "io_submit", "io_cancel", "io_getevents", "io_pgetevents", "io_pgetevents_time64"],
  "pipe-splice family (Dirty Pipe class)": ["splice", "tee", "vmsplice"],
  "handle and pidfd primitives": ["name_to_handle_at", "pidfd_open", "pidfd_send_signal", "process_mrelease"],
  "nested sandboxing and filters: Wine installs none": ["landlock_add_rule", "landlock_create_ruleset", "landlock_restrict_self", "seccomp"],
  "identity changes: Wine never changes uid or gid": [
    "setuid", "setuid32", "setgid", "setgid32", "setreuid", "setreuid32", "setregid", "setregid32", "setresuid", "setresuid32",
    "setresgid", "setresgid32", "setfsuid", "setfsuid32", "setfsgid", "setfsgid32", "setgroups", "setgroups32", "capset",
    "chown", "chown32", "fchown", "fchown32", "fchownat", "lchown", "lchown32",
  ],
  "device nodes, clock adjustment, fanotify, protection keys, mount queries, secret memfd, 32-bit socketcall": [
    "mknod", "mknodat", "adjtimex", "clock_adjtime", "clock_adjtime64", "fanotify_mark", "pkey_alloc", "pkey_free", "pkey_mprotect",
    "listmount", "statmount", "memfd_secret", "socketcall",
  ],
};
const drop = new Set(Object.values(removed).flat());

const allow = profile.syscalls[0];
if (allow.action !== "SCMP_ACT_ALLOW" || allow.includes || allow.args) throw new Error("entry 0 is not the unconditional allow list");
allow.names = allow.names.filter((n) => !drop.has(n));

// ptrace and process_vm_* (entry 1, kernel >= 4.8): remove. Wine's wineserver only needs them for debugger and
// cross-process thread-context paths.
profile.syscalls = profile.syscalls.filter((e) => !(e.names.length === 3 && e.names.includes("ptrace") && !e.includes?.caps));

// socket(): Docker allows ~30 address families. Wine needs UNIX (X11, wineserver), INET/INET6 (Winsock, loopback only
// with --network none) and NETLINK (getifaddrs).
profile.syscalls = profile.syscalls.filter((e) => !(e.names.length === 1 && e.names[0] === "socket"));
for (const domain of [1, 2, 10, 16]) {
  profile.syscalls.push({ names: ["socket"], action: "SCMP_ACT_ALLOW", args: [{ index: 0, value: domain, op: "SCMP_CMP_EQ" }] });
}

// Xvfb (the X server's xkbcomp launch) calls setgid(uid), setuid(uid) and setresuid(-1, uid, -1) with the container's own
// ids, and aborts with a failed display when they get EPERM. Without capabilities they cannot change identity, so allow
// them only for the job UID (SPEC 6.3: 10001). Everything else in the identity family stays blocked.
const JOB_UID = 10001;
for (const [name, index] of [["setuid", 0], ["setgid", 0], ["setresuid", 1]]) {
  profile.syscalls.push({ names: [name], action: "SCMP_ACT_ALLOW", args: [{ index, value: JOB_UID, op: "SCMP_CMP_EQ" }] });
}

// x86-64 and i386 syscall ABIs, no x32. Measured 2026-10-08: with the i386 ABI removed, `rundll32.exe` of a WINEARCH=wow64
// prefix is killed by SIGSYS on its first i386 `set_thread_area` (audit arch=40000003), and 32-bit programs cannot run.
// A WINEARCH=win64 prefix never uses the i386 ABI; drop "SCMP_ARCH_X86" below for a 64-bit-only deployment.
profile.archMap = profile.archMap.filter((a) => a.architecture === "SCMP_ARCH_X86_64").map((a) => ({ architecture: a.architecture, subArchitectures: ["SCMP_ARCH_X86"] }));
profile.syscalls = profile.syscalls.filter((e) => !e.includes?.arches || e.includes.arches.includes("amd64"));

writeFileSync(dst, JSON.stringify(profile, null, 2) + "\n");
console.log(`allow list: ${allow.names.length} names (removed ${drop.size}); entries: ${profile.syscalls.length}`);
