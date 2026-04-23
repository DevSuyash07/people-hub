import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
      <div>
        {eyebrow && (
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.05]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-3 max-w-xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
