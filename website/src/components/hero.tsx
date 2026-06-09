import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Download, Github } from 'lucide-react';
import { continuousReleaseUrl, githubRepoUrl, latestMainZipUrl } from '@/config/site';

export function Hero() {
  return (
    <section className="hero-glow hero-grid border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-8 px-4 py-16 sm:py-20 lg:py-24">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Chrome MV3</Badge>
          <Badge variant="outline">Not on Web Store</Badge>
          <Badge variant="accent">Free &amp; local</Badge>
        </div>

        <div className="flex max-w-3xl flex-col gap-4 text-left">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Organize your ChatGPT sidebar in bulk
          </h1>
          <p className="text-lg text-muted-foreground sm:text-xl">
            Checkboxes on conversations, batch delete, move to projects, and import/export metadata — using your
            existing ChatGPT session. Install in under a minute.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href={latestMainZipUrl}
            className={cn(
              buttonVariants({ variant: 'default', size: 'lg' }),
              'no-underline inline-flex items-center gap-2 shadow-md shadow-primary/20',
            )}
          >
            <Download className="size-4" aria-hidden />
            Download for Chrome
          </a>
          <a
            href="#install"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'no-underline inline-flex items-center gap-2')}
          >
            Install steps
            <ArrowRight className="size-4" aria-hidden />
          </a>
          <a
            href={githubRepoUrl}
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'no-underline inline-flex items-center gap-2')}
          >
            <Github className="size-4" aria-hidden />
            Source
          </a>
        </div>

        <p className="text-sm text-muted-foreground">
          Rolling build from <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">main</code> ·{' '}
          <a href={continuousReleaseUrl} className="text-primary underline">
            continuous release
          </a>
        </p>
      </div>
    </section>
  );
}
