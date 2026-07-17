import * as React from "react";
import { cn } from "~/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type = "text", ...props }, ref) => {
		return (
			<input
				ref={ref}
				type={type}
				className={cn(
					"flex h-12 w-full rounded-2xl border border-zinc-700/90 bg-zinc-950/80 px-4 text-[15px] leading-6 text-zinc-50 shadow-sm outline-none transition-all placeholder:text-zinc-500 placeholder:opacity-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		);
	},
);
Input.displayName = "Input";

export { Input };