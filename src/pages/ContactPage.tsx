import React, { useState } from 'react';
import { motion } from 'framer-motion';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
  marginBottom: 8,
};

const fieldWrap: React.CSSProperties = { marginBottom: 24 };

type FormState = {
  name: string; company: string; email: string;
  projectType: string; message: string;
};

const offices = [
  { city: 'Vienna', label: 'Headquarters', address: 'Nexus Link Productions\nVienna, Austria', },
  { city: 'Zurich', label: 'C2Moviez Partner', address: 'C2Moviez / ExeoFlow\nZurich, Switzerland', link: 'https://c2moviez.com' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

export default function ContactPage() {
  const [form, setForm] = useState<FormState>({ name: '', company: '', email: '', projectType: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); setSubmitted(true); };

  const fStyle = (name: string): React.CSSProperties => ({
    ...inputStyle,
    borderColor: focused === name ? 'rgba(220,38,38,0.5)' : 'rgba(255,255,255,0.09)',
  });

  return (
    <motion.div style={{ backgroundColor: 'var(--color-bg-void)', color: 'var(--color-text-primary)', minHeight: '100vh' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>

      {/* HERO */}
      <section style={{ padding: '160px clamp(24px,5vw,80px) 80px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <motion.div
            style={{ width: 4, backgroundColor: '#dc2626', flexShrink: 0, borderRadius: 2, transformOrigin: 'top' }}
            initial={{ height: 0 }} animate={{ height: 100 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
          <div>
            <motion.h1
              style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(3rem, 8vw, 6rem)', fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.04em', margin: 0 }}
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              Let's Build<br />Something.
            </motion.h1>
            <motion.p
              style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(1rem, 1.8vw, 1.2rem)', lineHeight: 1.65, color: 'var(--color-text-secondary)', maxWidth: 520, margin: '24px 0 0', fontWeight: 300 }}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              We take on a select number of projects each year. If you're serious about your vision, we want to hear from you.
            </motion.p>
          </div>
        </div>
      </section>

      {/* FORM + INFO */}
      <section style={{ padding: '0 clamp(24px,5vw,80px) 120px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 80, alignItems: 'start' }}>

          {/* INFO */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
            <div style={{ marginBottom: 48 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 24 }}>Contact</div>
              {[
                { label: 'Email', value: 'contact@nexuslinkproductions.com', href: 'mailto:contact@nexuslinkproductions.com' },
                { label: 'Phone', value: '+43 1 234 5678', href: 'tel:+4312345678' },
                { label: 'Location', value: 'Vienna, Austria', href: null },
              ].map((item) => (
                <div key={item.label} style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{item.label}</div>
                  {item.href ? (
                    <a href={item.href} style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-text-primary)', textDecoration: 'none' }}>{item.value}</a>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-text-primary)' }}>{item.value}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 32 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 16 }}>Swiss Partner</div>
              <a href="https://c2moviez.com" target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: 14, fontFamily: 'var(--font-body)' }}>
                ↗ c2moviez.com
              </a>
              <br />
              <a href="https://exeoflow.com" target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: 14, fontFamily: 'var(--font-body)', marginTop: 8 }}>
                ↗ exeoflow.com
              </a>
            </div>
          </motion.div>

          {/* FORM */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
            transition={{ delay: 0.1 }}>
            {submitted ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                style={{ padding: '64px 48px', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, margin: '0 0 12px' }}>Message received.</h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  We'll review your project and get back to you within 48 hours.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={onSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 0 }}>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Name *</label>
                    <input name="name" value={form.name} onChange={handle} onFocus={() => setFocused('name')} onBlur={() => setFocused(null)} required style={fStyle('name')} placeholder="Your name" />
                  </div>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Company</label>
                    <input name="company" value={form.company} onChange={handle} onFocus={() => setFocused('company')} onBlur={() => setFocused(null)} style={fStyle('company')} placeholder="Your company" />
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Email *</label>
                  <input name="email" type="email" value={form.email} onChange={handle} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} required style={fStyle('email')} placeholder="your@email.com" />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Project Type</label>
                  <select name="projectType" value={form.projectType} onChange={handle} onFocus={() => setFocused('projectType')} onBlur={() => setFocused(null)} style={{ ...fStyle('projectType'), cursor: 'pointer' }}>
                    <option value="">Select a project type</option>
                    {['Commercial Film', 'Brand Documentary', 'Music Video', 'Live Event', 'Other'].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Message *</label>
                  <textarea name="message" value={form.message} onChange={handle} onFocus={() => setFocused('message')} onBlur={() => setFocused(null)} required rows={6} style={{ ...fStyle('message'), resize: 'vertical' }} placeholder="Tell us about your project..." />
                </div>
                <motion.button
                  type="submit" data-magnetic
                  style={{
                    width: '100%', padding: '18px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-primary)',
                    transition: 'all 0.25s ease',
                  }}
                  whileHover={{ borderColor: 'rgba(220,38,38,0.5)', background: 'rgba(220,38,38,0.06)' }}
                  whileTap={{ scale: 0.99 }}
                >
                  Send Message →
                </motion.button>
              </form>
            )}
          </motion.div>
        </div>

        <style>{`@media (max-width: 767px) { .contact-grid { grid-template-columns: 1fr !important; } }`}</style>
      </section>

      {/* OFFICES */}
      <section style={{ padding: '0 clamp(24px,5vw,80px) 100px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 64 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 40 }}>Our Locations</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {offices.map((o, i) => (
              <motion.div key={o.city}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border-subtle)', borderRadius: 12, padding: '36px 32px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 12 }}>{o.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 16px' }}>{o.city}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{o.address}</div>
                {o.link && (
                  <a href={o.link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: 'var(--color-text-tertiary)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                    ↗ Visit site
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
