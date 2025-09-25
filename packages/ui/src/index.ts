import { clsx } from "clsx";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes
} from "react";

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

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500",
        className
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  requiredIndicator?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, children, requiredIndicator, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={clsx("flex items-center gap-1 text-sm font-medium text-slate-300", className)}
      {...props}
    >
      {children}
      {requiredIndicator ? <span className="text-emerald-400">*</span> : null}
    </label>
  );
});

Label.displayName = "Label";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={clsx("rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-slate-950/40", className)}
      {...props}
    />
  );
});

Card.displayName = "Card";

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx("flex flex-col gap-2 border-b border-slate-800 px-6 py-5", className)} {...props} />
);

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx("px-6 py-6", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={clsx("flex flex-col gap-3 border-t border-slate-800 px-6 py-5", className)} {...props} />
);
