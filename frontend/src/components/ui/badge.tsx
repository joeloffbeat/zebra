import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-[10px] tracking-widest transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-border bg-primary text-primary-foreground",
        secondary:
          "border-border bg-transparent text-foreground",
        outline:
          "border-border bg-transparent text-foreground",
        buy:
          "border-border bg-foreground text-background",
        sell:
          "border-border bg-transparent text-foreground",
        hidden:
          "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
