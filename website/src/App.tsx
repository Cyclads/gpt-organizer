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
  Shield,
  Trash2,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Hero } from '@/components/hero';
import { SiteNav } from '@/components/site-nav';
import {
  siteDescription,
  siteTitle,
  siteUrl,
  githubRepoUrl,
  latestMainZipUrl,
  continuousReleaseUrl,
} from '@/config/site';

const features = [
  {
    icon: CheckSquare,
    title: 'Sidebar selection',
    body: 'Checkboxes on visible conversations. Shift+click selects a range between two checkboxes.',
  },
  {
    icon: Trash2,
    title: 'Batch delete',
    body: 'Select multiple chats and delete them in one action from the Actions tab.',
  },
  {
    icon: FolderInput,
    title: 'Move to project',
    body: 'Move selected conversations into a ChatGPT project using your existing session.',
  },
  {
    icon: FileInput,
    title: 'Import / export',
    body: 'Export metadata (JSON/CSV), analyze in ChatGPT, import a plan, preview, then apply.',
  },
] as const;

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
        <SiteNav />
        <Hero />

        <main className="mx-auto flex max-w-5xl flex-col gap-16 px-4 py-16">
          <section className="flex flex-col gap-6 text-left" aria-labelledby="features-heading">
            <div className="flex flex-col gap-2">
              <h2 id="features-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Built for heavy ChatGPT users
              </h2>
              <p className="max-w-2xl text-muted-foreground">
                A lightweight panel in the sidebar — no account signup, no external servers.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, body }) => (
                <Card key={title} className="transition-colors hover:border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      {title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
                </Card>
              ))}
            </div>
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListChecks className="size-5 text-primary" aria-hidden />
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
                  Uses your ChatGPT session (<code className="rounded bg-muted px-1 font-mono">/api/auth/session</code>{' '}
                  + backend API) — no copied tokens.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="install" className="flex flex-col gap-6 text-left scroll-mt-20" aria-labelledby="install-heading">
            <div className="flex flex-col gap-2">
              <h2 id="install-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Install in Chrome
              </h2>
              <p className="text-muted-foreground">Developer mode → Load unpacked. No Chrome Web Store.</p>
            </div>

            <Card className="overflow-hidden border-primary/25 shadow-sm">
              <CardHeader className="border-b border-border bg-muted/30">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Download className="size-5 text-primary" aria-hidden />
                  Fastest: pre-built ZIP
                </CardTitle>
                <CardDescription>
                  Updated on every push to{' '}
                  <code className="rounded bg-muted px-1 font-mono">main</code> — stable download URL.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6 pt-6">
                <div className="flex flex-wrap gap-3">
                  <a
                    href={latestMainZipUrl}
                    className={cn(
                      buttonVariants({ variant: 'default', size: 'lg' }),
                      'no-underline inline-flex items-center gap-2',
                    )}
                  >
                    <Download className="size-4" aria-hidden />
                    Download ZIP
                  </a>
                  <a
                    href={continuousReleaseUrl}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'no-underline inline-flex items-center gap-2',
                    )}
                  >
                    <Github className="size-4" aria-hidden />
                    Release page
                  </a>
                </div>
                <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    'Download gpt-organizer-chrome-main.zip',
                    'Unzip — folder with manifest.json at the root',
                    'chrome://extensions → Developer mode',
                    'Load unpacked → pick that folder',
                    'Open chatgpt.com — Organizer pill in sidebar',
                  ].map((step, i) => (
                    <li
                      key={step}
                      className="flex gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Chrome className="size-5 text-primary" aria-hidden />
                  From source
                </CardTitle>
                <CardDescription>
                  For development: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">bun run dev</code>{' '}
                  → load <code className="rounded bg-muted px-1 font-mono">dist/chrome-mv3-dev</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <code className="block rounded-lg bg-muted p-4 font-mono text-foreground">
                  bun install && bun run build
                </code>
                <p className="mt-3">
                  Then load unpacked from <code className="rounded bg-muted px-1 font-mono">dist/chrome-mv3</code>.
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="rounded-xl border border-border bg-muted/40 p-8 text-left">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <h2 className="mb-2 text-lg font-semibold">Privacy</h2>
                <p className="text-sm text-muted-foreground">
                  Runs locally on chatgpt.com in your browser. Uses your login session to call ChatGPT APIs — nothing is
                  sent to a third-party server operated by the extension author. Install only from this site or GitHub
                  releases.
                </p>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
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
