# Analyse Python artifact-lock candidate

**Status: candidate only.** `deploy/detonation/analyse/requirements-cp312-linux-x86_64.candidate.txt` is not consumed by `Dockerfile.analyse` or any image recipe. Its fourteen version pins and SHA-256 values record selected published wheels; the candidate has not been resolved, built, downloaded, byte-verified, or approved for use. It does not establish a complete lock, reproducible image, verified dependencies, or milestone acceptance.

## Intended target

- CPython 3.12, Linux x86_64, as inferred from the selected artifact tags.
- Current `Dockerfile.analyse` still uses `python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f`; the effective architecture, Python patch version, operating-system variant and glibc version were not inspected or established here.
- NumPy and Contourpy candidate wheels declare a glibc 2.27 floor. Compatibility with the actual analyse base is unknown.
- The candidate's `--only-binary=:all:` and single hash per pin are intended to restrict later resolution to these selected wheel artifacts. They have not been exercised by a resolver.

## Candidate artifacts

Each source URL below is the exact-version PyPI release JSON used for the published `urls[].digests.sha256` value. These are artifact hashes, not `core-metadata.sha256` values. The wheel archives were not fetched or compared locally. Filenames describe the selected artifacts; they are not evidence of what pip currently selects or installs.

| Pin | Selected wheel filename | Published SHA-256 | Official release metadata |
|---|---|---|---|
| `pandas==2.3.3` | `pandas-2.3.3-cp312-cp312-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl` | `b3d11d2fda7eb164ef27ffc14b4fcab16a80e1ce67e9f57e19ec0afaf715ba89` | [PyPI JSON](https://pypi.org/pypi/pandas/2.3.3/json) |
| `matplotlib==3.10.7` | `matplotlib-3.10.7-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl` | `d5f256d49fea31f40f166a5e3131235a5d2f4b7f44520b1cf0baf1ce568ccff0` | [PyPI JSON](https://pypi.org/pypi/matplotlib/3.10.7/json) |
| `numpy==2.3.3` | `numpy-2.3.3-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl` | `d9192da52b9745f7f0766531dcfa978b7763916f158bb63bdb8a1eca0068ab20` | [PyPI JSON](https://pypi.org/pypi/numpy/2.3.3/json) |
| `contourpy==1.3.3` | `contourpy-1.3.3-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl` | `4d00e655fcef08aba35ec9610536bfe90267d7ab5ba944f7032549c55a146da1` | [PyPI JSON](https://pypi.org/pypi/contourpy/1.3.3/json) |
| `cycler==0.12.1` | `cycler-0.12.1-py3-none-any.whl` | `85cef7cff222d8644161529808465972e51340599459b8ac3ccbac5a854e0d30` | [PyPI JSON](https://pypi.org/pypi/cycler/0.12.1/json) |
| `fonttools==4.60.1` | `fonttools-4.60.1-py3-none-any.whl` | `906306ac7afe2156fcf0042173d6ebbb05416af70f6b370967b47f8f00103bbb` | [PyPI JSON](https://pypi.org/pypi/fonttools/4.60.1/json) |
| `kiwisolver==1.4.9` | `kiwisolver-1.4.9-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl` | `f6008a4919fdbc0b0097089f67a1eb55d950ed7e90ce2cc3e640abadd2757a04` | [PyPI JSON](https://pypi.org/pypi/kiwisolver/1.4.9/json) |
| `packaging==26.3` | `packaging-26.3-py3-none-any.whl` | `d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c` | [PyPI JSON](https://pypi.org/pypi/packaging/26.3/json) |
| `Pillow==11.3.0` | `pillow-11.3.0-cp312-cp312-manylinux2014_x86_64.manylinux_2_17_x86_64.whl` | `67172f2944ebba3d4a7b54f2e95c786a3a50c21b88456329314caaa28cda70f6` | [PyPI JSON](https://pypi.org/pypi/pillow/11.3.0/json) |
| `pyparsing==3.3.3` | `pyparsing-3.3.3-py3-none-any.whl` | `ece8c00a69cf01b45d0b1dedabb469c90d8caf996d4fda40f147627a122849a4` | [PyPI JSON](https://pypi.org/pypi/pyparsing/3.3.3/json) |
| `python-dateutil==2.9.0.post0` | `python_dateutil-2.9.0.post0-py2.py3-none-any.whl` | `a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427` | [PyPI JSON](https://pypi.org/pypi/python-dateutil/2.9.0.post0/json) |
| `pytz==2025.2` | `pytz-2025.2-py2.py3-none-any.whl` | `5ddf76296dd8c44c26eb8f4b6f35488f3ccbf6fbbd7adee0b7262d43f0ec2f00` | [PyPI JSON](https://pypi.org/pypi/pytz/2025.2/json) |
| `tzdata==2025.2` | `tzdata-2025.2-py2.py3-none-any.whl` | `1a403fada01ff9221ca8044d701868fa132215d84beb92242d9acd2147f667a8` | [PyPI JSON](https://pypi.org/pypi/tzdata/2025.2/json) |
| `six==1.17.0` | `six-1.17.0-py2.py3-none-any.whl` | `4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274` | [PyPI JSON](https://pypi.org/pypi/six/1.17.0/json) |

## Dependency rationale

`pandas==2.3.3` declares NumPy, python-dateutil, pytz and tzdata dependencies. `matplotlib==3.10.7` declares contourpy, cycler, fonttools, kiwisolver, NumPy, packaging, Pillow, pyparsing and python-dateutil dependencies. Contourpy requires NumPy; python-dateutil requires six. The fourteen rows comprise the two existing root pins plus twelve explicit transitive selections.

The selected versions satisfy the dependency constraints manually inspected in the retained metadata report; no resolver established the graph. `packaging==26.3`, `pyparsing==3.3.3` and `six==1.17.0` reuse existing project pins. Other transitive versions are source-backed candidate selections near the root release period, not observations of installed versions or claims that the selections are latest, security-vetted, compatible or upgrade-safe. The fonttools universal wheel and Pillow manylinux2014 wheel are deliberate artifact choices; the selected package releases also publish other platform files.

## Unresolved checks

- Confirm the pinned base image's effective OS/architecture, CPython patch version and glibc before considering the x86_64 wheel set.
- Recheck selected wheel metadata and the full dependency graph against the chosen target; the retained research used manual declared-edge comparisons only.
- Establish the selected package versions' security and licence suitability.
- Separately authorize any future resolver, package download, byte verification, build, image lock refresh or runtime acceptance. This candidate supplies none of that evidence.

`Dockerfile.analyse`, `images.lock.json` and all active recipes remain unchanged. Do not describe this candidate as the image's effective lock or as proof that the current image contains these versions.
