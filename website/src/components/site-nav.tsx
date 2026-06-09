import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Download, Github } from 'lucide-react';
import { githubRepoUrl, latestMainZipUrl } from '@/config/site';

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <a href="#" className="flex items-center gap-2.5 font-semibold text-foreground no-underline">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 rounded-lg" width={32} height={32} />
          <span>GPT Organizer</span>
        </a>
        <nav className="flex items-center gap-2">
          <a
            href={githubRepoUrl}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'no-underline hidden sm:inline-flex')}
          >
            <Github className="size-4" aria-hidden />
            GitHub
          </a>
          <a
            href={latestMainZipUrl}
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'no-underline inline-flex')}
          >
            <Download className="size-4" aria-hidden />
            Download
          </a>
        </nav>
      </div>
    </header>
  );
}
