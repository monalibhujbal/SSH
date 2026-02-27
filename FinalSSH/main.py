"""
main.py  —  Flask API
───────────────────────
Three-agent adaptive quiz backend.

AGENT MAP
─────────
  level1_agent  → generate_mcq, generate_feedback          (L1 — Knowledge, MCQ)
  level2_agent  → generate_why_question, evaluate_why_answer (L2 — Understanding, open text)
  level3_agent  → generate_scenario, evaluate_scenario       (L3 — Mastery, decision tree)

LEVEL 3 DESIGN (new)
─────────────────────
  L3 is now a Branching Decision Tree:
  • Real-world crisis / strategic scenario
  • 3 sequential decisions (each builds on the previous consequence)
  • Evaluated for individual quality AND cross-decision consistency
  • Consistency score = the "Expert" signal

ADAPTIVE ROUTES (unified flow)
────────────────────────────────
  POST /adaptive/start  → first question, always L1 medium
  POST /adaptive/next   → auto-selects L1/L2/L3 + difficulty, based on scores

MANUAL ROUTES (still usable)
──────────────────────────────
  POST /start  /next  /feedback  /submit   ← L1 MCQ (unchanged)
  POST /l2/question  /l2/evaluate          ← L2 open question
  POST /l3/question  /l3/evaluate          ← L3 decision-tree scenario

Level progression (rolling last-2 window)
──────────────────────────────────────────
  L1 → L2 : avg ≥ 80%
  L2 → L3 : avg ≥ 75%
  Drop down : avg < 35%

Difficulty thresholds per level (milliseconds)
───────────────────────────────────────────────
  L1: easy 15s  medium 25s  hard 45s
  L2: easy 60s  medium 90s  hard 150s
  L3: easy 5min medium 8min hard 12min  (scenarios take much longer)
"""

import uuid
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv

from agent import QuizAgent
from tools.mcq_tool              import create_mcq_tool
from tools.feedback_tool         import create_feedback_tool
from tools.level2_question_tool  import create_level2_question_tool
from tools.level2_eval_tool      import create_level2_eval_tool
from tools.level3_question_tool  import create_level3_question_tool
from tools.level3_eval_tool      import create_level3_eval_tool
from db import (
    init_db, get_or_create_user, update_user_difficulty,
    save_question, get_question, get_nearest_question, log_interaction,
)
from difficulty import (
    compute_next_difficulty, difficulty_to_label,
    label_to_difficulty, label_to_expected_time,
)

# ── Bootstrap ─────────────────────────────────────────────────────────────────
load_dotenv()
logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)
init_db()
client = Groq()

# ── Build agents ──────────────────────────────────────────────────────────────
level1_agent = (
    QuizAgent(client)
    .register(create_mcq_tool(client))
    .register(create_feedback_tool(client))
)

level2_agent = (
    QuizAgent(client)
    .register(create_level2_question_tool(client))
    .register(create_level2_eval_tool(client))
)

level3_agent = (
    QuizAgent(client)
    .register(create_level3_question_tool(client))  # → tool name: "generate_scenario"
    .register(create_level3_eval_tool(client))       # → tool name: "evaluate_scenario"
)

# ── Interview Agent ───────────────────────────────────────────────────────────
from tools.interview_tool import (
    create_interview_question_tool,
    create_interview_eval_tool,
    create_interview_analysis_tool,
)

interview_agent = (
    QuizAgent(client)
    .register(create_interview_question_tool(client))
    .register(create_interview_eval_tool(client))
    .register(create_interview_analysis_tool(client))
)

# ── Expected response time per level × difficulty (ms) ───────────────────────
EXPECTED_TIME_MS = {
    1: {"easy":  15_000, "medium":  25_000, "hard":  45_000},
    2: {"easy":  60_000, "medium":  90_000, "hard": 150_000},
    3: {"easy": 300_000, "medium": 480_000, "hard": 720_000},  # scenarios are long
}

LEVELS = ["easy", "medium", "hard"]


# ── Adaptive helpers ───────────────────────────────────────────────────────────

def _adapt_difficulty(level: int, current_diff: str,
                      is_good: bool, time_ms: int) -> str:
    """Difficutly up (correct + fast), down (poor/slow), or stay."""
    idx      = LEVELS.index(current_diff)
    expected = EXPECTED_TIME_MS[level].get(current_diff, 25_000)
    if not is_good:
        idx = max(idx - 1, 0)
    elif time_ms <= expected:
        idx = min(idx + 1, 2)
    return LEVELS[idx]


def _adapt_level(current_level: int, recent_score_pcts: list[float]) -> int:
    """Auto-transition L1↔L2↔L3 based on rolling 2-question score window."""
    if not recent_score_pcts:
        return current_level
    window = recent_score_pcts[-2:]
    avg    = sum(window) / len(window)

    if current_level == 1 and avg >= 80:
        logging.info("Level UP: L1 → L2 (avg %.0f%%)", avg)
        return 2
    if current_level == 2:
        if avg >= 75:
            logging.info("Level UP: L2 → L3 (avg %.0f%%)", avg)
            return 3
        if avg < 35:
            logging.info("Level DOWN: L2 → L1 (avg %.0f%%)", avg)
            return 1
    if current_level == 3 and avg < 35:
        logging.info("Level DOWN: L3 → L2 (avg %.0f%%)", avg)
        return 2
    return current_level


def _generate_for_level(level: int, topic: str, difficulty: str,
                        proficiency: str, asked: list[str]) -> dict:
    """Dispatch to correct agent and attach type/level/difficulty metadata."""
    if level == 1:
        q = level1_agent.call(
            "generate_mcq",
            topic=topic, difficulty=difficulty,
            proficiency=proficiency, asked_questions=asked,
        )
        return {**q, "type": "mcq", "level": 1, "difficulty": difficulty}

    if level == 2:
        q = level2_agent.call(
            "generate_why_question",
            topic=topic, difficulty=difficulty,
            proficiency=proficiency, asked_questions=asked,
        )
        return {**q, "type": "open", "level": 2, "difficulty": difficulty}

    # ── Level 3: Branching Decision Tree ──────────────────────────────────────
    try:
        q = level3_agent.call(
            "generate_scenario",
            topic=topic, difficulty=difficulty,
            proficiency=proficiency, asked_questions=asked,
        )
        # Sanity-check the returned structure
        if not q.get("scenario") or not q.get("decision_points"):
            raise ValueError("Scenario response is missing required fields.")
        return {**q, "type": "scenario", "level": 3, "difficulty": difficulty}
    except Exception as e:
        logging.error("L3 scenario generation failed (%s). Falling back to L2.", e)
        # Graceful fallback: give an L2 open question instead
        q = level2_agent.call(
            "generate_why_question",
            topic=topic, difficulty=difficulty,
            proficiency=proficiency, asked_questions=asked,
        )
        return {**q, "type": "open", "level": 2, "difficulty": difficulty,
                "_fallback": True}


def _persist_and_return(topic: str, difficulty_label: str, q: dict, asked: list) -> dict:
    qid = str(uuid.uuid4())
    save_question(qid, topic, q, label_to_difficulty(difficulty_label), label_to_expected_time(difficulty_label))
    return {"question_id": qid, "question": q, "difficulty": difficulty_label,
            "difficulty_numeric": label_to_difficulty(difficulty_label)}


# ══════════════════════════════════════════════════════════════════════════════
#  ADAPTIVE ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/adaptive/start", methods=["POST"])
def adaptive_start():
    """
    Start an adaptive quiz. Always begins at L1 / medium.
    Payload: { topic, proficiency?, userId? }
    Returns: { question: {type, level, difficulty, ...} }
    """
    data        = request.get_json()
    topic       = data.get("topic", "General Knowledge")
    proficiency = data.get("proficiency", "intermediate")
    get_or_create_user(data.get("userId", "anonymous"))
    q = _generate_for_level(1, topic, "medium", proficiency, [])
    return jsonify({"question": q})


@app.route("/adaptive/next", methods=["POST"])
def adaptive_next():
    """
    Adaptive next question — auto-selects level AND difficulty.

    Payload:
    {
      "topic":            str,
      "proficiency":      str,
      "current_level":    int,   1|2|3
      "current_difficulty": str, easy|medium|hard
      "last_score_pct":   float, 0-100 (MCQ: 100=correct, open/scenario: score%)
      "time_taken_ms":    int,
      "recent_score_pcts": [float],
      "asked_questions":  [str]
    }
    Returns: { question, new_level, new_difficulty, recent_scores }
    """
    data          = request.get_json()
    topic         = data.get("topic", "General Knowledge")
    proficiency   = data.get("proficiency", "intermediate")
    cur_level     = int(data.get("current_level", 1))
    cur_diff      = data.get("current_difficulty", "medium")
    last_score    = float(data.get("last_score_pct", 50))
    time_ms       = int(data.get("time_taken_ms", 0))
    recent_scores = list(data.get("recent_score_pcts", []))
    asked         = data.get("asked_questions", [])

    try:
        recent_scores.append(last_score)
        new_level = _adapt_level(cur_level, recent_scores)

        if new_level != cur_level:
            new_diff = "medium"   # reset on level transition
        else:
            new_diff = _adapt_difficulty(cur_level, cur_diff, last_score >= 60, time_ms)

        q = _generate_for_level(new_level, topic, new_diff, proficiency, asked)
        return jsonify({"question": q, "new_level": new_level,
                        "new_difficulty": new_diff, "recent_scores": recent_scores})
    except Exception as e:
        logging.exception("adaptive_next failed: %s", e)
        return jsonify({"error": str(e), "detail": "Failed to generate next question"}), 500


# ══════════════════════════════════════════════════════════════════════════════
#  LEVEL 1 ROUTES  (MCQ — unchanged)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/start", methods=["POST"])
def start_quiz():
    data        = request.get_json()
    topic       = data.get("topic", "General Knowledge")
    proficiency = data.get("proficiency", "intermediate")
    get_or_create_user(data.get("userId", "anonymous"))
    q = level1_agent.call("generate_mcq", topic=topic, difficulty="medium",
                          proficiency=proficiency, asked_questions=[])
    return jsonify(_persist_and_return(topic, "medium", q, []))


@app.route("/next", methods=["POST"])
def next_question():
    data         = request.get_json()
    topic        = data.get("topic", "General Knowledge")
    time_ms      = data.get("time_taken_ms", 0)
    is_correct   = data.get("is_correct", False)
    cur_diff     = data.get("current_difficulty", "medium")
    asked        = data.get("asked_questions", [])
    proficiency  = data.get("proficiency", "intermediate")
    new_diff     = _adapt_difficulty(1, cur_diff, is_correct, time_ms)
    q = level1_agent.call("generate_mcq", topic=topic, difficulty=new_diff,
                          proficiency=proficiency, asked_questions=asked)
    return jsonify(_persist_and_return(topic, new_diff, q, asked))


@app.route("/feedback", methods=["POST"])
def feedback():
    data    = request.get_json(force=True)
    topic   = data.get("topic", "General Knowledge")
    history = data.get("history", [])
    if not history:
        return jsonify({"feedback": "No quiz data to analyse."})
    return jsonify(level1_agent.call("generate_feedback", topic=topic, history=history))


@app.route("/submit", methods=["POST"])
def submit_answer():
    payload         = request.get_json(force=True)
    user_id         = payload.get("userId", "anonymous")
    question_id     = payload.get("questionId")
    time_taken_ms   = int(payload.get("timeTakenMs", 0))
    final_answer    = payload.get("finalAnswer", "")
    confidence      = payload.get("confidenceLevel", "MEDIUM")
    interaction_log = payload.get("interactionLog", [])
    q_row = get_question(question_id)
    if not q_row:
        return jsonify({"error": f"Question '{question_id}' not found"}), 404
    correct_answer   = q_row["correct_answer"]
    is_correct       = (final_answer.upper() == correct_answer.upper())
    a_score          = 1 if is_correct else -1
    d_current        = get_or_create_user(user_id)
    d_next, delta_d  = compute_next_difficulty(
        current_difficulty=d_current, a_score=a_score,
        time_taken_ms=time_taken_ms, expected_time_ms=q_row["expected_time_ms"],
        confidence_level=confidence, interaction_log=interaction_log,
        alpha=0.5, beta=0.3, gamma=0.2)
    update_user_difficulty(user_id, d_next)
    log_interaction(user_id, question_id, payload, delta_d, d_next)
    next_q_row = get_nearest_question(d_next, exclude_id=question_id, topic=q_row["topic"]) or \
                 get_nearest_question(d_next, exclude_id=question_id)
    next_payload = None
    if next_q_row:
        next_payload = {"question_id": next_q_row["question_id"],
                        "question": {"question": next_q_row["question_text"], "options": next_q_row["options"],
                                     "correct": next_q_row["correct_answer"], "explanation": ""},
                        "difficulty": difficulty_to_label(next_q_row["difficulty"]),
                        "difficulty_numeric": next_q_row["difficulty"]}
    return jsonify({
        "result": {"correct": is_correct, "correct_answer": correct_answer,
                   "explanation": q_row.get("explanation", ""), "your_answer": final_answer},
        "algorithm": {"delta_d": delta_d, "d_prev": d_current, "d_next": d_next,
                      "label": difficulty_to_label(d_next)},
        "next_question": next_payload,
    })


# ══════════════════════════════════════════════════════════════════════════════
#  LEVEL 2 ROUTES  (Why/Explain — manual)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/l2/question", methods=["POST"])
def l2_question():
    data = request.get_json()
    q = level2_agent.call("generate_why_question",
                          topic=data.get("topic", "General Knowledge"),
                          difficulty=data.get("difficulty", "medium"),
                          proficiency=data.get("proficiency", "intermediate"),
                          asked_questions=data.get("asked_questions", []))
    return jsonify(q)


@app.route("/l2/evaluate", methods=["POST"])
def l2_evaluate():
    data = request.get_json(force=True)
    result = level2_agent.call("evaluate_why_answer",
                               question=data.get("question", ""),
                               user_answer=data.get("user_answer", ""),
                               sample_answer=data.get("sample_answer", ""),
                               proficiency=data.get("proficiency", "intermediate"))
    return jsonify(result)


# ══════════════════════════════════════════════════════════════════════════════
#  LEVEL 3 ROUTES  (Decision Tree — manual)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/l3/question", methods=["POST"])
def l3_question():
    """Generate a branching decision-tree scenario."""
    data = request.get_json()
    q = level3_agent.call("generate_scenario",
                          topic=data.get("topic", "General Knowledge"),
                          difficulty=data.get("difficulty", "medium"),
                          proficiency=data.get("proficiency", "intermediate"),
                          asked_questions=data.get("asked_questions", []))
    return jsonify(q)


@app.route("/l3/evaluate", methods=["POST"])
def l3_evaluate():
    """
    Evaluate all decisions in a scenario for quality AND consistency.
    Payload: { scenario, decision_points[], user_answers{}, sample_answers{}, proficiency? }
    """
    data = request.get_json(force=True)
    result = level3_agent.call(
        "evaluate_scenario",
        scenario        = data.get("scenario", ""),
        decision_points = data.get("decision_points", []),
        user_answers    = data.get("user_answers", {}),
        sample_answers  = data.get("sample_answers", {}),
        proficiency     = data.get("proficiency", "intermediate"),
    )
    return jsonify(result)


# ══════════════════════════════════════════════════════════════════════════════
#  AI INTERVIEW ROUTES  (Voice/Text one-on-one assessment)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/interview/start", methods=["POST"])
def interview_start():
    """
    Begin an AI interview session. Returns the first question.
    Payload: { topic, proficiency?, total_questions? }
    """
    data        = request.get_json()
    topic       = data.get("topic", "General Knowledge")
    proficiency = data.get("proficiency", "intermediate")
    total       = int(data.get("total_questions", 5))
    try:
        q = interview_agent.call(
            "generate_interview_question",
            topic=topic, proficiency=proficiency,
            question_num=1, total=total, asked_questions=[],
        )
        return jsonify({"question": q, "question_num": 1})
    except Exception as e:
        logging.exception("interview_start failed: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/interview/transcribe", methods=["POST"])
def interview_transcribe():
    """
    Transcribe audio using Groq Whisper.
    Accepts multipart/form-data with an 'audio' file field.
    Returns: { transcript: str }
    """
    if "audio" not in request.files:
        return jsonify({"error": "No audio file in request"}), 400
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    if not audio_bytes:
        return jsonify({"error": "Empty audio file"}), 400
    try:
        transcription = client.audio.transcriptions.create(
            file=(audio_file.filename or "recording.webm", audio_bytes, "audio/webm"),
            model="whisper-large-v3",
            response_format="text",
            language="en",
            temperature=0.0,
        )
        # Groq returns the transcript string directly for response_format="text"
        return jsonify({"transcript": transcription if isinstance(transcription, str) else transcription.text})
    except Exception as e:
        logging.exception("Whisper transcription failed: %s", e)
        return jsonify({"error": f"Transcription failed: {str(e)}"}), 500


@app.route("/interview/evaluate", methods=["POST"])
def interview_evaluate():
    """
    Semantically evaluate a candidate's spoken/typed answer.
    Payload: { question, user_answer, expected_concepts[], proficiency? }
    """
    data = request.get_json(force=True)
    try:
        result = interview_agent.call(
            "evaluate_interview_answer",
            question=data.get("question", ""),
            user_answer=data.get("user_answer", ""),
            expected_concepts=data.get("expected_concepts", []),
            proficiency=data.get("proficiency", "intermediate"),
        )
        return jsonify(result)
    except Exception as e:
        logging.exception("interview_evaluate failed: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/interview/next", methods=["POST"])
def interview_next():
    """
    Generate the next interview question.
    Payload: { topic, proficiency, question_num, total_questions, asked_questions[] }
    """
    data = request.get_json()
    try:
        q = interview_agent.call(
            "generate_interview_question",
            topic=data.get("topic", "General Knowledge"),
            proficiency=data.get("proficiency", "intermediate"),
            question_num=int(data.get("question_num", 2)),
            total=int(data.get("total_questions", 5)),
            asked_questions=data.get("asked_questions", []),
        )
        return jsonify({"question": q, "question_num": data.get("question_num", 2)})
    except Exception as e:
        logging.exception("interview_next failed: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/interview/analyze", methods=["POST"])
def interview_analyze():
    """
    Generate a comprehensive performance analysis after the interview.
    Payload: { topic, proficiency, history: [{question, user_answer, score, grade, concepts_missing}] }
    """
    data = request.get_json(force=True)
    try:
        analysis = interview_agent.call(
            "generate_interview_analysis",
            topic=data.get("topic", "General Knowledge"),
            interview_history=data.get("history", []),
            proficiency=data.get("proficiency", "intermediate"),
        )
        return jsonify(analysis)
    except Exception as e:
        logging.exception("interview_analyze failed: %s", e)
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app.run(debug=True, port=8000)

