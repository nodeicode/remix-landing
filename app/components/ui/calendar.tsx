import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";
import { buttonVariants } from "~/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn("p-3", className)}
			classNames={{
				months: "flex flex-col sm:flex-row gap-4",
				month: "space-y-3",
				caption: "flex justify-center pt-1 relative items-center",
				caption_label: "text-sm font-semibold text-zinc-100",
				nav: "space-x-1 flex items-center",
				nav_button: cn(
					buttonVariants({ variant: "ghost", size: "icon" }),
					"h-7 w-7 bg-transparent opacity-60 hover:opacity-100 text-zinc-400",
				),
				nav_button_previous: "absolute left-1",
				nav_button_next: "absolute right-1",
				table: "w-full border-collapse space-y-1",
				head_row: "flex",
				head_cell: "text-zinc-500 rounded-md w-9 font-normal text-[0.8rem] text-center",
				row: "flex w-full mt-2",
				cell: cn(
					"relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
					"[&:has([aria-selected])]:bg-zinc-800/50",
					"[&:has([aria-selected].day-outside)]:bg-zinc-800/30",
					"[&:has([aria-selected].day-range-end)]:rounded-r-md",
					"[&:has([aria-selected].day-range-start)]:rounded-l-md",
					props.mode === "range"
						? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
						: "[&:has([aria-selected])]:rounded-md",
				),
				day: cn(
					buttonVariants({ variant: "ghost" }),
					"h-9 w-9 p-0 font-normal text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50 aria-selected:opacity-100",
				),
				day_range_start:
					"day-range-start aria-selected:bg-blue-600 aria-selected:text-white hover:bg-blue-700",
				day_range_end:
					"day-range-end aria-selected:bg-blue-600 aria-selected:text-white hover:bg-blue-700",
				day_selected:
					"bg-blue-600 text-white hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white",
				day_today: "bg-zinc-800 text-zinc-100",
				day_outside: "day-outside text-zinc-600 aria-selected:text-zinc-500",
				day_disabled: "text-zinc-700 opacity-50",
				day_range_middle:
					"aria-selected:bg-zinc-800/50 aria-selected:text-zinc-200 rounded-none",
				day_hidden: "invisible",
				...classNames,
			}}
			components={{
				IconLeft: () => <ChevronLeft className="h-4 w-4" />,
				IconRight: () => <ChevronRight className="h-4 w-4" />,
			}}
			{...props}
		/>
	);
}
Calendar.displayName = "Calendar";

export { Calendar };
