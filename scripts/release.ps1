# Release helper for SE-MENU.
# Usage:  .\scripts\release.ps1 1.0.1 "what changed"
# Bumps package.json, commits, tags v1.0.1, and pushes (triggers GitHub Actions build+release).

param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = "Release v$Version"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# bump package.json version
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $root 'package.json')

git add package.json
git commit -m "chore: bump version to $Version" 2>&1 | Out-Null
git tag "v$Version"
git push origin main
git push origin "v$Version"

Write-Host "Tagged and pushed v$Version. GitHub Actions will build and publish the release." -ForegroundColor Green