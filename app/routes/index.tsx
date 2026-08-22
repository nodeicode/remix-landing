import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

// Import your existing component content
import IndexContent from "../components/about";
import MyWorkContent from "../components/myWork";
import SystemsDiagnostic from "../components/systems-diagnostic";
import { useDarkMode } from "~/root";
import Nav from "../components/nav";

// Simple SectionWrapper with react-intersection-observer
const SectionWrapper = ({
	children,
	id,
	onInView,
	title,
	isManualScrolling,
}: {
	children: React.ReactNode;
	id: string;
	onInView: (inView: boolean, entry: IntersectionObserverEntry) => void;
	title?: string;
	isManualScrolling: boolean;
}) => {
	const { ref, inView, entry } = useInView({
		threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
		rootMargin: "-20% 0px -60% 0px",
		skip: isManualScrolling, // Skip observation during manual scrolling
		onChange: onInView,
	});

	return (
		<section ref={ref} id={id} className="min-h-screen py-16 flex flex-col justify-start">
			{title && <h1 className="text-4xl font-bold mb-8">{title}</h1>}
			{children}
		</section>
	);
};

export default function App() {
	const { darkMode, setTheme } = useDarkMode();
	const toggleTheme = () => {
		setTheme(!darkMode);
	};

	const [activeSection, setActiveSection] = useState(0);
	const [isManualScrolling, setIsManualScrolling] = useState(false);
	const scrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
	const [sectionVisibility, setSectionVisibility] = useState({
		about: { inView: false, ratio: 0 },
		systems: { inView: false, ratio: 0 },
		work: { inView: false, ratio: 0 },
	});

	const handleSectionView =
		(sectionName: string) => (inView: boolean, entry: IntersectionObserverEntry) => {
			if (!isManualScrolling) {
				setSectionVisibility((prev) => ({
					...prev,
					[sectionName]: { inView, ratio: entry.intersectionRatio },
				}));
			}
		};

	// Determine active section based on highest intersection ratio
	useEffect(() => {
		if (isManualScrolling) return;

		const sections = ["about", "systems", "work"];
		let maxRatio = 0;
		let activeIndex = 0;

		sections.forEach((section, index) => {
			const visibility = sectionVisibility[section as keyof typeof sectionVisibility];
			if (visibility.inView && visibility.ratio > maxRatio) {
				maxRatio = visibility.ratio;
				activeIndex = index;
			}
		});

		// Only update if there's a section in view
		if (maxRatio > 0.1) {
			setActiveSection(activeIndex);
		}
	}, [sectionVisibility, isManualScrolling]);

	const handleManualScroll = (index: number) => {
		setIsManualScrolling(true);
		setActiveSection(index);

		// Clear any existing timeout
		if (scrollTimeoutRef.current) {
			clearTimeout(scrollTimeoutRef.current);
		}

		// Re-enable intersection observer after scroll animation completes
		scrollTimeoutRef.current = setTimeout(() => {
			setIsManualScrolling(false);
			// Force update visibility state after manual scroll completes
			setSectionVisibility({
				about: { inView: false, ratio: 0 },
				systems: { inView: false, ratio: 0 },
				work: { inView: false, ratio: 0 },
			});
		}, 1500); // Increased timeout for smoother transition
	};

	return (
		<div className="flex flex-col gap-7 overflow-hidden bg-light dark:bg-dark lg:flex-row justify-center items-center px-4 relative z-10">
			<div className="prose prose-sm md:prose-base lg:prose-lg flex flex-row-reverse md:gap-6 min-w-[50vw]! overflow-hidden prose-stone font-mono dark:prose-invert prose-a:text-blue-600 dark:prose-a:text-dblue lg:px-4">
				<Nav
					activeIcon={activeSection}
					setIcon={setActiveSection}
					onManualScroll={handleManualScroll}
					{...{ darkMode, toggleTheme }}
				/>
				<motion.div
					className="h-screen overflow-y-auto transition-all pr-2"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<SectionWrapper
						id="about"
						onInView={handleSectionView("about")}
						isManualScrolling={isManualScrolling}
					>
						<IndexContent />
					</SectionWrapper>
					<SectionWrapper
						id="systems"
						onInView={handleSectionView("systems")}
						isManualScrolling={isManualScrolling}
					>
						<SystemsDiagnostic view="preview" />
					</SectionWrapper>
					<SectionWrapper
						id="work"
						onInView={handleSectionView("work")}
						title="My Work Experience"
						isManualScrolling={isManualScrolling}
					>
						<MyWorkContent {...{ darkMode }} />
					</SectionWrapper>
				</motion.div>
			</div>
		</div>
	);
}
