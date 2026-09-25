import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // FormMaps navy (#102B47), not indigo-600. The indigo came from the generic "Micro SaaS"
        // design system that was layered in -- one of four stacked here -- and has nothing to do
        // with this brand. The primary button is the single most repeated brand surface in the
        // product, so it was the loudest wrong colour on every screen. Navy on white is 14.4:1.
        default:
          "bg-[#102B47] text-white hover:bg-[#0B1F34]",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/20",
        // Token-based, NOT hardcoded slate: slate-900 text is invisible on the
        // dark theme's panels (slate isn't remapped by admin-theme.css).
        outline:
          "border border-border bg-transparent hover:bg-accent text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent text-foreground",
        link: "text-[#102B47] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
