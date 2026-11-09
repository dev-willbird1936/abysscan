/* Harmless bounded fork probe (investigation A). Lean twin of forkloop.py: a static binary has a tiny
 * resident set, so the 512 MB memory cap is not reached before the process cap.
 * build: gcc -O2 -static -o forkloop forkloop.c
 * usage: forkloop [max]    (default 2000)
 * Forks up to `max` children that sleep 20 s, stops at the first error, counts errors, prints one JSON line,
 * then kills and reaps every child it started. Children only call sleep() and _exit(). */
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <unistd.h>

int main(int argc, char **argv) {
    int max = argc > 1 ? atoi(argv[1]) : 2000;
    pid_t *kids = calloc(max, sizeof(pid_t));
    int started = 0, errors = 0, err = 0;
    struct rlimit rl;
    getrlimit(RLIMIT_NPROC, &rl);
    for (int i = 0; i < max; i++) {
        pid_t p = fork();
        if (p == 0) { sleep(20); _exit(0); }
        if (p < 0) { errors++; err = errno; break; }
        kids[started++] = p;
    }
    printf("{\"mode\": \"cfork\", \"max\": %d, \"started\": %d, \"errors\": %d, \"errno\": %d, \"error\": \"%s\", \"rlimit_nproc\": [%ld, %ld]}\n",
           max, started, errors, err, err ? strerror(err) : "", (long)rl.rlim_cur, (long)rl.rlim_max);
    fflush(stdout);
    for (int i = 0; i < started; i++) { kill(kids[i], SIGKILL); waitpid(kids[i], NULL, 0); }
    return 0;
}
