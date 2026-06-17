[CmdletBinding()]
param(
  [ValidateSet("Staged", "Tracked", "Path")]
  [string]$Scope = "Staged",
  [string]$Path
)

$ErrorActionPreference = "Stop"

function Set-RepoRoot {
  $root = (& git rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($root)) {
    throw "secret scan must run inside a git repository."
  }
  Set-Location $root.Trim()
}

function Get-CandidateFiles {
  switch ($Scope) {
    "Staged" {
      return @(& git diff --cached --name-only --diff-filter=ACM)
    }
    "Tracked" {
      return @(& git ls-files)
    }
    "Path" {
      if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "-Path is required when -Scope Path is used."
      }
      if (Test-Path -LiteralPath $Path -PathType Container) {
        return @(& git ls-files -- $Path)
      }
      return @($Path)
    }
  }
}

function Test-ShouldSkipFile {
  param([string]$File)

  if ([string]::IsNullOrWhiteSpace($File) -or -not (Test-Path -LiteralPath $File -PathType Leaf)) {
    return $true
  }

  if ($File -match "(^|/)(node_modules|dist|dist-electron|dist-renderer|release|coverage|\.git)/") {
    return $true
  }

  if ($File -match "(^|/)(package-lock\.json|.*\.png|.*\.jpg|.*\.jpeg|.*\.gif|.*\.ico|.*\.exe|.*\.dll|.*\.asar|.*\.zip)$") {
    return $true
  }

  $item = Get-Item -LiteralPath $File
  return $item.Length -gt 1MB
}

function Test-PlaceholderLine {
  param([string]$Line)

  return $Line -match "(?i)(your-|example|placeholder|dummy|sample|dev-only|admin12345|xxxx|\.\.\.|\$\{\{\s*secrets\.|<[^>]+>)"
}

function Get-ShannonEntropy {
  param([string]$Value)

  if ([string]::IsNullOrEmpty($Value)) {
    return 0
  }

  $counts = @{}
  foreach ($char in $Value.ToCharArray()) {
    $key = [string]$char
    if (-not $counts.ContainsKey($key)) {
      $counts[$key] = 0
    }
    $counts[$key] += 1
  }

  $entropy = 0.0
  foreach ($count in $counts.Values) {
    $p = $count / $Value.Length
    $entropy -= $p * [Math]::Log($p, 2)
  }
  return $entropy
}

Set-RepoRoot

$literalPatterns = @(
  @{ Name = "private key"; Pattern = "-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----" },
  @{ Name = "AWS access key"; Pattern = "AKIA[0-9A-Z]{16}" },
  @{ Name = "GitHub token"; Pattern = "gh[pousr]_[A-Za-z0-9_]{36,}" },
  @{ Name = "Slack token"; Pattern = "xox[baprs]-[A-Za-z0-9-]{20,}" },
  @{ Name = "Stripe live key"; Pattern = "sk_live_[A-Za-z0-9]{24,}" }
)

$keywordPattern = "(?i)\b(api[_-]?key|secret|token|password|private[_-]?key|service[_-]?role)\b\s*[:=]\s*[""']?([^""'\s#]{12,})"
$findings = New-Object System.Collections.Generic.List[string]

foreach ($file in Get-CandidateFiles) {
  $normalizedFile = $file.Replace("\", "/")
  if (Test-ShouldSkipFile $normalizedFile) {
    continue
  }

  $lineNumber = 0
  foreach ($line in Get-Content -LiteralPath $normalizedFile -ErrorAction Stop) {
    $lineNumber += 1
    if (Test-PlaceholderLine $line) {
      continue
    }

    foreach ($entry in $literalPatterns) {
      if ($line -match $entry.Pattern) {
        $findings.Add("${normalizedFile}:${lineNumber} potential $($entry.Name).")
      }
    }

    $keyword = [regex]::Match($line, $keywordPattern)
    if ($keyword.Success) {
      $assignedValue = $keyword.Groups[2].Value
      $isRuntimeExpression = $assignedValue -match "^(process\.env\.|import\.meta\.env\.|\$)" -or $assignedValue -match "[\?\.\(\)\[\]]"
      $isTestFixture = $normalizedFile -match "(^|/)tests/" -and $assignedValue -match "(?i)(password|token|secret|fixture|test|old-|new-|wrong-)"
      if (-not $isRuntimeExpression -and -not $isTestFixture) {
        $findings.Add("${normalizedFile}:${lineNumber} potential secret-like assignment for '$($keyword.Groups[1].Value)'.")
      }
    }

    if ($normalizedFile -notmatch "\.(md|json)$") {
      foreach ($tokenMatch in [regex]::Matches($line, "[A-Za-z0-9+/=_-]{32,}")) {
        $token = $tokenMatch.Value
        if ($token -match "^[a-fA-F0-9]+$") {
          continue
        }
        if ($token -match "^[A-Z0-9_-]+$" -or $token -match "^[a-z0-9_-]+$") {
          continue
        }
        $entropy = Get-ShannonEntropy $token
        if ($entropy -ge 4.2 -and $token -match "[A-Z]" -and $token -match "[a-z]" -and $token -match "\d") {
          $findings.Add("${normalizedFile}:${lineNumber} high-entropy token candidate.")
        }
      }
    }
  }
}

if ($findings.Count -gt 0) {
  $findings | Sort-Object -Unique | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Secret scan passed ($Scope)."
exit 0
