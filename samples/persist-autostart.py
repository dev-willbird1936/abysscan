# Demo sample for Detonation Ocean. Refuses to run outside the sandbox.
import os
import sys

# Two conditions, both required: the sandbox marker, and a home directory that is the seeded one. Anything else exits here.
if os.environ.get("DETONATION_SANDBOX") != "1" or os.path.expanduser("~") != "/home/dana" or not os.path.isdir("/home/dana/Documents"):
    sys.exit(0)

# Abyss depth via the `persistence` finding: a desktop autostart entry that would relaunch this script at login.
autostart = os.path.expanduser("~/.config/autostart")
os.makedirs(autostart, exist_ok=True)
with open(os.path.join(autostart, "system-updater.desktop"), "w") as entry:
    entry.write("[Desktop Entry]\nType=Application\nName=System Updater\n"
                f"Exec=python3 {os.path.abspath(sys.argv[0])}\nX-GNOME-Autostart-enabled=true\n")
print("Updater installed.")
