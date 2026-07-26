<#
.SYNOPSIS
  Load Lexicon release secrets and set Tauri / Android signing env vars correctly.

.DESCRIPTION
  - Reads root `.env.release` (KEY=VALUE lines; # comments / blank lines ignored).
  - Prefer TAURI_SIGNING_PRIVATE_KEY_PATH (file path). Never put a path string into
    TAURI_SIGNING_PRIVATE_KEY (that causes silent missing .sig).
  - Clears TAURI_SIGNING_PRIVATE_KEY so it cannot conflict with -f / KEY_PATH.
  - Maps ANDROID_* → KEYSTORE_PASSWORD / KEY_PASSWORD for android/app/build.gradle.

.EXAMPLE
  . .\scripts\release\Load-ReleaseEnv.ps1
  npm run tauri:build
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}

Set-Location $RepoRoot

$envFile = Join-Path $RepoRoot '.env.release'
$keyFile = Join-Path $RepoRoot 'src-tauri\lexicon.key'
Write-Host "[release-env] RepoRoot=$RepoRoot"

if (-not (Test-Path $envFile)) {
  throw "Missing $envFile — copy .env.release.example and fill secrets."
}
if (-not (Test-Path $keyFile)) {
  throw "Missing $keyFile — Tauri minisign private key required for updater signatures."
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    # Strip optional surrounding quotes
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  throw 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD missing in .env.release'
}

# Canonical Tauri path: KEY_PATH only (content env must be absent)
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = (Resolve-Path $keyFile).Path

# Android Gradle expects KEYSTORE_PASSWORD / KEY_PASSWORD
if ($env:ANDROID_KEYSTORE_PASSWORD) {
  $env:KEYSTORE_PASSWORD = $env:ANDROID_KEYSTORE_PASSWORD
}
if ($env:ANDROID_KEY_PASSWORD) {
  $env:KEY_PASSWORD = $env:ANDROID_KEY_PASSWORD
}

Write-Host "[release-env] Loaded .env.release"
Write-Host "[release-env] TAURI_SIGNING_PRIVATE_KEY_PATH=$($env:TAURI_SIGNING_PRIVATE_KEY_PATH)"
Write-Host "[release-env] TAURI_SIGNING_PRIVATE_KEY cleared (use path only)"
Write-Host "[release-env] Android KEYSTORE_PASSWORD set: $([bool]$env:KEYSTORE_PASSWORD)"
