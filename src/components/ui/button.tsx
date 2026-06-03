import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,background-color,box-shadow,color,border-color] duration-150 ease-out will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-900 text-zinc-50 shadow-z1 hover:bg-zinc-800 hover:shadow-z2 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200",
        destructive:
          "bg-destructive text-destructive-foreground shadow-z1 hover:brightness-110 hover:shadow-z2",
        brand:
          "bg-brand text-brand-foreground shadow-z1 hover:brightness-110 hover:shadow-glow-brand",
        success:
          "bg-success text-success-foreground shadow-z1 hover:brightness-110 hover:shadow-z2",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground hover:border-zinc-300 dark:hover:border-zinc-600",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-zinc-200 dark:hover:bg-zinc-700",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-foreground underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8 text-[0.9375rem]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
