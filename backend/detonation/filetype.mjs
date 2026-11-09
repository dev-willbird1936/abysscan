// Content-based file type detection (SPEC §5.2) and size tiers (SPEC §6.6). Pure: never runs or parses a sample beyond header bytes.

const MB = 1024 * 1024;
const TEXT_SAMPLE = 64 * 1024;

// detectedType -> extensions that are consistent with it. Their union is the set of "known" claimed extensions.
const EXTENSIONS = {
  zip: ['zip', 'jar', 'apk'], jar: ['jar', 'zip'], apk: ['apk', 'zip'],
  docx: ['docx'], docm: ['docm'], xlsx: ['xlsx'], xlsm: ['xlsm'], pptx: ['pptx'], pptm: ['pptm'],
  doc: ['doc'], xls: ['xls'], ppt: ['ppt'], msg: ['msg'], msi: ['msi'],
  ole2: ['doc', 'xls', 'ppt', 'msg', 'msi'],
  pdf: ['pdf'], ps: ['ps', 'eps'], rtf: ['rtf'], eml: ['eml'],
  exe: ['exe', 'scr', 'com', 'cpl'], dll: ['dll', 'xll', 'cpl', 'ocx'], elf: ['elf', 'so'],
  html: ['html', 'htm'], svg: ['svg'], hta: ['hta'], url: ['url', 'website'], // an Internet Shortcut: a text file that is only a URL
  py: ['py', 'pyw'], sh: ['sh', 'bash'], ps1: ['ps1', 'psm1'], vbs: ['vbs', 'vbe'], bat: ['bat', 'cmd'],
  'js-node': ['js', 'mjs', 'cjs'], 'js-wsh': ['js', 'jse', 'wsf'],
  macho: ['dylib', 'bundle'], dmg: ['dmg'], pkg: ['pkg'], one: ['one'],
  png: ['png'], jpeg: ['jpg', 'jpeg'], gif: ['gif'], '7z': ['7z'], rar: ['rar'], lnk: ['lnk'],
  text: ['txt', 'csv', 'log', 'json'],
  // The long tail: every type this file can name. Only the mismatch signal uses this table; the path does not.
  gz: ['gz', 'tgz'], bz2: ['bz2', 'tbz2'], xz: ['xz', 'txz'], zst: ['zst'], lz4: ['lz4'], tar: ['tar'],
  cab: ['cab'], iso: ['iso', 'img'], deb: ['deb'], rpm: ['rpm'], ar: ['ar', 'a'], cpio: ['cpio'], vhd: ['vhd', 'vhdx'], qcow: ['qcow', 'qcow2'],
  rtf: ['rtf'], chm: ['chm'], sqlite: ['sqlite', 'sqlite3', 'db'],
  perl: ['pl', 'pm'], ruby: ['rb'], php: ['php', 'phtml', 'php3', 'php4', 'php5'], lua: ['lua'], tcl: ['tcl'], awk: ['awk'], r: ['r'], xml: ['xml'], yaml: ['yml', 'yaml'],
  pem: ['pem', 'crt', 'cer', 'key', 'pub'], pgp: ['pgp', 'gpg', 'asc'],
  wasm: ['wasm'], class: ['class'], dex: ['dex'], macho: ['macho'], fatmacho: ['dylib', 'bundle'],
  bmp: ['bmp'], tiff: ['tif', 'tiff'], ico: ['ico'], webp: ['webp'], heic: ['heic', 'avif'], psd: ['psd'],
  wav: ['wav'], avi: ['avi'], flac: ['flac'], ogg: ['ogg', 'oga'], mp3: ['mp3'], mp4: ['mp4', 'm4a', 'mov', 'm4v'], mkv: ['mkv', 'webm'], midi: ['mid', 'midi'],
  ttf: ['ttf'], otf: ['otf'], ttc: ['ttc'], woff: ['woff'], woff2: ['woff2'],
  unknown: [],
};
const KNOWN_EXTENSIONS = new Set(Object.values(EXTENSIONS).flat());
// Text scripts have no mandatory magic header. Failure to recognize their syntax does not prove a disguised extension.
const TEXT_SCRIPT_EXTENSIONS = new Set(['py', 'pyw', 'sh', 'bash', 'ps1', 'psm1', 'vbs', 'vbe', 'bat', 'cmd', 'js', 'mjs', 'cjs', 'pl', 'pm', 'rb', 'php', 'lua', 'tcl', 'awk', 'r']);

// DETONATION-DESIGN §2 paths. Everything else is inspect-only (unpack, static analysis).
const RUN = new Set(['pdf', 'html', 'svg', 'docx', 'docm', 'xlsx', 'xlsm', 'doc', 'xls', 'pptx', 'ps1', 'py', 'sh', 'perl', 'php', 'ruby', 'lua', 'class', 'js-node', 'elf', 'jar']);
const WINE = new Set(['exe', 'dll', 'bat', 'js-wsh', 'vbs', 'hta', 'msi']);
// DETONATION-DESIGN §2 "Hackathon scope"; other types return "unsupported type: inspected only".
const SUPPORTED = new Set([
  'zip', 'pdf', 'docx', 'docm', 'xlsx', 'xlsm', 'doc', 'xls', 'pptx', 'exe', 'html', 'svg', 'eml',
  'py', 'sh', 'perl', 'php', 'ruby', 'lua', 'class', 'ps1', 'rtf', 'msg', 'js-node', 'js-wsh', 'vbs', 'bat', 'elf', // the image ships every interpreter here; elf is exec'd under runsc, a class runs on the JVM, an rtf is unpacked by rtfobj
]);

// Types 7zz opens (deploy/detonation/runner/unpack.py). Their entries become children, typed and run like any upload, so a
// dropper inside a .7z or a .tar.gz is executed instead of being a footnote.
export const ARCHIVE_TYPES = new Set(['zip', 'jar', 'apk', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz', 'zst', 'lz4', 'cab', 'iso', 'deb', 'rpm', 'ar', 'cpio']);

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);
const ascii = (buf, at, text) => buf.length >= at + text.length && buf.toString('latin1', at, at + text.length) === text;
const riff = (buf, kind) => ascii(buf, 0, 'RIFF') && ascii(buf, 8, kind);
const utf16 = (s) => Buffer.from(s, 'utf16le');

function zipEntryNames(buf) {
  const names = [];
  const sigs = [
    { sig: Buffer.from('PK\x03\x04', 'latin1'), lenAt: 26, nameAt: 30 },
    { sig: Buffer.from('PK\x01\x02', 'latin1'), lenAt: 28, nameAt: 46 },
  ];
  for (const { sig, lenAt, nameAt } of sigs) {
    for (let i = buf.indexOf(sig); i !== -1; i = buf.indexOf(sig, i + 4)) {
      if (i + nameAt > buf.length) break;
      const len = buf.readUInt16LE(i + lenAt);
      names.push(buf.toString('latin1', i + nameAt, i + nameAt + len));
    }
  }
  return names;
}

function detectZip(buf) {
  const names = zipEntryNames(buf);
  if (!names.includes('[Content_Types].xml')) {
    if (names.includes('AndroidManifest.xml') && names.includes('classes.dex')) return 'apk';
    return names.includes('META-INF/MANIFEST.MF') || names.some((n) => n.endsWith('.class')) ? 'jar' : 'zip';
  }
  const kind = names.some((n) => n.startsWith('word/')) ? 'doc'
    : names.some((n) => n.startsWith('xl/')) ? 'xls'
    : names.some((n) => n.startsWith('ppt/')) ? 'ppt' : null;
  if (!kind) return 'zip';
  return kind + (names.some((n) => n.endsWith('vbaProject.bin')) ? 'm' : 'x');
}

function detectOle2(buf) {
  if (buf.includes(Buffer.from([0x84, 0x10, 0x0c, 0, 0, 0, 0, 0, 0xc0, 0, 0, 0, 0, 0, 0, 0x46]))) return 'msi';
  if (buf.includes(utf16('WordDocument'))) return 'doc';
  if (buf.includes(utf16('Workbook')) || buf.includes(utf16('Book'))) return 'xls';
  if (buf.includes(utf16('PowerPoint Document'))) return 'ppt';
  if (buf.includes(utf16('__properties_version1.0'))) return 'msg';
  // A message whose property stream was stripped still carries its attachment streams (`__substg1.0_…`): the payload is what
  // matters, so the container is treated as a message and its attachments are extracted.
  if (buf.includes(utf16('__substg1.0_')) && !buf.includes(utf16('WordDocument'))) return 'msg';
  return 'ole2';
}

function detectPe(buf) {
  if (!startsWith(buf, [0x4d, 0x5a]) || buf.length < 0x40) return null;
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || !startsWith(buf, [0x50, 0x45, 0, 0], pe)) return null;
  return buf.readUInt16LE(pe + 22) & 0x2000 ? 'dll' : 'exe';
}

// feedface/feedfacf in either byte order, or a fat header. cafebabe also starts Java .class files, whose next
// u32 is minor/major version (>= 45); a fat header holds a small architecture count.
function isMachO(buf) {
  if (buf.length < 8) return false;
  const magic = buf.readUInt32BE(0);
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) return true;
  return (magic === 0xcafebabe || magic === 0xcafebabf) && buf.readUInt32BE(4) >= 1 && buf.readUInt32BE(4) <= 30;
}

const ONENOTE_GUID = [0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d, 0xae, 0xb1, 0x53, 0x78, 0xd0, 0x29, 0x96, 0xd3];

function detectText(buf) {
  const head = buf.subarray(0, TEXT_SAMPLE);
  const utf16le = startsWith(head, [0xff, 0xfe]);
  // A stray NUL does not make a document unidentifiable: the Trivial.Html family carries them and still loads in a browser.
  if (!utf16le && head.includes(0)) {
    const loose = head.toString('latin1');
    if (/<html[\s>]|<!doctype\s+html|<script[\s>]|<body[\s>]|<svg[\s>]/i.test(loose)) return 'html';
    return 'unknown';
  }
  const text = head.toString(utf16le ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
  const trimmed = text.trimStart();
  const first = trimmed.split(/\r?\n/, 1)[0];

  if (trimmed.startsWith('%!PS')) return 'ps';
  if (trimmed.startsWith('{\\rtf')) return 'rtf';
  if (/^#!/.test(trimmed)) {
    if (/python/.test(first)) return 'py';
    if (/\bnode\b/.test(first)) return 'js-node';
    if (/\b(pwsh|powershell)\b/.test(first)) return 'ps1';
    if (/\b(ba|z|da)?sh\b/.test(first)) return 'sh';
    if (/\bperl[0-9.]*\b/.test(first)) return 'perl';
    if (/\b(?:ruby[0-9.]*|jruby)\b/.test(first)) return 'ruby';
    if (/\bphp[0-9.]*\b/.test(first)) return 'php';
    if (/\b(?:lua(?:jit)?[0-9.]*)\b/.test(first)) return 'lua';
    if (/\b(tclsh|wish)\b/.test(first)) return 'tcl';
    if (/\b(awk|gawk|mawk|nawk)\b/.test(first)) return 'awk';
    if (/(^|\/)Rscript\b/.test(first)) return 'r';
  }

  // An Internet Shortcut is a text file that is only a URL: the payload is where it points.
  if (/\[\s*InternetShortcut\s*\]/i.test(trimmed) && /^URL\s*=/im.test(trimmed)) return 'url';
  if (/^<\?php/i.test(trimmed)) return 'php';
  if (/^<\?xml/i.test(trimmed) && !/<(html|svg|hta)[\s>]/i.test(trimmed.slice(0, 4096))) return 'xml';
  if (/^-----BEGIN [A-Z ]+-----/.test(trimmed)) return 'pem';
  const headers = (trimmed.split(/\r?\n\r?\n/, 1)[0].match(/^[A-Za-z][\w-]*:[ \t]/gm) ?? []).map((h) => h.toLowerCase());
  if (headers.length >= 3 && headers.some((h) => /^(from|to|subject|received|mime-version|message-id|return-path):/.test(h))) return 'eml';

  if (trimmed.startsWith('<')) {
    const markup = trimmed.slice(0, 4096);
    if (/<svg[\s>]/i.test(markup)) return 'svg';
    if (/<hta:application/i.test(markup)) return 'hta';
    if (/<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]|<iframe[\s>]/i.test(markup)) return 'html';
  }

  if (/^\s*(Dim\s+\w+|Set\s+\w+\s*=\s*CreateObject|On\s+Error\s+Resume\s+Next|Option\s+Explicit|MsgBox\b)/mi.test(text)) return 'vbs';
  if (/WScript\.|ActiveXObject|new\s+Enumerator\b/.test(text)) return 'js-wsh';
  if (/^\s*(\$\w+\s*=|param\s*\(|Write-(Host|Output)\b|Get-[A-Z]\w+|Invoke-\w+|Set-[A-Z]\w+|New-Object\b|Start-Process\b|Import-Module\b|\[System\.)/m.test(text)) return 'ps1';
  if (/^\s*(import\s+[\w.]+\s*$|import\s+[\w.]+\s*,|from\s+[\w.]+\s+import\s|def\s+\w+\s*\(.*\)\s*:|class\s+\w+.*:\s*$|if\s+__name__\s*==)/m.test(text)) return 'py';
  if (/\brequire\(|\bmodule\.exports\b|\bprocess\.(argv|env|exit)\b|^\s*import\s.+\sfrom\s+['"]|\bconsole\.log\(|\b(function\s+\w*\s*\(|(var|let|const)\s+\w+\s*=)/m.test(text)) return 'js-node';
  if (/^@?echo\s+off\b/mi.test(text) || (text.match(/^\s*(set\s+\w+=|goto\s|if\s+(not\s+)?exist\s|call\s|cmd\s+\/c|rem\s|::|start\s)/gmi)?.length ?? 0) >= 2) return 'bat';
  if (/^\s*(export\s+\w+=|if\s+\[|for\s+\w+\s+in\s|chmod\s|rm\s+-\w+\s)/m.test(text)) return 'sh';
  return 'text';
}

function isEmptyZip(buf) {
  if (buf.length < 22 || !startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) return false;
  return buf.readUInt16LE(4) === 0 && buf.readUInt16LE(6) === 0
    && buf.readUInt16LE(8) === 0 && buf.readUInt16LE(10) === 0
    && buf.readUInt32LE(12) === 0 && buf.readUInt32LE(16) === 0
    && buf.length === 22 + buf.readUInt16LE(20);
}

function detectContent(buf) {
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return detectZip(buf);
  if (isEmptyZip(buf)) return 'zip';
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return detectOle2(buf);
  if (startsWith(buf, ONENOTE_GUID)) return 'one';
  if (isMachO(buf)) return 'macho';
  if (startsWith(buf, [0x78, 0x61, 0x72, 0x21])) return 'pkg';
  if (buf.subarray(0, 1024).includes('%PDF-')) return 'pdf';
  const pe = detectPe(buf);
  if (pe) return pe;
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return 'elf';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (startsWith(buf, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return '7z';
  if (startsWith(buf, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return 'rar';
  if (startsWith(buf, [0x4c, 0, 0, 0, 0x01, 0x14, 0x02, 0])) return 'lnk';
  // Containers and disk images: 7zz opens every type in ARCHIVE_TYPES, so callers unpack their entries.
  if (startsWith(buf, [0x1f, 0x8b])) return 'gz';
  if (ascii(buf, 0, 'BZh')) return 'bz2';
  if (startsWith(buf, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return 'xz';
  if (startsWith(buf, [0x28, 0xb5, 0x2f, 0xfd])) return 'zst';
  if (startsWith(buf, [0x04, 0x22, 0x4d, 0x18])) return 'lz4';
  if (ascii(buf, 0, 'MSCF')) return 'cab';
  // A Debian package is an ar archive whose first member is `debian-binary`; anything else is a plain ar archive.
  if (ascii(buf, 0, '!<arch>')) return ascii(buf, 8, 'debian-binary') ? 'deb' : 'ar';
  if (startsWith(buf, [0xed, 0xab, 0xee, 0xdb])) return 'rpm';
  if (ascii(buf, 257, 'ustar')) return 'tar';
  if (ascii(buf, 32769, 'CD001')) return 'iso';
  if (ascii(buf, 0, '070701') || ascii(buf, 0, '070702')) return 'cpio';
  if (ascii(buf, 0, 'conectix')) return 'vhd';
  if (startsWith(buf, [0x51, 0x46, 0x49, 0xfb])) return 'qcow';
  // More executables and bytecode.
  if (startsWith(buf, [0x00, 0x61, 0x73, 0x6d])) return 'wasm';
  if (startsWith(buf, [0xca, 0xfe, 0xba, 0xbe])) return 'class';
  if (ascii(buf, 0, 'dex\n')) return 'dex';
  if (ascii(buf, 0, 'SQLite format 3')) return 'sqlite';
  if (ascii(buf, 0, 'ITSF')) return 'chm';
  // Images, sound, video and fonts: identified, inspected and reported, never executed.
  if (ascii(buf, 0, 'BM')) return 'bmp';
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (startsWith(buf, [0x00, 0x00, 0x01, 0x00])) return 'ico';
  if (riff(buf, 'WEBP')) return 'webp';
  if (riff(buf, 'WAVE')) return 'wav';
  if (riff(buf, 'AVI ')) return 'avi';
  if (ascii(buf, 0, 'fLaC')) return 'flac';
  if (ascii(buf, 0, 'OggS')) return 'ogg';
  if (ascii(buf, 0, 'MThd')) return 'midi';
  if (ascii(buf, 0, 'ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'mkv';
  if (ascii(buf, 4, 'ftyp')) return /^(heic|heix|mif1|avif|msf1)$/.test(buf.toString('latin1', 8, 12)) ? 'heic' : 'mp4';
  if (startsWith(buf, [0x00, 0x01, 0x00, 0x00]) || ascii(buf, 0, 'true')) return 'ttf';
  if (ascii(buf, 0, 'OTTO')) return 'otf';
  if (ascii(buf, 0, 'ttcf')) return 'ttc';
  if (ascii(buf, 0, 'wOFF')) return 'woff';
  if (ascii(buf, 0, 'wOF2')) return 'woff2';
  if (ascii(buf, 0, '8BPS')) return 'psd';
  if (buf.length >= 512 && buf.toString('latin1', buf.length - 512, buf.length - 508) === 'koly') return 'dmg';
  return detectText(buf);
}

// What a bare compression stream is expected to wrap: the inner suffix is a description, not a disguise.
const WRAPPED_IN = { gz: ['tar'], tgz: ['tar'], bz2: ['tar'], xz: ['tar'], zst: ['tar'], lz4: ['tar'], lzma: ['tar'] };


export function detectType(buffer, claimedName = '') {
  const detectedType = detectContent(buffer);
  const exts = String(claimedName).toLowerCase().split('.').slice(1);
  const accepted = EXTENSIONS[detectedType];
  // A compression stream names what it wraps (`control.tar.zst`), so that suffix is expected. Any other known suffix that the
  // detected type does not claim is a disguise: `invoice.pdf.html` is HTML wearing a PDF extension, which is the phishing trick.
  const wrapped = WRAPPED_IN[detectedType] || [];
  const wrong = exts.find((e) => KNOWN_EXTENSIONS.has(e) && !accepted.includes(e) && !wrapped.includes(e));
  const recognitionUncertain = detectedType === 'text' && wrong !== undefined
    && exts.filter(extension => KNOWN_EXTENSIONS.has(extension)).every(extension => TEXT_SCRIPT_EXTENSIONS.has(extension) || EXTENSIONS.text.includes(extension));
  const path = RUN.has(detectedType) ? 'run' : WINE.has(detectedType) ? 'wine' : 'inspect';
  return {
    detectedType,
    claimedExtension: wrong ?? exts.at(-1) ?? '',
    path,
    mismatch: wrong !== undefined && !recognitionUncertain,
    ...(recognitionUncertain ? { recognitionUncertain: true } : {}),
    // Supported means handled by a runner or an unpacker: executed, emulated, rendered, or opened so its entries become
    // children. A type that can only be fingerprinted (an image, a font, a database) stays inspect-only and marks the run
    // incomplete, which is the honest report of what was not analysed.
    supported: SUPPORTED.has(detectedType) || ARCHIVE_TYPES.has(detectedType),
  };
}

export function sizeTier(bytes) {
  if (bytes > 100 * MB) return 'reject';
  return bytes <= 10 * MB ? 'full' : 'static';
}
