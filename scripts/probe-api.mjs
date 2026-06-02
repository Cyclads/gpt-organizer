#!/usr/bin/env node
/**
 * Capture ChatGPT backend-api traffic + run read-only API probes in-page.
 *
 *   npm i playwright
 *   node scripts/probe-api.mjs
 *
 * Env:
 *   CHROME_USER_DATA_DIR — Chrome user data root (default: macOS Chrome path)
 *   CHROME_PROFILE       — profile folder name (default: Default)
 *   PROBE_HEADLESS       — "1" for headless (often blocked by ChatGPT)
 *   PROBE_WAIT_MS        — ms to wait after load for passive traffic (default 8000)
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const userDataRoot =
  process.env.CHROME_USER_DATA_DIR ||
  path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const profileName = process.env.CHROME_PROFILE || "Default";
const profilePath = path.join(userDataRoot, profileName);
const headless = process.env.PROBE_HEADLESS === "1";
const waitMs = Number(process.env.PROBE_WAIT_MS || 8000);
const manualWaitMs = Number(process.env.PROBE_MANUAL_WAIT_MS || 0);
const cdpUrl = process.env.CHROME_CDP_URL || "";
const outFile =
  process.env.PROBE_OUT ||
  path.join(process.cwd(), "docs/api-probe-report.json");

/** @type {object | null} */
let gizmoShapeFromNetwork = null;
/** @type {object | null} */
let conversationShapeFromNetwork = null;

/** @type {object[]} */
const captured = [];

/** @type {{ hasToken: boolean, email: string | null, keys: string[] } | null} */
let sessionFromNetwork = null;

function interestingUrl(url) {
  return (
    url.includes("/backend-api/") ||
    url.includes("/api/auth/") ||
    url.includes("/ces/") ||
    (url.includes("chatgpt.com") && url.includes("/api/"))
  );
}

function redactHeaders(headers) {
  const out = { ...headers };
  if (out.authorization) {
    out.authorization = "Bearer [REDACTED]";
  }
  if (out.Authorization) {
    out.Authorization = "Bearer [REDACTED]";
  }
  return out;
}

function summarizeBody(postData) {
  if (!postData) {
    return null;
  }
  try {
    return JSON.parse(postData);
  } catch {
    return postData.slice(0, 500);
  }
}

async function main() {
  if (!fs.existsSync(profilePath)) {
    console.error(`Profile not found: ${profilePath}`);
    process.exit(1);
  }

  console.error(`Using Chrome profile: ${profilePath}`);
  console.error(`Headless: ${headless}, passive wait: ${waitMs}ms`);

  /** @type {import('playwright').BrowserContext} */
  let context;
  let ownsContext = true;

  if (cdpUrl) {
    console.error(`Connecting over CDP: ${cdpUrl}`);
    const browser = await chromium.connectOverCDP(cdpUrl);
    context = browser.contexts()[0] || (await browser.newContext());
    ownsContext = false;
  } else {
    try {
      context = await chromium.launchPersistentContext(profilePath, {
        channel: "chrome",
        headless,
        viewport: { width: 1400, height: 900 },
        ignoreDefaultArgs: ["--enable-automation"],
        args: ["--disable-blink-features=AutomationControlled"],
      });
    } catch (err) {
      console.error(
        "Failed to launch Chrome profile (close Chrome or set CHROME_CDP_URL):",
        err.message,
      );
      process.exit(1);
    }
  }

  const page =
    context.pages().find((p) => p.url().includes("chatgpt.com")) ||
    context.pages()[0] ||
    (await context.newPage());

  page.on("request", (req) => {
    if (!interestingUrl(req.url())) {
      return;
    }
    captured.push({
      phase: "request",
      method: req.method(),
      url: req.url(),
      headers: redactHeaders(req.headers()),
      postData: summarizeBody(req.postData()),
    });
  });

  page.on("response", async (res) => {
    const req = res.request();
    if (!interestingUrl(res.url())) {
      return;
    }
    let bodySample = null;
    const ct = res.headers()["content-type"] || "";
    if (ct.includes("application/json")) {
      try {
        const text = await res.text();
        const parsed = JSON.parse(text);
        const path = new URL(res.url()).pathname;

        if (path === "/api/auth/session" && res.status() === 200) {
          sessionFromNetwork = {
            hasToken: Boolean(parsed?.accessToken),
            email: parsed?.user?.email || null,
            keys: Object.keys(parsed || {}),
          };
        }

        if (path.includes("/backend-api/gizmos/snorlax/sidebar") && res.status() === 200) {
          const first = parsed?.items?.[0];
          gizmoShapeFromNetwork = first
            ? {
                topLevelKeys: Object.keys(first),
                sampleId:
                  first.gizmo?.gizmo?.id || first.gizmo?.id || first.id,
                sampleName:
                  first.gizmo?.gizmo?.display?.name ||
                  first.gizmo?.display?.name,
              }
            : { empty: true };
        }

        if (path.includes("/backend-api/conversations") && res.status() === 200) {
          const first = parsed?.items?.[0];
          conversationShapeFromNetwork = first
            ? { keys: Object.keys(first), sampleGizmoId: first.gizmo_id ?? null }
            : { empty: true };
        }

        bodySample = parsed;
        if (Array.isArray(bodySample)) {
          bodySample = { _type: "array", length: bodySample.length };
        } else if (bodySample && typeof bodySample === "object") {
          const keys = Object.keys(bodySample);
          bodySample = {
            _keys: keys.slice(0, 30),
            ...(keys.includes("items") && Array.isArray(bodySample.items)
              ? { items_length: bodySample.items.length }
              : {}),
            ...(keys.includes("accessToken")
              ? { accessToken: "[present]" }
              : {}),
          };
        }
      } catch {
        bodySample = "[unparsed]";
      }
    }
    captured.push({
      phase: "response",
      method: req.method(),
      url: res.url(),
      status: res.status(),
      bodySample,
    });
  });

  if (!page.url().includes("chatgpt.com")) {
    await page.goto("https://chatgpt.com/", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
  }
  if (manualWaitMs > 0) {
    console.error(
      `Waiting ${manualWaitMs}ms — complete login / Cloudflare in the browser window…`,
    );
    await page.waitForTimeout(manualWaitMs);
  }
  await page.waitForTimeout(waitMs);

  const pageMeta = {
    url: page.url(),
    title: await page.title(),
  };

  const inPageProbe = await page.evaluate(async () => {
    async function readJsonSafe(res) {
      const text = await res.text();
      try {
        return { data: JSON.parse(text), rawPrefix: text.slice(0, 80) };
      } catch {
        return { data: null, rawPrefix: text.slice(0, 200) };
      }
    }

    async function getToken() {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      const { data, rawPrefix } = await readJsonSafe(res);
      return {
        ok: res.ok,
        status: res.status,
        hasToken: Boolean(data?.accessToken),
        email: data?.user?.email || null,
        rawPrefix: data ? undefined : rawPrefix,
      };
    }

    async function getSessionTokenField() {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      const { data } = await readJsonSafe(res);
      return data?.accessToken || null;
    }

    async function probeGet(url) {
      const token = await getSessionTokenField();
      if (!token) {
        return { url, error: "no accessToken" };
      }
      const res = await fetch(url, {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      let shape = null;
      try {
        const data = await res.json();
        if (Array.isArray(data)) {
          shape = { type: "array", length: data.length };
        } else if (data && typeof data === "object") {
          shape = {
            keys: Object.keys(data),
            itemsLength: Array.isArray(data.items) ? data.items.length : undefined,
            sampleItemKeys:
              data.items?.[0] && typeof data.items[0] === "object"
                ? Object.keys(data.items[0])
                : undefined,
            sampleConversationKeys:
              data.items?.[0]?.mapping || data.items?.[0]?.id
                ? Object.keys(data.items[0]).slice(0, 20)
                : data.items?.[0]
                  ? Object.keys(data.items[0])
                  : undefined,
          };
          if (data.items?.[0]?.gizmo_id !== undefined) {
            shape.sampleGizmoId = data.items[0].gizmo_id;
          }
        }
      } catch {
        shape = { parseError: true };
      }
      return { url, status: res.status, ok: res.ok, shape };
    }

    const auth = await getToken();
    const probes = await Promise.all([
      probeGet("/backend-api/conversations?offset=0&limit=3&order=updated"),
      probeGet(
        "/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0",
      ),
      probeGet("/backend-api/accounts/check/v4-2023-04-27"),
    ]);

    let gizmoItemShape = null;
    try {
      const token = await getSessionTokenField();
      const res = await fetch(
        "/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0",
        {
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      const first = data?.items?.[0];
      if (first) {
        gizmoItemShape = {
          topLevelKeys: Object.keys(first),
          gizmoKeys: first.gizmo ? Object.keys(first.gizmo) : null,
          nestedGizmoKeys: first.gizmo?.gizmo
            ? Object.keys(first.gizmo.gizmo)
            : null,
          sampleId:
            first.gizmo?.gizmo?.id || first.gizmo?.id || first.id || null,
          sampleName:
            first.gizmo?.gizmo?.display?.name ||
            first.gizmo?.display?.name ||
            null,
        };
      }
    } catch (e) {
      gizmoItemShape = { error: String(e) };
    }

    return {
      pageUrl: location.href,
      auth,
      probes,
      gizmoItemShape,
    };
  });

  const uniqueEndpoints = [
    ...new Set(
      captured.map((e) => `${e.method} ${new URL(e.url).pathname}`),
    ),
  ].sort();

  const patchBodies = captured
    .filter((e) => e.phase === "request" && e.method === "PATCH" && e.postData)
    .map((e) => ({
      path: new URL(e.url).pathname,
      body: e.postData,
    }));

  const report = {
    capturedAt: new Date().toISOString(),
    profilePath,
    cdpUrl: cdpUrl || null,
    pageMeta,
    sessionFromNetwork,
    gizmoShapeFromNetwork,
    conversationShapeFromNetwork,
    inPageProbe,
    uniqueEndpoints,
    patchBodiesObserved: patchBodies,
    passiveCaptureCount: captured.length,
    passiveCapture: captured.slice(-80),
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  const loggedIn =
    inPageProbe.auth?.hasToken || sessionFromNetwork?.hasToken || false;

  console.log(
    JSON.stringify(
      {
        savedTo: outFile,
        pageUrl: pageMeta.url,
        loggedIn,
        sessionFromNetwork,
        gizmoShapeFromNetwork,
        conversationShapeFromNetwork,
        uniqueEndpointCount: uniqueEndpoints.length,
        probes: inPageProbe.probes,
      },
      null,
      2,
    ),
  );

  if (ownsContext) {
    await context.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
