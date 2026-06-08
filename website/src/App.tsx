import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  CheckSquare,
  Chrome,
  Download,
  FileInput,
  FolderInput,
  Github,
  ListChecks,
  ScrollText,
  Trash2,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  siteDescription,
  siteTitle,
  siteUrl,
  githubRepoUrl,
  latestMainZipUrl,
  continuousReleaseUrl,
} from '@/config/site';

export default function App() {
  const canonical = siteUrl ? `${siteUrl}/` : undefined;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GPT Organizer',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: siteDescription,
    url: canonical ?? githubRepoUrl,
    codeRepository: githubRepoUrl,
    downloadUrl: latestMainZipUrl,
  };

  return (
    <>
      <Helmet>
        <html lang="en" />
        <title>{siteTitle}</title>
        <meta name="description" content={siteDescription} />
        <meta
          name="keywords"
          content="ChatGPT, Chrome extension, sidebar organizer, batch delete, projects, import export"
        />
        {canonical ? <link rel="canonical" href={canonical} /> : null}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={siteTitle} />
        <meta property="og:description" content={siteDescription} />
        {canonical ? <meta property="og:url" content={canonical} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={siteTitle} />
        <meta name="twitter:description" content={siteDescription} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent" className="font-normal">
                  Chrome
                </Badge>
                <Badge variant="secondary">MV3</Badge>
                <Badge variant="outline">Private / local</Badge>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">GPT Organizer</h1>
              <p className="max-w-xl text-muted-foreground">
                Batch-select ChatGPT sidebar conversations — delete, move to projects, export metadata, and apply
                import plans. No Chrome Web Store required.
              </p>
            </div>
            <a
              href={`${githubRepoUrl}#readme`}
              className={cn(buttonVariants({ variant: 'default', size: 'lg' }), 'no-underline')}
            >
              <Github className="size-4" aria-hidden />
              Source code
            </a>
          </div>
        </header>

        <main className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-12">
          <section className="flex flex-col gap-4 text-left" aria-labelledby="install-heading">
            <h2 id="install-heading" className="text-xl font-semibold">
              Install (Chrome)
            </h2>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Download className="size-5 text-primary" aria-hidden />
                  Pre-built ZIP from latest <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">main</code>
                </CardTitle>
                <CardDescription>
                  Every green build on <code className="rounded bg-muted px-1 font-mono">main</code> publishes the same
                  file at a stable URL — no Bun, no clone.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-3">
                  <a
                    href={latestMainZipUrl}
                    className={cn(
                      buttonVariants({ variant: 'default', size: 'lg' }),
                      'no-underline inline-flex items-center gap-2',
                    )}
                  >
                    <Download className="size-4" aria-hidden />
                    Download ZIP (Chrome)
                  </a>
                  <a
                    href={continuousReleaseUrl}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'no-underline inline-flex items-center gap-2',
                    )}
                  >
                    <Github className="size-4" aria-hidden />
                    Continuous release
                  </a>
                </div>
                <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
                  <li>
                    Download{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                      gpt-organizer-chrome-main.zip
                    </code>{' '}
                    (link above).
                  </li>
                  <li>
                    Unzip — you get a folder with{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono">manifest.json</code> at the root (not an
                    extra nested <code className="rounded bg-muted px-1 font-mono">chrome-mv3</code> folder).
                  </li>
                  <li>
                    Open <code className="rounded bg-muted px-1.5 py-0.5 font-mono">chrome://extensions</code>, enable{' '}
                    <strong>Developer mode</strong>.
                  </li>
                  <li>
                    <strong>Load unpacked</strong> → select that extracted directory (not the ZIP file).
                  </li>
                  <li>
                    Open{' '}
                    <a className="text-primary underline" href="https://chatgpt.com/">
                      chatgpt.com
                    </a>{' '}
                    — the Organizer pill appears in the sidebar.
                  </li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Chrome className="size-5 text-primary" aria-hidden />
                  From source (developer)
                </CardTitle>
                <CardDescription>
                  If you change the code: build locally and point Chrome at{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">dist/chrome-mv3</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ol className="list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
                  <li>
                    Install{' '}
                    <a className="text-primary underline" href="https://bun.sh">
                      Bun
                    </a>
                    , clone the repo.
                  </li>
                  <li>
                    In the project root:{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
                      bun install && bun run build
                    </code>
                  </li>
                  <li>
                    Open <code className="rounded bg-muted px-1.5 py-0.5 font-mono">chrome://extensions</code>, enable{' '}
                    <strong>Developer mode</strong>.
                  </li>
                  <li>
                    <strong>Load unpacked</strong> → select{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono">dist/chrome-mv3</code>.
                  </li>
                </ol>
                <Separator />
                <p className="text-sm text-muted-foreground">
                  Fast iteration with HMR:{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">bun run dev</code> → load{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">dist/chrome-mv3-dev</code>.
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="flex flex-col gap-4 text-left" aria-labelledby="features-heading">
            <h2 id="features-heading" className="text-xl font-semibold">
              What it does
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckSquare className="size-4" aria-hidden />
                    Sidebar selection
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Checkboxes on visible conversations. <strong>Shift+click</strong> selects a range between two
                  checkboxes.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trash2 className="size-4" aria-hidden />
                    Batch delete
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Select multiple chats and delete them in one action from the Actions tab.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FolderInput className="size-4" aria-hidden />
                    Move to project
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Move selected conversations into a ChatGPT project using your existing session.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileInput className="size-4" aria-hidden />
                    Import / export
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Export metadata (JSON/CSV), analyze in ChatGPT, import a plan, preview, then apply.
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListChecks className="size-5" aria-hidden />
                  Organizer panel
                </CardTitle>
                <CardDescription>
                  Minimized by default — small “Organizer · N” pill. Expand for Actions and Logs tabs.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <ScrollText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  Logs persist in <code className="rounded bg-muted px-1 font-mono">localStorage</code> and can be
                  exported as JSON.
                </p>
                <p>
                  Uses your ChatGPT session (<code className="rounded bg-muted px-1 font-mono">/api/auth/session</code> +
                  backend API) — no copied tokens.
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="rounded-lg border border-border bg-muted/40 p-6 text-left">
            <h2 className="mb-2 text-lg font-semibold">Privacy</h2>
            <p className="text-sm text-muted-foreground">
              The extension runs locally in your browser on chatgpt.com. It uses your existing login session to call
              ChatGPT APIs — data is not sent to any third-party server operated by the extension author. Not published
              to the Chrome Web Store; install only from this site or the GitHub release.
            </p>
          </section>
        </main>

        <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
          <a href={githubRepoUrl} className="text-primary underline">
            GitHub — gpt-organizer
          </a>
          {canonical ? (
            <>
              {' '}
              ·{' '}
              <a href={`${canonical}sitemap.xml`} className="underline">
                sitemap
              </a>
            </>
          ) : null}
        </footer>
      </div>
    </>
  );
}
