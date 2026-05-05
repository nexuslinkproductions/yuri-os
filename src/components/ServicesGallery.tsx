import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCreative, Mousewheel, Keyboard, Pagination } from 'swiper/modules';
import { motion } from 'framer-motion';
import type { Swiper as SwiperType } from 'swiper';

import 'swiper/css';
import 'swiper/css/effect-creative';

interface SlideData {
  id: number;
  num: string;
  title: string;
  desc: string;
  image: string;
}

const slides: SlideData[] = [
  {
    id: 1,
    num: '01',
    title: 'Video Production',
    desc: 'End-to-end cinematic storytelling from concept to final cut — commercials, branded content, music videos, and documentaries.',
    image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1920&q=80',
  },
  {
    id: 2,
    num: '02',
    title: 'Post-Production',
    desc: 'Professional editing, color grading, sound design, and visual effects that elevate your footage to a polished masterpiece.',
    image: 'https://images.unsplash.com/photo-1574717024453-354056afaf27?w=1920&q=80',
  },
  {
    id: 3,
    num: '03',
    title: 'Motion Graphics',
    desc: 'Dynamic animated graphics, kinetic typography, and branded explainer videos that communicate complex ideas with clarity.',
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1920&q=80',
  },
  {
    id: 4,
    num: '04',
    title: 'Photography',
    desc: 'High-end commercial photography including product shots, lifestyle campaigns, and editorial portraiture with meticulous lighting.',
    image: 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1920&q=80',
  },
  {
    id: 5,
    num: '05',
    title: 'Aerial',
    desc: 'Stunning drone cinematography and aerial mapping for real estate, events, landscapes, and immersive establishing shots.',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80',
  },
];

const ServicesGallery: React.FC = () => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const swiperRef = React.useRef<SwiperType | null>(null);

  return (
    <section
      role="region"
      aria-label="Services gallery"
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0a0a0a',
      }}
    >
      <Swiper
        modules={[EffectCreative, Mousewheel, Keyboard, Pagination]}
        effect="creative"
        creativeEffect={{
          prev: {
            translate: [0, 0, -400],
            opacity: 0,
          },
          next: {
            translate: ['100%', 0, 0],
            opacity: 0.5,
          },
        }}
        speed={800}
        mousewheel={{ forceToAxis: true }}
        keyboard={{ enabled: true, onlyInViewport: true }}
        pagination={{ clickable: false, enabled: false }}
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
        }}
        onSlideChange={(swiper) => {
          setActiveIndex(swiper.activeIndex);
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <div
              style={{
                width: '100%',
                height: '100vh',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* Background image */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `url(${slide.image})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  zIndex: 0,
                }}
              />

              {/* Dark gradient overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to bottom, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.85) 100%)',
                  zIndex: 1,
                }}
              />

              {/* Service number top-left */}
              <div
                style={{
                  position: 'absolute',
                  top: '48px',
                  left: '48px',
                  zIndex: 2,
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '14px',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#22d3ee',
                  fontWeight: 500,
                }}
              >
                {slide.num}
              </div>

              {/* Content */}
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{
                  position: 'relative',
                  zIndex: 2,
                  textAlign: 'center',
                  padding: '0 24px',
                  maxWidth: '600px',
                }}
              >
                <h2
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '60px',
                    fontWeight: 700,
                    color: '#ffffff',
                    margin: 0,
                    marginBottom: '20px',
                    lineHeight: 1.1,
                  }}
                >
                  {slide.title}
                </h2>
                <p
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: '18px',
                    fontWeight: 400,
                    color: 'rgba(255,255,255,0.85)',
                    maxWidth: '480px',
                    margin: '0 auto',
                    lineHeight: 1.6,
                  }}
                >
                  {slide.desc}
                </p>
              </motion.div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Bottom controls */}
      <div
        style={{
          position: 'absolute',
          bottom: '48px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        {/* 5-dot navigation */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => swiperRef.current?.slideTo(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                backgroundColor:
                  idx === activeIndex ? '#22d3ee' : 'rgba(255,255,255,0.35)',
                transition: 'background-color 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '240px',
            height: '2px',
            borderRadius: '1px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${((activeIndex + 1) / slides.length) * 100}%`,
              borderRadius: '1px',
              background:
                'linear-gradient(90deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%)',
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>
    </section>
  );
};

export default ServicesGallery;
