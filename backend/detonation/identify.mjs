// Identify results (deploy/detonation/runner/identify.py) to evidence and a coverage detail (docs/SPEC.md 6.6 "Identify"). Pure.
// Static evidence adds Twilight signals only (EVIDENCE.md). Everything read here came out of the sandbox: shapes are checked, strings cut.

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, size = 120) => String(value ?? '').slice(0, size);
const item = (source, kind, at, detail, fields) => ({ source, kind, detail, at, ...fields });
const MAX_PINVOKE = 10;

/** One-line description of the headers for the coverage list, for example "PE x64 console; packed with UPX; unsigned". */
export function identifyDetail(identify) {
  const facts = isObject(identify) ? identify : {};
  if (!facts.format || facts.format === 'unknown') return 'The headers could not be read.';
  const packers = Array.isArray(facts.packers) ? facts.packers.map(name => text(name, 30)) : [];
  const signature = isObject(facts.signature) ? facts.signature.status : '';
  return [
    `${text(facts.format, 10).toUpperCase()} ${[facts.arch, facts.subsystem].filter(Boolean).map(value => text(value, 12)).join(' ')}`.trim(),
    packers.length ? `packed with ${packers.join(', ')}` : '',
    facts.dotnet === true ? '.NET assembly' : '',
    signature === 'unsigned' ? 'unsigned' : signature === 'invalid' ? 'signature does not verify' : signature === 'valid' ? 'signed' : '',
  ].filter(Boolean).join('; ');
}

/**
 * Items for one `identify` object and the optional `dotnet` metadata. A missing or invalid Authenticode signature is `unsigned`
 * (a signature that verifies is not evidence of anything). A packer or high-entropy code is `obfuscation`. A .NET assembly is read
 * with dnfile and never run, which is `emulation-stopped` (`dotnet-static-only`): its P/Invoke list and names add `suspicious` and
 * `obfuscation` items.
 */
export function mapIdentify(identify, dotnet, { at, classinfo } = {}) {
  const facts = isObject(identify) ? identify : {};
  const items = [];
  // The import table is what the program says it will do: an import is intent, not action, so these are Twilight signals.
  const API_GROUPS = [
    [/^(?:URLDownloadToFile|InternetOpen|InternetReadFile|InternetConnect|HttpOpenRequest|HttpSendRequest|WinHttp|WSAStartup|socket|connect|send|recv|sendto|getaddrinfo|inet_addr|URLDownloadToCacheFile)/i, 'downloads or talks to the network'],
    [/^(?:CreateProcess|WinExec|ShellExecute|ShellExecuteEx|system|execv|execl|popen|fork|posix_spawn)/i, 'starts other programs'],
    [/^(?:RegSetValue|RegCreateKey|RegOpenKey|CreateService|OpenSCManager|StartService|schtasks|RegSaveKey)/i, 'writes to the registry or installs a service'],
    [/^(?:VirtualAllocEx|WriteProcessMemory|CreateRemoteThread|QueueUserAPC|SetThreadContext|NtUnmapViewOfSection|SetWindowsHookEx|NtCreateThreadEx)/i, 'injects code into another process'],
    [/^(?:CryptEncrypt|CryptGenKey|CryptAcquireContext|BCryptEncrypt|CryptImportKey|CryptExportKey)/i, 'uses cryptography'],
    [/^(?:CryptUnprotectData|LsaEnumerateLogonSessions|SamQueryInformationUser|GetAsyncKeyState|SetWindowsHookEx|GetClipboardData|GetKeyboardState)/i, 'reads credentials, keys or the clipboard'],
    [/^(?:IsDebuggerPresent|CheckRemoteDebuggerPresent|NtQueryInformationProcess|OutputDebugString|GetTickCount|QueryPerformanceCounter)/i, 'checks whether it is being watched'],
    [/^(?:DeleteFile|MoveFileEx|FindFirstFile|FindNextFile|CopyFile|SetFileAttributes|encrypt|unlink|unlinkat|rmdir|rename|truncate|fchmod|chmod)/i, 'walks and changes files'],
    // The same table serves ELF: libc and libcurl names an imported symbol exposes.
    [/^(?:curl_easy_|curl_multi_|SSL_connect|SSL_read|BIO_new|TLS_client|gnutls_|ares_)/i, 'downloads or talks to the network'],
    [/^(?:ptrace|personality|prctl|sigaction|mallopt|setrlimit)/i, 'checks whether it is being watched'],
    [/^(?:EVP_EncryptInit|EVP_DecryptInit|AES_|mbedtls_|sodium_|gcry_)/i, 'uses cryptography'],
    [/^(?:getpwuid|getpwnam|setuid|setgid|getspnam|crypt)/i, 'reads credentials or changes its identity'],
  ];
  const LIBRARY_GROUPS = [
    [/^libcurl|^libssl|^libcrypto|^libgnutls|^libpcap|^libnss/i, 'links a networking, TLS or packet-capture library'],
  ];
  const imported = [
    ...(Array.isArray(facts.imports?.names) ? facts.imports.names : []),
    ...(Array.isArray(facts.imports?.dlls) ? facts.imports.dlls : []),
  ];
  const seenGroup = new Set();
  for (const name of imported) {
    const clean = text(name, 80);
    const group = API_GROUPS.find(([pattern]) => pattern.test(clean)) ?? LIBRARY_GROUPS.find(([pattern]) => pattern.test(clean));
    if (!group || seenGroup.has(group[1])) continue;
    seenGroup.add(group[1]);
    items.push(item('identify', 'suspicious', at, `The import table shows it ${group[1]}: ${clean}.`, { indicator: `imports ${group[1]}`, tool: 'pefile' }));
  }
  const magic = isObject(facts.magic) ? facts.magic : {};
  if (magic.description) items.push(item('identify', 'identified', at, `libmagic: ${text(magic.description, 200)}`, { tool: 'libmagic', mime: text(magic.mime, 80) }));
  const signature = isObject(facts.signature) ? facts.signature : {};
  if (['unsigned', 'invalid'].includes(signature.status)) {
    items.push(item('identify', 'unsigned', at, text(signature.detail, 160) || 'No valid Authenticode signature.', { reason: signature.status === 'unsigned' ? 'no Authenticode signature' : 'the Authenticode signature does not verify' }));
  }
  const packers = Array.isArray(facts.packers) ? facts.packers.map(name => text(name, 30)).filter(Boolean) : [];
  const highEntropy = Array.isArray(facts.highEntropyCode) ? facts.highEntropyCode.map(name => text(name, 16)) : [];
  if (packers.length) items.push(item('static', 'obfuscation', at, `The program is packed with ${packers.join(', ')}.`, { technique: `packed with ${packers.join(', ')}` }));
  else if (highEntropy.length) items.push(item('static', 'obfuscation', at, 'An executable section has near-random content.', { technique: 'high-entropy code section' }));
  if (isObject(dotnet) && !dotnet.error) {
    const pinvoke = Array.isArray(dotnet.suspiciousPinvoke) ? dotnet.suspiciousPinvoke.slice(0, MAX_PINVOKE) : [];
    for (const name of pinvoke) items.push(item('static', 'suspicious', at, `The assembly imports ${text(name, 60)} through P/Invoke.`, { indicator: `dotnet p/invoke ${text(name, 60)}`, tool: 'dnfile' }));
    if (Number(dotnet.oddNameRatio) >= 0.5 && Number(dotnet.namesChecked) >= 10) items.push(item('static', 'obfuscation', at, 'Most type and method names are unreadable.', { technique: 'obfuscated .NET names' }));
    // What the assembly says it is, and what it carries: a .NET loader almost always ships its payload as a resource.
    const assembly = text(dotnet.assembly, 60);
    const runtime = text(dotnet.runtime, 20);
    items.push(item('static', 'identified', at, `.NET assembly ${assembly || '(unnamed)'}${dotnet.version ? ` ${text(dotnet.version, 20)}` : ''}${runtime ? ` on runtime ${runtime}` : ''}: ${Number(dotnet.typeCount) || 0} type(s), ${Number(dotnet.methodCount) || 0} method(s).`, { tool: 'dnfile', assembly }));
    const resources = (Array.isArray(dotnet.resources) ? dotnet.resources : []).map(name => text(name, 40)).filter(Boolean);
    if (resources.length > 0) {
      items.push(item('static', 'suspicious', at, `The assembly carries ${resources.length} embedded resource(s): ${resources.slice(0, 5).join(', ')}.`, { indicator: 'embedded .NET resource', tool: 'dnfile', resources: resources.slice(0, 20) }));
    }
  } else if (facts.dotnet === true) {
    items.push(item('static', 'emulation-stopped', at, 'A .NET assembly could not be read; it is executed under Mono when the runtime takes it, and read statically otherwise.', { reason: 'dotnet-unreadable' }));
  }
  // A compiled Java class is a program in its own right: its pool names the class, the bytecode level and the strings it carries.
  if (isObject(classinfo) && !classinfo.error && classinfo.name) {
    const name = text(classinfo.name, 120);
    const version = text(classinfo.version, 12);
    items.push(item('static', 'identified', at, `Compiled Java class ${name}${version ? `, Java ${version} bytecode` : ''}.`, { tool: 'classfile', className: name }));
  }
  return items;
}
