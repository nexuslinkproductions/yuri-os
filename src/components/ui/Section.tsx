import React from 'react';
import '../styles/tokens.css';

type SectionPadding = 'sm' | 'md' | 'lg';
type SectionVariant = 'void' | 'deep' | 'surface' | 'gradient';

interface SectionProps {
  children: React.ReactNode;
  padding?: SectionPadding;
  id?: string;
  className?: string;
  dataAttribute?: string;
  background?: SectionVariant;
  style?: React.CSSProperties;
}

const paddingMap: Record<SectionPadding, string> = {
  sm: 'var(--section-py-sm, 32px) 0',
  md: 'var(--section-py-md, 64px) 0',
  lg: 'var(--section-py-lg, 96px) 0',
};

const backgroundMap: Record<SectionVariant, React.CSSProperties> = {
  void: { backgroundColor: 'var(--color-bg-void, #0b0b15)' },
  deep: { backgroundColor: 'var(--color-bg-deep, #111827)' },
  surface: { backgroundColor: 'var(--color-bg-surface, #1e293b)' },
  gradient: {
    background: 'linear-gradient(180deg, var(--color-bg-deep, #111827) 0%, var(--color-bg-void, #0b0b15) 100%)',
  },
};

const Section: React.FC<SectionProps> = ({
  children,
  padding = 'md',
  id,
  className = '',
  dataAttribute,
  background,
  style,
}) => {
  const sectionStyle: React.CSSProperties = {
    padding: paddingMap[padding],
    position: 'relative',
    ...(background ? backgroundMap[background] : {}),
    ...style,
  };

  const dataProps = dataAttribute
    ? { 'data-scroll': dataAttribute }
    : {};

  return (
    <section
      id={id}
      className={className}
      style={sectionStyle}
      {...dataProps}
    >
      {children}
    </section>
  );
};

export default Section;
