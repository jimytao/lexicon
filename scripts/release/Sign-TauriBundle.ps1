<#
.SYNOPSIS
  Ensure NSIS setup.exe has a Tauri updater .sig (manual sign if build omitted it).

.DESCRIPTION
  Clears TAURI_SIGNING_PRIVATE_KEY so it cannot conflict with --private-key-path.
  Uses TAURI_SIGNING_PRIVATE_KEY_PATH + password from Load-ReleaseEnv.ps1.

.EXAMPLE
  . .\scripts\release\Load-ReleaseEnv.ps1
  .\scripts\release\Sign-TauriBundle.ps1 -Version 0.8.6
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

$v = $Version.TrimStart('v')
$exe = Join-Path $RepoRoot "src-tauri\target\release\bundle\nsis\Lexicon_${v}_x64-setup.exe"
$sig = "$exe.sig"

if (-not (Test-Path $exe)) {
  throw "Missing $exe — run tauri:build first"
}

. (Join-Path $scriptDir 'Load-ReleaseEnv.ps1') -RepoRoot $RepoRoot

# Critical: content-key env conflicts with --private-key-path
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue

if (Test-Path $sig) {
  Write-Host "[sign] .sig already exists: $sig"
  exit 0
}

Write-Host "[sign] No .sig after build — signing with private-key-path ..."
npx tauri signer sign `
  --private-key-path $env:TAURI_SIGNING_PRIVATE_KEY_PATH `
  --password $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD `
  $exe

if (-not (Test-Path $sig)) {
  throw "Signing finished but $sig still missing"
}

Write-Host "[sign] Wrote $sig (length=$((Get-Content $sig -Raw).Length))"
