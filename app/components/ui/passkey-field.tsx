import * as React from "react";
import { KeyRound } from "lucide-react";
import { cn } from "~/lib/utils";

export interface PasskeyFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
	label?: string;
	hint?: string;
}

const PasskeyField = React.forwardRef<HTMLInputElement, PasskeyFieldProps>(
	({ className, label = "Device passkey", hint = "Local device unlock", type = "password", ...props }, ref) => {
		return (
			<div className="rounded-[1.7rem] border border-zinc-700/80 bg-linear-to-br from-zinc-900 to-zinc-950 p-px shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
				<div className="rounded-[1.65rem] bg-zinc-950/90 px-4 py-4 sm:px-5 sm:py-5">
					<div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-zinc-400">
						<KeyRound className="h-3.5 w-3.5 text-blue-300" />
						<span>{label}</span>
						<span className="ml-auto rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
							{hint}
						</span>
					</div>
					<input
						ref={ref}
						type={type}
						className={cn(
							"h-14 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 text-[15px] font-medium tracking-[0.12em] text-zinc-50 shadow-inner shadow-black/20 outline-none transition-all placeholder:text-zinc-400 placeholder:tracking-normal placeholder:opacity-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50",
							className,
						)}
						{...props}
					/>
					<p className="mt-3 text-[11px] leading-5 text-zinc-500">
						This stays on this device only. If it is saved in your browser, the dashboard opens automatically.
					</p>
				</div>
			</div>
		);
	},
);
PasskeyField.displayName = "PasskeyField";

export { PasskeyField };