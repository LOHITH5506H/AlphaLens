/**
 * VoiceButton — Hold-to-speak microphone button.
 * Fixed position on the AR overlay, outside the AR canvas.
 */

"use client";

interface VoiceButtonProps {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  onStart: () => void;
  onStop: () => void;
}

export default function VoiceButton({
  isListening,
  isSupported,
  transcript,
  onStart,
  onStop,
}: VoiceButtonProps) {
  if (!isSupported) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "32px",
        right: "24px",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "10px",
      }}
    >
      {/* Transcript bubble */}
      {(isListening || transcript) && (
        <div
          className="glass-card-sm animate-fade-in-up"
          style={{
            padding: "10px 14px",
            maxWidth: "240px",
            fontSize: "13px",
            lineHeight: "1.4",
          }}
        >
          {isListening && !transcript && (
            <span style={{ color: "#f87171" }}>● Listening...</span>
          )}
          {transcript && (
            <span style={{ color: "#e2e8f0" }}>
              &ldquo;{transcript}&rdquo;
            </span>
          )}
        </div>
      )}

      {/* Mic button */}
      <button
        className={`voice-btn ${isListening ? "listening" : ""}`}
        onPointerDown={(e) => {
          e.preventDefault();
          onStart();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          onStop();
        }}
        onPointerLeave={(e) => {
          e.preventDefault();
          if (isListening) onStop();
        }}
        title="Hold to speak"
        id="voice-button"
      >
        {isListening ? (
          // Active mic icon
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        ) : (
          // Inactive mic icon
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </button>
    </div>
  );
}
