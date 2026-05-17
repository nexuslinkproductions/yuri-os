interface SectionIndicatorProps {
  sections: string[];
  activeSection: string;
}

const SectionIndicator: React.FC<SectionIndicatorProps> = ({ sections, activeSection }) => {
  return (
    <div className="nlp-section-dots" role="navigation" aria-label="Section navigation">
      {sections.map((s) => (
        <button
          key={s}
          className={`nlp-dot ${activeSection === s ? 'active' : ''}`}
          onClick={() => document.getElementById(s)?.scrollIntoView({ behavior: 'smooth' })}
          aria-label={`Go to ${s}`}
          title={s}
        />
      ))}
    </div>
  );
};

export default SectionIndicator;
