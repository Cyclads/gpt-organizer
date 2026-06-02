#!/usr/bin/env node
/**
 * Optional: inspect live chatgpt.com DOM with your Chrome profile.
 *
 *   npm init -y && npm i playwright
 *   node scripts/probe-dom.mjs
 *
 * Set CHROME_USER_DATA_DIR to your profile, e.g.:
 *   ~/Library/Application Support/Google/Chrome
 * Use a dedicated profile copy to avoid locking your main browser.
 */

import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";

const userDataDir =
  process.env.CHROME_USER_DATA_DIR ||
  path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const profileDir = process.env.CHROME_PROFILE || "Default";

const browser = await chromium.launchPersistentContext(
  path.join(userDataDir, profileDir),
  {
    channel: "chrome",
    headless: false,
  },
);

const page = browser.pages()[0] || (await browser.newPage());
await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);

const report = await page.evaluate(() => {
  const convLinks = [
    ...document.querySelectorAll(
      'a[data-sidebar-item="true"][href*="/c/"]',
    ),
  ];
  const projects = [
    ...document.querySelectorAll(
      'a[data-sidebar-item="true"][href$="/project"]',
    ),
  ];
  return {
    url: location.href,
    conversationCount: convLinks.length,
    sampleConversations: convLinks.slice(0, 5).map((a) => ({
      href: a.getAttribute("href"),
      label: a.getAttribute("aria-label"),
      trigger: a
        .querySelector("[data-conversation-options-trigger]")
        ?.getAttribute("data-conversation-options-trigger"),
    })),
    projectCount: projects.length,
    sampleProjects: projects.slice(0, 5).map((a) => ({
      href: a.getAttribute("href"),
      label: a.getAttribute("aria-label"),
    })),
    testIds: [
      ...new Set(
        [...document.querySelectorAll("[data-testid]")].map((el) =>
          el.getAttribute("data-testid"),
        ),
      ),
    ]
      .filter((id) => /conv|history|project|sidebar/i.test(id || ""))
      .sort(),
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
