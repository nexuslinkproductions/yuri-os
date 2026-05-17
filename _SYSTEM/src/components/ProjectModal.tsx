import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

interface ProjectModalProps {
  isOpen: boolean;
  projectId: string | null;
  onClose: () => void;
}

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

export default function ProjectModal({ isOpen, projectId, onClose }: ProjectModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && projectId && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
          style={{ backgroundColor: 'rgba(10,10,15,0.95)' }}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={handleBackdropClick}
        >
          {/* Blur layer */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          />

          <motion.div
            className="relative w-full max-w-[1200px] p-12 rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]"
            style={{ backgroundColor: '#0a0a0f' }}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors duration-200 group z-10"
              aria-label="Close modal"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-200 group-hover:rotate-90"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Video Placeholder */}
            <div className="w-full aspect-video mb-8 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center">
              <div className="text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white/20 mb-4 mx-auto"
                >
                  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                </svg>
                <p className="text-white/30 text-sm font-mono">vimeo.com/{projectId || 'embed'}</p>
              </div>
            </div>

            {/* Project Details */}
            <div className="space-y-4">
              <h2
                className="text-white text-3xl md:text-4xl font-bold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Project Title
              </h2>

              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-white/40 font-medium">Client</span>
                  <p className="text-white/80 mt-1">Client Name</p>
                </div>
                <div>
                  <span className="text-white/40 font-medium">Category</span>
                  <p className="text-white/80 mt-1">Category</p>
                </div>
                <div>
                  <span className="text-white/40 font-medium">Year</span>
                  <p className="text-white/80 mt-1">2025</p>
                </div>
              </div>

              <p
                className="text-white/60 leading-relaxed mt-4 max-w-3xl"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                A compelling description of the project goes here. This placeholder text will be
                replaced with actual project details fetched based on the projectId prop.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
