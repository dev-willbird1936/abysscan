"""Prints the emulator that must run this ELF in front of the sample, or nothing when the kernel can run it directly.

The sandbox is x86-64 under gVisor: an x86-64 binary runs as it is, and every other machine (i386, ARM, AArch64, MIPS,
PowerPC, SPARC) runs under qemu-user, because gVisor has no 32-bit compatibility and no foreign instruction set. Only a
path from this table is ever printed, so the dispatcher in run.sh cannot be steered at anything else.
"""
import sys

MACHINES = {
    # The sandbox runs under gVisor, which has no IA32 (32-bit) support: an i386 binary must be emulated even on x86-64.
    (1, 3): "/usr/bin/qemu-i386-static",
    (1, 40): "/usr/bin/qemu-arm-static",
    (1, 8): "/usr/bin/qemu-mips-static",
    (1, 20): "/usr/bin/qemu-ppc-static",
    (2, 183): "/usr/bin/qemu-aarch64-static",
    (2, 21): "/usr/bin/qemu-ppc64-static",
    (1, 43): "/usr/bin/qemu-sparc-static",
}
HERE = {(2, 62)}


def main():
    with open(sys.argv[1], "rb") as handle:
        header = handle.read(20)
    if len(header) < 20 or header[:4] != bytes([0x7F, 0x45, 0x4C, 0x46]):
        return
    key = (header[4], int.from_bytes(header[18:20], "little"))
    if key in HERE:
        return
    print(MACHINES.get(key, ""))


main()
