import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type React from 'react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const phases = [
  {
    phase: 'DISCOVER',
    title: 'What are we framing?',
    description: 'Choose the project surface. This gives the conversation its first edge.',
  },
  {
    phase: 'DEVELOP',
    title: 'Define the vision.',
    description: 'Describe the story, audience, pressure, and the kind of memory the asset should leave.',
  },
  {
    phase: 'PRODUCE',
    title: 'Set the production reality.',
    description: 'Budget, timeline, and contact details decide how the room gets built.',
  },
  {
    phase: 'DELIVER',
    title: 'Review the brief.',
    description: 'Confirm the signal before it moves into a direct creative proposal.',
  },
];

const projectTypes = [
  { id: 'brand-campaign', title: 'Brand Content & Campaigns', detail: 'Campaign assets, launch visuals, commercial social systems' },
  { id: 'documentary', title: 'Corporate & Documentary', detail: 'Founder story, interviews, event coverage, brand films' },
  { id: 'post-motion', title: 'Editing, Color & Motion', detail: 'Post-production, color, After Effects, motion design' },
  { id: 'short-form', title: 'Short-Form & Social', detail: 'Reels, TikTok, Shorts, fast campaign variants' },
  { id: 'audio-visual', title: 'Audio-Visual Production', detail: 'Podcast, live stream, music video, multi-camera capture' },
];

const budgets = ['Under EUR 5k', 'EUR 5k-10k', 'EUR 10k-25k', 'EUR 25k+', 'Open'];
const timelines = ['0-4 weeks', '1-3 months', '3-6 months', 'Open timeline'];

type FormState = {
  type: string;
  vision: string;
  budget: string;
  timeline: string;
  name: string;
  company: string;
  email: string;
  phone: string;
};

const initialForm: FormState = {
  type: '',
  vision: '',
  budget: '',
  timeline: '',
  name: '',
  company: '',
  email: '',
  phone: '',
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  padding: '14px 16px',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(255,255,255,0.035)',
  color: 'var(--color-text-primary)',
  outline: 0,
  transition: 'border-color 180ms var(--ease-out), background 180ms var(--ease-out)',
};

function FrameCorners() {
  return <div className="frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>;
}

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <div className="kicker" style={{ marginBottom: 18 }}>
      {phase}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 34 }}>
      {phases.map((phase, index) => (
        <div key={phase.phase}>
          <motion.div
            layout
            style={{
              height: 2,
              borderRadius: 999,
              background: index <= step ? 'var(--color-crimson)' : 'var(--color-border-subtle)',
              boxShadow: index === step ? 'var(--shadow-glow)' : 'none',
            }}
          />
          <div style={{ marginTop: 8, color: index === step ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em' }}>
            {phase.phase}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChoiceButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      data-magnetic
      className="magnetic-link"
      onClick={onClick}
      style={{
        justifyContent: 'flex-start',
        minHeight: 44,
        padding: '11px 16px',
        border: active ? '1px solid var(--color-crimson-border)' : '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-full)',
        background: active ? 'rgba(220,38,38,0.1)' : 'rgba(255,255,255,0.025)',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

function NavButtons({ step, next, prev, submit }: { step: number; next: () => void; prev: () => void; submit: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 34, flexWrap: 'wrap' }}>
      {step > 0 && (
        <button type="button" data-magnetic className="magnetic-link cta-button" onClick={prev}>
          Back
        </button>
      )}
      <button type="button" data-magnetic className="magnetic-link cta-button cta-button--primary" onClick={step === 3 ? submit : next}>
        {step === 3 ? 'Submit Brief' : 'Continue'} <span aria-hidden="true">-&gt;</span>
      </button>
    </div>
  );
}

export default function ContactPage() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const setField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const next = useCallback(() => {
    setDirection(1);
    setStep((current) => Math.min(3, current + 1));
  }, []);

  const prev = useCallback(() => {
    setDirection(-1);
    setStep((current) => Math.max(0, current - 1));
  }, []);

  const selectedProject = useMemo(
    () => projectTypes.find((project) => project.id === form.type)?.title || 'Not selected',
    [form.type],
  );

  const reviewRows = [
    { label: 'Project', value: selectedProject },
    { label: 'Vision', value: form.vision || 'Not described yet' },
    { label: 'Budget', value: form.budget || 'Open' },
    { label: 'Timeline', value: form.timeline || 'Open' },
    { label: 'Contact', value: [form.name, form.company, form.email].filter(Boolean).join(' / ') || 'Not provided yet' },
  ];

  return (
    <div className="spatial-page">
      <section className="spatial-section frame-shell page-hero page-hero--contact" data-proximity>
        <FrameCorners />
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.68, ease: EASE }}
            style={{ marginBottom: 42 }}
          >
            <div className="kicker">Contact</div>
            <h1 className="section-title" style={{ fontSize: 'clamp(58px, 10vw, 140px)' }}>Start a Project.</h1>
          </motion.div>

          <div className="contact-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'stretch' }}>
            <motion.div
              className="depth-panel"
              data-tilt
              data-proximity
              style={{ '--z-depth': '42px', minHeight: 650, padding: 'clamp(24px, 5vw, 56px)' } as React.CSSProperties}
              initial={{ opacity: 0, y: 34 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 0.1, ease: EASE }}
            >
              {!submitted && <StepIndicator step={step} />}

              <AnimatePresence mode="wait" custom={direction}>
                {submitted ? (
                  <motion.div
                    key="success"
                    custom={direction}
                    initial={{ opacity: 0, y: 24, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -24 }}
                    transition={{ duration: 0.52, ease: EASE }}
                    style={{ minHeight: 420, display: 'grid', placeItems: 'center', textAlign: 'center' }}
                  >
                    <div>
                      <div style={{ width: 76, height: 76, borderRadius: '50%', border: '1px solid var(--color-crimson-border)', display: 'grid', placeItems: 'center', margin: '0 auto 28px', color: 'var(--color-crimson)', fontSize: 28 }}>
                        NL
                      </div>
                      <h2 style={{ fontSize: 'clamp(34px, 5vw, 70px)', fontWeight: 900, letterSpacing: 0 }}>Brief received.</h2>
                      <p className="section-copy" style={{ marginInline: 'auto' }}>
                        Nexus Link will review the project signal and respond with the next practical step.
                      </p>
                      <button
                        type="button"
                        data-magnetic
                        className="magnetic-link cta-button"
                        style={{ marginTop: 30 }}
                        onClick={() => {
                          setSubmitted(false);
                          setStep(0);
                          setForm(initialForm);
                        }}
                      >
                        New Brief
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={step}
                    custom={direction}
                    initial={{ opacity: 0, x: direction * 26 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * -26 }}
                    transition={{ duration: 0.38, ease: EASE }}
                  >
                    <PhaseBadge phase={phases[step].phase} />
                    <h2 style={{ fontSize: 'clamp(32px, 5vw, 62px)', fontWeight: 900, letterSpacing: 0 }}>{phases[step].title}</h2>
                    <p className="section-copy">{phases[step].description}</p>

                    {step === 0 && (
                      <div className="project-choice-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 36 }}>
                        {projectTypes.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            data-tilt
                            data-magnetic
                            data-proximity
                            className="depth-card"
                            onClick={() => {
                              setField('type', project.id);
                              window.setTimeout(next, 180);
                            }}
                            style={{
                              '--z-depth': form.type === project.id ? '38px' : '24px',
                              minHeight: 155,
                              padding: 22,
                              textAlign: 'left',
                              borderColor: form.type === project.id ? 'var(--color-crimson-border)' : 'var(--color-border-subtle)',
                            } as React.CSSProperties}
                          >
                            <div style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900 }}>{project.title}</div>
                            <div style={{ marginTop: 10, color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{project.detail}</div>
                          </button>
                        ))}
                      </div>
                    )}

                    {step === 1 && (
                      <div style={{ marginTop: 34 }}>
                        <label style={{ display: 'block', marginBottom: 10, color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                          Vision
                        </label>
                        <textarea
                          value={form.vision}
                          onChange={(event) => setField('vision', event.target.value)}
                          rows={7}
                          placeholder="Story, audience, references, deliverables, pressure, deadlines..."
                          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.65 }}
                        />
                        <div style={{ marginTop: 26 }}>
                          <div style={{ marginBottom: 12, color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            Budget Range
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {budgets.map((budget) => (
                              <ChoiceButton key={budget} active={form.budget === budget} onClick={() => setField('budget', budget)}>
                                {budget}
                              </ChoiceButton>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {step === 2 && (
                      <div style={{ marginTop: 34 }}>
                        <div className="contact-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                          {(['name', 'company', 'email', 'phone'] as const).map((field) => (
                            <label key={field} style={{ display: 'grid', gap: 9 }}>
                              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{field}</span>
                              <input value={form[field]} onChange={(event) => setField(field, event.target.value)} style={fieldStyle} />
                            </label>
                          ))}
                        </div>
                        <div style={{ marginTop: 26 }}>
                          <div style={{ marginBottom: 12, color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            Timeline
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {timelines.map((timeline) => (
                              <ChoiceButton key={timeline} active={form.timeline === timeline} onClick={() => setField('timeline', timeline)}>
                                {timeline}
                              </ChoiceButton>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {step === 3 && (
                      <div className="depth-card" data-proximity style={{ marginTop: 34, padding: 20 }}>
                        {reviewRows.map((row, index) => (
                          <div
                            key={row.label}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '110px 1fr',
                              gap: 16,
                              padding: '14px 0',
                              borderBottom: index === reviewRows.length - 1 ? '0' : '1px solid var(--color-border-void)',
                            }}
                          >
                            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{row.label}</span>
                            <span style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <NavButtons step={step} next={next} prev={prev} submit={() => setSubmitted(true)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.aside
              className="depth-card contact-sidebar"
              data-tilt
              data-proximity
              style={{
                '--z-depth': '64px',
                padding: 28,
                position: 'sticky',
                top: 104,
                minHeight: 650,
                alignSelf: 'start',
                display: 'flex',
                flexDirection: 'column',
              } as React.CSSProperties}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: submitted ? 0.42 : 1, x: 0 }}
              transition={{ duration: 0.72, delay: 0.18, ease: EASE }}
            >
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 900, letterSpacing: '0.16em' }}>NEXUS LINK</div>
                <div style={{ marginTop: 26, color: 'var(--color-text-secondary)', lineHeight: 1.9 }}>
                  <a href="mailto:contact@nexuslinkproductions.com">contact@nexuslinkproductions.com</a>
                  <div>Vienna, Austria</div>
                  <div>@nexuslinkproductions</div>
                </div>
              </div>

              <div style={{ marginTop: 42, paddingTop: 28, borderTop: '1px solid var(--color-border-subtle)' }}>
                <div className="kicker">{phases[step].phase}</div>
                <p style={{ marginTop: 18, color: 'var(--color-text-secondary)', lineHeight: 1.72 }}>{phases[step].description}</p>
              </div>

              <div style={{ flex: 1 }} />

              <blockquote
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  borderLeft: '1px solid var(--color-crimson)',
                  color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  lineHeight: 1.72,
                }}
              >
                "Selective projects. Full conviction. Clear delivery."
              </blockquote>
            </motion.aside>
          </div>
        </div>
      </section>

      <style>{`
        input:focus,
        textarea:focus {
          border-color: var(--color-crimson-border) !important;
          background: rgba(255,255,255,0.055) !important;
        }

        @media (max-width: 980px) {
          .contact-layout {
            grid-template-columns: 1fr !important;
          }

          .contact-sidebar {
            position: relative !important;
            top: auto !important;
            min-height: auto !important;
          }

          .project-choice-grid,
          .contact-fields {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
