import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ── Types ────────────────────────────────────────────────────
interface RevealOpts {
  trigger?: string | HTMLElement;
  start?: string;
  end?: string;
  y?: number;
  opacity?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
  toggleActions?: string;
}

interface ParallaxOpts {
  trigger?: string | HTMLElement;
  start?: string;
  end?: string;
  scrub?: number;
}

interface PinOpts {
  trigger?: string | HTMLElement;
  start?: string;
  end?: string;
  pinSpacing?: boolean;
}

interface HorizontalOpts {
  container: string | HTMLElement;
  sections: string | HTMLElement[];
  start?: string;
  end?: string;
  scrub?: number;
}

// ── Helpers ──────────────────────────────────────────────────
export function revealOnScroll(
  element: string | HTMLElement | HTMLElement[],
  opts: Partial<RevealOpts> = {}
): void {
  const {
    trigger,
    start = 'top 85%',
    end = 'bottom 20%',
    y = 60,
    opacity = 0,
    duration = 0.8,
    stagger = 0.1,
    ease = 'power2.out',
    toggleActions = 'play none none reverse',
  } = opts;

  const items = Array.isArray(element) ? element : [element];

  items.forEach((el) => {
    gsap.fromTo(
      el,
      { y, opacity },
      {
        y: 0,
        opacity: 1,
        duration,
        stagger,
        ease,
        scrollTrigger: {
          trigger: trigger ?? (typeof el === 'string' ? el : el),
          start,
          end,
          toggleActions,
        },
      }
    );
  });
}

export function parallaxY(
  element: string | HTMLElement | HTMLElement[],
  speed: number = 0.3,
  opts: Partial<ParallaxOpts> = {}
): void {
  const { trigger, start = 'top bottom', end = 'bottom top', scrub = 1 } = opts;

  const items = Array.isArray(element) ? element : [element];

  items.forEach((el) => {
    gsap.fromTo(
      el,
      { y: `${-speed * 100}%` },
      {
        y: `${speed * 100}%`,
        ease: 'none',
        scrollTrigger: {
          trigger: trigger ?? (typeof el === 'string' ? el : el),
          start,
          end,
          scrub,
        },
      }
    );
  });
}

export function pinSection(
  element: string | HTMLElement,
  height: string = '400%',
  opts: Partial<PinOpts> = {}
): void {
  const { trigger, start = 'top top', end = `+=${height}`, pinSpacing = true } = opts;

  ScrollTrigger.create({
    trigger: trigger ?? (typeof element === 'string' ? element : element),
    start,
    end,
    pin: true,
    pinSpacing,
  });
}

export function horizontalScroll(
  container: string | HTMLElement,
  sections: string | HTMLElement[],
  opts: Partial<HorizontalOpts> = {}
): void {
  const {
    start = 'top top',
    end = () => `+=${getScrollWidth(container, sections)}`,
    scrub = 1,
  } = opts;

  const sectionsArr = Array.isArray(sections) ? sections : [sections];

  gsap.to(sectionsArr, {
    xPercent: -100 * (sectionsArr.length - 1),
    ease: 'none',
    scrollTrigger: {
      trigger: typeof container === 'string' ? container : container,
      pin: true,
      start,
      end,
      scrub,
      invalidateOnRefresh: true,
    },
  });
}

function getScrollWidth(
  container: string | HTMLElement,
  sections: string | HTMLElement[]
): number {
  const el =
    typeof container === 'string'
      ? document.querySelector(container)
      : container;
  const children = sections.map((s) =>
    typeof s === 'string' ? document.querySelector(s) : s
  );
  if (!el || children.includes(null)) return 6000;

  let total = 0;
  children.forEach((child) => {
    if (child) total += (child as HTMLElement).offsetWidth;
  });
  return total - (el as HTMLElement).offsetWidth;
}
