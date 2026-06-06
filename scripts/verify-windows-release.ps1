[CmdletBinding()]
param(
    [string]$ReleaseDirectory,
    [switch]$RequireSignature,
    [switch]$KeepInstall
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Step {
    param([string]$Message)
    Write-Host "[check] $Message" -ForegroundColor Cyan
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Stop-NewProcesses {
    param([int[]]$BaselineIds)

    $newProcesses = Get-Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Id -notin $BaselineIds -and
            ($_.ProcessName -like "Video Reposter*" -or $_.ProcessName -like "VideoReposter*")
        }

    foreach ($process in $newProcesses) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}

function Wait-ForNewAppProcess {
    param(
        [int[]]$BaselineIds,
        [int]$TimeoutSeconds = 180
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $process = Get-Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Id -notin $BaselineIds -and
                ($_.ProcessName -like "Video Reposter*" -or $_.ProcessName -like "VideoReposter*")
            } |
            Select-Object -First 1

        if ($process) {
            return $process
        }

        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "Video Reposter did not launch within $TimeoutSeconds seconds."
}

function Test-Signature {
    param([System.IO.FileInfo]$Artifact)

    $signature = Get-AuthenticodeSignature -LiteralPath $Artifact.FullName
    if ($signature.Status -eq "Valid") {
        Write-Host "[pass] Valid signature: $($Artifact.Name)" -ForegroundColor Green
        return
    }

    $message = "$($Artifact.Name) signature status is $($signature.Status)."
    if ($RequireSignature) {
        throw $message
    }

    Write-Warning "$message Public releases should be code-signed."
}

if ([string]::IsNullOrWhiteSpace($ReleaseDirectory)) {
    $ReleaseDirectory = Join-Path $PSScriptRoot "..\desktop-app\release"
}

$releasePath = [System.IO.Path]::GetFullPath($ReleaseDirectory)
Assert-True (Test-Path -LiteralPath $releasePath -PathType Container) "Release directory does not exist: $releasePath"

$setup = Get-ChildItem -LiteralPath $releasePath -Filter "Video Reposter-Setup-*-x64.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
$portable = Get-ChildItem -LiteralPath $releasePath -Filter "Video Reposter-Portable-*-x64.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

Assert-True ($null -ne $setup) "Setup installer was not found in $releasePath."
Assert-True ($null -ne $portable) "Portable executable was not found in $releasePath."

Write-Step "Generating SHA256SUMS.txt"
$hashLines = @($setup, $portable) | ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
    "$($hash.Hash)  $($_.Name)"
}
$checksumPath = Join-Path $releasePath "SHA256SUMS.txt"
Set-Content -LiteralPath $checksumPath -Value $hashLines -Encoding ascii
$hashLines | ForEach-Object { Write-Host "[pass] $_" -ForegroundColor Green }

Write-Step "Checking Authenticode signatures"
Test-Signature $setup
Test-Signature $portable

$baselineIds = @(Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$installPath = [System.IO.Path]::GetFullPath(
    (Join-Path $tempRoot ("VideoReposterReleaseCheck_" + [guid]::NewGuid().ToString("N")))
)

Assert-True ($installPath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) "Temporary install path escaped the system temp directory."
Assert-True ((Split-Path $installPath -Leaf).StartsWith("VideoReposterReleaseCheck_")) "Unexpected temporary install directory name."

try {
    Write-Step "Silently installing to $installPath"
    $installerProcess = Start-Process -FilePath $setup.FullName -ArgumentList @("/S", "/D=$installPath") -Wait -PassThru -WindowStyle Hidden
    Assert-True ($installerProcess.ExitCode -eq 0) "Setup installer exited with code $($installerProcess.ExitCode)."

    $installedApp = Join-Path $installPath "Video Reposter.exe"
    $uninstaller = Join-Path $installPath "Uninstall Video Reposter.exe"
    $ffmpeg = Join-Path $installPath "resources\bin\ffmpeg.exe"
    $ffprobe = Join-Path $installPath "resources\bin\ffprobe.exe"
    Assert-True (Test-Path -LiteralPath $installedApp -PathType Leaf) "Installed application executable is missing."
    Assert-True (Test-Path -LiteralPath $uninstaller -PathType Leaf) "Installed uninstaller is missing."
    Assert-True (Test-Path -LiteralPath $ffmpeg -PathType Leaf) "Bundled FFmpeg executable is missing."
    Assert-True (Test-Path -LiteralPath $ffprobe -PathType Leaf) "Bundled FFprobe executable is missing."
    Write-Host "[pass] Setup install contains the app, uninstaller, FFmpeg, and FFprobe." -ForegroundColor Green

    Write-Step "Launching the installed application"
    Start-Process -FilePath $installedApp -WindowStyle Hidden | Out-Null
    $installedProcess = Wait-ForNewAppProcess -BaselineIds $baselineIds -TimeoutSeconds 60
    Write-Host "[pass] Installed application launched as process $($installedProcess.Id)." -ForegroundColor Green
    Stop-NewProcesses -BaselineIds $baselineIds

    Write-Step "Launching the portable application (first extraction can take several minutes)"
    Start-Process -FilePath $portable.FullName -WindowStyle Hidden | Out-Null
    $portableProcess = Wait-ForNewAppProcess -BaselineIds $baselineIds -TimeoutSeconds 180
    Write-Host "[pass] Portable application launched as process $($portableProcess.Id)." -ForegroundColor Green
    Stop-NewProcesses -BaselineIds $baselineIds

    Write-Host "[pass] Windows release verification completed." -ForegroundColor Green
}
finally {
    Stop-NewProcesses -BaselineIds $baselineIds

    if ($KeepInstall) {
        Write-Host "[info] Temporary installation kept at $installPath" -ForegroundColor Yellow
    }
    elseif (Test-Path -LiteralPath $installPath) {
        $resolvedInstallPath = [System.IO.Path]::GetFullPath($installPath)
        $safeToDelete =
            $resolvedInstallPath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
            (Split-Path $resolvedInstallPath -Leaf).StartsWith("VideoReposterReleaseCheck_")

        if ($safeToDelete) {
            Remove-Item -LiteralPath $resolvedInstallPath -Recurse -Force
            Write-Host "[info] Removed temporary installation." -ForegroundColor DarkGray
        }
        else {
            Write-Warning "Skipped cleanup because the temporary path safety check failed: $resolvedInstallPath"
        }
    }
}
