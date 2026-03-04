import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-zinc-50 text-zinc-900 hover:bg-zinc-200",
				destructive: "bg-red-600 text-zinc-50 hover:bg-red-700",
				outline:
					"border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50",
				secondary: "bg-zinc-800 text-zinc-50 hover:bg-zinc-700",
				ghost: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50",
				link: "text-zinc-50 underline-offset-4 hover:underline",
				blue: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-600/50",
				orange: "bg-orange-600 text-white hover:bg-orange-700 disabled:bg-orange-600/50",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 rounded-md px-3 text-xs",
				lg: "h-10 rounded-lg px-8",
				icon: "h-9 w-9",
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
