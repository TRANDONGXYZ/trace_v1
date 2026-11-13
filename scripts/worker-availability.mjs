import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const runFile = promisify(execFile);
// Read-only inspection: a previous enforced block must match the exact current
// executable's SHA-256 flat hash. Unsigned alone is not evidence of a block.
const probe = `
$ErrorActionPreference = 'Stop'
$blocked = $false
try {
  $state = Get-ItemPropertyValue -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy' -Name VerifiedAndReputablePolicyState
  if ($state -eq 1) {
    $hash = (Get-FileHash -LiteralPath $env:TRACE_WORKERD_PROBE_PATH -Algorithm SHA256).Hash
    $events = Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-CodeIntegrity/Operational'; Id=3077} -MaxEvents 200
    foreach ($event in $events) {
      $fields = @{}
      foreach ($field in ([xml]$event.ToXml()).Event.EventData.Data) { $fields[$field.Name] = $field.'#text' }
      if ($fields['PolicyName'] -eq 'VerifiedAndReputableDesktop' -and $fields['SHA256 Flat Hash'] -eq $hash) { $blocked = $true; break }
    }
  }
} catch { }
@{blocked=$blocked} | ConvertTo-Json -Compress
`;

export async function isWorkerBlocked({ platform = process.platform, env = process.env, execute = runFile } = {}) {
  if (platform !== 'win32') return false;
  try {
    const binary = env.MINIFLARE_WORKERD_PATH ?? require('workerd').default;
    const powershell = join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const { stdout } = await execute(powershell, ['-NoProfile', '-NonInteractive', '-Command', probe], {
      env: { ...env, TRACE_WORKERD_PROBE_PATH: binary }, windowsHide: true, timeout: 5000, maxBuffer: 4096,
    });
    return JSON.parse(stdout).blocked === true;
  } catch {
    // Inspection can be unavailable; let normal startup diagnose the service.
    // Its failure must still never terminate the frontend.
    return false;
  }
}
