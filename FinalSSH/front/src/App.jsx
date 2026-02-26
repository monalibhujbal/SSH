import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

const API = "http://localhost:8000";
const TOTAL_QUESTIONS = 5;
const STORAGE_KEY = "mcq_quiz_sessions";

const PROFICIENCY_OPTIONS = [
  { value: "beginner", label: "Beginner", icon: "🌱", desc: "Foundational concepts, straightforward recall" },
  { value: "intermediate", label: "Intermediate", icon: "⚡", desc: "Applied thinking, multi-step reasoning" },
  { value: "advanced", label: "Advanced", icon: "🔥", desc: "Expert edge-cases, deep implementation" },
];

// ── LocalStorage ──────────────────────────────────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveSession(session) {
  const sessions = loadSessions();
  sessions.unshift(session);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 50)));
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const pct = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - pct, 3); // ease-out cubic
      setVal(Math.round(ease * target));
      if (pct < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return val;
}

// ── Colour helpers ────────────────────────────────────────────────────────────
const DIFF_NUM = { easy: 1, medium: 2, hard: 3 };
const DIFF_COL = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };
const DIFF_LABEL = { 1: "Easy", 2: "Med", 3: "Hard" };

function scoreBadgeClass(pct) {
  if (pct >= 80) return "badge-excellent";
  if (pct >= 60) return "badge-good";
  if (pct >= 40) return "badge-fair";
  return "badge-poor";
}
function scoreBadgeLabel(pct) {
  if (pct >= 80) return "Excellent 🏆";
  if (pct >= 60) return "Good 👍";
  if (pct >= 40) return "Fair 💪";
  return "Needs Work 📖";
}

// ── SVG Tooltip ───────────────────────────────────────────────────────────────
function SvgTooltip({ x, y, lines, visible }) {
  if (!visible) return null;
  const W = 100, H = lines.length * 14 + 10, PAD = 6;
  const tx = Math.min(x - W / 2, 999);
  const ty = y - H - 10;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={tx} y={ty} width={W} height={H} rx={5}
        fill="#1e1b4b" opacity={0.92} />
      {lines.map((l, i) => (
        <text key={i} x={tx + PAD} y={ty + PAD + 11 + i * 14}
          fontSize="10" fill="#fff" fontWeight={i === 0 ? "700" : "400"}>
          {l}
        </text>
      ))}
    </g>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ correct, total }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 80); return () => clearTimeout(t); }, []);
  const r = 38, cx = 48, cy = 48, sw = 11;
  const circ = 2 * Math.PI * r;
  const pct = total ? (animated ? correct / total : 0) : 0;
  return (
    <svg width={96} height={96}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6366f1" strokeWidth={sw}
        strokeDasharray={`${pct * circ} ${circ}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)" }}
      />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#111">
        {correct}/{total}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9" fill="#999">Score</text>
    </svg>
  );
}

// ── Trend Chart ───────────────────────────────────────────────────────────────
function TrendChart({ sessions }) {
  const [hovered, setHovered] = useState(null);
  const data = [...sessions].reverse();
  const W = 340, H = 90, P = { t: 12, b: 22, l: 30, r: 12 };
  const iW = W - P.l - P.r, iH = H - P.t - P.b;
  const pts = data.map((s, i) => ({
    x: P.l + (data.length < 2 ? iW / 2 : (i / (data.length - 1)) * iW),
    y: P.t + iH - (s.score / s.total) * iH,
    pct: Math.round(s.score / s.total * 100), topic: s.topic,
  }));
  const line = pts.map(p => `${p.x},${p.y}`).join(" ");
  const areaY = P.t + iH;
  const area = pts.length >= 2
    ? `${pts[0].x},${areaY} ${line} ${pts[pts.length - 1].x},${areaY}`
    : "";

  // Trend insight
  let trendText = "", trendClass = "";
  if (data.length >= 2) {
    const diff = pts[pts.length - 1].pct - pts[0].pct;
    if (diff > 0) { trendText = `▲ +${diff}% overall improvement`; trendClass = "trend-up"; }
    else if (diff < 0) { trendText = `▼ ${diff}% decline`; trendClass = "trend-down"; }
    else { trendText = "→ Consistent performance"; trendClass = "trend-flat"; }
  }

  return (
    <div>
      {trendText && <div className={`trend-insight ${trendClass}`}>{trendText}</div>}
      <svg width={W} height={H} className="an-svg">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 50, 100].map(v => {
          const y = P.t + iH - (v / 100) * iH;
          return (
            <g key={v}>
              <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" />
              <text x={P.l - 3} y={y + 3} fontSize="8" fill="#bbb" textAnchor="end">{v}%</text>
            </g>
          );
        })}
        {area && <polygon points={area} fill="url(#trendGrad)" />}
        {pts.length >= 2 && (
          <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2.5"
            strokeLinejoin="round" className="an-line-draw" />
        )}
        {pts.map((p, i) => (
          <g key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}>
            <circle cx={p.x} cy={p.y} r={hovered === i ? 7 : 4.5}
              fill={hovered === i ? "#4f46e5" : "#6366f1"}
              stroke="#fff" strokeWidth="2"
              style={{ transition: "r 0.15s, fill 0.15s" }} />
          </g>
        ))}
        {hovered !== null && pts[hovered] && (
          <SvgTooltip x={pts[hovered].x} y={pts[hovered].y} visible
            lines={[pts[hovered].topic, `Score: ${pts[hovered].pct}%`]} />
        )}
      </svg>
    </div>
  );
}

// ── Difficulty Chart ──────────────────────────────────────────────────────────
function DifficultyChart({ history }) {
  const [hovered, setHovered] = useState(null);
  const W = 340, H = 100, P = { t: 12, b: 26, l: 40, r: 12 };
  const iW = W - P.l - P.r, iH = H - P.t - P.b;
  const n = history.length;
  const pts = history.map((h, i) => {
    const x = P.l + (n < 2 ? iW / 2 : (i / (n - 1)) * iW);
    const d = DIFF_NUM[h.difficulty] || 2;
    const y = P.t + iH - ((d - 1) / 2) * iH;
    return { x, y, d, correct: h.isCorrect, diff: h.difficulty, time: h.timeTaken };
  });
  const line = pts.map(p => `${p.x},${p.y}`).join(" ");
  const areaY = P.t + iH;
  const area = pts.length >= 2
    ? `${pts[0].x},${areaY} ${line} ${pts[pts.length - 1].x},${areaY}`
    : "";

  return (
    <svg width={W} height={H} className="an-svg">
      <defs>
        <linearGradient id="diffGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[1, 2, 3].map(v => {
        const y = P.t + iH - ((v - 1) / 2) * iH;
        return (
          <g key={v}>
            <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" />
            <text x={P.l - 4} y={y + 4} fontSize="9" fill="#bbb" textAnchor="end">{DIFF_LABEL[v]}</text>
          </g>
        );
      })}
      {area && <polygon points={area} fill="url(#diffGrad)" />}
      {n >= 2 && <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2.5"
        strokeLinejoin="round" className="an-line-draw" />}
      {pts.map((p, i) => (
        <g key={i}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          style={{ cursor: "pointer" }}>
          <circle cx={p.x} cy={p.y} r={hovered === i ? 9 : 7}
            fill={DIFF_COL[p.diff]} stroke="#fff" strokeWidth="2"
            style={{ transition: "r 0.15s" }} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9"
            fill="#fff" fontWeight="700" style={{ pointerEvents: "none" }}>
            {p.correct ? "✓" : "✗"}
          </text>
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#aaa">Q{i + 1}</text>
        </g>
      ))}
      {hovered !== null && pts[hovered] && (
        <SvgTooltip x={pts[hovered].x} y={pts[hovered].y} visible lines={[
          `Q${hovered + 1} · ${pts[hovered].diff}`,
          pts[hovered].correct ? "✓ Correct" : "✗ Wrong",
          `${(pts[hovered].time / 1000).toFixed(1)}s taken`,
        ]} />
      )}
    </svg>
  );
}

// ── Time Chart ────────────────────────────────────────────────────────────────
function TimeChart({ history }) {
  const [hovered, setHovered] = useState(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t); }, []);

  const W = 340, H = 110, P = { t: 12, b: 26, l: 38, r: 12 };
  const iW = W - P.l - P.r, iH = H - P.t - P.b;
  const maxT = Math.max(...history.map(h => h.timeTaken), 1);

  return (
    <svg width={W} height={H} className="an-svg">
      {[0, 0.5, 1].map(v => {
        const y = P.t + iH - v * iH;
        return (
          <g key={v}>
            <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" />
            <text x={P.l - 3} y={y + 3} fontSize="9" fill="#bbb" textAnchor="end">
              {Math.round(v * maxT / 1000)}s
            </text>
          </g>
        );
      })}
      {history.map((h, i) => {
        const slotW = iW / history.length;
        const barW = slotW - 8;
        const fullH = (h.timeTaken / maxT) * iH;
        const bH = mounted ? fullH : 0;
        const x = P.l + i * slotW + 4;
        const y = P.t + iH - bH;
        const col = h.isCorrect ? "#6366f1" : "#ef4444";
        const isHov = hovered === i;
        return (
          <g key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer" }}>
            <rect x={x} y={y} width={barW} height={bH} rx={4}
              fill={col} opacity={isHov ? 1 : 0.78}
              style={{ transition: "height 0.6s cubic-bezier(0.4,0,0.2,1), y 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.15s" }} />
            {/* Value label on top */}
            {mounted && <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="8"
              fill={col} fontWeight="600">{(h.timeTaken / 1000).toFixed(1)}s</text>}
            <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#aaa">Q{i + 1}</text>
          </g>
        );
      })}
      {hovered !== null && history[hovered] && (() => {
        const slotW = iW / history.length;
        const x = P.l + hovered * slotW + 4 + (slotW - 8) / 2;
        const bH = (history[hovered].timeTaken / maxT) * iH;
        const y = P.t + iH - bH;
        return (
          <SvgTooltip x={x} y={y} visible lines={[
            `Q${hovered + 1}`,
            `${(history[hovered].timeTaken / 1000).toFixed(1)}s`,
            history[hovered].isCorrect ? "✓ Correct" : "✗ Wrong",
            `${history[hovered].difficulty}`,
          ]} />
        );
      })()}
    </svg>
  );
}

// ── Stat Card with count-up ───────────────────────────────────────────────────
function StatCard({ label, value, suffix = "", color = "#6366f1", icon }) {
  const count = useCountUp(value);
  return (
    <div className="an-big-stat">
      {icon && <span className="an-stat-icon">{icon}</span>}
      <span className="an-big-val" style={{ color }}>{count}{suffix}</span>
      <span className="an-big-lbl">{label}</span>
    </div>
  );
}

// ── Analytics Dashboard ───────────────────────────────────────────────────────
function AnalyticsDashboard({ sessions, onBack }) {
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState("newest");

  if (detail) return <TestDetail session={detail} onBack={() => setDetail(null)} />;

  const totalQ = sessions.reduce((s, x) => s + (x.history || []).length, 0);
  const avgScore = sessions.length
    ? Math.round(sessions.reduce((s, x) => s + x.score / x.total, 0) / sessions.length * 100) : 0;
  const bestScore = sessions.length
    ? Math.max(...sessions.map(s => Math.round(s.score / s.total * 100))) : 0;

  const diffCounts = { easy: 0, medium: 0, hard: 0 };
  sessions.forEach(s => (s.history || []).forEach(h => { if (h.difficulty in diffCounts) diffCounts[h.difficulty]++; }));
  const dTotal = totalQ || 1;

  const sorted = [...sessions].sort((a, b) => {
    if (sort === "best") return b.score / b.total - a.score / a.total;
    if (sort === "worst") return a.score / a.total - b.score / b.total;
    if (sort === "topic") return a.topic.localeCompare(b.topic);
    return 0; // newest (already newest-first from storage)
  });

  return (
    <div className="an-page">
      <div className="an-page-header">
        <button className="an-back-btn" onClick={onBack}>← Back</button>
        <h2>Analytics Dashboard</h2>
      </div>

      {sessions.length === 0 ? (
        <div className="an-empty-state">
          <div className="an-empty-icon">📊</div>
          <p>No quizzes yet.</p>
          <p className="an-empty-sub">Complete a quiz and come back to see your analytics!</p>
        </div>
      ) : (
        <>
          {/* Stat strip */}
          <div className="an-stat-strip">
            <StatCard icon="📝" label="Quizzes" value={sessions.length} color="#6366f1" />
            <StatCard icon="❓" label="Questions" value={totalQ} color="#8b5cf6" />
            <StatCard icon="📊" label="Avg Score" value={avgScore} suffix="%" color="#f59e0b" />
            <StatCard icon="🏆" label="Best" value={bestScore} suffix="%" color="#22c55e" />
          </div>

          {/* Score trend */}
          <div className="an-card">
            <div className="an-card-title">📈 Score Trend</div>
            {sessions.length >= 2
              ? <TrendChart sessions={sessions} />
              : <p className="an-hint">Complete 2+ quizzes to see trend</p>}
          </div>

          {/* Difficulty mix */}
          <div className="an-card">
            <div className="an-card-title">🎯 Difficulty Distribution</div>
            <div className="an-diff-grid">
              {["easy", "medium", "hard"].map(d => (
                <div key={d} className="an-diff-box">
                  <div className="an-diff-circle" style={{ background: DIFF_COL[d] }}>
                    {diffCounts[d]}
                  </div>
                  <div className="an-diff-bar-wrap">
                    <div className="an-diff-bar-fill"
                      style={{ width: `${Math.round(diffCounts[d] / dTotal * 100)}%`, background: DIFF_COL[d] }} />
                  </div>
                  <span className="an-diff-name">{d}</span>
                  <span className="an-diff-pct">{Math.round(diffCounts[d] / dTotal * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Test list */}
          <div className="an-card">
            <div className="an-card-header-row">
              <div className="an-card-title" style={{ marginBottom: 0 }}>📋 All Tests</div>
              <div className="an-sort-btns">
                {[["newest", "Newest"], ["best", "Best"], ["worst", "Worst"], ["topic", "A–Z"]].map(([k, l]) => (
                  <button key={k} className={`an-sort-btn ${sort === k ? "active" : ""}`}
                    onClick={() => setSort(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="an-test-list" style={{ marginTop: 12 }}>
              {sorted.map((s, i) => {
                const pct = Math.round(s.score / s.total * 100);
                return (
                  <button key={i} className="an-test-row" onClick={() => setDetail(s)}>
                    <div className="an-test-left">
                      <span className="an-test-topic">{s.topic}</span>
                      <span className="an-test-date">{s.date}</span>
                    </div>
                    <div className="an-test-right">
                      <div className="an-test-bar-wrap">
                        <div className="an-test-bar-fill" style={{
                          width: `${pct}%`,
                          background: pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444"
                        }} />
                      </div>
                      <span className="an-test-score">{s.score}/{s.total}</span>
                    </div>
                    <span className="an-test-arrow">›</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Test Detail ───────────────────────────────────────────────────────────────
function TestDetail({ session, onBack }) {
  const h = session.history || [];
  const score = session.score;
  const total = session.total;
  const scorePct = Math.round(score / total * 100);
  const avgTime = Math.round(h.reduce((s, x) => s + x.timeTaken, 0) / h.length / 1000);
  const fastestQ = h.reduce((a, b) => a.timeTaken < b.timeTaken ? a : b, h[0]);
  const slowestQ = h.reduce((a, b) => a.timeTaken > b.timeTaken ? a : b, h[0]);
  const diffCounts = { easy: 0, medium: 0, hard: 0 };
  h.forEach(q => { if (q.difficulty in diffCounts) diffCounts[q.difficulty]++; });

  return (
    <div className="an-page">
      <div className="an-page-header">
        <button className="an-back-btn" onClick={onBack}>← All Tests</button>
        <h2>{session.topic}</h2>
        <span className="an-detail-date">{session.date}</span>
      </div>

      {/* Performance badge */}
      <div className={`performance-badge ${scoreBadgeClass(scorePct)}`}>
        {scoreBadgeLabel(scorePct)}
      </div>

      {/* Overview row */}
      <div className="an-overview-row">
        <div className="an-overview-donut">
          <DonutChart correct={score} total={total} />
          <div className={`an-pct-label ${scorePct >= 80 ? "good" : scorePct >= 50 ? "mid" : "bad"}`}>
            {scorePct}%
          </div>
        </div>
        <div className="an-overview-stats">
          <div className="an-ov-stat"><span className="an-ov-val">{avgTime}s</span><span className="an-ov-lbl">Avg Time</span></div>
          <div className="an-ov-stat"><span className="an-ov-val" style={{ color: "#22c55e" }}>{h.filter(x => x.isCorrect).length}</span><span className="an-ov-lbl">Correct</span></div>
          <div className="an-ov-stat"><span className="an-ov-val" style={{ color: "#ef4444" }}>{h.filter(x => !x.isCorrect).length}</span><span className="an-ov-lbl">Wrong</span></div>
        </div>
        <div className="an-diff-summary">
          {["easy", "medium", "hard"].map(d => (
            <div key={d} className="an-ds-pill" style={{ background: DIFF_COL[d] }}>
              {diffCounts[d]} {d}
            </div>
          ))}
        </div>
      </div>

      {/* Difficulty progression */}
      <div className="an-card">
        <div className="an-card-title">📈 Difficulty Progression</div>
        <p className="an-hint">Hover a dot for details. Colors: 🟢 Easy · 🟡 Medium · 🔴 Hard</p>
        <DifficultyChart history={h} />
        <div className="chart-legend">
          <span className="legend-item correct-legend">✓ Correct</span>
          <span className="legend-item wrong-legend">✗ Wrong</span>
        </div>
      </div>

      {/* Time per question */}
      <div className="an-card">
        <div className="an-card-title">⏱ Time Per Question</div>
        <p className="an-hint">
          Fastest: Q{h.indexOf(fastestQ) + 1} ({(fastestQ.timeTaken / 1000).toFixed(1)}s) ·
          Slowest: Q{h.indexOf(slowestQ) + 1} ({(slowestQ.timeTaken / 1000).toFixed(1)}s)
        </p>
        <TimeChart history={h} />
        <div className="chart-legend">
          <span className="legend-item" style={{ color: "#6366f1" }}>🟣 Correct</span>
          <span className="legend-item" style={{ color: "#ef4444" }}>🔴 Wrong</span>
        </div>
      </div>

      {/* Question breakdown */}
      <div className="an-card">
        <div className="an-card-title">📋 Question Breakdown</div>
        <table className="results-table">
          <thead>
            <tr><th>#</th><th>Question</th><th>Difficulty</th><th>Time</th><th>Answer</th><th>Result</th></tr>
          </thead>
          <tbody>
            {h.map((q, i) => (
              <tr key={i} className={q.isCorrect ? "row-correct" : "row-wrong"}>
                <td>{i + 1}</td>
                <td className="q-cell">{q.question}</td>
                <td><span className="diff-pill" style={{ background: DIFF_COL[q.difficulty] }}>{q.difficulty}</span></td>
                <td>{(q.timeTaken / 1000).toFixed(1)}s</td>
                <td>{q.selected}</td>
                <td>{q.isCorrect ? "✅" : `❌ (${q.correct})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI Feedback */}
      {session.feedback && (
        <div className="an-card">
          <div className="an-card-title">🎓 Study Coach Note</div>
          <p className="feedback-text">{session.feedback}</p>
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ sessions, onReview, onAnalytics }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-title">📋 Past Quizzes</div>
      {sessions.length === 0 ? (
        <p className="sidebar-empty">No quizzes yet.<br />Complete one to see it here!</p>
      ) : (
        <ul className="session-list">
          {sessions.map((s, i) => (
            <li key={i} className="session-item" onClick={() => onReview(s)}>
              <div className="session-topic">{s.topic}</div>
              <div className="session-meta">
                <span className="session-score">{s.score}/{s.total}</span>
                <span className="session-date">{s.date}</span>
              </div>
              <div className="session-bar">
                <div className="session-bar-fill" style={{ width: `${(s.score / s.total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <button className="sidebar-analytics-btn" onClick={onAnalytics}>📊 Analytics</button>
    </aside>
  );
}

function ReviewModal({ session, onClose }) {
  if (!session) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>{session.topic} — {session.score}/{session.total}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <table className="results-table">
          <thead><tr><th>#</th><th>Question</th><th>Diff</th><th>Time</th><th>Result</th></tr></thead>
          <tbody>
            {(session.history || []).map((h, i) => (
              <tr key={i} className={h.isCorrect ? "row-correct" : "row-wrong"}>
                <td>{i + 1}</td><td className="q-cell">{h.question}</td>
                <td><span className="diff-pill" style={{ background: DIFF_COL[h.difficulty] }}>{h.difficulty}</span></td>
                <td>{(h.timeTaken / 1000).toFixed(1)}s</td>
                <td>{h.isCorrect ? "✅" : `❌ (${h.correct})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
const diffColor = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };

export default function App() {
  const [screen, setScreen] = useState("start");
  const [topic, setTopic] = useState("");
  const [proficiency, setProficiency] = useState("intermediate");
  const [loading, setLoading] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState([]);
  const [askedQuestions, setAsked] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFBLoad] = useState(false);
  const [sessions, setSessions] = useState(loadSessions);
  const [reviewSession, setReview] = useState(null);
  const startTimeRef = useRef(null);

  async function startQuiz() {
    if (!topic.trim()) return;
    setLoading(true);
    const data = await fetch(`${API}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, proficiency }) }).then(r => r.json());
    setQuestion(data.question); setDifficulty(data.difficulty);
    setAsked([data.question.question]); setQIndex(1);
    setSelected(null); setRevealed(false); setHistory([]); setFeedback("");
    setLoading(false); setScreen("quiz");
    startTimeRef.current = Date.now();
  }

  function confirm(choice) { if (!revealed) { setSelected(choice); setRevealed(true); } }

  async function fetchFeedback(finalHistory) {
    setFBLoad(true);
    try {
      const data = await fetch(`${API}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, history: finalHistory }) }).then(r => r.json());
      const text = data.feedback || "";
      setFeedback(text);
      setSessions(prev => {
        const updated = [...prev];
        if (updated[0]?.topic === topic) updated[0].feedback = text;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch { setFeedback("Could not generate feedback."); }
    setFBLoad(false);
  }

  async function handleNext() {
    const timeTaken = Date.now() - startTimeRef.current;
    const isCorrect = selected === question.correct;
    const entry = { question: question.question, difficulty, timeTaken, isCorrect, selected, correct: question.correct };
    const newHistory = [...history, entry];
    setHistory(newHistory);

    if (qIndex >= TOTAL_QUESTIONS) {
      const session = {
        topic, proficiency, score: newHistory.filter(h => h.isCorrect).length, total: TOTAL_QUESTIONS,
        date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        history: newHistory, feedback: ""
      };
      saveSession(session); setSessions(loadSessions());
      setScreen("results"); fetchFeedback(newHistory);
      return;
    }
    setLoading(true);
    const data = await fetch(`${API}/next`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, answer: selected, time_taken_ms: timeTaken, is_correct: isCorrect, current_difficulty: difficulty, asked_questions: askedQuestions, proficiency })
    }).then(r => r.json());
    setQuestion(data.question); setDifficulty(data.difficulty);
    setAsked(prev => [...prev, data.question.question]);
    setQIndex(i => i + 1); setSelected(null); setRevealed(false); setLoading(false);
    startTimeRef.current = Date.now();
  }

  function restart() { setScreen("start"); setTopic(""); setHistory([]); setFeedback(""); }
  const score = history.filter(h => h.isCorrect).length;

  return (
    <div className="app-layout">
      <Sidebar sessions={sessions} onReview={setReview} onAnalytics={() => setScreen("analytics")} />
      <main className="main-content">

        {screen === "analytics" && (
          <div className="an-wrapper">
            <AnalyticsDashboard sessions={sessions} onBack={() => setScreen("start")} />
          </div>
        )}

        {screen === "start" && (
          <div className="card start-card">
            <h1>Adaptive MCQ Quiz</h1>
            <p className="subtitle">Answer faster → harder questions. Take your time → easier ones.</p>
            <input className="topic-input" placeholder="Enter a topic (e.g. Python, History…)"
              value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && startQuiz()} />

            <div className="proficiency-label">Your proficiency level</div>
            <div className="proficiency-group">
              {PROFICIENCY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`prof-btn ${proficiency === opt.value ? 'active' : ''}`}
                  onClick={() => setProficiency(opt.value)}
                  type="button"
                >
                  <span className="prof-icon">{opt.icon}</span>
                  <span className="prof-name">{opt.label}</span>
                  <span className="prof-desc">{opt.desc}</span>
                </button>
              ))}
            </div>

            <button className="btn primary" onClick={startQuiz} disabled={loading || !topic.trim()}>
              {loading ? "Loading…" : "Start Quiz →"}
            </button>
          </div>
        )}

        {screen === "results" && (
          <div className="card results-card">
            <h2>Quiz Complete!</h2>
            <div className="score-badge">{score} / {TOTAL_QUESTIONS}</div>
            <table className="results-table">
              <thead><tr><th>#</th><th>Question</th><th>Difficulty</th><th>Time</th><th>Result</th></tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className={h.isCorrect ? "row-correct" : "row-wrong"}>
                    <td>{i + 1}</td><td className="q-cell">{h.question}</td>
                    <td><span className="diff-pill" style={{ background: diffColor[h.difficulty] }}>{h.difficulty}</span></td>
                    <td>{(h.timeTaken / 1000).toFixed(1)}s</td>
                    <td>{h.isCorrect ? "✅" : `❌ (${h.correct})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="feedback-box">
              <div className="feedback-header">🎓 Study Coach Note</div>
              {feedbackLoading
                ? <div className="feedback-loading"><div className="spinner" /><span>Analysing…</span></div>
                : <p className="feedback-text">{feedback}</p>}
            </div>
            <button className="btn primary" onClick={restart}>Try Again</button>
            <button className="btn secondary" onClick={() => setScreen("analytics")}>View Analytics →</button>
          </div>
        )}

        {screen === "quiz" && (
          <div className="card quiz-card">
            <div className="quiz-header">
              <span className="q-counter">Q {qIndex} / {TOTAL_QUESTIONS}</span>
              <span className="diff-pill" style={{ background: diffColor[difficulty] }}>{difficulty}</span>
            </div>
            {loading ? (
              <div className="loading-state"><div className="spinner" /><p>Generating question…</p></div>
            ) : question && (
              <>
                <p className="question-text">{question.question}</p>
                <div className="options">
                  {Object.entries(question.options).map(([key, val]) => {
                    let cls = "option-btn";
                    if (revealed) { if (key === question.correct) cls += " correct"; else if (key === selected) cls += " wrong"; }
                    return (
                      <button key={key} className={cls} onClick={() => confirm(key)} disabled={revealed}>
                        <span className="option-key">{key}</span> {val}
                      </button>
                    );
                  })}
                </div>
                {revealed && <div className="explanation"><strong>Explanation:</strong> {question.explanation}</div>}
                {revealed && (
                  <button className="btn primary" onClick={handleNext}>
                    {qIndex >= TOTAL_QUESTIONS ? "See Results →" : "Next Question →"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </main>
      <ReviewModal session={reviewSession} onClose={() => setReview(null)} />
    </div>
  );
}
