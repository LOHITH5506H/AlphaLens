/**
 * LoadingOverlay — Skeleton loading state for the AR dashboard.
 */

"use client";

export default function LoadingOverlay() {
  return (
    <div className="ar-dashboard animate-fade-in-up">
      {/* Header skeleton */}
      <div className="ar-dashboard-header">
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: "60%", height: 14, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: "30%", height: 10 }} />
        </div>
      </div>

      {/* Price skeleton */}
      <div style={{ marginBottom: 16 }}>
        <div className="skeleton" style={{ width: "50%", height: 28, marginBottom: 6 }} />
        <div className="skeleton" style={{ width: "25%", height: 12 }} />
      </div>

      {/* Stats grid skeleton */}
      <div className="stats-grid">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="stat-card">
            <div className="skeleton" style={{ width: "50%", height: 8, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: "70%", height: 14 }} />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="chart-container">
        <div className="skeleton" style={{ width: "40%", height: 8, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: "100%", height: 80 }} />
      </div>

      {/* AI Banner skeleton */}
      <div
        className="skeleton"
        style={{ width: "100%", height: 90, borderRadius: 14 }}
      />
    </div>
  );
}
