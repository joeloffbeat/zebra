import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-xs tracking-widest transition-opacity duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30",
  {
    variants: {
      variant: {
        default: "hover:opacity-60",
        outline: "border border-border hover:opacity-60",
        ghost: "hover:opacity-60",
        link: "underline-offset-4 hover:underline hover:opacity-60",
      },
      size: {
        default: "h-8 px-0",
        sm: "h-6 px-0 text-[10px]",
        lg: "h-10 px-0 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        <span className="mr-0.5">[</span>
        {children}
        <span className="ml-0.5">]</span>
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

