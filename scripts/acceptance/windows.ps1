# Sets up the native acceptance environment on Windows: invented usage, invented workspace, the extension pre-installed in an
# isolated Kiro profile, and an opened Kiro window. Kiro asks YOU to sign in (nobody else may); the demo folder holds that login
# afterwards, so delete it when done. Env: BOBERT_REF (default main), BOBERT_VSIX (candidate path; default builds the checkout),
# BOBERT_TESTS=1 (also run the automated tests), BOBERT_DIR (checkout folder, default ~\bobert-acceptance).
$ErrorActionPreference = 'Continue'
$ref = if ($env:BOBERT_REF) { $env:BOBERT_REF } else { 'main' }
$dir = if ($env:BOBERT_DIR) { $env:BOBERT_DIR } else { "$HOME\bobert-acceptance" }
$out = "$HOME\bobert-acceptance-result.txt"; '' | Set-Content $out
function Say($m) { $m | Tee-Object -FilePath $out -Append }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
Say "date: $((Get-Date).ToUniversalTime().ToString('s'))Z  os: $((Get-CimInstance Win32_OperatingSystem).Caption)  arch: $env:PROCESSOR_ARCHITECTURE"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements; RefreshPath }
$nv = try { [int](node -p "process.versions.node.split('.')[0]") } catch { 0 }
if ($nv -lt 24) { winget install -e --id OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements; RefreshPath }
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) { npm.cmd install -g pnpm *> $null; $env:Path += ';' + (npm.cmd prefix -g) }
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) { Say 'pnpm missing: stopped'; return }
Say "node: $(node -v)  pnpm: $(pnpm.cmd -v)"
if (-not (Test-Path "$dir\.git")) { git clone -q https://github.com/StefanSuess/Bobert.git $dir }
Set-Location $dir; git fetch -q origin
git checkout -q --detach "origin/$ref" 2>$null; if ($LASTEXITCODE -ne 0) { git checkout -q --detach $ref }
Say "commit: $(git rev-parse --short=12 HEAD)"
pnpm.cmd install --frozen-lockfile *> $null; if ($LASTEXITCODE -ne 0) { Say 'install: FAIL'; return }
if ($env:BOBERT_TESTS -eq '1') {
  pnpm.cmd typecheck *> $null; Say "typecheck exit: $LASTEXITCODE"
  Say ((pnpm.cmd test 2>&1 | Select-String '^ℹ (pass|fail)') -join ' ')
  Say ((pnpm.cmd test:release 2>&1 | Select-String '^ℹ (pass|fail)') -join ' ')
}
$setupArgs = @('--rich', '--pace', 'high')
if ((Test-Path "$env:LOCALAPPDATA\Programs\Kiro\Kiro.exe") -or (Test-Path "$env:ProgramFiles\Kiro\Kiro.exe")) { $setupArgs += @('--install', '--open') }
else { Say 'KIRO_NOT_FOUND: install Kiro IDE for Windows first, then run this script again.' }
if ($env:BOBERT_VSIX) { $setupArgs += @('--vsix', $env:BOBERT_VSIX) }
pnpm.cmd demo:setup @setupArgs 2>&1 | Tee-Object -FilePath $out -Append
Say "Next: sign in to Kiro in the DEMO window, hide the status bar item 'Usage Meter' (it shows your real usage), then follow docs\test-inventory.md."
Say "Chat hints: run the 'Invented chat session' command printed above. Delete the demo folder afterwards (it holds your login)."
