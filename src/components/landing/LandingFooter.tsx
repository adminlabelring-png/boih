import { Linkedin, Instagram } from "lucide-react";


const LandingFooter = () => (
  <footer className="rounded-xl border bg-card p-6 mt-8">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="text-xs text-muted-foreground">
        © 2026 Labelring Ltd. Registered in England and Wales. Company No. 16816508.
      </div>
      <div className="flex flex-col items-center md:items-end gap-1.5">
        <div className="flex items-center gap-3">
          <a
            href="https://www.linkedin.com/company/labelring/posts/?feedView=all"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Labelring on LinkedIn"
            className="h-8 w-8 rounded-md border inline-flex items-center justify-center hover:bg-accent text-muted-foreground"
          >
            <Linkedin className="h-4 w-4" />
          </a>
          <a
            href="https://www.instagram.com/labelring/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Labelring on Instagram"
            className="h-8 w-8 rounded-md border inline-flex items-center justify-center hover:bg-accent text-muted-foreground"
          >
            <Instagram className="h-4 w-4" />
          </a>
        </div>
      </div>

    </div>
    <div className="mt-4 pt-4 border-t text-[11px] text-muted-foreground text-center md:text-left">
      Built in the UK · Compliant with UK GDPR
    </div>
  </footer>
);

export default LandingFooter;
