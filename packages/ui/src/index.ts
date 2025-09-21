import { clsx } from "clsx";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition";
    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      primary: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
      secondary: "border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500"
    };

    return <button ref={ref} className={clsx(base, variants[variant], className)} {...props} />;
  }
);

Button.displayName = "Button";
