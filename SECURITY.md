# Security

This project is a **training simulator**. It does not run real malware. Public file upload is retired (`POST /api/jobs` answers 410 unless `DETONATION_UPLOADS=true`). The live demo is https://demo.abysscan.com.

## Report a vulnerability

Please **do not** open a public issue for a security problem in the live site, the sandbox pipeline, or the threat-search keys.

Email **willbird1936@gmail.com** with:

- which host or repository path is affected
- steps to reproduce
- impact (data exposure, sandbox escape, spend, impersonation)

We will acknowledge the report and say what we will change. There is no bug bounty.

## What this service does not do

- It does not download, store or execute visitor-supplied malware on the public site.
- Scene scripts are illustrations based on public reporting. They must not contain real URLs, hashes or working attack commands.
- Inference keys and Parallel keys live only in the server environment, never in this repository.

If you find a secret in a clone, treat it as leaked: rotate it and tell us.
