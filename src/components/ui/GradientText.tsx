import React from 'react';
import '../../styles/tokens.css';

type GradientTextElement = 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div';

interface GradientTextProps {
  children: React.ReactNode;
  as?: GradientTextElement;
  className?: string;
  style?: React.CSSProperties;
}

const GradientText: React.FC<GradientTextProps> = ({
  children,
  as: Tag = 'span',
  className = '',
  style,
}) => {
  const gradientStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #a855f7, #06b6d4)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: 'transparent',
    display: 'inline-block',
    ...style,
  };

  return (
    <Tag className={className} style={gradientStyle}>
      {children}
    </Tag>
  );
};

export default GradientText;
