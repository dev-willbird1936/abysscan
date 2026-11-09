# Harmless syscall exerciser: file create/read/rename/delete, a child process, and
# connection attempts that must fail because the container has --network none.
import os, socket, subprocess

p = "/tmp/probe.txt"
with open(p, "w") as f:
    f.write("hello")
print(open(p).read())
os.rename(p, "/tmp/probe2.txt")
os.remove("/tmp/probe2.txt")
print("child exit:", subprocess.run(["/bin/true"]).returncode)

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect(("10.1.2.3", 80))
except OSError as e:
    print("tcp connect:", e)

u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    u.sendto(b"x", ("10.1.2.3", 53))
    print("udp sendto ok")
except OSError as e:
    print("udp sendto:", e)

l = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
l.settimeout(2)
try:
    l.connect(("127.0.0.1", 9))
except OSError as e:
    print("loopback connect:", e)
