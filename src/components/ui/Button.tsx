import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  icon?: ReactNode;
}

export function Button({ className = "", variant = "primary", icon, children, ...props }: ButtonProps) {
  const variants = {
    primary: "bg-zinc-950 text-white hover:bg-zinc-800 disabled:bg-zinc-400",
    secondary: "border border-zinc-300 bg-white text-zinc-950 hover:bg-zinc-100 disabled:text-zinc-400",
    ghost: "text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-400",
  };

  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
