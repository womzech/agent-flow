import { type HTMLAttributes, type ButtonHTMLAttributes, forwardRef } from "react";

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cls("rounded-lg border border-forge-line bg-forge-panel/60 p-5 shadow-panel", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cls("mb-3 flex items-center justify-between", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cls("text-base font-semibold text-ink-50", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cls("text-sm text-forge-muted", className)} {...props} />;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent-500 text-forge hover:bg-accent-400",
  secondary: "bg-forge-line/60 text-ink-100 hover:bg-forge-line",
  ghost: "text-ink-200 hover:bg-forge-line/40",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }>(
  function Button({ className, variant = "primary", size = "md", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cls("inline-flex items-center justify-center rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50", VARIANTS[variant], SIZES[size], className)}
        {...props}
      />
    );
  },
);

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "success" | "warning" | "danger"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    neutral: "bg-forge-line/60 text-ink-200",
    accent: "bg-accent-500/15 text-accent-300 border border-accent-500/30",
    success: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    danger: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  };
  return <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function KPI({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wider text-forge-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink-50">{value}</div>
      {hint ? <div className="mt-1 text-xs text-forge-muted">{hint}</div> : null}
    </Card>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center py-10 text-center">
      <div className="text-base font-semibold text-ink-100">{title}</div>
      {description ? <div className="mt-1 max-w-md text-sm text-forge-muted">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-100">{label}</span>
      {children}
      {hint ? <span className="text-xs text-forge-muted">{hint}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cls(
        "rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none transition focus:border-accent-500",
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cls(
        "min-h-[80px] rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none transition focus:border-accent-500",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cls(
        "rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none transition focus:border-accent-500",
        props.className,
      )}
    />
  );
}

export function Section({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-50">{title}</h2>
          {description ? <p className="text-sm text-forge-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-ink-50">{title}</h1>
        {description ? <p className="mt-1 text-sm text-forge-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
