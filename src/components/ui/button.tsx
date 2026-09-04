import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-revora-amber",
  {
    variants: {
      variant: {
        default: "bg-revora-amber text-revora-bg hover:bg-[#e0b68a]",
        secondary:
          "bg-revora-elevated text-revora-text border border-revora-border hover:bg-[#1f2330]",
        ghost: "text-revora-muted hover:text-revora-text hover:bg-revora-elevated",
        danger: "bg-revora-danger/15 text-revora-danger border border-revora-danger/30 hover:bg-revora-danger/25",
        outline:
          "border border-revora-border bg-transparent text-revora-text hover:bg-revora-elevated",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";
