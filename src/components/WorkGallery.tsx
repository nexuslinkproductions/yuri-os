import { useState, useRef, useMemo, type FC } from "react";
import { motion, useInView, type Variants } from "framer-motion";

interface Project {
  id: string;
  title: string;
  client: string;
  category: string;
  year: number;
  thumbnail: string;
  aspect: "4:3" | "16:9" | "1:1";
}

interface WorkGalleryProps {
  onProjectClick: (id: string) => void;
}

const categories = [
  "All",
  "Commercial",
  "Music Video",
  "Documentary",
  "Corporate",
  "Event",
] as const;

const projects: Project[] = [
  {
    id: "stephansdom",
    title: "Stephansdom Illuminated",
    client: "Vienna Tourism Board",
    category: "Commercial",
    year: 2024,
    thumbnail: "https://picsum.photos/seed/stephan/800/600",
    aspect: "4:3",
  },
  {
    id: "belvedere",
    title: "Belvedere Nights",
    client: "Österreichische Galerie",
    category: "Music Video",
    year: 2024,
    thumbnail: "https://picsum.photos/seed/belvedere/1600/900",
    aspect: "16:9",
  },
  {
    id: "prater",
    title: "Riesenrad Reimagined",
    client: "Prater Wien GmbH",
    category: "Documentary",
    year: 2023,
    thumbnail: "https://picsum.photos/seed/prater/800/800",
    aspect: "1:1",
  },
  {
    id: "naschmarkt",
    title: "Naschmarkt Stories",
    client: "Marktamt Wien",
    category: "Documentary",
    year: 2023,
    thumbnail: "https://picsum.photos/seed/nasch/800/600",
    aspect: "4:3",
  },
  {
    id: "kunsthistorisches",
    title: "Masterpieces in Motion",
    client: "Kunsthistorisches Museum",
    category: "Corporate",
    year: 2024,
    thumbnail: "https://picsum.photos/seed/kunst/1600/900",
    aspect: "16:9",
  },
  {
    id: "rathaus",
    title: "Rathaus Sommerkino",
    client: "Stadt Wien",
    category: "Event",
    year: 2024,
    thumbnail: "https://picsum.photos/seed/rathaus/800/800",
    aspect: "1:1",
  },
  {
    id: "hunderwasser",
    title: "Hundertwasser Harmony",
    client: "Wien Kultur",
    category: "Commercial",
    year: 2023,
    thumbnail: "https://picsum.photos/seed/hunder/800/600",
    aspect: "4:3",
  },
  {
    id: "donaukanal",
    title: "Donaukanal Sessions",
    client: "Vienna Music Collective",
    category: "Music Video",
    year: 2024,
    thumbnail: "https://picsum.photos/seed/donau/1600/900",
    aspect: "16:9",
  },
  {
    id: "schonbrunn",
    title: "Schönbrunn After Hours",
    client: "Schloss Schönbrunn Kultur",
    category: "Event",
    year: 2023,
    thumbnail: "https://picsum.photos/seed/schonb/800/800",
    aspect: "1:1",
  },
];

const aspectRatioMap: Record<Project["aspect"], string> = {
  "4:3": "3 / 4",
  "16:9": "9 / 16",
  "1:1": "1 / 1",
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" },
  }),
};

const WorkGallery: FC<WorkGalleryProps> = ({ onProjectClick }) => {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  const filtered = useMemo(
    () =>
      activeCategory === "All"
        ? projects
        : projects.filter((p) => p.category === activeCategory),
    [activeCategory]
  );

  return (
    <div className="work-gallery" ref={ref}>
      <style>{`
        .work-gallery {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 24px 64px;
        }

        .filter-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
          margin-bottom: 48px;
          padding: 16px 0;
        }

        .filter-btn {
          background: transparent;
          border: 1px solid #888;
          color: #fff;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 200ms;
        }

        .filter-btn:hover,
        .filter-btn.active {
          background: #7c3aed;
          border-color: #7c3aed;
        }

        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          margin-bottom: 48px;
        }

        .gallery-item {
          aspect-ratio: var(--aspect);
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
        }

        .gallery-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 300ms ease;
        }

        .gallery-item:hover img {
          transform: scale(1.05);
        }
      `}</style>

      <div className="filter-bar">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <motion.div className="gallery-grid" ref={ref}>
        {inView &&
          filtered.map((project, i) => (
            <motion.div
              key={project.id}
              className="gallery-item"
              style={{ '--aspect': aspectRatioMap[project.aspect] } as React.CSSProperties}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              custom={i}
              onClick={() => onProjectClick(project.id)}
            >
              <img src={project.thumbnail} alt={project.title} loading="lazy" />
            </motion.div>
          ))}
      </motion.div>
    </div>
  );
          border: 2px solid transparent;
          border-radius: 9999px;
          padding: 8px 20px;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 500;
          color: #aaa;
          cursor: pointer;
          transition: all 0.25s ease;
          outline: none;
          position: relative;
        }

        .filter-btn:hover {
          color: #fff;
          border-color: rgba(0, 255, 255, 0.3);
        }

        .filter-btn.active {
          color: #00ffff;
          border-color: #00ffff;
          box-shadow: 0 0 14px rgba(0, 255, 255, 0.35),
                      0 0 28px rgba(0, 255, 255, 0.12);
        }

        .masonry {
          display: block;
          column-count: 1;
          column-gap: 24px;
        }

        @media (min-width: 768px) {
          .masonry { column-count: 2; }
        }

        @media (min-width: 1024px) {
          .masonry { column-count: 3; }
        }

        @media (min-width: 1440px) {
          .masonry { column-count: 4; }
        }

        .masonry-item {
          display: inline-block;
          width: 100%;
          margin-bottom: 24px;
          break-inside: avoid;
          cursor: pointer;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
        }

        .card-img-wrap {
          position: relative;
          overflow: hidden;
          border-radius: 12px;
          width: 100%;
        }

        .card-img {
          display: block;
          width: 100%;
          height: auto;
          object-fit: cover;
          transition: transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .masonry-item:hover .card-img {
          transform: scale(1.05);
        }

        .card-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 24px;
          opacity: 0;
          transition:
