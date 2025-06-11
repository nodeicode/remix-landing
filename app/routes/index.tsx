import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

// Import your existing component content
import IndexContent from "../components/about";
import MyWorkContent from "../components/myWork";
import ProjectsContent from "../components/projects";
import { useDarkMode } from "~/root";
import Nav from "../components/nav";

// Enhanced SectionWrapper with react-intersection-observer
const SectionWrapper = ({
	children,
	id,
	onInView,
}: {
	children: React.ReactNode;
	id: string;
	onInView: (inView: boolean, entry: IntersectionObserverEntry) => void;
}) => {
	const { ref, inView, entry } = useInView({
		threshold: [0.3, 0.5, 0.7, 0.9],
		rootMargin: "-30% 0px -30% 0px",
		onChange: onInView,
	});

	const sectionVariants = {
		hidden: {
			opacity: 0,
			y: 30,
			scale: 0.99,
			filter: "blur(2px)",
		},
		visible: {
			opacity: 1,
			y: 0,
			scale: 1,
			filter: "blur(0px)",
			transition: {
				duration: 0.6,
				ease: [0.25, 0.46, 0.45, 0.94],
				staggerChildren: 0.1,
			},
		},
	};

	return (
		<motion.section
			ref={ref}
			id={id}
			initial="hidden"
			whileInView="visible"
			viewport={{ margin: "-20px", amount: 0.3 }}
			variants={sectionVariants}
			className="min-h-[90vh] py-4 flex flex-col justify-start"
		>
			<motion.div
				variants={{
					hidden: { opacity: 0, x: -20 },
					visible: {
						opacity: 1,
						x: 0,
						transition: { delay: 0.2, duration: 0.6 },
					},
				}}
			>
				{children}
			</motion.div>
		</motion.section>
	);
};

export default function App() {
	const { darkMode, setTheme } = useDarkMode();
	const toggleTheme = () => {
		setTheme(!darkMode);
	};

	const [activeSection, setActiveSection] = useState(0);
	const [sectionVisibility, setSectionVisibility] = useState({
		about: { inView: false, ratio: 0 },
		work: { inView: false, ratio: 0 },
		projects: { inView: false, ratio: 0 },
	});

	const handleSectionView =
		(sectionName: string) => (inView: boolean, entry: IntersectionObserverEntry) => {
			setSectionVisibility((prev) => ({
				...prev,
				[sectionName]: { inView, ratio: entry.intersectionRatio },
			}));
		};

	// Determine active section based on highest intersection ratio
	useEffect(() => {
		const sections = ["about", "work", "projects"];
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
	}, [sectionVisibility]);

	return (
		<>
			<Nav
				activeIcon={activeSection}
				setIcon={setActiveSection}
				{...{ darkMode, toggleTheme }}
			/>
			<motion.div
				className="h-screen overflow-y-auto transition-all pr-2"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
			>
				<SectionWrapper id="about" onInView={handleSectionView("about")}>
					<IndexContent />
				</SectionWrapper>
				<SectionWrapper id="work" onInView={handleSectionView("work")}>
					<MyWorkContent {...{ darkMode }} />
				</SectionWrapper>
				<SectionWrapper id="projects" onInView={handleSectionView("projects")}>
					<ProjectsContent />
				</SectionWrapper>
			</motion.div>
		</>
	);
}
