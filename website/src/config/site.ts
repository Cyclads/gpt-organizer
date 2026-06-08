/** Public site URL (no trailing slash). Set VITE_SITE_URL when building for GitHub Pages. */
export const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

const defaultGithubRepo = 'benedyktdryl/gpt-organizer';
export const githubRepoSlug =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.replace(/^\/+|\/+$/g, '') || defaultGithubRepo;

export const githubRepoUrl = `https://github.com/${githubRepoSlug}`;

/** Rolling prerelease from `.github/workflows/release-main-zip.yml` (tag `continuous`). */
export const latestMainZipUrl = `https://github.com/${githubRepoSlug}/releases/download/continuous/gpt-organizer-chrome-main.zip`;

export const continuousReleaseUrl = `https://github.com/${githubRepoSlug}/releases/tag/continuous`;

export const siteTitle = 'GPT Organizer — batch organize ChatGPT sidebar';
export const siteDescription =
  'Private Chrome extension for chatgpt.com: sidebar checkboxes, batch delete, move to projects, and import/export metadata. Install without the Chrome Web Store.';
