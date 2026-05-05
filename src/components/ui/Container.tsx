import React from 'react';
import '../styles/tokens.css';

type ContainerWidth = 'narrow' | 'default' | 'wide' | 'full';

interface ContainerProps {
  children: React.ReactNode;
  maxWidth?: ContainerWidth;
  className?: string;
  style?: React.CSSProperties;
}

const widthMap: Record<ContainerWidth, number | '100%'> = {
  narrow: 768,
  default: 1280,
  wide: 1440,
  full: '100%',
};

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ children, maxWidth = 'default', className = '', style }, ref) => {
    const maxVal = widthMap[maxWidth];

    const containerStyle: React.CSSProperties = {
      width: '100%',
      maxWidth: maxVal === '100%' ? '100%' : `${maxVal}px`,
      marginLeft: 'auto',
      marginRight: 'auto',
      paddingLeft: 'var(--container-px, 24px)',
      paddingRight: 'var(--container-px, 24px)',
      boxSizing: 'border-box',
      ...style,
    };

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = 'Container';

export default Container;
