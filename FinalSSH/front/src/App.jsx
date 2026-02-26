import { useState, useRef } from "react";
import "./App.css";

const API = "http://localhost:8000";
const TOTAL_QUESTIONS = 5;
const STORAGE_KEY = "mcq_quiz_sessions";

// ── LocalStorage helpers ──────────────────────────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveSession(session) {
  const sessions = loadSessions();
  sessions.unshift(session);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 50)));
}

// ── SVG Chart helpers ─────────────────────────────────────────────────────────
const DIFF_NUM = { easy: 1, medium: 2, hard: 3 };
const DIFF_COL = { easy: "#22c55e", medium: "#f59e0b", hard: "#ef4444" };
const DIFF_LABEL = { 1: "Easy", 2: "Medium", 3: "Hard" };

/** Mini donut chart for correct / wrong */
function DonutChart({ correct, total }) {
  const r = 36, cx = 44, cy = 44, stroke = 10;
  const circ = 2 * Math.PI * r;
  const pct = total ? correct / total : 0;
  return (
    <svg width={88} height={88}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6366f1" strokeWidth={stroke}
        strokeDasharray={`${pct * circ} ${circ}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="13" fontWeight="800" fill="#111">
        {correct}/{total}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#888">Score</text>
    </svg>
  );
}

/** SVG line chart — difficulty progression per question */
function DifficultyChart({ history }) {
  const W = 340, H = 90, PAD = { t: 10, b: 24, l: 36, r: 10 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const n = history.length;
  const points = history.map((h, i) => {
    const x = PAD.l + (n < 2 ? iW / 2 : (i / (n - 1)) * iW);
    const d = DIFF_NUM[h.difficulty] || 2;
    const y = PAD.t + iH - ((d - 1) / 2) * iH;
    return { x, y, d, correct: h.isCorrect, label: h.difficulty };
  });
  const line = points.map(p => `${p.x},${p.y}`).join(" ");
  return (
    <svg width={W} height={H} className="an-svg">
      {/* Y grid + labels */}
      {[1, 2, 3].map(v => {
        const y = PAD.t + iH - ((v - 1) / 2) * iH;
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" />
            <text x={PAD.l - 4} y={y + 4} fontSize="9" fill="#aaa" textAnchor="end">{DIFF_LABEL[v]}</text>
          </g>
        );
      })}
      {/* Line */}
      {n >= 2 && <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" />}
      {/* Dots */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={6} fill={DIFF_COL[p.label]} stroke="#fff" strokeWidth="2" />
          {p.correct
            ? <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="8" fill="#fff">✓</text>
            : <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="8" fill="#fff">✗</text>
          }
          {/* X label */}
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="#aaa">Q{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

/** SVG bar chart — time per question */
function TimeChart({ history }) {
  const W = 340, H = 100, PAD = { t: 10, b: 24, l: 42, r: 10 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const maxT = Math.max(...history.map(h => h.timeTaken), 1);
  const barW = iW / history.length - 6;
  return (
    <svg width={W} height={H} className="an-svg">
      {/* Y grid */}
      {[0, 0.5, 1].map(v => {
        const y = PAD.t + iH - v * iH;
        const label = Math.round((v * maxT) / 1000) + "s";
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" />
            <text x={PAD.l - 4} y={y + 3} fontSize="9" fill="#aaa" textAnchor="end">{label}</text>
          </g>
        );
      })}
      {/* Bars */}
      {history.map((h, i) => {
        const bH = (h.timeTaken / maxT) * iH;
        const x = PAD.l + i * (iW / history.length) + 3;
        const y = PAD.t + iH - bH;
        const col = h.isCorrect ? "#6366f1" : "#ef4444";
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH} rx={3} fill={col} opacity={0.85} />
            <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="#aaa">Q{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** SVG score over sessions trend */
function TrendChart({ sessions }) {
  const data = [...sessions].reverse();
  const W = 340, H = 80, PAD = { t: 8, b: 20, l: 28, r: 8 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const pts = data.map((s, i) => ({
    x: PAD.l + (data.length < 2 ? iW / 2 : (i / (data.length - 1)) * iW),
    y: PAD.t + iH - (s.score / s.total) * iH,
    pct: Math.round((s.score / s.total) * 100),
    topic: s.topic,
  }));
  const line = pts.map(p => `${p.x},${p.y}`).join(" ");
  return (
    <svg width={W} height={H} className="an-svg">
      {[0, 50, 100].map(v => {
        const y = PAD.t + iH - (v / 100) * iH;
        return (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#e5e7eb" strokeDasharray="4,3" />
            <text x={PAD.l - 3} y={y + 3} fontSize="8" fill="#bbb" textAnchor="end">{v}%</text>
          </g>
        );
      })}
      {data.length >= 2 && <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill="#6366f1" stroke="#fff" strokeWidth="1.5" />
          <title>{p.topic}: {p.pct}%</title>
        </g>
      ))}
    </svg>
  );
}

// ── Analytics Dashboard ───────────────────────────────────────────────────────
function AnalyticsDashboard({ sessions, onBack }) {
  const [detail, setDetail] = useState(null);

  if (detail) return <TestDetail session={detail} onBack={() => setDetail(null)} />;

  const totalQ = sessions.reduce((s, x) => s + (x.history || []).length, 0);
  const avgScore = sessions.length
    ? Math.round(sessions.reduce((s, x) => s + x.score / x.total, 0) / sessions.length * 100) : 0;
  const bestScore = sessions.length
    ? Math.max(...sessions.map(s => Math.round(s.score / s.total * 100))) : 0;

  const diffCounts = { easy: 0, medium: 0, hard: 0 };
  sessions.forEach(s => (s.history || []).forEach(h => { if (h.difficulty in diffCounts) diffCounts[h.difficulty]++; }));
  const dTotal = totalQ || 1;

  return (
    <div className="an-page">
      <div className="an-page-header">
        <button className="an-back-btn" onClick={onBack}>← Back</button>
        <h2>Analytics Dashboard</h2>
      </div>

      {sessions.length === 0 ? (
        <div className="an-empty-state">No quizzes yet. Complete a quiz to see analytics!</div>
      ) : (
        <>
          {/* ── Overall stats ── */}
          <div className="an-stat-strip">
            <div className="an-big-stat"><span className="an-big-val">{sessions.length}</span><span className="an-big-lbl">Quizzes</span></div>
            <div className="an-big-stat"><span className="an-big-val">{totalQ}</span><span className="an-big-lbl">Questions</span></div>
            <div className="an-big-stat"><span className="an-big-val">{avgScore}%</span><span className="an-big-lbl">Avg Score</span></div>
            <div className="an-big-stat"><span className="an-big-val">{bestScore}%</span><span className="an-big-lbl">Best</span></div>
          </div>

          {/* ── Score trend ── */}
          <div className="an-card">
            <div className="an-card-title">📈 Score Trend (all quizzes)</div>
            {sessions.length >= 2
              ? <TrendChart sessions={sessions} />
              : <p className="an-hint">Complete 2+ quizzes to see trend</p>}
          </div>

          {/* ── Difficulty mix ── */}
          <div className="an-card">
            <div className="an-card-title">🎯 Difficulty Distribution (all questions)</div>
            <div className="an-diff-grid">
              {["easy", "medium", "hard"].map(d => (
                <div key={d} className="an-diff-box">
                  <div className="an-diff-circle" style={{ background: DIFF_COL[d] }}>{diffCounts[d]}</div>
                  <span className="an-diff-name">{d}</span>
                  <span className="an-diff-pct">{Math.round(diffCounts[d] / dTotal * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Test list ── */}
          <div className="an-card">
            <div className="an-card-title">📋 All Tests (click for details)</div>
            <div className="an-test-list">
              {sessions.map((s, i) => (
                <button key={i} className="an-test-row" onClick={() => setDetail(s)}>
                  <div className="an-test-left">
                    <span className="an-test-topic">{s.topic}</span>
                    <span className="an-test-date">{s.date}</span>
                  </div>
                  <div className="an-test-right">
                    <div className="an-test-bar-wrap">
                      <div className="an-test-bar-fill" style={{ width: `${s.score / s.total * 100}%` }} />
                    </div>
                    <span className="an-test-score">{s.score}/{s.total}</span>
                  </div>
                  <span className="an-test-arrow">›</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Test Detail View ──────────────────────────────────────────────────────────
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

      {/* ── Overview row ── */}
      <div className="an-overview-row">
        <div className="an-overview-donut">
          <DonutChart correct={score} total={total} />
          <div className={`an-pct-label ${scorePct >= 80 ? "good" : scorePct >= 50 ? "mid" : "bad"}`}>
            {scorePct}%
          </div>
        </div>
        <div className="an-overview-stats">
          <div className="an-ov-stat"><span className="an-ov-val">{avgTime}s</span><span className="an-ov-lbl">Avg Time</span></div>
          <div className="an-ov-stat">
            <span className="an-ov-val" style={{ color: "#22c55e" }}>{h.filter(x => x.isCorrect).length}</span>
            <span className="an-ov-lbl">Correct</span>
          </div>
          <div className="an-ov-stat">
            <span className="an-ov-val" style={{ color: "#ef4444" }}>{h.filter(x => !x.isCorrect).length}</span>
            <span className="an-ov-lbl">Wrong</span>
          </div>
        </div>
        <div className="an-diff-summary">
          {["easy", "medium", "hard"].map(d => (
            <div key={d} className="an-ds-pill" style={{ background: DIFF_COL[d] }}>
              {diffCounts[d]} {d}
            </div>
          ))}
        </div>
      </div>

      {/* ── Difficulty progression chart ── */}
      <div className="an-card">
        <div className="an-card-title">📈 Difficulty Progression</div>
        <p className="an-hint">Colored dots = difficulty (🟢=Easy 🟡=Medium 🔴=Hard). ✓/✗ = correct/wrong.</p>
        <DifficultyChart history={h} />
      </div>

      {/* ── Time per question chart ── */}
      <div className="an-card">
        <div className="an-card-title">⏱ Time Per Question</div>
        <p className="an-hint">🟣 correct, 🔴 wrong. Fastest: Q{h.indexOf(fastestQ) + 1} ({(fastestQ.timeTaken / 1000).toFixed(1)}s) · Slowest: Q{h.indexOf(slowestQ) + 1} ({(slowestQ.timeTaken / 1000).toFixed(1)}s)</p>
        <TimeChart history={h} />
      </div>

      {/* ── Question breakdown table ── */}
      <div className="an-card">
        <div className="an-card-title">📋 Question Breakdown</div>
        <table className="results-table">
          <thead>
            <tr><th>#</th><th>Question</th><th>Difficulty</th><th>Time</th><th>Your Answer</th><th>Result</th></tr>
          </thead>
          <tbody>
            {h.map((q, i) => (
              <tr key={i} className={q.isCorrect ? "row-correct" : "row-wrong"}>
                <td>{i + 1}</td>
                <td className="q-cell">{q.question}</td>
                <td>
                  <span className="diff-pill" style={{ background: DIFF_COL[q.difficulty] }}>{q.difficulty}</span>
                </td>
                <td>{(q.timeTaken / 1000).toFixed(1)}s</td>
                <td>{q.selected}</td>
                <td>{q.isCorrect ? "✅" : `❌ (${q.correct})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── AI Feedback ── */}
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
      {/* Analytics button pinned to bottom */}
      <button className="sidebar-analytics-btn" onClick={onAnalytics}>
        📊 Analytics
      </button>
    </aside>
  );
}

// ── Review modal (quick peek from sidebar) ────────────────────────────────────
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
          <thead>
            <tr><th>#</th><th>Question</th><th>Diff</th><th>Time</th><th>Result</th></tr>
          </thead>
          <tbody>
            {(session.history || []).map((h, i) => (
              <tr key={i} className={h.isCorrect ? "row-correct" : "row-wrong"}>
                <td>{i + 1}</td>
                <td className="q-cell">{h.question}</td>
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
  const [loading, setLoading] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState([]);
  const [askedQuestions, setAskedQuestions] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [sessions, setSessions] = useState(loadSessions);
  const [reviewSession, setReviewSession] = useState(null);
  const startTimeRef = useRef(null);

  async function startQuiz() {
    if (!topic.trim()) return;
    setLoading(true);
    const res = await fetch(`${API}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
    const data = await res.json();
    setQuestion(data.question); setDifficulty(data.difficulty);
    setAskedQuestions([data.question.question]); setQIndex(1);
    setSelected(null); setRevealed(false); setHistory([]); setFeedback("");
    setLoading(false); setScreen("quiz");
    startTimeRef.current = Date.now();
  }

  function confirm(choice) { if (!revealed) { setSelected(choice); setRevealed(true); } }

  async function fetchFeedback(finalHistory) {
    setFeedbackLoading(true);
    try {
      const res = await fetch(`${API}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, history: finalHistory }) });
      const data = await res.json();
      const text = data.feedback || "";
      setFeedback(text);
      setSessions(prev => {
        const updated = [...prev];
        if (updated[0]?.topic === topic) updated[0].feedback = text;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch { setFeedback("Could not generate feedback."); }
    setFeedbackLoading(false);
  }

  async function handleNext() {
    const timeTaken = Date.now() - startTimeRef.current;
    const isCorrect = selected === question.correct;
    const entry = { question: question.question, difficulty, timeTaken, isCorrect, selected, correct: question.correct };
    const newHistory = [...history, entry];
    setHistory(newHistory);

    if (qIndex >= TOTAL_QUESTIONS) {
      const session = {
        topic, score: newHistory.filter(h => h.isCorrect).length, total: TOTAL_QUESTIONS,
        date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        history: newHistory, feedback: ""
      };
      saveSession(session); setSessions(loadSessions());
      setScreen("results"); fetchFeedback(newHistory);
      return;
    }

    setLoading(true);
    const res = await fetch(`${API}/next`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, answer: selected, time_taken_ms: timeTaken, is_correct: isCorrect, current_difficulty: difficulty, asked_questions: askedQuestions })
    });
    const data = await res.json();
    setQuestion(data.question); setDifficulty(data.difficulty);
    setAskedQuestions(prev => [...prev, data.question.question]);
    setQIndex(i => i + 1); setSelected(null); setRevealed(false); setLoading(false);
    startTimeRef.current = Date.now();
  }

  function restart() { setScreen("start"); setTopic(""); setHistory([]); setFeedback(""); }
  const score = history.filter(h => h.isCorrect).length;

  return (
    <div className="app-layout">
      <Sidebar sessions={sessions} onReview={setReviewSession} onAnalytics={() => setScreen("analytics")} />

      <main className="main-content">
        {/* Analytics dashboard */}
        {screen === "analytics" && (
          <div className="an-wrapper">
            <AnalyticsDashboard sessions={sessions} onBack={() => setScreen("start")} />
          </div>
        )}

        {/* Start */}
        {screen === "start" && (
          <div className="card start-card">
            <h1>Adaptive MCQ Quiz</h1>
            <p className="subtitle">Answer faster → harder questions. Take your time → easier ones.</p>
            <input className="topic-input" placeholder="Enter a topic (e.g. Python, History…)"
              value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && startQuiz()} />
            <button className="btn primary" onClick={startQuiz} disabled={loading || !topic.trim()}>
              {loading ? "Loading…" : "Start Quiz →"}
            </button>
          </div>
        )}

        {/* Results */}
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

        {/* Quiz */}
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

      <ReviewModal session={reviewSession} onClose={() => setReviewSession(null)} />
    </div>
  );
}
