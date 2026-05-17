import React from 'react';
import { motion } from 'framer-motion';
import '../../styles/tokens.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'pill' | 'large';
type ButtonSize = 'sm' | 'md' | 'lg';
type IconPosition = 'left' | 'right';

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: IconPosition;
  className?: string;
  style?: React.CSSProperties;
}

interface ButtonAsButton extends ButtonBaseProps {
  href?: undefined;
}

interface ButtonAsLink extends Omit<ButtonBaseProps, 'onClick'> {
  href: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

const sizeMap: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: '13px', borderRadius: '8px' },
  md: { padding: '10px 20px', fontSize: '15px', borderRadius: '10px' },
  lg: { padding: '14px 28px', fontSize: '17px', borderRadius: '12px' },
};

const variantStyle: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    color: '#ffffff',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--color-text, #e2e8f0)',
    border: '1.5px solid var(--color-border, #334155)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text, #e2e8f0)',
    border: 'none',
  },
  pill: {
    background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '9999px',
  },
  large: {
    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    color: '#ffffff',
    border: 'none',
    padding: '16px 36px',
    fontSize: '18px',
    borderRadius: '14px',
  },
};

const Button: React.FC<ButtonProps> = (props) => {
  const {
    variant = 'primary',
    size = 'md',
    children,
    disabled = false,
    icon,
    iconPosition = 'left',
    className = '',
    ...rest
  } = props;

  const motionProps = {
    whileHover: disabled ? undefined : { scale: 1.04, filter: 'brightness(1.1)' },
    whileTap: disabled ? undefined : { scale: 0.97 },
    transition: { type: 'tween' as const, ease: 'easeOut' as const, duration: 0.15 },
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontWeight: 600,
    lineHeight: 1.4,
    textDecoration: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.15s ease-out',
    ...variantStyle[variant === 'large' ? 'large' : variant],
    ...(variant !== 'large' ? sizeMap[size] : {}),
  };

  const focusVisibleStyle: React.CSSProperties = {
    boxShadow: '0 0 0 2px #06b6d4, 0 0 0 6px rgba(6, 182, 212, 0.2)',
  };

  const [isFocused, setIsFocused] = React.useState(false);

  const handleFocus = (e: React.FocusEvent) => {
    if (e.currentTarget.matches(':focus-visible')) {
      setIsFocused(true);
    }
  };

  const handleBlur = () => setIsFocused(false);

  const iconElement = icon && (
    <span style={{ display: 'inline-flex', alignItems: 'center', order: iconPosition === 'right' ? 1 : 0 }}>
      {icon}
    </span>
  );

  const content = (
    <>
      {iconPosition === 'left' && iconElement}
      {children}
      {iconPosition === 'right' && iconElement}
    </>
  );

  if (props.href !== undefined) {
    const { href, onClick: anchorOnClick } = props as ButtonAsLink;
    return (
      <motion.a
        href={href}
        className={className}
        style={{
          ...baseStyle,
          ...(isFocused ? focusVisibleStyle : {}),
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={anchorOnClick}
        {...motionProps}
      >
        {content}
      </motion.a>
    );
  }

  const { onClick: buttonOnClick } = props as ButtonAsButton;
  return (
    <motion.button
      type="button"
      disabled={disabled}
      className={className}
      style={{
        ...baseStyle,
        ...(isFocused ? focusVisibleStyle : {}),
      }}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={buttonOnClick}
      {...motionProps}
    >
      {content}
    </motion.button>
  );
};

export default Button;
