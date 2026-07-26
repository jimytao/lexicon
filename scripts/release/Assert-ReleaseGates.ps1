<#
.SYNOPSIS
  Hard gates before git push / gh release. Fail = stop the release.

.PARAMETER Version
  Semver without leading v, e.g. 0.8.6

.EXAMPLE
  .\scripts\release\Assert-ReleaseGates.ps1 -Version 0.8.6
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}

Set-Location $RepoRoot

$failed = @()
function Fail([string]$msg) {
  $script:failed += $msg
  Write-Host "FAIL: $msg" -ForegroundColor Red
}

$v = $Version.TrimStart('v')
$exe = Join-Path $RepoRoot "src-tauri\target\release\bundle\nsis\Lexicon_${v}_x64-setup.exe"
$sig = "$exe.sig"
$msi = Join-Path $RepoRoot "src-tauri\target\release\bundle\msi\Lexicon_${v}_x64_en-US.msi"
$versionJson = Join-Path $RepoRoot 'version.json'

if (-not (Test-Path $exe)) { Fail "Missing NSIS exe: $exe" }
if (-not (Test-Path $msi)) { Fail "Missing MSI: $msi" }
if (-not (Test-Path $sig)) {
  Fail "Missing updater .sig next to exe. Run Sign-TauriBundle.ps1 or rebuild with Load-ReleaseEnv.ps1."
}

# version.json structure
if (-not (Test-Path $versionJson)) { Fail 'Missing version.json' }
$bytes = [System.IO.File]::ReadAllBytes($versionJson)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  Fail 'version.json has UTF-8 BOM — Tauri updater will fail. Rewrite with UTF8Encoding($false).'
}

$manifest = Get-Content $versionJson -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.version -ne $v) {
  Fail "version.json.version=$($manifest.version) != expected $v"
}

$expectedUrl = "https://github.com/jimytao/lexicon/releases/download/v$v/Lexicon_${v}_x64-setup.exe"
$plat = $manifest.platforms.'windows-x86_64'
if (-not $plat) { Fail 'version.json missing platforms.windows-x86_64' }
if ($plat.url -ne $expectedUrl) {
  Fail "windows url mismatch.`n  got: $($plat.url)`n  want: $expectedUrl"
}

if (Test-Path $sig) {
  $sigText = (Get-Content $sig -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($plat.signature)) {
    Fail 'version.json signature is empty'
  }
  if ($plat.signature.Trim() -ne $sigText) {
    Fail 'version.json signature does not match Lexicon_*_x64-setup.exe.sig contents'
  }
  if ($plat.signature -match 'PLACEHOLDER') {
    Fail 'version.json still contains PLACEHOLDER signature'
  }
}

# platforms must be Windows-only (empty android/ios signatures break Tauri whole-file validation)
$platNames = @($manifest.platforms.PSObject.Properties.Name)
$extra = $platNames | Where-Object { $_ -ne 'windows-x86_64' }
if ($extra) {
  Fail "version.json platforms has non-Windows keys (breaks updater): $($extra -join ', ')"
}

if ($null -eq $manifest.is_major) {
  Write-Warning 'version.json has no is_major — default is fine; prefer explicit false for patch releases'
} elseif ($manifest.is_major -eq $true) {
  Write-Warning 'is_major=true — only OK if user explicitly requested a major release toast'
}

# Android APKs (root copies expected by upload step)
$apkNames = @(
  "Lexicon_${v}_universal_signed.apk",
  "Lexicon_${v}_arm64-v8a_signed.apk",
  "Lexicon_${v}_armeabi-v7a_signed.apk",
  "Lexicon_${v}_x86_signed.apk",
  "Lexicon_${v}_x86_64_signed.apk"
)
foreach ($name in $apkNames) {
  $p = Join-Path $RepoRoot $name
  if (-not (Test-Path $p)) {
    Fail "Missing release APK copy in repo root: $name (copy from android/app/build/outputs/apk/release/)"
  }
}

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "=== RELEASE GATES FAILED ($($failed.Count)) — DO NOT PUSH / DO NOT gh release ===" -ForegroundColor Red
  $failed | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "[release-gates] OK for v$v (exe/msi/sig, version.json no-BOM, signature match, 5 APKs)" -ForegroundColor Green
exit 0
