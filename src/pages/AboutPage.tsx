import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import CTABanner from '../components/CTABanner';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ─── Counting stat ─── */
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-15%' });

  useEffect(() => {
    if (!inView) { setVal(0); return; }
    let start = 0;
    const dur = 1200;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.floor(e * target));
      if (p < 1) requestAnimationFrame(tick);
      else setVal(target);
    };
    requestAnimationFrame(tick);
  }, [inView, target]);

  return <span ref={ref}>{val}{suffix}</span>;
}

/* ─── Team card ─── */
const members = [
  { name: 'Marcel Spatz', role: 'Founder & Creative Director', loc: 'Vienna, Austria', link: null },
  { name: 'C2Moviez', role: 'Swiss Creative Partner', loc: 'Zurich, Switzerland', link: 'https://c2moviez.com', note: 'Also ExeoFlow IT' },
  { name: 'Lilly Mansfeld', role: 'Graphic Designer', loc: 'Europe', link: null },
];

export default function AboutPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const heroBg = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.94]);

  return (
    <motion.div ref={containerRef} style={{ background: '#0e0e18', color: '#f5f5f7', overflow: 'hidden' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>

      {/* ── HERO ── */}
      <motion.section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', perspective: 800 }}>
        {/* Ghost heading */}
        <motion.h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(80px,14vw,200px)',
          fontWeight: 800, letterSpacing: '-0.06em', lineHeight: 1, textAlign: 'center',
          margin: 0, opacity: heroBg as any, scale: heroScale as any,
          userSelect: 'none', color: '#fff',
        }}>
          NEXUS<br />LINK
        </motion.h1>

        {/* Tagline */}
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.6, ease: EASE }}
          style={{ position: 'absolute', bottom: 120, fontFamily: 'var(--font-body)', fontSize: 14, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
          A Vienna-based creative production house
        </motion.p>

        {/* Red line */}
        <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.4, delay: 0.2, ease: EASE }}
          style={{ position: 'absolute', bottom: 80, left: 0, width: '100%', height: 1, background: 'rgba(220,38,38,0.5)', transformOrigin: '0 0' }} />

        {/* Scroll cue */}
        <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)' }}>
          <div style={{ width: 1, height: 28, background: 'linear-gradient(to bottom, rgba(255,255,255,0.4), transparent)' }} />
        </motion.div>

        {/* Corner labels */}
        {[{ t: 32, l: 32, text: 'EST. 2016' }, { t: 32, r: 32, text: 'VIENNA' }].map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.8 }}
            style={{ position: 'absolute', top: c.t, left: (c as any).l, right: (c as any).r, fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
            {c.text}
          </motion.div>
        ))}
      </motion.section>

      {/* ── MANIFESTO ── */}
      <section style={{ padding: '120px clamp(32px,6vw,96px)', background: '#161620', position: 'relative' }}>
        {/* Ghost pull-quote */}
        <div style={{
          position: 'absolute', top: 60, left: 'clamp(32px,6vw,96px)',
          fontFamily: 'Georgia, serif', fontStyle: 'italic',
          fontSize: 'clamp(32px,4vw,60px)', fontWeight: 400,
          color: 'rgba(255,255,255,0.04)', lineHeight: 1.2, letterSpacing: '-0.02em',
          maxWidth: 600, pointerEvents: 'none', userSelect: 'none',
        }}>
          Story<br />precedes<br />everything.
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 80, alignItems: 'start' }}>
          {/* Left accent */}
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, margin: '-15%' }} transition={{ duration: 0.9, ease: EASE }}>
            <div style={{ width: 1, height: 80, background: 'rgba(220,38,38,0.5)', marginBottom: 32 }} />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#dc2626', marginBottom: 16 }}>About</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,3.5vw,48px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, color: 'rgba(255,255,255,0.9)' }}>
              We find the story. We frame it in light.
            </div>
          </motion.div>

          {/* Right text */}
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-15%' }} transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
            style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(15px,1.4vw,18px)', lineHeight: 1.8, color: 'rgba(255,255,255,0.55)', fontWeight: 300, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p>Nexus Link was born from a conviction that every great brand carries an untold story. Founded in Vienna, we operate at the intersection of cinematic craft and strategic intelligence — producing films that outlast the moment.</p>
            <p>From a two-person operation to an internationally networked collective, we've grown by refusing to compromise on the fundamentals: intention, craft, and unwavering attention to the frame.</p>
            <p>We work with brands who understand that the most powerful thing they can do is make someone feel something. Everything else follows from that.</p>
          </motion.div>
        </div>
      </section>

      {/* ── THE COLLECTIVE ── */}
      <section style={{ padding: '120px 0', overflow: 'hidden', position: 'relative' }}>
        {/* Ghost heading */}
        <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-display)', fontSize: 'clamp(60px,12vw,180px)', fontWeight: 800, letterSpacing: '-0.06em', color: 'rgba(255,255,255,0.03)', whiteSpace: 'nowrap', userSelect: 'none', pointerEvents: 'none' }}>
          THE COLLECTIVE
        </div>

        <div style={{ paddingInline: 'clamp(32px,6vw,96px)', marginBottom: 48 }}>
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-15%' }} transition={{ duration: 0.8, ease: EASE }}
            style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,48px)', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>
            The Collective
          </motion.h2>
        </div>

        {/* Horizontal scroll cards */}
        <div style={{ display: 'flex', gap: 24, paddingInline: 'clamp(32px,6vw,96px)', overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
          {members.map((m, i) => (
            <motion.div key={m.name}
              initial={{ opacity: 0, y: 40, rotateY: 8 }} whileInView={{ opacity: 1, y: 0, rotateY: 0 }}
              viewport={{ once: false, margin: '-15%' }} transition={{ duration: 0.8, delay: i * 0.12, ease: EASE }}
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
              style={{ flexShrink: 0, width: 280, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '32px 24px', background: 'rgba(255,255,255,0.02)', perspective: 600 }}>
              {/* Avatar */}
              <div style={{ width: '100%', aspectRatio: '4/3', background: 'linear-gradient(135deg, #1a1a28, #0e0e18)', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1}>
                  <circle cx={12} cy={8} r={4} /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: '#dc2626', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{m.role}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body)' }}>{m.loc}</div>
              {m.note && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 8, fontStyle: 'italic' }}>{m.note}</div>}
              {m.link && <a href={m.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 16, fontSize: 12, color: 'rgba(220,38,38,0.7)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>↗ {m.link.replace('https://', '')}</a>}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── SWISS PARTNERSHIP ── */}
      <section style={{ padding: '100px clamp(32px,6vw,96px)', background: '#13131e' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease: EASE }}
            style={{ display: 'flex', alignItems: 'center', gap: 48, flexWrap: 'wrap' }}>
            {[{ name: 'C2Moviez', url: 'c2moviez.com', href: 'https://c2moviez.com' }, { name: 'ExeoFlow', url: 'exeoflow.com', href: 'https://exeoflow.com' }].map((p, i) => (
              <React.Fragment key={p.name}>
                {i > 0 && <div style={{ width: 1, height: 60, background: 'rgba(220,38,38,0.3)', flexShrink: 0 }} />}
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,48px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>{p.name}</div>
                  <a href={p.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)', textDecoration: 'none' }}>↗ {p.url}</a>
                </div>
              </React.Fragment>
            ))}
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.7, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                Our Swiss partners bring cinematic mastery and digital infrastructure — enabling projects at scale across Europe and beyond.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── NUMBERS ── */}
      <section style={{ padding: '120px clamp(32px,6vw,96px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'clamp(24px,4vw,64px)' }}>
          {[{ val: 150, suf: '+', label: 'Projects' }, { val: 8, suf: '', label: 'Years' }, { val: 12, suf: '', label: 'Countries' }, { val: 3, suf: '', label: 'Partners' }].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, margin: '-15%' }} transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(48px,7vw,88px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: '#f5f5f7' }}>
                <CountUp target={s.val} suffix={s.suf} />
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── PHILOSOPHY ── */}
      <section style={{ padding: '120px clamp(32px,6vw,96px)', background: '#161620' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false }} transition={{ duration: 0.8, ease: EASE }}
          style={{ textAlign: 'center', marginBottom: 80 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 'clamp(20px,3vw,36px)', fontWeight: 400, color: 'rgba(255,255,255,0.7)' }}>As above, so below.</div>
        </motion.div>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
          {[
            { num: 'I', title: 'Every Frame Is A Choice', desc: 'We leave nothing to accident. Every composition, every cut, every breath of sound is intentional.' },
            { num: 'II', title: 'Story Precedes Strategy', desc: 'Narrative first. Execution second. The strategy that doesn\'t begin with story doesn\'t end with impact.' },
            { num: 'III', title: 'Craft Has No Deadline', desc: 'We stay until it\'s right. Not until the budget runs out. Until the work is true.' },
          ].map((p, i) => (
            <motion.div key={p.num} initial={{ opacity: 0, y: 32, rotateX: 8 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }} viewport={{ once: false, margin: '-15%' }} transition={{ duration: 0.8, delay: i * 0.12, ease: EASE }}
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 32 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: 'rgba(220,38,38,0.6)', marginBottom: 20, fontStyle: 'italic' }}>{p.num}</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(16px,1.6vw,20px)', fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 16px' }}>{p.title}</h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <CTABanner headline="Ready to tell your story?" buttonLabel="Start a Project" buttonHref="/contact" />
    </motion.div>
  );
}
