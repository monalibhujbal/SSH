import { useState, useRef, useEffect } from "react";
import "./App.css";

const API = "http://localhost:8000";
const STORAGE_KEY = "mcq_quiz_sessions";

const PROFICIENCY_OPTIONS = [
  { value: "beginner", label: "Beginner", icon: "🙂", iconBg: "#dcfce7", desc: "Foundational concepts and basic MCQ's." },
  { value: "intermediate", label: "Intermediate", icon: "📈", iconBg: "#dbeafe", desc: "Application logic and conceptual explanations." },
  { value: "advanced", label: "Advanced", icon: "✦", iconBg: "#ede9fe", desc: "Critical thinking and decision tree analysis." },
];

const LEVEL_META = {
  1: { label: "L1 — Knowledge", color: "#f97316", tag: "MCQ" },
  2: { label: "L2 — Understanding", color: "#f59e0b", tag: "Why / Explain" },
  3: { label: "L3 — Mastery", color: "#ef4444", tag: "Decision Tree" },
};

/* ── LocalStorage ─────────────────────────────────────────────── */
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveSession(s) {
  const all = loadSessions(); all.unshift(s);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 50)));
}

/* ── Hooks ────────────────────────────────────────────────────── */
function useCountUp(target, dur = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!target) { setV(0); return; }
    let f; const t0 = performance.now();
    const tick = n => { const p = Math.min((n - t0) / dur, 1); setV(Math.round((1 - Math.pow(1 - p, 3)) * target)); if (p < 1) f = requestAnimationFrame(tick); };
    f = requestAnimationFrame(tick); return () => cancelAnimationFrame(f);
  }, [target, dur]);
  return v;
}

/* ── Helpers ──────────────────────────────────────────────────── */
const DIFF_COL = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };
function gradeColor(g) { return g === "Excellent" ? "#22c55e" : g === "Good" ? "#6366f1" : g === "Fair" ? "#f59e0b" : "#ef4444"; }
function scoreBadgeClass(p) { return p >= 80 ? "badge-excellent" : p >= 60 ? "badge-good" : p >= 40 ? "badge-fair" : "badge-poor"; }
function scoreBadgeLabel(p) { return p >= 80 ? "Excellent 🏆" : p >= 60 ? "Good 👍" : p >= 40 ? "Fair 💪" : "Needs Work 📖"; }

/* ── DonutChart ───────────────────────────────────────────────── */
function DonutChart({ correct, total, color = "#f97316" }) {
  const [anim, setAnim] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnim(true), 80); return () => clearTimeout(t); }, []);
  const r = 38, cx = 48, cy = 48, sw = 11, circ = 2 * Math.PI * r;
  const pct = total ? (anim ? correct / total : 0) : 0;
  return (
    <svg width={96} height={96}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${pct * circ} ${circ}`} strokeDashoffset={circ / 4}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1)" }} />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#111">{correct}/{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9" fill="#94a3b8">Score</text>
    </svg>
  );
}

/* ── Chart helpers ────────────────────────────────────────────── */
function SvgTooltip({ x, y, lines, visible }) {
  if (!visible) return null;
  const W = 100, H = lines.length * 14 + 10, tx = x - W / 2, ty = y - H - 10;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={tx} y={ty} width={W} height={H} rx={5} fill="#1e1b4b" opacity={0.92} />
      {lines.map((l, i) => <text key={i} x={tx + 6} y={ty + 12 + i * 14} fontSize="10" fill="#fff" fontWeight={i === 0 ? "700" : "400"}>{l}</text>)}
    </g>
  );
}
function TrendChart({ sessions }) {
  const [hov, setHov] = useState(null);
  const data = [...sessions].reverse();
  const W = 340, H = 90, P = { t: 12, b: 22, l: 30, r: 12 };
  const iW = W - P.l - P.r, iH = H - P.t - P.b;
  const pts = data.map((s, i) => ({
    x: P.l + (data.length < 2 ? iW / 2 : (i / (data.length - 1)) * iW),
    y: P.t + iH - (s.score / s.total) * iH,
    pct: Math.round(s.score / s.total * 100), topic: s.topic
  }));
  const line = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = pts.length >= 2 ? `${pts[0].x},${P.t + iH} ${line} ${pts[pts.length - 1].x},${P.t + iH}` : "";
  let tT = "", tC = "";
  if (data.length >= 2) { const d = pts[pts.length - 1].pct - pts[0].pct; tT = d > 0 ? `▲ +${d}%` : d < 0 ? `▼ ${d}%` : "→ Consistent"; tC = d > 0 ? "trend-up" : d < 0 ? "trend-down" : "trend-flat"; }
  return (
    <div>
      {tT && <div className={`trend-insight ${tC}`}>{tT}</div>}
      <svg width={W} height={H} className="an-svg">
        <defs><linearGradient id="tG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity="0.18" /><stop offset="100%" stopColor="#f97316" stopOpacity="0" /></linearGradient></defs>
        {[0, 50, 100].map(v => { const y = P.t + iH - (v / 100) * iH; return <g key={v}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" /><text x={P.l - 3} y={y + 3} fontSize="8" fill="#bbb" textAnchor="end">{v}%</text></g>; })}
        {area && <polygon points={area} fill="url(#tG)" />}
        {pts.length >= 2 && <polyline points={line} fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinejoin="round" className="an-line-draw" />}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ cursor: "pointer" }}>
            <circle cx={p.x} cy={p.y} r={hov === i ? 7 : 4.5} fill={hov === i ? "#ea580c" : "#f97316"} stroke="#fff" strokeWidth="2" style={{ transition: "r 0.15s" }} />
          </g>
        ))}
        {hov !== null && pts[hov] && <SvgTooltip x={pts[hov].x} y={pts[hov].y} visible lines={[pts[hov].topic, `Score: ${pts[hov].pct}%`]} />}
      </svg>
    </div>
  );
}
function StatCard({ label, value, suffix = "", color = "#f97316", icon }) {
  const c = useCountUp(value);
  return (
    <div className="an-big-stat">
      {icon && <span className="an-stat-icon">{icon}</span>}
      <span className="an-big-val" style={{ color }}>{c}{suffix}</span>
      <span className="an-big-lbl">{label}</span>
    </div>
  );
}

/* ── Evaluation Panel (L2) ────────────────────────────────────── */
function EvalPanel({ evaluation, onNext, isLast, loading }) {
  const [showModel, setShowModel] = useState(false);
  const { score, max_score, grade, feedback, key_points_hit, missing_points, model_answer } = evaluation;
  return (
    <div className="eval-panel">
      <div className="eval-score-row">
        <div className="eval-donut"><DonutChart correct={score} total={max_score} /></div>
        <div>
          <div className="eval-grade-badge" style={{ background: gradeColor(grade) + "22", color: gradeColor(grade), border: `1.5px solid ${gradeColor(grade)}` }}>{grade} — {score}/{max_score}</div>
          <p className="eval-feedback">{feedback}</p>
        </div>
      </div>
      {key_points_hit?.length > 0 && <div className="eval-section"><div className="eval-section-title">✅ What you got right</div><ul className="eval-list correct-list">{key_points_hit.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      {missing_points?.length > 0 && <div className="eval-section"><div className="eval-section-title">❌ What you missed</div><ul className="eval-list missing-list">{missing_points.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      <button className="model-ans-toggle" onClick={() => setShowModel(v => !v)}>💡 {showModel ? "Hide" : "Show"} Model Answer</button>
      {showModel && <div className="model-ans-box">{model_answer}</div>}
      <button className="btn primary" style={{ marginTop: 16 }} onClick={onNext} disabled={loading}>{loading ? "Loading…" : isLast ? "See Results →" : "Next Question →"}</button>
    </div>
  );
}

/* ── Scenario Eval Panel (L3) ─────────────────────────────────── */
function ScenarioEvalPanel({ evaluation, onNext, isLast, loading }) {
  const [showModel, setShowModel] = useState(false);
  const { decision_scores = [], consistency_score, consistency_note, total_score, total_max_score, overall_grade, expert_assessment, model_approach } = evaluation;
  return (
    <div className="eval-panel scenario-eval">
      <div className="eval-score-row">
        <div className="eval-donut"><DonutChart correct={total_score} total={total_max_score} color="#ef4444" /></div>
        <div>
          <div className="eval-grade-badge" style={{ background: gradeColor(overall_grade) + "22", color: gradeColor(overall_grade), border: `1.5px solid ${gradeColor(overall_grade)}` }}>{overall_grade} — {total_score}/{total_max_score}</div>
          <div className="consistency-badge">🔗 Consistency: <strong>{consistency_score}/10</strong></div>
          <p className="eval-feedback" style={{ marginTop: 4 }}>{consistency_note}</p>
        </div>
      </div>
      <div className="eval-section">
        <div className="eval-section-title">📊 Decision Breakdown</div>
        <div className="decision-breakdown">
          {decision_scores.map((ds, i) => (
            <div key={i} className="dp-score-row">
              <span className="dp-step-label">D{ds.step}</span>
              <div className="dp-mini-bar"><div className="dp-mini-fill" style={{ width: `${(ds.score / ds.max_score) * 100}%`, background: gradeColor(ds.grade) }} /></div>
              <span className="dp-score-num">{ds.score}/{ds.max_score}</span>
              <span className="dp-grade-chip" style={{ color: gradeColor(ds.grade) }}>{ds.grade}</span>
            </div>
          ))}
          <div className="dp-score-row consistency-row">
            <span className="dp-step-label">🔗</span>
            <div className="dp-mini-bar"><div className="dp-mini-fill" style={{ width: `${consistency_score * 10}%`, background: "#6366f1" }} /></div>
            <span className="dp-score-num">{consistency_score}/10</span>
            <span className="dp-grade-chip" style={{ color: "#6366f1" }}>Consistency</span>
          </div>
        </div>
      </div>
      <div className="eval-section">
        <div className="eval-section-title">💬 Decision Feedback</div>
        {decision_scores.map((ds, i) => (
          <div key={i} className="dp-feedback-row">
            <span className="dp-feedback-tag" style={{ background: gradeColor(ds.grade) + "22", color: gradeColor(ds.grade) }}>D{ds.step}</span>
            <p className="dp-feedback-text">{ds.feedback}</p>
          </div>
        ))}
      </div>
      <div className="expert-assessment-box"><span className="expert-icon">🏆</span><p>{expert_assessment}</p></div>
      <button className="model-ans-toggle" onClick={() => setShowModel(v => !v)}>💡 {showModel ? "Hide" : "Show"} Expert Strategy</button>
      {showModel && <div className="model-ans-box">{model_approach}</div>}
      <button className="btn primary" style={{ marginTop: 16 }} onClick={onNext} disabled={loading}>{loading ? "Loading…" : isLast ? "See Results →" : "Next Question →"}</button>
    </div>
  );
}

/* ── Level Progress Bar ───────────────────────────────────────── */
function LevelProgressBar({ currentLevel, recentScores }) {
  const avg = recentScores.length ? Math.round(recentScores.slice(-2).reduce((a, b) => a + b, 0) / Math.min(recentScores.length, 2)) : null;
  return (
    <div className="level-progress-bar">
      {[1, 2, 3].map(l => (
        <div key={l} className={`level-pip ${currentLevel === l ? "active" : currentLevel > l ? "done" : ""}`}
          style={currentLevel >= l ? { background: LEVEL_META[l].color, color: "#fff" } : {}}>
          <span className="pip-num">L{l}</span>
          <span className="pip-label">{LEVEL_META[l].tag}</span>
        </div>
      ))}
      {avg !== null && <span className="level-score-avg">Avg: {avg}%</span>}
    </div>
  );
}

/* ── Analytics ────────────────────────────────────────────────── */
function AnalyticsDashboard({ sessions, onBack }) {
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState("newest");
  if (detail) return <TestDetail session={detail} onBack={() => setDetail(null)} />;
  const totalQ = sessions.reduce((s, x) => s + (x.history || []).length, 0);
  const avgScore = sessions.length ? Math.round(sessions.reduce((s, x) => s + x.score / x.total, 0) / sessions.length * 100) : 0;
  const bestScore = sessions.length ? Math.max(...sessions.map(s => Math.round(s.score / s.total * 100))) : 0;
  const sorted = [...sessions].sort((a, b) => sort === "best" ? b.score / b.total - a.score / a.total : sort === "worst" ? a.score / a.total - b.score / b.total : sort === "topic" ? a.topic.localeCompare(b.topic) : 0);
  return (
    <div className="an-page">
      <div className="an-page-header"><button className="an-back-btn" onClick={onBack}>← Back</button><h2>Analytics Dashboard</h2></div>
      {sessions.length === 0
        ? <div className="an-empty-state"><div className="an-empty-icon">📊</div><p>No quizzes yet.</p><p className="an-empty-sub">Complete a quiz and come back!</p></div>
        : <>
          <div className="an-stat-strip">
            <StatCard icon="📝" label="Quizzes" value={sessions.length} color="#f97316" />
            <StatCard icon="❓" label="Questions" value={totalQ} color="#8b5cf6" />
            <StatCard icon="📊" label="Avg Score" value={avgScore} color="#f59e0b" suffix="%" />
            <StatCard icon="🏆" label="Best" value={bestScore} color="#22c55e" suffix="%" />
          </div>
          <div className="an-card"><div className="an-card-title">📈 Score Trend</div>{sessions.length >= 2 ? <TrendChart sessions={sessions} /> : <p className="an-hint">Complete 2+ quizzes to see trend</p>}</div>
          <div className="an-card">
            <div className="an-card-header-row">
              <div className="an-card-title" style={{ marginBottom: 0 }}>📋 All Tests</div>
              <div className="an-sort-btns">{[["newest", "Newest"], ["best", "Best"], ["worst", "Worst"], ["topic", "A–Z"]].map(([k, l]) => <button key={k} className={`an-sort-btn ${sort === k ? "active" : ""}`} onClick={() => setSort(k)}>{l}</button>)}</div>
            </div>
            <div className="an-test-list" style={{ marginTop: 12 }}>
              {sorted.map((s, i) => {
                const pct = Math.round(s.score / s.total * 100); return (
                  <button key={i} className="an-test-row" onClick={() => setDetail(s)}>
                    <div className="an-test-left"><span className="an-test-topic">{s.topic}</span><span className="an-test-date">{s.date}</span></div>
                    <div className="an-test-right"><div className="an-test-bar-wrap"><div className="an-test-bar-fill" style={{ width: `${pct}%`, background: pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444" }} /></div><span className="an-test-score">{s.score}/{s.total}</span></div>
                    <span className="an-test-arrow">›</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      }
    </div>
  );
}

function TestDetail({ session, onBack }) {
  const h = session.history || [];
  const pct = Math.round(session.score / session.total * 100);
  return (
    <div className="an-page">
      <div className="an-page-header"><button className="an-back-btn" onClick={onBack}>← All Tests</button><h2>{session.topic}</h2><span className="an-detail-date">{session.date}</span></div>
      <div className={`performance-badge ${scoreBadgeClass(pct)}`}>{scoreBadgeLabel(pct)}</div>
      <div className="an-overview-row">
        <div className="an-overview-donut"><DonutChart correct={session.score} total={session.total} /><div className={`an-pct-label ${pct >= 80 ? "good" : pct >= 50 ? "mid" : "bad"}`}>{pct}%</div></div>
        <div className="an-overview-stats">
          <div className="an-ov-stat"><span className="an-ov-val" style={{ color: "#22c55e" }}>{h.filter(x => x.isCorrect || (x.score >= (x.max_score || 10) * .6)).length}</span><span className="an-ov-lbl">Good</span></div>
          <div className="an-ov-stat"><span className="an-ov-val" style={{ color: "#ef4444" }}>{h.filter(x => !(x.isCorrect || (x.score >= (x.max_score || 10) * .6))).length}</span><span className="an-ov-lbl">Needs work</span></div>
        </div>
      </div>
      <div className="an-card">
        <div className="an-card-title">📋 Question Breakdown</div>
        <table className="results-table">
          <thead><tr><th>#</th><th>Question</th><th>Level</th><th>Result</th></tr></thead>
          <tbody>{h.map((q, i) => (<tr key={i} className={(q.isCorrect || (q.score >= (q.max_score || 10) * .6)) ? "row-correct" : "row-wrong"}><td>{i + 1}</td><td className="q-cell">{(q.question || "").substring(0, 80)}{q.question?.length > 80 ? "…" : ""}</td><td><span className="level-chip" style={{ background: LEVEL_META[q.level || 1]?.color || "#f97316" }}>L{q.level || 1}</span></td><td>{q.isCorrect ? "✅" : q.score !== undefined ? `${q.score}/${q.max_score}` : "❌"}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ── New Sidebar ──────────────────────────────────────────────── */
function Sidebar({ screen, setScreen, sessions, onReview }) {
  const nav = [
    { id: "start", label: "Dashboard", icon: "⊞" },
    { id: "quizzes", label: "Past Quizzes", icon: "🕐" },
    { id: "analytics", label: "Analytics", icon: "📊" },
    { id: "interview", label: "AI Interview", icon: "🎙️" },
  ];
  const [showSessions, setShowSessions] = useState(false);
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon-box"><span>⚡</span></div>
        <div><div className="logo-title">Adaptive Quiz</div><div className="logo-sub">Learning Portal</div></div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {nav.map(item => (
          <button key={item.id}
            className={`nav-item ${screen === item.id || (item.id === "start" && (screen === "start" || screen === "adaptive-quiz" || screen === "results")) ? "active" : ""}`}
            onClick={() => {
              if (item.id === "quizzes") setShowSessions(v => !v);
              else setScreen(item.id);
            }}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === "quizzes" && sessions.length > 0 && <span className="nav-badge">{sessions.length}</span>}
          </button>
        ))}
      </nav>

      {/* Past sessions drawer */}
      {showSessions && sessions.length > 0 && (
        <div className="sessions-drawer">
          {sessions.map((s, i) => (
            <button key={i} className="session-drawer-item" onClick={() => onReview(s)}>
              <span className="sdi-topic">{s.topic}</span>
              <span className="sdi-score">{Math.round(s.score / s.total * 100)}%</span>
            </button>
          ))}
        </div>
      )}

      {/* User */}
      <div className="sidebar-user">
        <div className="user-avatar">U</div>
        <div className="user-info"><div className="user-name">Learner</div><div className="user-role">Pro Learner</div></div>
        <button className="user-settings">⚙</button>
      </div>
    </aside>
  );
}

/* ── Top Nav ──────────────────────────────────────────────────── */
function TopNav({ topic, setTopic, screen }) {
  return (
    <div className="top-nav">
      <div className="top-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input
          className="top-search-input"
          placeholder="Search for quiz topics (e.g. React, Data Science)..."
          value={topic}
          onChange={e => setTopic(e.target.value)}
          disabled={screen !== "start"}
        />
      </div>
      <div className="top-actions">
        <button className="top-bell">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        </button>
        <div className="top-streak">
          <span className="streak-label">Daily Streak:</span>
          <span className="streak-pill">🔥 12</span>
        </div>
      </div>
    </div>
  );
}

/* ── Adaptive Panel (dark right column) ───────────────────────── */
function AdaptivePanel() {
  return (
    <div className="adaptive-panel-wrap">
      <div className="adaptive-panel">
        <div className="ap-header">
          <span className="ap-icon">❓</span>
          <h3>Adaptive Logic</h3>
        </div>
        <div className="ap-levels">
          {[
            { badge: "L1", color: "#f97316", title: "MULTI-CHOICE", desc: "Foundation assessment via rapid response MCQ's." },
            { badge: "L2", color: "#f59e0b", title: "CONCEPT VERIFICATION", desc: "Short answer prompts to explain 'why' a concept works." },
            { badge: "L3", color: "#ef4444", title: "DECISION TREES", desc: "Complex scenarios requiring branching logic and strategy." },
          ].map((l, i, arr) => (
            <div key={l.badge} className="ap-level-item">
              <div className="ap-level-badge" style={{ background: l.color }}>{l.badge}</div>
              <div className="ap-level-connector" style={{ visibility: i < arr.length - 1 ? "visible" : "hidden" }} />
              <div className="ap-level-info">
                <div className="ap-level-title">{l.title}</div>
                <div className="ap-level-desc">{l.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="ap-quote">"The difficulty increases dynamically as you maintain a &gt;85% accuracy rate across levels."</div>
      </div>

      {/* Progress card */}
      <div className="progress-card">
        <div className="progress-card-title">Your Progress</div>
        <div className="progress-mastery-row">
          <span className="progress-mastery-label">MASTERY</span>
          <span className="progress-mastery-pct">68%</span>
        </div>
        <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{ width: "68%" }} /></div>
        <div className="progress-stats">
          <div className="progress-stat"><div className="ps-label">RANK</div><div className="ps-value">Gold III</div></div>
          <div className="progress-stat"><div className="ps-label">TOKENS</div><div className="ps-value">2,450</div></div>
        </div>
      </div>
    </div>
  );
}

/* ── Review Modal ─────────────────────────────────────────────── */
function ReviewModal({ session, onClose }) {
  if (!session) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span>{session.topic} — {session.score}/{session.total}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <div style={{ overflowY: "auto", padding: "16px 22px" }}>
          <table className="results-table">
            <thead><tr><th>#</th><th>Question</th><th>Result</th></tr></thead>
            <tbody>{(session.history || []).map((h, i) => (<tr key={i} className={(h.isCorrect || (h.score >= (h.max_score || 10) * .6)) ? "row-correct" : "row-wrong"}><td>{i + 1}</td><td className="q-cell">{(h.question || "").substring(0, 60)}…</td><td>{h.isCorrect ? "✅" : "❌"}</td></tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* \u2500\u2500 InterviewScreen \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
function InterviewScreen({ globalTopic, globalProficiency, onExit }) {
  const [phase, setPhase] = useState("setup");
  const [ivTopic, setIvTopic] = useState(globalTopic || "");
  const [ivProf, setIvProf] = useState(globalProficiency || "intermediate");
  const [ivNumQ, setIvNumQ] = useState(5);
  const [qNum, setQNum] = useState(0);
  const [currentQ, setCurrentQ] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [askedQs, setAskedQs] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const chatRef = useRef(null);

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  function speakText(text) {
    if (isMuted || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // stop previous
    const u = new SpeechSynthesisUtterance(text);
    // try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith("en-") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))) || voices.find(v => v.lang.startsWith("en-"));
    if (voice) u.voice = voice;
    u.rate = 1.05;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  }

  // Ensure voices are loaded (Chrome bug workaround)
  useEffect(() => { window.speechSynthesis.getVoices(); }, []);

  function addMsg(msg) {
    setMessages(prev => [...prev, msg]);
    if (msg.type === "ai" && msg.text) speakText(msg.text);
  }
  const gradeCol = g => g === "Excellent" ? "#22c55e" : g === "Good" ? "#6366f1" : g === "Partial" ? "#f59e0b" : "#ef4444";
  const ivSliderPct = ((ivNumQ - 3) / (10 - 3)) * 100;

  async function startInterview() {
    if (!ivTopic.trim()) return;
    setStatus("loading-q");
    try {
      const d = await fetch(`${API}/interview/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: ivTopic, proficiency: ivProf, total_questions: ivNumQ }),
      }).then(r => r.json());
      if (d.error) throw new Error(d.error);
      setCurrentQ(d.question); setQNum(1); setAskedQs([d.question.question]);
      addMsg({ type: "ai", text: d.question.question, qData: d.question });
      setPhase("interview");
    } catch (e) { addMsg({ type: "error", text: `Failed to start: ${e.message}` }); }
    setStatus("idle");
  }

  async function startRecording() {
    if (status !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mt = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType: mt });
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mt });
        setStatus("transcribing");
        const fd = new FormData(); fd.append("audio", blob, "recording.webm");
        try {
          const r = await fetch(`${API}/interview/transcribe`, { method: "POST", body: fd }).then(r => r.json());
          if (r.error) throw new Error(r.error);
          setTranscript(r.transcript || "");
        } catch (e) { addMsg({ type: "error", text: `Transcription error: ${e.message}` }); }
        setStatus("idle");
      };
      mr.start(); mediaRef.current = mr; setIsRecording(true); setStatus("recording");
    } catch (e) { addMsg({ type: "error", text: `Mic error: ${e.message}. Type your answer instead.` }); }
  }

  function stopRecording() { if (mediaRef.current && isRecording) { mediaRef.current.stop(); setIsRecording(false); } }

  async function submitAnswer() {
    const ans = transcript.trim();
    if (!ans || !currentQ) return;
    addMsg({ type: "user", text: ans }); setTranscript(""); setStatus("evaluating");
    try {
      const ev = await fetch(`${API}/interview/evaluate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQ.question, user_answer: ans,
          expected_concepts: currentQ.expected_concepts || [], proficiency: ivProf
        }),
      }).then(r => r.json());
      const entry = { question: currentQ.question, user_answer: ans, score: ev.score, grade: ev.grade, concepts_missing: ev.concepts_missing || [] };
      const newHistory = [...history, entry]; setHistory(newHistory);
      addMsg({ type: "eval", data: ev });
      if (qNum >= ivNumQ) {
        setStatus("analyzing"); setAnalysisPending(true);
        try {
          const a = await fetch(`${API}/interview/analyze`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: ivTopic, proficiency: ivProf, history: newHistory }),
          }).then(r => r.json());
          setAnalysis(a);
        } catch { setAnalysis({ summary: "Analysis unavailable.", strengths: [], improvement_areas: [], study_plan: [] }); }
        setAnalysisPending(false); setPhase("results");
      } else {
        setStatus("loading-q"); const nq = qNum + 1;
        const nr = await fetch(`${API}/interview/next`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: ivTopic, proficiency: ivProf, question_num: nq,
            total_questions: ivNumQ, asked_questions: askedQs
          }),
        }).then(r => r.json());
        if (nr.error) throw new Error(nr.error);
        setCurrentQ(nr.question); setQNum(nq); setAskedQs(prev => [...prev, nr.question.question]);
        addMsg({ type: "ai", text: nr.question.question, qData: nr.question });
      }
    } catch (e) { addMsg({ type: "error", text: `Error: ${e.message}` }); }
    setStatus("idle");
  }

  if (phase === "setup") return (
    <div className="iv-setup">
      <h2 className="iv-setup-title">🎙️ AI Interview Mode</h2>
      <p className="iv-setup-sub">One-on-one with an AI interviewer. Speak your answers — Whisper AI transcribes in real-time, then semantically evaluates your response.</p>
      <div className="iv-setup-card">
        <div className="iv-field"><label>Topic</label>
          <input className="iv-input" placeholder="e.g. Python, React, System Design…" value={ivTopic} onChange={e => setIvTopic(e.target.value)} />
        </div>
        <div className="iv-field"><label>Proficiency Level</label>
          <div className="iv-prof-btns">{["beginner", "intermediate", "advanced"].map(p => (
            <button key={p} className={`iv-prof-btn ${ivProf === p ? "active" : ""}`} onClick={() => setIvProf(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}</div>
        </div>
        <div className="iv-field">
          <div className="qs-header"><span className="qs-label">Number of Questions</span><span className="qs-badge">{ivNumQ}</span></div>
          <div className="qs-slider-wrap"><input type="range" className="qs-slider" min={3} max={10} step={1} value={ivNumQ} style={{ "--pct": `${ivSliderPct}%` }} onChange={e => setIvNumQ(+e.target.value)} /></div>
          <div className="qs-ticks"><span>3</span><span>5</span><span>7</span><span>10</span></div>
        </div>
        <button className="start-btn" onClick={startInterview} disabled={!ivTopic.trim() || status === "loading-q"}>
          {status === "loading-q" ? "Loading…" : <><span>Start Interview</span><span className="start-btn-icon">🚀</span></>}
        </button>
        <button className="btn secondary" onClick={onExit} style={{ marginTop: 8 }}>← Back to Dashboard</button>
      </div>
    </div>
  );

  if (phase === "results") return (
    <div className="iv-results">
      <div className="iv-results-header"><h2>Interview Complete 🎉</h2><button className="btn secondary" onClick={onExit}>← Dashboard</button></div>
      {analysisPending ? (
        <div className="loading-state"><div className="spinner" /><p>Generating your analysis…</p></div>
      ) : analysis && (<>
        <div className="iv-analysis-hero">
          <div className="iv-score-ring">
            <svg width={110} height={110}>
              <circle cx={55} cy={55} r={40} fill="none" stroke="#f1f5f9" strokeWidth={11} />
              <circle cx={55} cy={55} r={40} fill="none" stroke="#f97316" strokeWidth={11}
                strokeDasharray={`${((analysis.overall_score || 0) / 100) * 2 * Math.PI * 40} ${2 * Math.PI * 40}`}
                strokeDashoffset={2 * Math.PI * 40 / 4} strokeLinecap="round" style={{ transition: "stroke-dasharray 1.2s ease" }} />
              <text x={55} y={50} textAnchor="middle" fontSize="17" fontWeight="900" fill="#111">{analysis.overall_score ?? 0}</text>
              <text x={55} y={65} textAnchor="middle" fontSize="9" fill="#94a3b8">/ 100</text>
            </svg>
          </div>
          <div><div className="iv-perf-badge">{analysis.performance_level}</div><p className="iv-summary">{analysis.summary}</p></div>
        </div>
        <div className="iv-analysis-grid">
          <div className="iv-analysis-card"><div className="iv-ac-title">✅ Strengths</div><ul>{(analysis.strengths || []).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div className="iv-analysis-card"><div className="iv-ac-title">📈 Improve</div><ul>{(analysis.improvement_areas || []).map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        </div>
        {analysis.topic_coverage && (
          <div className="iv-analysis-card">
            <div className="iv-ac-title">📚 Topic Coverage</div>
            <div className="iv-coverage-row"><span className="iv-cov-label ok">Strong</span>{(analysis.topic_coverage.strong || []).map((t, i) => <span key={i} className="iv-cov-tag green">{t}</span>)}</div>
            <div className="iv-coverage-row" style={{ marginTop: 6 }}><span className="iv-cov-label bad">Weak</span>{(analysis.topic_coverage.weak || []).map((t, i) => <span key={i} className="iv-cov-tag red">{t}</span>)}</div>
          </div>
        )}
        <div className="iv-analysis-card"><div className="iv-ac-title">🎯 Recommendation</div><p className="iv-recom-text">{analysis.recommendation}</p></div>
        <div className="iv-analysis-card"><div className="iv-ac-title">📋 Study Plan</div><ol className="iv-study-plan">{(analysis.study_plan || []).map((s, i) => <li key={i}>{s}</li>)}</ol></div>
        <button className="start-btn" onClick={onExit} style={{ marginTop: 16 }}>← Back to Dashboard</button>
      </>)}
    </div>
  );

  return (
    <div className="iv-screen">
      <div className="iv-header">
        <div className="iv-header-left">
          <button className="iv-back-btn" onClick={() => { setPhase("setup"); setMessages([]); setHistory([]); setTranscript(""); }}>←</button>
          <div><div className="iv-header-topic">{ivTopic}</div><div className="iv-header-sub">{ivProf} · Q {qNum} of {ivNumQ}</div></div>
        </div>
        <div className="iv-header-right">
          <button className="iv-mute-btn" onClick={() => {
            setIsMuted(!isMuted);
            if (!isMuted) window.speechSynthesis.cancel();
          }}>
            {isMuted ? "🔇 Muted" : "🔊 Unmute"}
          </button>
          <div className="iv-progress-dots">
            {Array.from({ length: ivNumQ }, (_, i) => (<div key={i} className={`iv-dot${i < qNum - 1 ? " done" : i === qNum - 1 ? " active" : ""}`} />))}
          </div>
        </div>
      </div>

      <div className="iv-chat" ref={chatRef}>
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.type === "ai" && <div className="iv-ai-bubble"><div className="iv-ai-avatar">🤖</div><div className="iv-bubble-inner"><div className="iv-bubble-name">AI Interviewer</div><div className="iv-bubble-text">{msg.text}</div></div></div>}
            {msg.type === "user" && <div className="iv-user-bubble"><div className="iv-bubble-inner right"><div className="iv-bubble-name right">You</div><div className="iv-bubble-text right">{msg.text}</div></div></div>}
            {msg.type === "eval" && (
              <div className="iv-eval-bubble">
                <div className="iv-eval-top">
                  <span className="iv-eval-grade-pill" style={{ color: gradeCol(msg.data.grade), background: gradeCol(msg.data.grade) + "18", border: `1px solid ${gradeCol(msg.data.grade)}44` }}>{msg.data.grade}</span>
                  <span className="iv-eval-score">{msg.data.score}/10</span>
                </div>
                <p className="iv-eval-text">{msg.data.feedback}</p>
                {msg.data.concepts_covered?.length > 0 && <div className="iv-tag-row"><span className="iv-tag-lbl ok">✓ Got it</span>{msg.data.concepts_covered.map((c, j) => <span key={j} className="iv-tag green">{c}</span>)}</div>}
                {msg.data.concepts_missing?.length > 0 && <div className="iv-tag-row"><span className="iv-tag-lbl bad">✗ Missed</span>{msg.data.concepts_missing.map((c, j) => <span key={j} className="iv-tag red">{c}</span>)}</div>}
                <details className="iv-model-toggle"><summary>💡 Model Answer</summary><p className="iv-model-text">{msg.data.complete_answer}</p></details>
                {msg.data.encouragement && <p className="iv-encourage">{msg.data.encouragement}</p>}
              </div>
            )}
            {msg.type === "error" && <div className="iv-error-msg">{msg.text}</div>}
          </div>
        ))}
        {["evaluating", "loading-q", "analyzing"].includes(status) && (
          <div className="iv-ai-bubble"><div className="iv-ai-avatar">🤖</div><div className="iv-bubble-inner">
            <div className="iv-typing"><span /><span /><span /></div>
            <div className="iv-status-label">{status === "evaluating" ? "Evaluating your answer…" : status === "loading-q" ? "Preparing next question…" : "Generating your analysis…"}</div>
          </div></div>
        )}
      </div>

      <div className="iv-input-area">
        <textarea className="iv-textarea" rows={3} value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder={isRecording ? "🔴 Recording… speak now." : status === "transcribing" ? "Transcribing with Whisper…" : "Transcription appears here, or type your answer…"}
          disabled={isRecording || ["transcribing", "evaluating", "loading-q"].includes(status)} />
        <div className="iv-controls">
          <div className="iv-mic-wrap">
            <button className={`iv-mic-btn${isRecording ? " active" : ""}`}
              onMouseDown={startRecording} onMouseUp={stopRecording}
              onTouchStart={e => { e.preventDefault(); startRecording(); }} onTouchEnd={e => { e.preventDefault(); stopRecording(); }}
              disabled={["transcribing", "evaluating", "loading-q"].includes(status)}>
              {isRecording ? "⏹" : status === "transcribing" ? "⟳" : "🎤"}
            </button>
            <span className="iv-mic-hint">{isRecording ? "Release to stop" : "Hold to record"}</span>
          </div>
          <button className="iv-submit-btn" onClick={submitAnswer} disabled={!transcript.trim() || status !== "idle"}>
            {status === "evaluating" ? "Evaluating…" : "Submit ↩"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("start");
  const [topic, setTopic] = useState("");
  const [proficiency, setProficiency] = useState("intermediate");
  const [numQuestions, setNumQuestions] = useState(15);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState(loadSessions);
  const [reviewSession, setReview] = useState(null);

  useEffect(() => { setSessions(loadSessions()); }, [screen]);

  // Adaptive core
  const [qIndex, setQIndex] = useState(0);
  const [currentQ, setCurrentQ] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentDiff, setCurrentDiff] = useState("medium");
  const [recentScores, setRecentScores] = useState([]);
  const [askedQuestions, setAsked] = useState([]);
  const [history, setHistory] = useState([]);
  const startTimeRef = useRef(null);

  // L1
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);

  // L2
  const [openAnswer, setOpenAnswer] = useState("");
  const [evaluation, setEval] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);

  // L3
  const [currentStep, setCurrentStep] = useState(1);
  const [stepAnswers, setStepAnswers] = useState({});
  const [stepHint, setStepHint] = useState(false);
  const [scenarioEval, setScenarioEval] = useState(null);

  // Results
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFBLoad] = useState(false);
  const [quizError, setQuizError] = useState(null);

  function resetSubState() {
    setSelected(null); setRevealed(false);
    setOpenAnswer(""); setEval(null); setShowHint(false);
    setCurrentStep(1); setStepAnswers({}); setStepHint(false); setScenarioEval(null);
  }

  async function startQuiz() {
    if (!topic.trim()) return;
    setLoading(true); setQuizError(null);
    setHistory([]); setRecentScores([]); setAsked([]); setQIndex(1);
    setCurrentLevel(1); setCurrentDiff("medium");
    resetSubState(); setFeedback("");
    try {
      const data = await fetch(`${API}/adaptive/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, proficiency }),
      }).then(r => r.json());
      setCurrentQ(data.question);
      setAsked([data.question.scenario || data.question.question]);
      setScreen("adaptive-quiz");
      startTimeRef.current = Date.now();
    } catch { setQuizError("Failed to start quiz. Please check the server is running."); }
    finally { setLoading(false); }
  }

  async function fetchNextQuestion(newHistory, newScores, lastScorePct, timeTaken) {
    setLoading(true); setQuizError(null);
    const asked = newHistory.map(h => h.question).filter(Boolean);
    try {
      const resp = await fetch(`${API}/adaptive/next`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, proficiency, current_level: currentLevel, current_difficulty: currentDiff, last_score_pct: lastScorePct, time_taken_ms: timeTaken, recent_score_pcts: newScores, asked_questions: asked }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.detail || data.error || `Server error ${resp.status}`);
      if (!data.question) throw new Error("Server returned an empty question. Please try again.");
      setCurrentQ(data.question); setCurrentLevel(data.new_level); setCurrentDiff(data.new_difficulty);
      setAsked([...asked, data.question.scenario || data.question.question]);
      setQIndex(i => i + 1); resetSubState(); startTimeRef.current = Date.now();
    } catch (err) { setQuizError(err.message || "Failed to generate next question."); }
    finally { setLoading(false); }
  }

  async function finishQuiz(finalHistory) {
    const score = finalHistory.filter(h => h.isCorrect || (h.score >= (h.max_score || 10) * 0.6)).length;
    const session = {
      topic, proficiency, level: "adaptive", score, total: numQuestions,
      date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      history: finalHistory, feedback: "",
    };
    saveSession(session); setSessions(loadSessions()); setScreen("results");
    setFBLoad(true);
    try {
      const res = await fetch(`${API}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, history: finalHistory }) }).then(r => r.json());
      setFeedback(res.feedback || "");
    } catch { setFeedback("Could not generate feedback."); }
    setFBLoad(false);
  }

  async function handleMCQNext() {
    const timeTaken = Date.now() - startTimeRef.current;
    const isCorrect = selected === currentQ.correct; const scorePct = isCorrect ? 100 : 0;
    const entry = { question: currentQ.question, level: 1, difficulty: currentDiff, isCorrect, timeTaken, selected, correct: currentQ.correct };
    const newHistory = [...history, entry]; setHistory(newHistory);
    const newScores = [...recentScores, scorePct]; setRecentScores(newScores);
    if (qIndex >= numQuestions) { finishQuiz(newHistory); return; }
    await fetchNextQuestion(newHistory, newScores, scorePct, timeTaken);
  }

  async function submitOpenAnswer() {
    if (!openAnswer.trim()) return; setEvalLoading(true);
    const result = await fetch(`${API}/l2/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: currentQ.question, context: currentQ.context || "", user_answer: openAnswer, sample_answer: currentQ.sample_answer, proficiency }) }).then(r => r.json());
    setEval(result); setEvalLoading(false);
  }

  async function handleOpenNext() {
    const scorePct = Math.round((evaluation.score / evaluation.max_score) * 100);
    const timeTaken = Date.now() - startTimeRef.current;
    const entry = { question: currentQ.question, level: 2, difficulty: currentDiff, isCorrect: scorePct >= 60, score: evaluation.score, max_score: evaluation.max_score };
    const newHistory = [...history, entry]; setHistory(newHistory);
    const newScores = [...recentScores, scorePct]; setRecentScores(newScores);
    if (qIndex >= numQuestions) { finishQuiz(newHistory); return; }
    await fetchNextQuestion(newHistory, newScores, scorePct, timeTaken);
  }

  async function handleStepNext() {
    const ans = (stepAnswers[currentStep] || "").trim(); if (!ans) return;
    const totalSteps = currentQ.decision_points?.length || 3;
    if (currentStep < totalSteps) { setCurrentStep(s => s + 1); setStepHint(false); }
    else {
      setEvalLoading(true);
      const result = await fetch(`${API}/l3/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: currentQ.scenario, decision_points: currentQ.decision_points, user_answers: stepAnswers, sample_answers: currentQ.sample_answers || {}, proficiency }) }).then(r => r.json());
      setScenarioEval(result); setEvalLoading(false);
    }
  }

  async function handleScenarioNext() {
    const scorePct = scenarioEval.total_max_score ? Math.round((scenarioEval.total_score / scenarioEval.total_max_score) * 100) : 0;
    const timeTaken = Date.now() - startTimeRef.current;
    const entry = { question: (currentQ.scenario || "").substring(0, 120), level: 3, difficulty: currentDiff, isCorrect: scorePct >= 60, score: scenarioEval.total_score, max_score: scenarioEval.total_max_score };
    const newHistory = [...history, entry]; setHistory(newHistory);
    const newScores = [...recentScores, scorePct]; setRecentScores(newScores);
    if (qIndex >= numQuestions) { finishQuiz(newHistory); return; }
    await fetchNextQuestion(newHistory, newScores, scorePct, timeTaken);
  }

  function restart() {
    setSessions(loadSessions()); setScreen("start"); setTopic(""); setHistory([]); setFeedback("");
    setRecentScores([]); setAsked([]); setCurrentQ(null); resetSubState(); setQuizError(null);
  }

  const isMCQ = currentQ?.type === "mcq";
  const isOpen = currentQ?.type === "open";
  const isScenario = currentQ?.type === "scenario";
  const levelMeta = LEVEL_META[currentLevel] || LEVEL_META[1];
  const totalSteps = currentQ?.decision_points?.length || 3;
  const resultScore = history.filter(h => h.isCorrect || (h.score >= (h.max_score || 10) * 0.6)).length;
  const sliderPct = ((numQuestions - 3) / (50 - 3)) * 100;

  return (
    <div className="app-layout">
      <Sidebar screen={screen} setScreen={setScreen} sessions={sessions} onReview={setReview} />

      <div className="app-main">
        <TopNav topic={topic} setTopic={setTopic} screen={screen} />

        <main className="main-content">

          {/* ── Analytics ── */}
          {screen === "analytics" && <div className="an-wrapper"><AnalyticsDashboard sessions={sessions} onBack={() => setScreen("start")} /></div>}

          {/* ── AI Interview ── */}
          {screen === "interview" && <InterviewScreen globalTopic={topic} globalProficiency={proficiency} onExit={() => setScreen("start")} />}

          {/* ── Start Screen ── */}
          {screen === "start" && (
            <div className="start-layout">
              <div className="start-left">
                <h1 className="start-heading">Ready for your daily challenge?</h1>
                <p className="start-sub">Our AI-driven adaptive engine calibrates questions in real-time based on your responses.</p>

                <div className="start-card">
                  {/* Proficiency */}
                  <div className="section-heading"><span className="section-icon">📊</span> Choose Proficiency Level</div>
                  <div className="prof-grid">
                    {PROFICIENCY_OPTIONS.map(opt => (
                      <button key={opt.value} className={`prof-card ${proficiency === opt.value ? "active" : ""}`} onClick={() => setProficiency(opt.value)} type="button">
                        <div className="prof-card-icon" style={{ background: opt.iconBg }}>{opt.icon}</div>
                        <div className="prof-card-name">{opt.label}</div>
                        <div className="prof-card-desc">{opt.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Question Slider */}
                  <div className="qs-section">
                    <div className="qs-header">
                      <span className="qs-label">Number of Questions</span>
                      <span className="qs-badge">{numQuestions}</span>
                    </div>
                    <div className="qs-slider-wrap">
                      <input type="range" className="qs-slider" min={3} max={50} step={1} value={numQuestions}
                        style={{ "--pct": `${sliderPct}%` }}
                        onChange={e => setNumQuestions(+e.target.value)} />
                    </div>
                    <div className="qs-ticks"><span>5 QS</span><span>15 QS</span><span>30 QS</span><span>50 QS</span></div>
                  </div>

                  {/* Start Button */}
                  <button className="start-btn" onClick={startQuiz} disabled={loading || !topic.trim()}>
                    {loading ? "Loading…" : <><span>Start Adaptive Quiz</span><span className="start-btn-icon">🚀</span></>}
                  </button>
                  {quizError && <div className="start-error">{quizError}</div>}
                  <div className="start-duration">Estimated duration: {Math.round(numQuestions * 1.2)}–{Math.round(numQuestions * 1.8)} minutes</div>
                </div>
              </div>

              {/* Right Panel */}
              <AdaptivePanel />
            </div>
          )}

          {/* ── Quiz Screen ── */}
          {screen === "adaptive-quiz" && (
            <div className={`quiz-area ${isScenario ? "scenario-area" : ""}`}>
              <LevelProgressBar currentLevel={currentLevel} recentScores={recentScores} />
              <div className="quiz-header">
                <span className="q-counter">Q {qIndex} / {numQuestions}</span>
                {!isScenario && <span className="diff-pill" style={{ background: DIFF_COL[currentDiff] }}>{currentDiff}</span>}
                <span className="level-chip" style={{ background: levelMeta.color }}>{levelMeta.tag}</span>
              </div>

              {loading ? (
                <div className="loading-state"><div className="spinner" /><p>Generating {isScenario ? "scenario" : "question"}…</p></div>
              ) : quizError ? (
                <div className="quiz-error-box">
                  <div className="quiz-error-icon">⚠️</div>
                  <p className="quiz-error-msg">{quizError}</p>
                  <button className="btn primary" onClick={() => setQuizError(null)}>Retry</button>
                  <button className="btn secondary" onClick={restart}>Start Over</button>
                </div>
              ) : currentQ ? (

                isMCQ && !evaluation ? (
                  <>
                    <p className="question-text">{currentQ.question}</p>
                    <div className="options">
                      {Object.entries(currentQ.options || {}).map(([key, val]) => {
                        let cls = "option-btn";
                        if (revealed) { if (key === currentQ.correct) cls += " correct"; else if (key === selected) cls += " wrong"; }
                        return <button key={key} className={cls} onClick={() => { if (!revealed) { setSelected(key); setRevealed(true); } }} disabled={revealed}><span className="option-key">{key}</span> {val}</button>;
                      })}
                    </div>
                    {revealed && <div className="explanation"><strong>Explanation:</strong> {currentQ.explanation}</div>}
                    {revealed && <button className="btn primary" onClick={handleMCQNext}>{qIndex >= numQuestions ? "See Results →" : "Next →"}</button>}
                  </>
                )

                  : isOpen && !evaluation ? (
                    <>
                      <p className="question-text">{currentQ.question}</p>
                      {currentQ.context && <div className="q-context">📌 {currentQ.context}</div>}
                      <button className="hint-toggle" onClick={() => setShowHint(v => !v)}>💡 {showHint ? "Hide Hint" : "Show Hint"}</button>
                      {showHint && <div className="hint-box">{currentQ.hint}</div>}
                      <textarea className="open-answer-box" placeholder="Type your answer here…" value={openAnswer} onChange={e => setOpenAnswer(e.target.value)} rows={5} />
                      <div className="open-answer-meta">{openAnswer.length} characters</div>
                      <button className="btn primary" onClick={submitOpenAnswer} disabled={evalLoading || !openAnswer.trim()}>{evalLoading ? "Evaluating…" : "Submit Answer →"}</button>
                    </>
                  )

                    : isOpen && evaluation ? (
                      <EvalPanel evaluation={evaluation} isLast={qIndex >= numQuestions} onNext={handleOpenNext} loading={loading} />
                    )

                      : isScenario && !scenarioEval ? (
                        <>
                          <div className="scenario-box"><div className="scenario-context-tag">📍 {currentQ.context}</div><p className="scenario-text">{currentQ.scenario}</p></div>
                          <div className="decision-step-indicator">
                            {(currentQ.decision_points || []).map((_, i) => <div key={i} className={`step-dot ${currentStep > i + 1 ? "done" : currentStep === i + 1 ? "active" : ""}`}>{currentStep > i + 1 ? "✓" : i + 1}</div>)}
                            <span className="step-label-text">Decision {currentStep} of {totalSteps}</span>
                          </div>
                          <div className="decision-point-box">
                            <div className="dp-number">Decision {currentStep}</div>
                            <p className="dp-situation">{currentQ.decision_points?.[currentStep - 1]?.situation}</p>
                            <button className="hint-toggle" onClick={() => setStepHint(v => !v)}>💡 {stepHint ? "Hide Hint" : "Show Hint"}</button>
                            {stepHint && <div className="hint-box">{currentQ.decision_points?.[currentStep - 1]?.hint}</div>}
                            <textarea className="open-answer-box" placeholder="What would you do? Be specific…" value={stepAnswers[currentStep] || ""} rows={4} onChange={e => setStepAnswers(prev => ({ ...prev, [currentStep]: e.target.value }))} />
                            <div className="open-answer-meta">{(stepAnswers[currentStep] || "").length} characters</div>
                          </div>
                          <button className="btn primary" onClick={handleStepNext} disabled={evalLoading || !(stepAnswers[currentStep] || "").trim()}>{evalLoading ? "Evaluating…" : currentStep < totalSteps ? `Next Decision (${currentStep + 1}/${totalSteps}) →` : "Submit All Decisions →"}</button>
                          {currentStep > 1 && (
                            <div className="prev-steps-summary">
                              <div className="prev-steps-label">📋 Your previous decisions:</div>
                              {Array.from({ length: currentStep - 1 }, (_, i) => i + 1).map(s => <div key={s} className="prev-step-item"><span className="prev-step-num">D{s}</span><span className="prev-step-text">{(stepAnswers[s] || "").substring(0, 80)}…</span></div>)}
                            </div>
                          )}
                        </>
                      )

                        : isScenario && scenarioEval ? (
                          <ScenarioEvalPanel evaluation={scenarioEval} isLast={qIndex >= numQuestions} onNext={handleScenarioNext} loading={loading} />
                        ) : null

              ) : null}
            </div>
          )}

          {/* ── Results ── */}
          {screen === "results" && (
            <div className="results-area">
              <h2>Quiz Complete! 🎉</h2>
              <div className="score-badge">{resultScore} / {numQuestions}</div>
              <table className="results-table">
                <thead><tr><th>#</th><th>Question</th><th>Level</th><th>Result</th></tr></thead>
                <tbody>{history.map((h, i) => (<tr key={i} className={(h.isCorrect || (h.score >= (h.max_score || 10) * .6)) ? "row-correct" : "row-wrong"}><td>{i + 1}</td><td className="q-cell">{(h.question || "").substring(0, 70)}{(h.question || "").length > 70 ? "…" : ""}</td><td><span className="level-chip" style={{ background: LEVEL_META[h.level || 1]?.color || "#f97316" }}>L{h.level || 1}</span></td><td>{h.isCorrect ? "✅" : h.score !== undefined ? `${h.score}/${h.max_score}` : `❌ (${h.correct})`}</td></tr>))}</tbody>
              </table>
              <div className="feedback-box">
                <div className="feedback-header">🎓 Study Coach Note</div>
                {feedbackLoading ? <div className="feedback-loading"><div className="spinner" /><span>Analysing…</span></div> : <p className="feedback-text">{feedback}</p>}
              </div>
              <button className="btn primary" onClick={restart}>Try Again</button>
              <button className="btn secondary" onClick={() => setScreen("analytics")}>View Analytics →</button>
            </div>
          )}
        </main>
      </div>

      <ReviewModal session={reviewSession} onClose={() => setReview(null)} />
    </div>
  );
}
