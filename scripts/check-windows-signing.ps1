[CmdletBinding()]
param(
    [switch]$RequireSigning
)

$ErrorActionPreference = "Stop"

$hasCertificate = -not [string]::IsNullOrWhiteSpace($env:CSC_LINK)
$hasPassword = -not [string]::IsNullOrWhiteSpace($env:CSC_KEY_PASSWORD)

if ($hasCertificate -and $hasPassword) {
    Write-Host "[pass] Windows code-signing environment is configured." -ForegroundColor Green
    exit 0
}

$missing = @()
if (-not $hasCertificate) { $missing += "CSC_LINK" }
if (-not $hasPassword) { $missing += "CSC_KEY_PASSWORD" }

$message = "Windows code-signing environment is missing: $($missing -join ', '). Configure repository secrets WINDOWS_CSC_LINK and WINDOWS_CSC_KEY_PASSWORD for GitHub Actions, or set CSC_LINK and CSC_KEY_PASSWORD locally."

if ($RequireSigning) {
    Write-Error $message
    exit 1
}

Write-Warning $message
exit 0
