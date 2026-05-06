import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Multi-step project application experience ─── */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const projectTypes = [
  { id: 'commercial', title: 'Commercial Film', desc: 'Brand campaigns, product launches, corporate storytelling' },
  { id: 'documentary', title: 'Brand Documentary', desc: 'Long-form narrative that defines your legacy' },
  { id: 'music', title: 'Music Video', desc: 'Visual worlds that amplify the sound' },
  { id: 'live', title: 'Live Event', desc: 'Multi-camera coverage of moments that matter' },
];

const budgets = ['Under €10k', '€10k–25k', '€25k–50k', '€50k–100k', '€100k+'];
const timelines = ['Immediate (0–4 weeks)', 'Near term (1–3 months)', 'Strategic (3–6 months)', 'Open timeline'];

const stepVariants = {
  enter:  (d: number) => ({ x: d * 60, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.4, ease: EASE } },
  exit:   (d: number) => ({ x: d * -60, opacity: 0, transition: { duration: 0.28, ease: EASE } }),
};

const inp: React.CSSProperties = {
  width: '100%', padding: '14px 16px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, color: '#f5f5f7', fontFamily: 'var(--font-body)',
  fontSize: 15, outline: 'none',
};

type FormData = {
  type: string; vision: string; budget: string;
  name: string; company: string; email: string; phone: string; timeline: string;
};

export default function ContactPage() {
  const [step, setStep]       = useState(0);
  const [dir, setDir]         = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [focused, setFocused] = useState('');
  const [form, setForm]       = useState<FormData>({
    type: '', vision: '', budget: '', name: '', company: '', email: '', phone: '', timeline: '',
  });

  const next = () => { setDir(1); setStep(s => Math.min(s + 1, 3)); };
  const prev = () => { setDir(-1); setStep(s => Math.max(s - 1, 0)); };
  const set  = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const focusStyle = (name: string): React.CSSProperties => ({
    ...inp, borderColor: focused === name ? 'rgba(220,38,38,0.55)' : 'rgba(255,255,255,0.1)',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e18', color: '#f5f5f7', display: 'flex' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '48px 32px', display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 40 }}>
          Nexus Link
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 2, color: 'rgba(255,255,255,0.35)' }}>
          <div>contact@nexuslinkproductions.com</div>
          <div>Vienna, Austria</div>
          <div>c2moviez.com (CH)</div>
        </div>
        <div style={{ flex: 1 }} />
        <blockquote style={{
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontSize: 13, lineHeight: 1.65, color: 'rgba(255,255,255,0.2)',
          borderLeft: '2px solid rgba(220,38,38,0.3)', paddingLeft: 12, margin: 0,
        }}>
          "We take on a select number of projects each year. Each one demands our full conviction."
        </blockquote>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px clamp(32px,6vw,96px)' }}>

        {/* Progress */}
        {!submitted && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 64 }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                height: 2, flex: 1, borderRadius: 1,
                background: i < step ? 'rgba(220,38,38,0.5)' : i === step ? '#fff' : 'rgba(255,255,255,0.12)',
                transition: 'background 0.4s ease',
              }} />
            ))}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 720 }}>
            <AnimatePresence mode="wait" custom={dir}>
              {submitted ? (
                <motion.div key="success"
                  initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: EASE }}
                  style={{ textAlign: 'center', padding: '80px 0' }}>
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.7, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
                    style={{ fontSize: 64, marginBottom: 32 }}>✦</motion.div>
                  <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}
                    style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,48px)', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 16px' }}>
                    Application received.
                  </motion.h2>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }}
                    style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>
                    We review every submission personally and will be in touch within 48 hours.
                  </motion.p>
                </motion.div>

              ) : step === 0 ? (
                <motion.div key="step0" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(220,38,38,0.8)', marginBottom: 24 }}>Step 01 — The Vision</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,64px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 48px' }}>What do you want to create?</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 48 }}>
                    {projectTypes.map(pt => (
                      <motion.div key={pt.id}
                        onClick={() => { set('type', pt.id); setTimeout(next, 300); }}
                        whileHover={{ scale: 1.02, borderColor: 'rgba(255,255,255,0.2)' }}
                        whileTap={{ scale: 0.98 }}
                        style={{
                          padding: '28px 24px', borderRadius: 8, cursor: 'pointer',
                          border: form.type === pt.id ? '1px solid rgba(220,38,38,0.6)' : '1px solid rgba(255,255,255,0.09)',
                          borderLeft: form.type === pt.id ? '3px solid #dc2626' : '1px solid rgba(255,255,255,0.09)',
                          background: form.type === pt.id ? 'rgba(220,38,38,0.06)' : 'rgba(255,255,255,0.02)',
                          transition: 'all 0.25s ease',
                        }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.01em' }}>{pt.title}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{pt.desc}</div>
                      </motion.div>
                    ))}
                  </div>
                  {form.type && <NavBtns onNext={next} />}
                </motion.div>

              ) : step === 1 ? (
                <motion.div key="step1" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(220,38,38,0.8)', marginBottom: 24 }}>Step 02 — The Story</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 40px' }}>Tell us about your vision.</h2>
                  <textarea
                    value={form.vision} onChange={e => set('vision', e.target.value)}
                    onFocus={() => setFocused('vision')} onBlur={() => setFocused('')}
                    placeholder="Describe the project, the feeling you want to evoke, who it's for..."
                    rows={5}
                    style={{ ...focusStyle('vision'), resize: 'vertical', marginBottom: 40, display: 'block' }}
                  />
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Budget Range</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 48 }}>
                    {budgets.map(b => (
                      <button key={b} onClick={() => set('budget', b)} style={{
                        padding: '10px 20px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 500,
                        border: form.budget === b ? '1px solid rgba(220,38,38,0.7)' : '1px solid rgba(255,255,255,0.12)',
                        background: form.budget === b ? 'rgba(220,38,38,0.08)' : 'rgba(255,255,255,0.03)',
                        color: form.budget === b ? '#f5f5f7' : 'rgba(255,255,255,0.55)',
                        transition: 'all 0.2s ease',
                      }}>{b}</button>
                    ))}
                  </div>
                  <NavBtns onNext={next} onPrev={prev} />
                </motion.div>

              ) : step === 2 ? (
                <motion.div key="step2" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(220,38,38,0.8)', marginBottom: 24 }}>Step 03 — The Details</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 40px' }}>How do we reach you?</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                    {(['name','company','email','phone'] as const).map(k => (
                      <div key={k}>
                        <label style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
                          {k.charAt(0).toUpperCase() + k.slice(1)}
                        </label>
                        <input value={form[k]} onChange={e => set(k, e.target.value)}
                          onFocus={() => setFocused(k)} onBlur={() => setFocused('')}
                          style={focusStyle(k)} />
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', margin: '32px 0 16px' }}>Preferred Timeline</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 48 }}>
                    {timelines.map(tl => (
                      <button key={tl} onClick={() => set('timeline', tl)} style={{
                        padding: '10px 20px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 500,
                        border: form.timeline === tl ? '1px solid rgba(220,38,38,0.7)' : '1px solid rgba(255,255,255,0.12)',
                        background: form.timeline === tl ? 'rgba(220,38,38,0.08)' : 'rgba(255,255,255,0.03)',
                        color: form.timeline === tl ? '#f5f5f7' : 'rgba(255,255,255,0.55)',
                        transition: 'all 0.2s ease',
                      }}>{tl}</button>
                    ))}
                  </div>
                  <NavBtns onNext={next} onPrev={prev} />
                </motion.div>

              ) : (
                <motion.div key="step3" custom={dir} variants={stepVariants} initial="enter" animate="center" exit="exit">
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(220,38,38,0.8)', marginBottom: 24 }}>Step 04 — Submit</div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,56px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '0 0 40px' }}>Review & send.</h2>
                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '32px', marginBottom: 40, background: 'rgba(255,255,255,0.02)' }}>
                    {[
                      { label: 'Project type', value: form.type },
                      { label: 'Vision', value: form.vision ? form.vision.slice(0, 80) + (form.vision.length > 80 ? '…' : '') : '—' },
                      { label: 'Budget', value: form.budget || '—' },
                      { label: 'Contact', value: `${form.name}${form.company ? `, ${form.company}` : ''}` || '—' },
                      { label: 'Email', value: form.email || '—' },
                      { label: 'Timeline', value: form.timeline || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: 24, paddingBlock: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', width: 100, flexShrink: 0 }}>{label}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <button onClick={prev} style={{ padding: '16px 24px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, background: 'none', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>← Back</button>
                    <motion.button onClick={() => setSubmitted(true)} whileHover={{ scale: 1.02, borderColor: 'rgba(220,38,38,0.8)' }} whileTap={{ scale: 0.98 }}
                      style={{ flex: 1, padding: '16px 32px', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 4, background: 'rgba(220,38,38,0.08)', color: '#f5f5f7', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.12em', textTransform: 'uppercase', transition: 'all 0.25s ease' }}>
                      Submit Application →
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavBtns({ onNext, onPrev }: { onNext: () => void; onPrev?: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {onPrev && (
        <button onClick={onPrev} style={{ padding: '14px 24px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, background: 'none', color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-display)', fontSize: 12, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>← Back</button>
      )}
      <motion.button onClick={onNext} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ padding: '14px 32px', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#f5f5f7', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'all 0.2s ease' }}>
        Continue →
      </motion.button>
    </div>
  );
}
