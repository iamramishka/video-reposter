# Windows Release Checklist

Use this checklist before sharing the setup installer or portable executable with customers.

## Build

From the repository root:

```powershell
npm test
npm run build
npm run dist -w desktop-app
```

The release artifacts are created in `desktop-app/release/`.

## Automated Verification

Run:

```powershell
npm run verify:windows-release
```

The command:

- creates `desktop-app/release/SHA256SUMS.txt`
- checks Authenticode signature status
- silently installs into a unique temporary directory
- confirms the installed app, uninstaller, FFmpeg, and FFprobe exist
- launches the installed and portable applications
- removes only its own temporary installation

Unsigned builds produce a warning. To fail verification when a signature is missing:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-windows-release.ps1 -RequireSignature
```

Electron Builder automatically uses the standard `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables when a Windows code-signing certificate is available. Never commit the certificate or password.

## Separate Clean-PC Check

Copy the entire repository or the release artifacts and verification script to a separate Windows 10/11 x64 PC that has never had Video Reposter installed. Then:

1. Run `npm run verify:windows-release`, or run the script directly with `-ReleaseDirectory`.
2. Open the setup-installed app and activate a test license.
3. Import and process one supported video.
4. Repeat with the portable executable.
5. Confirm Windows Security does not quarantine the app.
6. Uninstall the setup version and confirm its shortcuts are removed.

Do not mark the clean-PC release check complete until this separate-machine run passes.
