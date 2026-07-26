<#
.SYNOPSIS
  Copy Gradle release APKs to repo-root Lexicon_X.X.X_*_signed.apk names for gh upload.
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
$src = Join-Path $RepoRoot 'android\app\build\outputs\apk\release'

$map = @{
  'app-universal-release.apk'   = "Lexicon_${v}_universal_signed.apk"
  'app-arm64-v8a-release.apk'   = "Lexicon_${v}_arm64-v8a_signed.apk"
  'app-armeabi-v7a-release.apk' = "Lexicon_${v}_armeabi-v7a_signed.apk"
  'app-x86-release.apk'         = "Lexicon_${v}_x86_signed.apk"
  'app-x86_64-release.apk'      = "Lexicon_${v}_x86_64_signed.apk"
}

foreach ($kv in $map.GetEnumerator()) {
  $from = Join-Path $src $kv.Key
  $to = Join-Path $RepoRoot $kv.Value
  if (-not (Test-Path $from)) { throw "Missing $from — run gradlew assembleRelease first" }
  Copy-Item $from $to -Force
  Write-Host "[apk] $($kv.Value)"
}
