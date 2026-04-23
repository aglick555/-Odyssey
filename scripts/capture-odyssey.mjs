import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "artifacts", "screenshots");
const url = process.env.ODYSSEY_URL || "http://127.0.0.1:5173";
const quality = process.env.ODYSSEY_QUALITY || "safe";
const shouldStartServer = process.env.ODYSSEY_START_SERVER !== "0";
const waitMs = Number(process.env.ODYSSEY_WAIT_MS || 900);
const viewportWidth = Number(process.env.ODYSSEY_VIEWPORT_WIDTH || 1728);
const viewportHeight = Number(process.env.ODYSSEY_VIEWPORT_HEIGHT || 1040);
const outputName = process.env.ODYSSEY_OUTPUT || `odyssey-${quality}.png`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(targetUrl, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(targetUrl);
      if (response.ok || response.status < 500) return;
    } catch {
      // keep waiting
    }
    await sleep(350);
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}

function startVite() {
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return child;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  let server = null;
  if (shouldStartServer) {
    server = startVite();
    await waitForServer(url);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: viewportWidth, height: viewportHeight },
    deviceScaleFactor: 1,
  });

  const consoleLines = [];
  page.on("console", (message) => {
    const text = `[${message.type()}] ${message.text()}`;
    consoleLines.push(text);
    console.log(text);
  });
  page.on("pageerror", (error) => {
    const text = `[pageerror] ${error.message}`;
    consoleLines.push(text);
    console.log(text);
  });

  const pageUrl = `${url}?quality=${encodeURIComponent(quality)}&capture=1`;
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 45000 });

  // If the safe shell is present, select requested quality and render once.
  const qualityButton = page.getByRole("button", { name: new RegExp(`^${quality}$`, "i") });
  if (await qualityButton.count()) {
    await qualityButton.first().click();
  }

  const renderButton = page.getByRole("button", { name: /render flow/i });
  if (await renderButton.count()) {
    await renderButton.first().click();
  }

  // Let canvas settle; cinematic render is bounded by app-side controls.
  await page.waitForTimeout(waitMs);

  const outputPath = path.join(outDir, outputName);
  await page.screenshot({ path: outputPath, fullPage: true });
  await fs.writeFile(path.join(outDir, `console-${quality}.log`), consoleLines.join("\n"));
  await browser.close();

  if (server) {
    server.kill("SIGTERM");
  }

  console.log(`Screenshot saved: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
