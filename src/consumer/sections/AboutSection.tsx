import { profile, brandStory, stats } from '../data/about';

export default function AboutSection() {
  return (
    <section className="nlp-section nlp-about" id="about">
      <div className="nlp-services-header">
        <span className="nlp-section-kicker">About</span>
        <h2 className="nlp-section-title">{profile.title}</h2>
      </div>

      <div className="nlp-about-grid">
        <div
          className="nlp-about-photo"
          role="img"
          aria-label={`Portrait of ${profile.name}`}
          style={{
            backgroundImage: `url(${profile.photoUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />

        <div>
          <h3
            style={{
              fontFamily: 'var(--nlp-font-heading)',
              fontSize: 'var(--nlp-text-3xl)',
              marginBottom: 'var(--nlp-space-3)',
            }}
          >
            {profile.name}
          </h3>
          <p
            style={{
              color: 'var(--nlp-text-secondary)',
              marginBottom: 'var(--nlp-space-2)',
            }}
          >
            {profile.location}
          </p>
          <p
            style={{
              lineHeight: 1.7,
              marginBottom: 'var(--nlp-space-6)',
            }}
          >
            {profile.bio}
          </p>
          <p
            style={{
              lineHeight: 1.6,
              color: 'var(--nlp-text-secondary)',
              fontSize: 'var(--nlp-text-sm)',
              borderLeft: '2px solid var(--nlp-purple)',
              paddingLeft: 'var(--nlp-space-4)',
              marginBottom: 'var(--nlp-space-6)',
            }}
          >
            {brandStory}
          </p>

          <div className="nlp-stats-row">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="nlp-stat-value">
                  {stat.value}
                  {stat.suffix || ''}
                </div>
                <div className="nlp-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

