# Bobert 1.0.0 short checks on Windows (run in PowerShell). Clones the public repo at commit 18af368, runs the automated checks,
# writes a summary to $HOME\bobert-vm-result.txt.
$ErrorActionPreference = 'Continue'
$out = "$HOME\bobert-vm-result.txt"; '' | Set-Content $out
function Say($m) { $m | Tee-Object -FilePath $out -Append }
Say "date: $((Get-Date).ToUniversalTime().ToString('s'))Z  os: $((Get-CimInstance Win32_OperatingSystem).Caption)  arch: $env:PROCESSOR_ARCHITECTURE"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements }
$nv = try { (node -p "process.versions.node.split('.')[0]") } catch { 0 }
if ([int]$nv -lt 24) { winget install -e --id OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements }
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
Say "node: $(node -v)"
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) { npm.cmd install -g pnpm *> $null }
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + (npm.cmd prefix -g)
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) { Say 'pnpm missing: stopped'; return }
Say "pnpm: $(pnpm.cmd -v)"
Set-Location $HOME; if (Test-Path bobert-vm) { Remove-Item -Recurse -Force bobert-vm }
git clone -q https://github.com/StefanSuess/Bobert.git bobert-vm; Set-Location bobert-vm; git checkout -q $(if ($env:BOBERT_REF) { $env:BOBERT_REF } else { "18af368" })
Say "commit: $(git rev-parse --short=12 HEAD)"
pnpm.cmd install --frozen-lockfile *> $null; Say "install exit: $LASTEXITCODE"
pnpm.cmd typecheck *> $null; Say "typecheck exit: $LASTEXITCODE"
Say ((pnpm.cmd test 2>&1 | Select-String '^ℹ (pass|fail|skipped)') -join ' ')
Say ((pnpm.cmd test:release 2>&1 | Select-String '^ℹ (pass|fail)') -join ' ')
pnpm.cmd release:build "$HOME\bobert-vm-candidate.vsix" *> $null; Say "vsix build exit: $LASTEXITCODE"
Say ((pnpm.cmd test:host "$HOME\bobert-vm-candidate.vsix" 2>&1 | Select-Object -Last 5) -join "`n")
Say "done. Result file: $out"
