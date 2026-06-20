import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-windows-signing.ps1");
const powershellPromise = findPowerShell();

test("windows signing check warns but passes when signing is optional", async (t) => {
  const powershell = await powershellPromise;
  if (!powershell) {
    t.skip("PowerShell is not available in this environment.");
    return;
  }

  const result = await runSigningCheck(powershell);

  assert.equal(result.code, 0);
  assert.match(result.combined, /missing: CSC_LINK, CSC_KEY_PASSWORD/);
});

test("windows signing check fails when signing is required and env is missing", async (t) => {
  const powershell = await powershellPromise;
  if (!powershell) {
    t.skip("PowerShell is not available in this environment.");
    return;
  }

  const result = await runSigningCheck(powershell, ["-RequireSigning"]);

  assert.equal(result.code, 1);
  assert.match(result.combined, /missing: CSC_LINK, CSC_KEY_PASSWORD/);
});

test("windows signing check passes when signing env is configured", async (t) => {
  const powershell = await powershellPromise;
  if (!powershell) {
    t.skip("PowerShell is not available in this environment.");
    return;
  }

  const result = await runSigningCheck(powershell, ["-RequireSigning"], {
    CSC_LINK: "placeholder-cert-ref",
    CSC_KEY_PASSWORD: "placeholder-password"
  });

  assert.equal(result.code, 0);
  assert.match(result.combined, /Windows code-signing environment is configured/);
});

async function findPowerShell() {
  for (const command of process.platform === "win32" ? ["powershell", "pwsh"] : ["pwsh", "powershell"]) {
    const result = await runCommand(command, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
    if (result.code === 0) return command;
  }
  return null;
}

function runSigningCheck(powershell, args = [], extraEnv = {}) {
  return runCommand(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], extraEnv);
}

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        ...extraEnv
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", () => resolve({ code: null, stdout, stderr, combined: `${stdout}${stderr}` }));
    child.on("close", (code) => resolve({ code, stdout, stderr, combined: `${stdout}${stderr}` }));
  });
}
