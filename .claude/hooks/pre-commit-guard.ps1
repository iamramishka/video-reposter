[CmdletBinding()]
param(
  [ValidateSet("TouchedWorkspace", "CommitCommand", "PreCommit", "Ship", "Lint")]
  [string]$Mode = "PreCommit"
)

$ErrorActionPreference = "Stop"

function Set-RepoRoot {
  $root = (& git rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($root)) {
    throw "pre-commit guard must run inside a git repository."
  }
  Set-Location $root.Trim()
}

function Invoke-Process {
  param(
    [string]$Label,
    [string]$Command,
    [string[]]$Arguments,
    [bool]$Block = $true
  )

  Write-Host "==> $Label"
  & $Command @Arguments
  $code = $LASTEXITCODE
  if ($code -eq 0) {
    return $true
  }

  $message = "$Label failed with exit code $code."
  if ($Block) {
    throw $message
  }

  Write-Warning $message
  return $false
}

function Read-HookInput {
  $raw = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  try {
    return $raw | ConvertFrom-Json
  } catch {
    Write-Warning "Could not parse Claude hook input JSON."
    return $null
  }
}

function Get-ToolCommand {
  param($HookInput)

  if ($null -eq $HookInput) {
    return ""
  }

  foreach ($name in @("command", "script")) {
    if ($HookInput.PSObject.Properties.Name -contains $name) {
      return [string]$HookInput.$name
    }
  }

  if ($HookInput.PSObject.Properties.Name -contains "tool_input") {
    foreach ($name in @("command", "script")) {
      if ($HookInput.tool_input.PSObject.Properties.Name -contains $name) {
        return [string]$HookInput.tool_input.$name
      }
    }
  }

  return ""
}

function Get-TouchedPath {
  param($HookInput)

  if ($null -eq $HookInput -or -not ($HookInput.PSObject.Properties.Name -contains "tool_input")) {
    return $null
  }

  $toolInput = $HookInput.tool_input
  foreach ($name in @("file_path", "path")) {
    if ($toolInput.PSObject.Properties.Name -contains $name) {
      return [string]$toolInput.$name
    }
  }

  if ($toolInput.PSObject.Properties.Name -contains "edits" -and $toolInput.edits.Count -gt 0) {
    $firstEdit = $toolInput.edits[0]
    if ($firstEdit.PSObject.Properties.Name -contains "file_path") {
      return [string]$firstEdit.file_path
    }
  }

  return $null
}

function Get-WorkspaceName {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $null
  }

  $normalized = $Path.Replace("\", "/")
  if ($normalized -match "(^|/)backend/") { return "backend" }
  if ($normalized -match "(^|/)desktop-app/") { return "desktop-app" }
  if ($normalized -match "(^|/)admin-dashboard/") { return "admin-dashboard" }
  return $null
}

function Invoke-TypecheckForWorkspace {
  param(
    [string]$Workspace,
    [bool]$Block = $true
  )

  switch ($Workspace) {
    "backend" { return Invoke-Process "typecheck backend" "npm" @("run", "typecheck", "-w", "backend") $Block }
    "desktop-app" { return Invoke-Process "typecheck desktop-app" "npm" @("run", "typecheck", "-w", "desktop-app") $Block }
    "admin-dashboard" { return Invoke-Process "typecheck admin-dashboard" "npm" @("run", "typecheck", "-w", "admin-dashboard") $Block }
    default { return Invoke-Process "typecheck all workspaces" "npm" @("run", "typecheck") $Block }
  }
}

function Invoke-LintGuard {
  param([bool]$Block = $true)

  Write-Host "==> lint guard"
  $patterns = @("*.ts", "*.tsx", "*.js", "*.jsx", "*.cts", "*.mts", "*.mjs", "*.cjs")
  $files = @(& git ls-files --cached --others --exclude-standard -- $patterns)
  $findings = New-Object System.Collections.Generic.List[string]

  foreach ($file in $files) {
    if ($file -match "(^|/)(dist|dist-electron|dist-renderer|release|node_modules)/") {
      continue
    }
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      continue
    }

    $lineNumber = 0
    foreach ($line in Get-Content -LiteralPath $file) {
      $lineNumber += 1
      if ($line -match "\bdebugger\s*;") {
        $findings.Add("${file}:${lineNumber} contains debugger statement.")
      }
      if ($line -match "\b(describe|it|test)\.only\s*\(") {
        $findings.Add("${file}:${lineNumber} contains focused test.")
      }
    }
  }

  if ($findings.Count -eq 0) {
    return $true
  }

  $findings | ForEach-Object { Write-Error $_ }
  if ($Block) {
    throw "lint guard failed."
  }

  return $false
}

function Invoke-SecretScan {
  param(
    [ValidateSet("Staged", "Tracked")]
    [string]$Scope,
    [bool]$Block = $true
  )

  $arguments = @("-ExecutionPolicy", "Bypass", "-File", ".claude/hooks/secret-scan.ps1", "-Scope", $Scope)
  return Invoke-Process "secret scan ($Scope)" "powershell" $arguments $Block
}

function Invoke-PreCommit {
  Invoke-LintGuard $true | Out-Null
  Invoke-Process "typecheck" "npm" @("run", "typecheck") $true | Out-Null
  Invoke-Process "tests" "npm" @("test") $true | Out-Null
  Invoke-SecretScan "Staged" $true | Out-Null
}

function Invoke-Ship {
  Invoke-LintGuard $true | Out-Null
  Invoke-Process "typecheck" "npm" @("run", "typecheck") $true | Out-Null
  Invoke-Process "tests" "npm" @("test") $true | Out-Null
  Invoke-Process "build" "npm" @("run", "build") $true | Out-Null
  Invoke-SecretScan "Tracked" $true | Out-Null
  Invoke-Process "npm audit high (report)" "npm" @("audit", "--workspaces", "--audit-level=high") $false | Out-Null
}

Set-RepoRoot

try {
  switch ($Mode) {
    "TouchedWorkspace" {
      $inputJson = Read-HookInput
      $path = Get-TouchedPath $inputJson
      $workspace = Get-WorkspaceName $path
      if ($workspace) {
        Invoke-TypecheckForWorkspace $workspace $false | Out-Null
      }
      exit 0
    }
    "CommitCommand" {
      $command = Get-ToolCommand (Read-HookInput)
      if ($command -match "(^|[\s;&|])git\s+commit\b") {
        Invoke-PreCommit
      }
      exit 0
    }
    "PreCommit" {
      Invoke-PreCommit
      exit 0
    }
    "Ship" {
      Invoke-Ship
      exit 0
    }
    "Lint" {
      Invoke-LintGuard $true | Out-Null
      exit 0
    }
  }
} catch {
  Write-Error $_
  exit 1
}
