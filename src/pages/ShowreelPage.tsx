import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const VIMEO_PLACEHOLDER =
  "https://player.vimeo.com/video/76979871?badge=0&autopause=0&player_id=0&app_id=58479";

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const ShowreelPage = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const [showControls, setShowControls] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(120);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubRef = useRef<HTMLDivElement>(null);

  const postMessage = useCallback(
    (data: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ method: "player", value: data }),
        "*"
      );
    },
    []
  );

  const togglePlay = () => {
    if (playing) {
      postMessage({ method: "pause" });
    } else {
      postMessage({ method: "play" });
    }
    setPlaying((p) => !p);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    setMuted(v === 0);
    postMessage({ method: "setVolume", value: v });
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    postMessage({ method: "setVolume", value: next ? 0 : volume });
  };

  const toggleFullscreen = async () => {
    if (!sectionRef.current) return;
    if (!document.fullscreenElement) {
      await sectionRef.current.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubRef.current || !duration) return;
    const rect = scrubRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const clamped = Math.min(1, Math.max(0, x));
    const time = clamped * duration;
    setProgress(clamped);
    setCurrentTime(time);
    postMessage({ method: "seekTo", value: time });
  };

  // Listen for Vimeo player events
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "ready") {
          postMessage({ method: "addEventListener", value: "playProgress" });
          postMessage({ method: "addEventListener", value: "finish" });
        }
        if (data.event === "playProgress") {
          const pct = data.data.percent ?? 0;
          const sec = data.data.seconds ?? 0;
          const dur = data.data.duration ?? duration;
          setProgress(pct);
          setCurrentTime(sec);
          setDuration(dur);
        }
        if (data.event === "finish") {
          setPlaying(false);
          setProgress(1);
        }
        if (data.event === "play") setPlaying(true);
        if (data.event === "pause") setPlaying(false);
      } catch {
        // ignore
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [duration, postMessage]);

  // Auto-hide controls
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const resetTimer = () => {
      setShowControls(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    };

    section.addEventListener("mousemove", resetTimer);
    section.addEventListener("mouseenter", resetTimer);
    section.addEventListener("mouseleave", () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShowControls(false), 1000);
    });

    resetTimer();
    return () => {
      section.removeEventListener("mousemove", resetTimer);
      section.removeEventListener("mouseenter", resetTimer);
      section.removeEventListener("mouseleave", resetTimer);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#000",
      }}
    >
      {/* Video iframe */}
      <iframe
        ref={iframeRef}
        src={`${VIMEO_PLACEHOLDER}?autoplay=0&muted=0&controls=0&loop=0&title=0&byline=0&portrait=0`}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: "none",
          pointerEvents: playing ? "auto" : "none",
        }}
        allow="autoplay; fullscreen"
        allowFullScreen
        title="Showreel"
      />

      {/* Overlay gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Animated overlay contents */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            key="controls-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "24px 32px",
              pointerEvents: "auto",
            }}
          >
            {/* Top row: Logo + Close */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontFamily: "Space Grotesk, sans-serif",
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  cursor: "default",
                }}
              >
                LOGO
              </div>
              <button
                onClick={() => window.history.back()}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  fontSize: 28,
                  cursor: "pointer",
                  width: 44,
                  height: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#06b6d4")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#fff")}
              >
                ✕
              </button>
            </div>

            {/* Spacer */}
            <div />

            {/* Bottom controls */}
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {/* Scrubber */}
              <div
                ref={scrubRef}
                onClick={handleScrub}
                style={{
                  width: "100%",
                  height: 6,
                  background: "rgba(255,255,255,0.25)",
                  borderRadius: 3,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: `${progress * 100}%`,
                    height: "100%",
                    background: "#06b6d4",
                    borderRadius: 3,
                    transition: "width 0.1s linear",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${progress * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 0 6px rgba(0,0,0,0.4)",
                  }}
                />
              </div>

              {/* Button row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "#fff",
                }}
              >
                {/* Left group */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlay}
                    aria-label={playing ? "Pause" : "Play"}
                    style={iconBtnStyle}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#06b6d4")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "#fff")
                    }
                  >
                    {playing ? "⏸" : "▶"}
                  </button>

                  {/* Time display */}
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 13,
                      opacity: 0.8,
                      minWidth: 70,
                    }}
                  >
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Right group */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {/* Volume */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={toggleMute}
                      aria-label={muted ? "Unmute" : "Mute"}
                      style={iconBtnStyle}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "#06b6d4")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "#fff")
                      }
                    >
                      {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      style={{
                        width: 80,
                        accentColor: "#06b6d4",
                        height: 4,
                        cursor: "pointer",
                      }}
                    />
                  </div>

                  {/* Fullscreen */}
                  <button
                    onClick={toggleFullscreen}
                    aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                    style={iconBtnStyle}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#06b6d4")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "#fff")
                    }
                  >
                    {fullscreen ? "⛶" : "⛶"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: 20,
  cursor: "pointer",
  width: 36,
  height: 36,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  transition: "color 0.2s",
};

export default ShowreelPage;
