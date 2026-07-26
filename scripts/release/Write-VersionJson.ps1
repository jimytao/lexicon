<#
.SYNOPSIS
  Write root version.json (UTF-8 no BOM) with notes + signature from .sig file.

.EXAMPLE
  .\scripts\release\Write-VersionJson.ps1 -Version 0.8.6
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$RepoRoot = '',
  [string]$NotesZhPath = '',
  [string]$NotesEnPath = ''
)

$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
}

Set-Location $RepoRoot

$v = $Version.TrimStart('v')
$sigPath = Join-Path $RepoRoot "src-tauri\target\release\bundle\nsis\Lexicon_${v}_x64-setup.exe.sig"
if (-not (Test-Path $sigPath)) {
  throw "Missing $sigPath — run Sign-TauriBundle.ps1 first"
}

if (-not $NotesZhPath) { $NotesZhPath = Join-Path $RepoRoot 'release_notes_zh.md' }
if (-not $NotesEnPath) { $NotesEnPath = Join-Path $RepoRoot 'release_notes_en.md' }
if (-not (Test-Path $NotesZhPath)) { throw "Missing $NotesZhPath" }
if (-not (Test-Path $NotesEnPath)) { throw "Missing $NotesEnPath" }

$sig = (Get-Content $sigPath -Raw).Trim()
$zh = (Get-Content $NotesZhPath -Raw).TrimEnd() + "`n"
$en = (Get-Content $NotesEnPath -Raw).TrimEnd() + "`n"
$pub = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

$obj = [ordered]@{
  platforms = [ordered]@{
    'windows-x86_64' = [ordered]@{
      signature = $sig
      url       = "https://github.com/jimytao/lexicon/releases/download/v$v/Lexicon_${v}_x64-setup.exe"
    }
  }
  pub_date  = $pub
  version   = $v
  notes     = $zh
  notes_zh  = $zh
  notes_en  = $en
  is_major  = $false
}

$json = $obj | ConvertTo-Json -Depth 6
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$out = Join-Path $RepoRoot 'version.json'
[System.IO.File]::WriteAllText($out, $json, $utf8NoBom)

$b = [System.IO.File]::ReadAllBytes($out)
if ($b[0] -eq 0xEF) { throw 'BOM detected after write — abort' }

Write-Host "[version.json] Wrote $out (no BOM) version=$v pub_date=$pub"
