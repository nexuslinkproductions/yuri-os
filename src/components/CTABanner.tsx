import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface CTABannerProps {
  headline: string;
  sub?: string;
  buttonLabel: string;
  buttonHref?: string;
}

const CTABanner = ({ headline, sub, buttonLabel, buttonHref = "#" }: CTABannerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      style={{
        width: "100%",
        paddingBlock: 96,
        background:
          "linear-gradient(135deg, #7c3aed 0%, #4c1d95 50%, #06b6d4 100%)",
      }}
    >
      <div
        ref={ref}
        style={{
          maxWidth: 720,
          margin: "0 auto",
          textAlign: "center",
          paddingInline: 24,
        }}
      >
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 56,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.1,
            margin: 0,
            marginBottom: sub ? 16 : 32,
          }}
        >
          {headline}
        </motion.h2>

        {sub && (
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 18,
              fontWeight: 300,
              color: "rgba(255,255,255,0.85)",
              margin: 0,
              marginBottom: 40,
              lineHeight: 1.6,
            }}
          >
            {sub}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: "easeOut", delay: sub ? 0.3 : 0.15 }}
        >
          <a
            href={buttonHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Outfit', sans-serif",
              fontSize: 18,
              fontWeight: 600,
              padding: "16px 40px",
              borderRadius: 9999,
              border: "none",
              cursor: "pointer",
              textDecoration: "none",
              color: "#7c3aed",
              background: "#fff",
              transition: "transform 0.2s, box-shadow 0.2s",
              boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.04)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.15)";
            }}
          >
            {buttonLabel}
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default CTABanner;
