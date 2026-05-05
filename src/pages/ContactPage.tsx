import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Container, Section, Button } from '../components/ui';
import { default as CTABanner } from '../components/CTABanner';

interface FormData {
  name: string;
  email: string;
  projectType: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  projectType?: string;
  message?: string;
}

const ContactForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    projectType: '',
    message: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.projectType) {
      newErrors.projectType = 'Please select a project type';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setIsSubmitted(true);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 0',
    border: 'none',
    borderBottom: '2px solid var(--color-border, #ccc)',
    background: 'transparent',
    color: 'var(--color-text, #333)',
    fontSize: '16px',
    outline: 'none',
    transition: 'border-color 0.3s ease',
    fontFamily: 'inherit',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    cursor: 'pointer',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    minHeight: '100px',
    borderBottom: '2px solid var(--color-border, #ccc)',
  };

  const errorStyle: React.CSSProperties = {
    color: 'var(--color-error, #e74c3c)',
    fontSize: '13px',
    marginTop: '4px',
  };

  const fieldContainerStyle: React.CSSProperties = {
    marginBottom: '24px',
  };

  return (
    <AnimatePresence mode="wait">
      {isSubmitted ? (
        <motion.div
          key="confirmation"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            textAlign: 'center',
            padding: '40px 20px',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
          <h3 style={{ margin: '0 0 12px', color: 'var(--color-heading, #111)' }}>
            Message Sent!
          </h3>
          <p style={{ margin: 0, color: 'var(--color-text, #555)', lineHeight: 1.6 }}>
            Thank you for reaching out. We'll review your project and get back to you within 24 hours.
          </p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          noValidate
        >
          <div style={fieldContainerStyle}>
            <input
              type="text"
              name="name"
              placeholder="Your Name *"
              value={formData.name}
              onChange={handleChange}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderBottomColor = 'var(--color-accent, #007bff)')}
              onBlur={(e) => (e.target.style.borderBottomColor = 'var(--color-border, #ccc)')}
            />
            {errors.name && <div style={errorStyle}>{errors.name}</div>}
          </div>

          <div style={fieldContainerStyle}>
            <input
              type="email"
              name="email"
              placeholder="Your Email *"
              value={formData.email}
              onChange={handleChange}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderBottomColor = 'var(--color-accent, #007bff)')}
              onBlur={(e) => (e.target.style.borderBottomColor = 'var(--color-border, #ccc)')}
            />
            {errors.email && <div style={errorStyle}>{errors.email}</div>}
          </div>

          <div style={fieldContainerStyle}>
            <select
              name="projectType"
              value={formData.projectType}
              onChange={handleChange}
              style={selectStyle}
              onFocus={(e) => (e.target.style.borderBottomColor = 'var(--color-accent, #007bff)')}
              onBlur={(e) => (e.target.style.borderBottomColor = 'var(--color-border, #ccc)')}
            >
              <option value="" disabled>
                Project Type *
              </option>
              <option value="Commercial">Commercial</option>
              <option value="Music Video">Music Video</option>
              <option value="Documentary">Documentary</option>
              <option value="Corporate">Corporate</option>
              <option value="Event">Event</option>
              <option value="Other">Other</option>
            </select>
            {errors.projectType && <div style={errorStyle}>{errors.projectType}</div>}
          </div>

          <div style={fieldContainerStyle}>
            <textarea
              name="message"
              placeholder="Tell us about your project *"
              value={formData.message}
              onChange={handleChange}
              style={textareaStyle}
              onFocus={(e) => (e.target.style.borderBottomColor = 'var(--color-accent, #007bff)')}
              onBlur={(e) => (e.target.style.borderBottomColor = 'var(--color-border, #ccc)')}
            />
            {errors.message && <div style={errorStyle}>{errors.message}</div>}
          </div>

          <button type="submit" onClick={handleSubmit} style={{
            background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
            color: '#ffffff',
            border: 'none',
            padding: '10px 20px',
            fontSize: '15px',
            borderRadius: '10px',
            marginTop: '8px',
            cursor: 'pointer',
            fontWeight: 600,
          }}>
            Send Message
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
};

const ContactInfo: React.FC = () => {
  const linkStyle: React.CSSProperties = {
    color: 'var(--color-text, #333)',
    textDecoration: 'none',
    transition: 'color 0.3s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  };

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: 'var(--color-muted, #888)',
    marginBottom: '8px',
  };

  const socialLinkStyle: React.CSSProperties = {
    ...linkStyle,
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '1px solid var(--color-border, #ccc)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    transition: 'all 0.3s ease',
  };

  return (
    <div style={sectionStyle}>
      <div>
        <div style={labelStyle}>Email</div>
        <a
          href="mailto:contact@nexuslinkproductions.com"
          style={linkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent, #007bff)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text, #333)')}
        >
          ✉ contact@nexuslinkproductions.com
        </a>
      </div>

      <div>
        <div style={labelStyle}>Phone</div>
        <a
          href="tel:+4312345678"
          style={linkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent, #007bff)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text, #333)')}
        >
          📞 +43 1 234 5678
        </a>
      </div>

      <div>
        <div style={labelStyle}>Address</div>
        <p style={{ margin: 0, color: 'var(--color-text, #333)' }}>📍 Vienna, Austria</p>
      </div>

      <div>
        <div style={labelStyle}>Follow Us</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            style={socialLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent, #007bff)';
              e.currentTarget.style.color = 'var(--color-accent, #007bff)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border, #ccc)';
              e.currentTarget.style.color = 'var(--color-text, #333)';
            }}
            aria-label="Instagram"
          >
            IG
          </a>
          <a
            href="https://vimeo.com"
            target="_blank"
            rel="noopener noreferrer"
            style={socialLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent, #007bff)';
              e.currentTarget.style.color = 'var(--color-accent, #007bff)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border, #ccc)';
              e.currentTarget.style.color = 'var(--color-text, #333)';
            }}
            aria-label="Vimeo"
          >
            VI
          </a>
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noopener noreferrer"
            style={socialLinkStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-accent, #007bff)';
              e.currentTarget.style.color = 'var(--color-accent, #007bff)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border, #ccc)';
              e.currentTarget.style.color = 'var(--color-text, #333)';
            }}
            aria-label="LinkedIn"
          >
            LI
          </a>
        </div>
      </div>

      <div
        style={{
          padding: '16px 20px',
          background: 'var(--color-bg-muted, #f5f5f5)',
          borderRadius: '8px',
          borderLeft: '3px solid var(--color-accent, #007bff)',
        }}
      >
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text, #555)', lineHeight: 1.5 }}>
          ⏱ Typical response within <strong>24 hours</strong>.
        </p>
      </div>
    </div>
  );
};

const ContactPage: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* ContactHero */}
      <Section style={{ padding: '80px 0 40px' }}>
        <Container>
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <h1
              style={{
                fontSize: 'clamp(36px, 6vw, 64px)',
                fontWeight: 700,
                margin: '0 0 16px',
                color: 'var(--color-heading, #111)',
                letterSpacing: '-0.02em',
              }}
            >
              Let's Talk
            </h1>
            <p
              style={{
                fontSize: 'clamp(16px, 2vw, 20px)',
                color: 'var(--color-muted, #666)',
                margin: 0,
                maxWidth: '540px',
                lineHeight: 1.5,
              }}
            >
              Tell us about your project. We'll respond within 24 hours.
            </p>
          </motion.div>
        </Container>
      </Section>

      {/* ContactBody: 50/50 split */}
      <Section style={{ padding: '0 0 80px' }}>
        <Container>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '60px',
              alignItems: 'start',
            }}
            className="contact-grid"
          >
            <style>{`
              @media (max-width: 768px) {
                .contact-grid {
                  grid-template-columns: 1fr !important;
                  gap: 48px !important;
                }
              }
            `}</style>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <ContactForm />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <ContactInfo />
            </motion.div>
          </div>
        </Container>
      </Section>

      <CTABanner headline="Questions? We're here to help." buttonLabel="Get in Touch" buttonHref="#form" />
    </motion.div>
  );
};

export default ContactPage;
