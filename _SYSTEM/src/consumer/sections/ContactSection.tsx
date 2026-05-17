import { useState } from 'react';

type FormStatus = 'idle' | 'sending' | 'success' | 'error';

interface FormData {
  name: string;
  email: string;
  projectType: string;
  message: string;
}

const initialForm: FormData = {
  name: '',
  email: '',
  projectType: '',
  message: '',
};

export default function ContactSection() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [status, setStatus] = useState<FormStatus>('idle');

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');

    try {
      const res = await fetch('/api/consumer/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="nlp-section nlp-contact" id="contact">
      <div className="nlp-services-header" style={{ textAlign: 'center' }}>
        <span className="nlp-section-kicker">Contact</span>
        <h2 className="nlp-section-title">Start a project.</h2>
        <p
          className="nlp-section-subtitle"
          style={{ color: 'var(--nlp-text-secondary)' }}
        >
          One operator, one stack, one delivery promise.
        </p>
      </div>

      <form className="nlp-contact-form" onSubmit={handleSubmit}>
        <label className="nlp-form-field">
          <span className="nlp-form-label">Name</span>
          <input
            className="nlp-form-input"
            type="text"
            name="name"
            required
            value={form.name}
            onChange={handleChange}
          />
        </label>

        <label className="nlp-form-field">
          <span className="nlp-form-label">Email</span>
          <input
            className="nlp-form-input"
            type="email"
            name="email"
            required
            value={form.email}
            onChange={handleChange}
          />
        </label>

        <label className="nlp-form-field">
          <span className="nlp-form-label">Project type</span>
          <select
            className="nlp-form-select"
            name="projectType"
            required
            value={form.projectType}
            onChange={handleChange}
          >
            <option value="" disabled>
              Select...
            </option>
            <option value="Video">Video</option>
            <option value="Motion">Motion</option>
            <option value="Social">Social</option>
            <option value="Web">Web</option>
            <option value="IT">IT</option>
            <option value="Ads">Ads</option>
          </select>
        </label>

        <label className="nlp-form-field">
          <span className="nlp-form-label">Message</span>
          <textarea
            className="nlp-form-textarea"
            name="message"
            rows={5}
            required
            value={form.message}
            onChange={handleChange}
          />
        </label>

        {status === 'success' ? (
          <div className="nlp-form-success">
            Thanks. We'll be in touch within 24 hours.
          </div>
        ) : (
          <button
            className="nlp-button-primary nlp-form-submit"
            type="submit"
            disabled={status === 'sending'}
          >
            {status === 'sending' ? 'Sending...' : 'Send message'}
          </button>
        )}
      </form>

      <div
        style={{
          textAlign: 'center',
          marginTop: 'var(--nlp-space-8)',
          color: 'var(--nlp-text-secondary)',
          fontSize: 'var(--nlp-text-sm)',
        }}
      >
        Or email{' '}
        <a
          href="mailto:contact@nexuslinkproductions.com"
          style={{ color: 'var(--nlp-cyan)' }}
        >
          contact@nexuslinkproductions.com
        </a>
      </div>
    </section>
  );
}
