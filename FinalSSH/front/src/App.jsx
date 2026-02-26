import { useState, useRef, useEffect } from "react";
import "./App.css";

const API = "http://localhost:8000";
const TOTAL_QUESTIONS = 5;
const STORAGE_KEY = "mcq_quiz_sessions";

const PROFICIENCY_OPTIONS = [
  { value: "beginner", label: "Beginner", icon: "🌱", desc: "Foundational concepts, straightforward recall" },
  { value: "intermediate", label: "Intermediate", icon: "⚡", desc: "Applied thinking, multi-step reasoning" },
  { value: "advanced", label: "Advanced", icon: "🔥", desc: "Expert edge-cases, deep implementation" },
];

const LEVEL_META = {
  1: { label: "L1 — Knowledge", color: "#22c55e", icon: "🟢", tag: "MCQ" },
  2: { label: "L2 — Understanding", color: "#f59e0b", icon: "🟡", tag: "Why/Explain" },
  3: { label: "L3 — Mastery", color: "#ef4444", icon: "🔴", tag: "Decision Tree" },
};

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

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const pct = Math.min((now - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - pct, 3)) * target));
      if (pct < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return val;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const DIFF_COL = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };

function gradeColor(grade) {
  if (grade === "Excellent") return "#22c55e";
  if (grade === "Good") return "#6366f1";
  if (grade === "Fair") return "#f59e0b";
  return "#ef4444";
}
function scoreBadgeClass(pct) {
  return pct >= 80 ? "badge-excellent" : pct >= 60 ? "badge-good" : pct >= 40 ? "badge-fair" : "badge-poor";
}
function scoreBadgeLabel(pct) {
  return pct >= 80 ? "Excellent 🏆" : pct >= 60 ? "Good 👍" : pct >= 40 ? "Fair 💪" : "Needs Work 📖";
}

// ── DonutChart ────────────────────────────────────────────────────────────────
function DonutChart({ correct, total, color = "#6366f1" }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 80); return () => clearTimeout(t); }, []);
  const r = 38, cx = 48, cy = 48, sw = 11, circ = 2 * Math.PI * r;
  const pct = total ? (animated ? correct / total : 0) : 0;
  return (
    <svg width={96} height={96}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${pct * circ} ${circ}`} strokeDashoffset={circ / 4}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1)" }} />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#111">{correct}/{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize="9" fill="#999">Score</text>
    </svg>
  );
}

// ── SvgTooltip ────────────────────────────────────────────────────────────────
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

// ── TrendChart ───────────────────────────────────────────────────────────────
function TrendChart({ sessions }) {
  const [hovered, setHovered] = useState(null);
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
        <defs><linearGradient id="tG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient></defs>
        {[0, 50, 100].map(v => { const y = P.t + iH - (v / 100) * iH; return <g key={v}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" /><text x={P.l - 3} y={y + 3} fontSize="8" fill="#bbb" textAnchor="end">{v}%</text></g> })}
        {area && <polygon points={area} fill="url(#tG)" />}
        {pts.length >= 2 && <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" className="an-line-draw" />}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: "pointer" }}>
            <circle cx={p.x} cy={p.y} r={hovered === i ? 7 : 4.5} fill={hovered === i ? "#4f46e5" : "#6366f1"} stroke="#fff" strokeWidth="2" style={{ transition: "r 0.15s" }} />
          </g>
        ))}
        {hovered !== null && pts[hovered] && <SvgTooltip x={pts[hovered].x} y={pts[hovered].y} visible lines={[pts[hovered].topic, `Score: ${pts[hovered].pct}%`]} />}
      </svg>
    </div>
  );
}

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

// ── L2 Evaluation Panel ───────────────────────────────────────────────────────
function EvalPanel({ evaluation, onNext, isLast, loading }) {
  const [showModel, setShowModel] = useState(false);
  const { score, max_score, grade, feedback, key_points_hit, missing_points, model_answer } = evaluation;
  return (
    <div className="eval-panel">
      <div className="eval-score-row">
        <div className="eval-donut"><DonutChart correct={score} total={max_score} /></div>
        <div>
          <div className="eval-grade-badge" style={{ background: gradeColor(grade) + "22", color: gradeColor(grade), border: `1.5px solid ${gradeColor(grade)}` }}>
            {grade} — {score}/{max_score}
          </div>
          <p className="eval-feedback">{feedback}</p>
        </div>
      </div>
      {key_points_hit?.length > 0 && (
        <div className="eval-section">
          <div className="eval-section-title">✅ What you got right</div>
          <ul className="eval-list correct-list">{key_points_hit.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {missing_points?.length > 0 && (
        <div className="eval-section">
          <div className="eval-section-title">❌ What you missed</div>
          <ul className="eval-list missing-list">{missing_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      <button className="model-ans-toggle" onClick={() => setShowModel(v => !v)}>💡 {showModel ? "Hide" : "Show"} Model Answer</button>
      {showModel && <div className="model-ans-box">{model_answer}</div>}
      <button className="btn primary" style={{ marginTop: 16 }} onClick={onNext} disabled={loading}>
        {loading ? "Loading…" : isLast ? "See Results →" : "Next Question →"}
      </button>
    </div>
  );
}

// ── L3 Scenario Eval Panel ────────────────────────────────────────────────────
function ScenarioEvalPanel({ evaluation, onNext, isLast, loading }) {
  const [showModel, setShowModel] = useState(false);
  const { decision_scores = [], consistency_score, consistency_note,
    total_score, total_max_score, overall_grade, expert_assessment, model_approach } = evaluation;
  const totalPct = total_max_score ? Math.round((total_score / total_max_score) * 100) : 0;

  return (
    <div className="eval-panel scenario-eval">
      {/* Overall Header */}
      <div className="eval-score-row">
        <div className="eval-donut">
          <DonutChart correct={total_score} total={total_max_score} color="#ef4444" />
        </div>
        <div>
          <div className="eval-grade-badge" style={{ background: gradeColor(overall_grade) + "22", color: gradeColor(overall_grade), border: `1.5px solid ${gradeColor(overall_grade)}` }}>
            {overall_grade} — {total_score}/{total_max_score}
          </div>
          <div className="consistency-badge">
            🔗 Consistency: <strong>{consistency_score}/10</strong>
          </div>
          <p className="eval-feedback" style={{ marginTop: 4 }}>{consistency_note}</p>
        </div>
      </div>

      {/* Per-Decision Breakdown */}
      <div className="eval-section">
        <div className="eval-section-title">📊 Decision Breakdown</div>
        <div className="decision-breakdown">
          {decision_scores.map((ds, i) => (
            <div key={i} className="dp-score-row">
              <span className="dp-step-label">D{ds.step}</span>
              <div className="dp-mini-bar">
                <div className="dp-mini-fill" style={{ width: `${(ds.score / ds.max_score) * 100}%`, background: gradeColor(ds.grade) }} />
              </div>
              <span className="dp-score-num">{ds.score}/{ds.max_score}</span>
              <span className="dp-grade-chip" style={{ color: gradeColor(ds.grade) }}>{ds.grade}</span>
            </div>
          ))}

          {/* Consistency row */}
          <div className="dp-score-row consistency-row">
            <span className="dp-step-label">🔗</span>
            <div className="dp-mini-bar">
              <div className="dp-mini-fill" style={{ width: `${consistency_score * 10}%`, background: "#6366f1" }} />
            </div>
            <span className="dp-score-num">{consistency_score}/10</span>
            <span className="dp-grade-chip" style={{ color: "#6366f1" }}>Consistency</span>
          </div>
        </div>
      </div>

      {/* Per-Decision Feedback */}
      <div className="eval-section">
        <div className="eval-section-title">💬 Decision Feedback</div>
        {decision_scores.map((ds, i) => (
          <div key={i} className="dp-feedback-row">
            <span className="dp-feedback-tag" style={{ background: gradeColor(ds.grade) + "22", color: gradeColor(ds.grade) }}>D{ds.step}</span>
            <p className="dp-feedback-text">{ds.feedback}</p>
          </div>
        ))}
      </div>

      {/* Expert Assessment */}
      <div className="expert-assessment-box">
        <span className="expert-icon">🏆</span>
        <p>{expert_assessment}</p>
      </div>

      {/* Model Approach */}
      <button className="model-ans-toggle" onClick={() => setShowModel(v => !v)}>
        💡 {showModel ? "Hide" : "Show"} Expert Strategy
      </button>
      {showModel && <div className="model-ans-box">{model_approach}</div>}

      <button className="btn primary" style={{ marginTop: 16 }} onClick={onNext} disabled={loading}>
        {loading ? "Loading…" : isLast ? "See Results →" : "Next Question →"}
      </button>
    </div>
  );
}

// ── Level Progress Bar ────────────────────────────────────────────────────────
function LevelProgressBar({ currentLevel, recentScores }) {
  const avg = recentScores.length ? Math.round(recentScores.slice(-2).reduce((a, b) => a + b, 0) / Math.min(recentScores.length, 2)) : null;
  return (
    <div className="level-progress-bar">
      {[1, 2, 3].map(l => (
        <div key={l} className={`level-pip ${currentLevel === l ? "active" : currentLevel > l ? "done" : ""}`}
          style={{ background: currentLevel >= l ? LEVEL_META[l].color : undefined }}>
          <span>{LEVEL_META[l].icon}</span>
          <span className="pip-label">L{l}</span>
        </div>
      ))}
      {avg !== null && <span className="level-score-avg">Avg: {avg}%</span>}
    </div>
  );
}

// ── Analytics Dashboard ───────────────────────────────────────────────────────
function AnalyticsDashboard({ sessions, onBack }) {
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState("newest");
  if (detail) return <TestDetail session={detail} onBack={() => setDetail(null)} />;

  const totalQ = sessions.reduce((s, x) => s + (x.history || []).length, 0);
  const avgScore = sessions.length ? Math.round(sessions.reduce((s, x) => s + x.score / x.total, 0) / sessions.length * 100) : 0;
  const bestScore = sessions.length ? Math.max(...sessions.map(s => Math.round(s.score / s.total * 100))) : 0;
  const sorted = [...sessions].sort((a, b) =>
    sort === "best" ? b.score / b.total - a.score / a.total : sort === "worst" ? a.score / a.total - b.score / b.total : sort === "topic" ? a.topic.localeCompare(b.topic) : 0
  );
  return (
    <div className="an-page">
      <div className="an-page-header"><button className="an-back-btn" onClick={onBack}>← Back</button><h2>Analytics Dashboard</h2></div>
      {sessions.length === 0 ? (
        <div className="an-empty-state"><div className="an-empty-icon">📊</div><p>No quizzes yet.</p><p className="an-empty-sub">Complete a quiz and come back!</p></div>
      ) : (<>
        <div className="an-stat-strip">
          <StatCard icon="📝" label="Quizzes" value={sessions.length} color="#6366f1" />
          <StatCard icon="❓" label="Questions" value={totalQ} color="#8b5cf6" />
          <StatCard icon="📊" label="Avg Score" value={avgScore} color="#f59e0b" suffix="%" />
          <StatCard icon="🏆" label="Best" value={bestScore} color="#22c55e" suffix="%" />
        </div>
        <div className="an-card">
          <div className="an-card-title">📈 Score Trend</div>
          {sessions.length >= 2 ? <TrendChart sessions={sessions} /> : <p className="an-hint">Complete 2+ quizzes to see trend</p>}
        </div>
        <div className="an-card">
          <div className="an-card-header-row">
            <div className="an-card-title" style={{ marginBottom: 0 }}>📋 All Tests</div>
            <div className="an-sort-btns">
              {[["newest", "Newest"], ["best", "Best"], ["worst", "Worst"], ["topic", "A–Z"]].map(([k, l]) => (
                <button key={k} className={`an-sort-btn ${sort === k ? "active" : ""}`} onClick={() => setSort(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="an-test-list" style={{ marginTop: 12 }}>
            {sorted.map((s, i) => {
              const pct = Math.round(s.score / s.total * 100);
              return (
                <button key={i} className="an-test-row" onClick={() => setDetail(s)}>
                  <div className="an-test-left"><span className="an-test-topic">{s.topic}</span><span className="an-test-date">{s.date}</span></div>
                  <div className="an-test-right">
                    <div className="an-test-bar-wrap"><div className="an-test-bar-fill" style={{ width: `${pct}%`, background: pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444" }} /></div>
                    <span className="an-test-score">{s.score}/{s.total}</span>
                  </div>
                  <span className="an-test-arrow">›</span>
                </button>
              );
            })}
          </div>
        </div>
      </>)}
    </div>
  );
}

function TestDetail({ session, onBack }) {
  const h = session.history || [];
  const scorePct = Math.round(session.score / session.total * 100);
  return (
    <div className="an-page">
      <div className="an-page-header"><button className="an-back-btn" onClick={onBack}>← All Tests</button><h2>{session.topic}</h2><span className="an-detail-date">{session.date}</span></div>
      <div className={`performance-badge ${scoreBadgeClass(scorePct)}`}>{scoreBadgeLabel(scorePct)}</div>
      <div className="an-overview-row">
        <div className="an-overview-donut">
          <DonutChart correct={session.score} total={session.total} />
          <div className={`an-pct-label ${scorePct >= 80 ? "good" : scorePct >= 50 ? "mid" : "bad"}`}>{scorePct}%</div>
        </div>
        <div className="an-overview-stats">
          <div className="an-ov-stat"><span className="an-ov-val" style={{ color: "#22c55e" }}>{h.filter(x => x.isCorrect || (x.score >= (x.max_score || 10) * .6)).length}</span><span className="an-ov-lbl">Good</span></div>
          <div className="an-ov-stat"><span className="an-ov-val" style={{ color: "#ef4444" }}>{h.filter(x => !(x.isCorrect || (x.score >= (x.max_score || 10) * .6))).length}</span><span className="an-ov-lbl">Needs work</span></div>
        </div>
      </div>
      <div className="an-card">
        <div className="an-card-title">📋 Question Breakdown</div>
        <table className="results-table">
          <thead><tr><th>#</th><th>Question</th><th>Level</th><th>Result</th></tr></thead>
          <tbody>{h.map((q, i) => (
            <tr key={i} className={(q.isCorrect || (q.score >= (q.max_score || 10) * .6)) ? "row-correct" : "row-wrong"}>
              <td>{i + 1}</td>
              <td className="q-cell">{(q.question || "").substring(0, 80)}{q.question?.length > 80 ? "…" : ""}</td>
              <td><span className="level-chip" style={{ background: LEVEL_META[q.level || 1]?.color || "#6366f1" }}>L{q.level || 1}</span></td>
              <td>{q.isCorrect ? "✅" : q.score !== undefined ? `${q.score}/${q.max_score}` : "❌"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Sidebar({ sessions, onReview, onAnalytics }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-title">📋 Past Quizzes</div>
      {sessions.length === 0
        ? <p className="sidebar-empty">No quizzes yet.<br />Complete one to see it here!</p>
        : <ul className="session-list">
          {sessions.map((s, i) => (
            <li key={i} className="session-item" onClick={() => onReview(s)}>
              <div className="session-topic">{s.topic}</div>
              <div className="session-meta"><span className="session-score">{s.score}/{s.total}</span><span className="session-date">{s.date}</span></div>
              <div className="session-bar"><div className="session-bar-fill" style={{ width: `${(s.score / s.total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      }
      <button className="sidebar-analytics-btn" onClick={onAnalytics}>📊 Analytics</button>
    </aside>
  );
}

function ReviewModal({ session, onClose }) {
  if (!session) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span>{session.topic} — {session.score}/{session.total}</span><button className="modal-close" onClick={onClose}>✕</button></div>
        <table className="results-table">
          <thead><tr><th>#</th><th>Question</th><th>Result</th></tr></thead>
          <tbody>{(session.history || []).map((h, i) => (
            <tr key={i} className={(h.isCorrect || (h.score >= (h.max_score || 10) * .6)) ? "row-correct" : "row-wrong"}>
              <td>{i + 1}</td><td className="q-cell">{(h.question || "").substring(0, 60)}…</td><td>{h.isCorrect ? "✅" : "❌"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Main App
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("start");
  const [topic, setTopic] = useState("");
  const [proficiency, setProficiency] = useState("intermediate");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState(loadSessions);
  const [reviewSession, setReview] = useState(null);

  // Adaptive quiz core
  const [qIndex, setQIndex] = useState(0);
  const [currentQ, setCurrentQ] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentDiff, setCurrentDiff] = useState("medium");
  const [recentScores, setRecentScores] = useState([]);
  const [askedQuestions, setAsked] = useState([]);
  const [history, setHistory] = useState([]);
  const startTimeRef = useRef(null);

  // L1 MCQ sub-state
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);

  // L2 Open sub-state
  const [openAnswer, setOpenAnswer] = useState("");
  const [evaluation, setEval] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);

  // L3 Scenario sub-state
  const [currentStep, setCurrentStep] = useState(1);   // which decision point
  const [stepAnswers, setStepAnswers] = useState({});   // {1: "...", 2: "...", 3: "..."}
  const [stepHint, setStepHint] = useState(false);
  const [scenarioEval, setScenarioEval] = useState(null);

  // Results
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFBLoad] = useState(false);

  // ── Reset all sub-state ─────────────────────────────────────
  function resetSubState() {
    setSelected(null); setRevealed(false);
    setOpenAnswer(""); setEval(null); setShowHint(false);
    setCurrentStep(1); setStepAnswers({}); setStepHint(false); setScenarioEval(null);
  }

  // ── Start quiz ──────────────────────────────────────────────
  async function startQuiz() {
    if (!topic.trim()) return;
    setLoading(true);
    setHistory([]); setRecentScores([]); setAsked([]); setQIndex(1);
    setCurrentLevel(1); setCurrentDiff("medium");
    resetSubState(); setFeedback("");

    const data = await fetch(`${API}/adaptive/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, proficiency }),
    }).then(r => r.json());

    setCurrentQ(data.question);
    setAsked([data.question.scenario || data.question.question]);
    setLoading(false);
    setScreen("adaptive-quiz");
    startTimeRef.current = Date.now();
  }

  // ── Fetch next adaptive question ────────────────────────────
  async function fetchNextQuestion(newHistory, newScores, lastScorePct, timeTaken) {
    setLoading(true);
    const asked = newHistory.map(h => h.question).filter(Boolean);
    const data = await fetch(`${API}/adaptive/next`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic, proficiency,
        current_level: currentLevel,
        current_difficulty: currentDiff,
        last_score_pct: lastScorePct,
        time_taken_ms: timeTaken,
        recent_score_pcts: newScores,
        asked_questions: asked,
      }),
    }).then(r => r.json());

    setCurrentQ(data.question);
    setCurrentLevel(data.new_level);
    setCurrentDiff(data.new_difficulty);
    setAsked([...asked, data.question.scenario || data.question.question]);
    setQIndex(i => i + 1);
    resetSubState();
    setLoading(false);
    startTimeRef.current = Date.now();
  }

  // ── Finish quiz ─────────────────────────────────────────────
  async function finishQuiz(finalHistory) {
    const score = finalHistory.filter(h => h.isCorrect || (h.score >= (h.max_score || 10) * 0.6)).length;
    const session = {
      topic, proficiency, level: "adaptive", score, total: TOTAL_QUESTIONS,
      date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      history: finalHistory, feedback: "",
    };
    saveSession(session); setSessions(loadSessions());
    setScreen("results");

    setFBLoad(true);
    try {
      const res = await fetch(`${API}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, history: finalHistory }),
      }).then(r => r.json());
      setFeedback(res.feedback || "");
    } catch { setFeedback("Could not generate feedback."); }
    setFBLoad(false);
  }

  // ── L1: MCQ answer ──────────────────────────────────────────
  async function handleMCQNext() {
    const timeTaken = Date.now() - startTimeRef.current;
    const isCorrect = selected === currentQ.correct;
    const scorePct = isCorrect ? 100 : 0;
    const entry = {
      question: currentQ.question, level: 1, difficulty: currentDiff,
      isCorrect, timeTaken, selected, correct: currentQ.correct
    };
    const newHistory = [...history, entry];
    setHistory(newHistory);
    const newScores = [...recentScores, scorePct];
    setRecentScores(newScores);
    if (qIndex >= TOTAL_QUESTIONS) { finishQuiz(newHistory); return; }
    await fetchNextQuestion(newHistory, newScores, scorePct, timeTaken);
  }

  // ── L2: Open answer submit ──────────────────────────────────
  async function submitOpenAnswer() {
    if (!openAnswer.trim()) return;
    setEvalLoading(true);
    const result = await fetch(`${API}/l2/evaluate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: currentQ.question, context: currentQ.context || "",
        user_answer: openAnswer, sample_answer: currentQ.sample_answer, proficiency
      }),
    }).then(r => r.json());
    setEval(result);
    setEvalLoading(false);
  }

  async function handleOpenNext() {
    const scorePct = Math.round((evaluation.score / evaluation.max_score) * 100);
    const timeTaken = Date.now() - startTimeRef.current;
    const entry = {
      question: currentQ.question, level: 2, difficulty: currentDiff,
      isCorrect: scorePct >= 60, score: evaluation.score, max_score: evaluation.max_score
    };
    const newHistory = [...history, entry];
    setHistory(newHistory);
    const newScores = [...recentScores, scorePct];
    setRecentScores(newScores);
    if (qIndex >= TOTAL_QUESTIONS) { finishQuiz(newHistory); return; }
    await fetchNextQuestion(newHistory, newScores, scorePct, timeTaken);
  }

  // ── L3: Scenario decision steps ────────────────────────────
  async function handleStepNext() {
    const ans = (stepAnswers[currentStep] || "").trim();
    if (!ans) return;

    const totalSteps = currentQ.decision_points?.length || 3;

    if (currentStep < totalSteps) {
      // Move to next decision point
      setCurrentStep(s => s + 1);
      setStepHint(false);
    } else {
      // All steps answered — evaluate
      setEvalLoading(true);
      const result = await fetch(`${API}/l3/evaluate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: currentQ.scenario,
          decision_points: currentQ.decision_points,
          user_answers: stepAnswers,
          sample_answers: currentQ.sample_answers || {},
          proficiency,
        }),
      }).then(r => r.json());
      setScenarioEval(result);
      setEvalLoading(false);
    }
  }

  async function handleScenarioNext() {
    const scorePct = scenarioEval.total_max_score
      ? Math.round((scenarioEval.total_score / scenarioEval.total_max_score) * 100) : 0;
    const timeTaken = Date.now() - startTimeRef.current;
    const entry = {
      question: (currentQ.scenario || "").substring(0, 120),
      level: 3, difficulty: currentDiff,
      isCorrect: scorePct >= 60,
      score: scenarioEval.total_score, max_score: scenarioEval.total_max_score,
    };
    const newHistory = [...history, entry];
    setHistory(newHistory);
    const newScores = [...recentScores, scorePct];
    setRecentScores(newScores);
    if (qIndex >= TOTAL_QUESTIONS) { finishQuiz(newHistory); return; }
    await fetchNextQuestion(newHistory, newScores, scorePct, timeTaken);
  }

  function restart() {
    setScreen("start"); setTopic(""); setHistory([]); setFeedback("");
    setRecentScores([]); setAsked([]); setCurrentQ(null);
    resetSubState();
  }

  const isMCQ = currentQ?.type === "mcq";
  const isOpen = currentQ?.type === "open";
  const isScenario = currentQ?.type === "scenario";
  const levelMeta = LEVEL_META[currentLevel] || LEVEL_META[1];
  const totalSteps = currentQ?.decision_points?.length || 3;
  const resultScore = history.filter(h => h.isCorrect || (h.score >= (h.max_score || 10) * 0.6)).length;

  return (
    <div className="app-layout">
      <Sidebar sessions={sessions} onReview={setReview} onAnalytics={() => setScreen("analytics")} />
      <main className="main-content">

        {screen === "analytics" && (
          <div className="an-wrapper"><AnalyticsDashboard sessions={sessions} onBack={() => setScreen("start")} /></div>
        )}

        {/* ── Start ── */}
        {screen === "start" && (
          <div className="card start-card">
            <h1>Adaptive Quiz</h1>
            <p className="subtitle">Automatically levels up from MCQ → Conceptual → Mastery based on your scores.</p>
            <input className="topic-input" placeholder="Enter a topic (e.g. Python, Leadership, Finance…)"
              value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && startQuiz()} />

            <div className="proficiency-label">Proficiency Level</div>
            <div className="proficiency-group">
              {PROFICIENCY_OPTIONS.map(opt => (
                <button key={opt.value} className={`prof-btn ${proficiency === opt.value ? "active" : ""}`}
                  onClick={() => setProficiency(opt.value)} type="button">
                  <span className="prof-icon">{opt.icon}</span>
                  <span className="prof-name">{opt.label}</span>
                  <span className="prof-desc">{opt.desc}</span>
                </button>
              ))}
            </div>

            <div className="adaptive-info-box">
              <div className="adaptive-info-title">🤖 Auto-Adaptive Levels</div>
              <div className="adaptive-level-row"><span>🟢 L1 MCQ</span><span className="adaptive-arrow">avg ≥ 80% →</span><span>🟡 L2 Why/Explain</span></div>
              <div className="adaptive-level-row"><span>🟡 L2 Why</span><span className="adaptive-arrow">avg ≥ 75% →</span><span>🔴 L3 Decision Tree</span></div>
              <div className="adaptive-level-row gray"><span>Drop back if avg &lt; 35%</span></div>
            </div>

            <button className="btn primary" onClick={startQuiz} disabled={loading || !topic.trim()}>
              {loading ? "Loading…" : "Start Adaptive Quiz →"}
            </button>
          </div>
        )}

        {/* ── Adaptive Quiz ── */}
        {screen === "adaptive-quiz" && (
          <div className={`card quiz-card ${isScenario ? "scenario-card" : isOpen ? "open-quiz-card" : ""}`}>
            <LevelProgressBar currentLevel={currentLevel} recentScores={recentScores} />
            <div className="quiz-header">
              <span className="q-counter">Q {qIndex} / {TOTAL_QUESTIONS}</span>
              {!isScenario && <span className="diff-pill" style={{ background: DIFF_COL[currentDiff] }}>{currentDiff}</span>}
              <span className="level-chip" style={{ background: levelMeta.color }}>{levelMeta.tag}</span>
            </div>

            {loading ? (
              <div className="loading-state"><div className="spinner" /><p>Generating {isScenario ? "scenario" : "question"}…</p></div>
            ) : currentQ ? (

              /* ── L1: MCQ ── */
              isMCQ && !evaluation ? (
                <>
                  <p className="question-text">{currentQ.question}</p>
                  <div className="options">
                    {Object.entries(currentQ.options || {}).map(([key, val]) => {
                      let cls = "option-btn";
                      if (revealed) { if (key === currentQ.correct) cls += " correct"; else if (key === selected) cls += " wrong"; }
                      return (
                        <button key={key} className={cls}
                          onClick={() => { if (!revealed) { setSelected(key); setRevealed(true); } }} disabled={revealed}>
                          <span className="option-key">{key}</span> {val}
                        </button>
                      );
                    })}
                  </div>
                  {revealed && <div className="explanation"><strong>Explanation:</strong> {currentQ.explanation}</div>}
                  {revealed && <button className="btn primary" onClick={handleMCQNext}>{qIndex >= TOTAL_QUESTIONS ? "See Results →" : "Next →"}</button>}
                </>
              )

                /* ── L2: Open Text ── */
                : isOpen && !evaluation ? (
                  <>
                    <p className="question-text">{currentQ.question}</p>
                    {currentQ.context && <div className="q-context">📌 {currentQ.context}</div>}
                    <button className="hint-toggle" onClick={() => setShowHint(v => !v)}>💡 {showHint ? "Hide Hint" : "Show Hint"}</button>
                    {showHint && <div className="hint-box">{currentQ.hint}</div>}
                    <textarea className="open-answer-box" placeholder="Type your answer here…"
                      value={openAnswer} onChange={e => setOpenAnswer(e.target.value)} rows={5} />
                    <div className="open-answer-meta">{openAnswer.length} characters</div>
                    <button className="btn primary" onClick={submitOpenAnswer} disabled={evalLoading || !openAnswer.trim()}>
                      {evalLoading ? "Evaluating…" : "Submit Answer →"}
                    </button>
                  </>
                )

                  /* ── L2: Eval result ── */
                  : isOpen && evaluation ? (
                    <EvalPanel evaluation={evaluation} isLast={qIndex >= TOTAL_QUESTIONS} onNext={handleOpenNext} loading={loading} />
                  )

                    /* ── L3: Decision Tree scenario ── */
                    : isScenario && !scenarioEval ? (
                      <>
                        {/* Scenario Description */}
                        <div className="scenario-box">
                          <div className="scenario-context-tag">📍 {currentQ.context}</div>
                          <p className="scenario-text">{currentQ.scenario}</p>
                        </div>

                        {/* Step Indicator */}
                        <div className="decision-step-indicator">
                          {(currentQ.decision_points || []).map((_, i) => (
                            <div key={i} className={`step-dot ${currentStep > i + 1 ? "done" : currentStep === i + 1 ? "active" : ""}`}>
                              {currentStep > i + 1 ? "✓" : i + 1}
                            </div>
                          ))}
                          <span className="step-label-text">Decision {currentStep} of {totalSteps}</span>
                        </div>

                        {/* Current Decision Point */}
                        <div className="decision-point-box">
                          <div className="dp-number">Decision {currentStep}</div>
                          <p className="dp-situation">{currentQ.decision_points?.[currentStep - 1]?.situation}</p>
                          <button className="hint-toggle" onClick={() => setStepHint(v => !v)}>
                            💡 {stepHint ? "Hide Hint" : "Show Hint"}
                          </button>
                          {stepHint && <div className="hint-box">{currentQ.decision_points?.[currentStep - 1]?.hint}</div>}
                          <textarea className="open-answer-box" placeholder="What would you do? Be specific…"
                            value={stepAnswers[currentStep] || ""} rows={4}
                            onChange={e => setStepAnswers(prev => ({ ...prev, [currentStep]: e.target.value }))} />
                          <div className="open-answer-meta">{(stepAnswers[currentStep] || "").length} characters</div>
                        </div>

                        <button className="btn primary" onClick={handleStepNext}
                          disabled={evalLoading || !(stepAnswers[currentStep] || "").trim()}>
                          {evalLoading ? "Evaluating all decisions…"
                            : currentStep < totalSteps ? `Next Decision (${currentStep + 1}/${totalSteps}) →`
                              : "Submit All Decisions →"}
                        </button>

                        {/* Previously answered steps summary */}
                        {currentStep > 1 && (
                          <div className="prev-steps-summary">
                            <div className="prev-steps-label">📋 Your previous decisions:</div>
                            {Array.from({ length: currentStep - 1 }, (_, i) => i + 1).map(s => (
                              <div key={s} className="prev-step-item">
                                <span className="prev-step-num">D{s}</span>
                                <span className="prev-step-text">{(stepAnswers[s] || "").substring(0, 80)}…</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )

                      /* ── L3: Scenario Eval result ── */
                      : isScenario && scenarioEval ? (
                        <ScenarioEvalPanel evaluation={scenarioEval} isLast={qIndex >= TOTAL_QUESTIONS}
                          onNext={handleScenarioNext} loading={loading} />
                      )

                        : null
            ) : null}
          </div>
        )}

        {/* ── Results ── */}
        {screen === "results" && (
          <div className="card results-card">
            <h2>Quiz Complete! 🎉</h2>
            <div className="score-badge">{resultScore} / {TOTAL_QUESTIONS}</div>
            <table className="results-table">
              <thead><tr><th>#</th><th>Question</th><th>Level</th><th>Result</th></tr></thead>
              <tbody>{history.map((h, i) => (
                <tr key={i} className={(h.isCorrect || (h.score >= (h.max_score || 10) * .6)) ? "row-correct" : "row-wrong"}>
                  <td>{i + 1}</td>
                  <td className="q-cell">{(h.question || "").substring(0, 70)}{(h.question || "").length > 70 ? "…" : ""}</td>
                  <td><span className="level-chip" style={{ background: LEVEL_META[h.level || 1]?.color || "#6366f1" }}>L{h.level || 1}</span></td>
                  <td>{h.isCorrect ? "✅" : h.score !== undefined ? `${h.score}/${h.max_score}` : `❌ (${h.correct})`}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="feedback-box">
              <div className="feedback-header">🎓 Study Coach Note</div>
              {feedbackLoading ? <div className="feedback-loading"><div className="spinner" /><span>Analysing…</span></div>
                : <p className="feedback-text">{feedback}</p>}
            </div>
            <button className="btn primary" onClick={restart}>Try Again</button>
            <button className="btn secondary" onClick={() => setScreen("analytics")}>View Analytics →</button>
          </div>
        )}
      </main>
      <ReviewModal session={reviewSession} onClose={() => setReview(null)} />
    </div>
  );
}
