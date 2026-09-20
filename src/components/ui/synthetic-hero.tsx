import { lazy, Suspense, useRef } from "react";

// Nachgeladen statt mitgeliefert: der Shader ist Dekoration, kein Inhalt.
const HeroShaderCanvas = lazy(() => import("./synthetic-hero-canvas"));
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import p2gIconLogo from "@/assets/p2g-icon-logo.png";

gsap.registerPlugin(useGSAP);



// P2G Lime Green shader

// Simple text line animation (alternative to GSAP SplitText club plugin)
const animateLines = (element: HTMLElement) => {
  element.innerHTML = "";

  // Define exact words for the hero headline
  const words = "Dein Padel. Dein Level. Dein Spiel.".split(" ");

  words.forEach((word, wordIndex) => {
    const span = document.createElement("span");
    span.textContent = word;
    span.style.display = "inline-block";
    span.style.opacity = "0";
    span.style.transform = "translateY(20px)";
    span.style.filter = "blur(8px)";
    // Headline emphasis (matches design): "Level." lime, "Spiel." italic
    if (word === "Level.") span.style.color = "hsl(71 91% 51%)";
    if (word === "Spiel.") span.style.fontStyle = "italic";
    element.appendChild(span);
    // Real space between the inline-block word spans (renders + allows wrapping)
    if (wordIndex < words.length - 1) element.appendChild(document.createTextNode(" "));
  });

  const spans = element.querySelectorAll("span");
  gsap.to(spans, {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    duration: 0.8,
    stagger: 0.08,
    ease: "power3.out",
    delay: 0.2,
  });
};

interface HeroProps {
  title: string;
  description: string | React.ReactNode;
  microDetails?: Array<string>;
  showLogo?: boolean;
  /** false → kein eigener Canvas/Overlay; der Seiten-Backdrop (SectionShaderBackdrop) übernimmt */
  showShader?: boolean;
  children?: React.ReactNode;
}

const SyntheticHero = ({
  title = "An experiment in light, motion, and the quiet chaos between.",
  description = "Experience a new dimension of interaction — fluid, tactile, and alive.",
  microDetails = [],
  showLogo = false,
  showShader = true,
  children,
}: HeroProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const microRef = useRef<HTMLUListElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!headingRef.current) return;

      // Build the hero slogan immediately (prevents a flash of the raw `title` string)
      animateLines(headingRef.current);

      if (logoRef.current) {
        gsap.set(logoRef.current, { autoAlpha: 0, scale: 0.8 });
      }
      if (paragraphRef.current) {
        gsap.set(paragraphRef.current, { autoAlpha: 0, y: 8 });
      }

      const microItems = microRef.current
        ? Array.from(microRef.current.querySelectorAll("li"))
        : [];
      if (microItems.length > 0) {
        gsap.set(microItems, { autoAlpha: 0, y: 6 });
      }

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      if (logoRef.current) {
        tl.to(logoRef.current, { autoAlpha: 1, scale: 1, duration: 0.6 }, 0);
      }

      if (paragraphRef.current) {
        tl.to(paragraphRef.current, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.8);
      }


      if (microItems.length > 0) {
        tl.to(microItems, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1 }, 1.2);
      }
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* WebGL Canvas Background (entfällt, wenn der Seiten-Backdrop den Shader stellt) */}
      {showShader && (
        <>
          <div className="absolute inset-0 z-0">
            <Suspense fallback={null}>
              <HeroShaderCanvas />
            </Suspense>
          </div>

          {/* Dark Overlay for readability */}
          <div className="absolute inset-0 bg-background/70 z-[1]" />
        </>
      )}

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 pt-24 md:pt-32 pb-20 max-w-5xl">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Logo */}
          {showLogo && (
            <div ref={logoRef} className="mb-2">
              <img 
                src={p2gIconLogo} 
                alt="PADEL2GO Logo" 
                className="h-24 md:h-40 lg:h-52 w-auto drop-shadow-2xl"
              />
            </div>
          )}


          {/* Heading */}
          <h1
            ref={headingRef}
            className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight text-foreground max-w-4xl"
          >
            {title}
          </h1>

          {/* Description */}
          <p
            ref={paragraphRef}
            className="text-base md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
          >
            {description}
          </p>


          {/* Micro Details - only show if not empty */}
          {microDetails && microDetails.length > 0 && (
            <ul
              ref={microRef}
              className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
            >
              {microDetails.map((detail, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {detail}
                </li>
              ))}
            </ul>
          )}

          {/* Optional children (for scroll indicator, etc.) */}
          {children}
        </div>
      </div>
    </section>
  );
};

export default SyntheticHero;
