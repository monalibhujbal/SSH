import json
import os
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv

from db import init_db, get_or_create_user, update_user_difficulty, save_question, get_question, get_nearest_question, log_interaction
from difficulty import compute_next_difficulty, difficulty_to_label, label_to_difficulty, label_to_expected_time

load_dotenv()

app = Flask(__name__)
CORS(app)
init_db()   # create tables on startup (idempotent)

client = Groq()

# ── Difficulty label thresholds ───────────────────────────────────────────────
# Expected response times per difficulty — used by /next to judge speed
EXPECTED_TIME_MS = {"easy": 15_000, "medium": 25_000, "hard": 45_000}

# ── Groq question generator ───────────────────────────────────────────────────
SYSTEM_PROMPT = """You are an MCQ generator. Always respond with ONLY valid JSON (no markdown, no extra text).
Format:
{
  "question": "...",
  "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "correct": "A",
  "explanation": "..."
}"""

def _try_repair_json(text: str) -> dict:
    """
    Last-resort repair for truncated JSON from the model.
    Tries json.loads first; if that fails, attempts to close open braces/brackets
    and retries once, which recovers truncated 'explanation' fields gracefully.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Count unclosed braces/brackets and close them
        repairable = text.rstrip()
        # If the last char is a comma or partial key, trim it
        while repairable and repairable[-1] in (',', ':', '"'):
            repairable = repairable[:-1]
        # Close any open string
        if repairable.count('"') % 2 == 1:
            repairable += '"'
        # Close open structures
        opens = {'[': ']', '{': '}'}
        closes = {']', '}'}
        stack = []
        for ch in repairable:
            if ch in opens:
                stack.append(opens[ch])
            elif ch in closes and stack:
                stack.pop()
        repairable += ''.join(reversed(stack))
        return json.loads(repairable)


# Per-proficiency calibration context for the prompt
PROFICIENCY_CONTEXT = {
    "beginner": (
        "The student is a BEGINNER. "
        "Easy = foundational recall (definitions, basic syntax). "
        "Medium = simple application of one concept. "
        "Hard = slightly more involved scenario still accessible to a beginner."
    ),
    "intermediate": (
        "The student is INTERMEDIATE. "
        "Easy = comfortable recall of established concepts. "
        "Medium = multi-step application or comparison between concepts. "
        "Hard = edge-cases, nuanced distinctions, or synthesis of two concepts."
    ),
    "advanced": (
        "The student is ADVANCED / EXPERT level. "
        "Easy = solid conceptual recall that experts handle quickly. "
        "Medium = tricky edge-cases or deep implementation details. "
        "Hard = expert-level, real-world scenarios requiring in-depth knowledge."
    ),
}


def generate_question(
    topic: str,
    difficulty_label: str,
    asked_questions: list[str],
    proficiency: str = "intermediate",
) -> dict:
    avoid = ""
    if asked_questions:
        avoid = "\nDo NOT repeat these questions:\n" + "\n".join(f"- {q}" for q in asked_questions)

    prof_ctx = PROFICIENCY_CONTEXT.get(proficiency.lower(), PROFICIENCY_CONTEXT["intermediate"])

    user_msg = (
        f"{prof_ctx}\n\n"
        f"Generate a {difficulty_label} difficulty MCQ about: {topic}.{avoid}\n"
        "Return ONLY the JSON object. Keep the explanation under 30 words."
    )

    # Non-streaming is required for reasoning models (openai/gpt-oss-120b routes
    # reasoning tokens separately from delta.content, making streamed text empty).
    completion = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        temperature=1,
        max_completion_tokens=1500,
        top_p=1,
        reasoning_effort="medium",
        stream=False,
        stop=None,
    )

    text = (completion.choices[0].message.content or "").strip()

    # Strip markdown fences if the model wraps the JSON
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1].lstrip("json").strip()

    if not text:
        raise ValueError("Groq returned an empty response — check your API key and model access.")

    return _try_repair_json(text)



def _persist_and_return(topic: str, difficulty_label: str, q: dict, asked: list[str]) -> dict:
    """Save a Groq-generated question to DB and return a response dict."""
    qid = str(uuid.uuid4())
    diff_num = label_to_difficulty(difficulty_label)
    exp_time = label_to_expected_time(difficulty_label)
    save_question(qid, topic, q, diff_num, exp_time)
    return {
        "question_id": qid,
        "question": q,
        "difficulty": difficulty_label,
        "difficulty_numeric": diff_num,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Route 1 /start  — generate the first question (medium, user-chosen topic)
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/start", methods=["POST"])
def start_quiz():
    data        = request.get_json()
    topic       = data.get("topic", "General Knowledge")
    proficiency = data.get("proficiency", "intermediate")
    user_id     = data.get("userId", "anonymous")

    get_or_create_user(user_id)
    q = generate_question(topic, "medium", [], proficiency)
    return jsonify(_persist_and_return(topic, "medium", q, []))


# ═══════════════════════════════════════════════════════════════════════════════
# Route 2 /next  — simple time-based difficulty (legacy, 5-question flow)
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/next", methods=["POST"])
def next_question():
    data            = request.get_json()
    topic           = data.get("topic", "General Knowledge")
    time_ms         = data.get("time_taken_ms", 0)
    is_correct      = data.get("is_correct", False)
    current_diff    = data.get("current_difficulty", "medium")
    asked           = data.get("asked_questions", [])
    proficiency     = data.get("proficiency", "intermediate")

    levels   = ["easy", "medium", "hard"]
    idx      = levels.index(current_diff)
    expected = EXPECTED_TIME_MS.get(current_diff, 25_000)

    if not is_correct:
        idx = max(idx - 1, 0)
    elif time_ms <= expected:
        idx = min(idx + 1, 2)

    new_label = levels[idx]
    q = generate_question(topic, new_label, asked, proficiency)
    return jsonify(_persist_and_return(topic, new_label, q, asked))


# ═══════════════════════════════════════════════════════════════════════════════
# Route 3 /feedback  — AI-generated personalised study note after the quiz
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/feedback", methods=["POST"])
def generate_feedback():
    """
    Expected payload:
    {
      "topic": "Python",
      "history": [
        {
          "question":   "What does len() do?",
          "difficulty": "easy",
          "timeTaken":  8200,
          "isCorrect":  true,
          "selected":   "A",
          "correct":    "A"
        }, ...
      ]
    }
    Returns: { "feedback": "<multi-line text>" }
    """
    data    = request.get_json(force=True)
    topic   = data.get("topic", "General Knowledge")
    history = data.get("history", [])

    if not history:
        return jsonify({"feedback": "No quiz data to analyse."})

    # Build a readable summary of every question for the prompt
    lines = []
    for i, h in enumerate(history, 1):
        status   = "✅ Correct" if h.get("isCorrect") else "❌ Wrong"
        time_s   = round(h.get("timeTaken", 0) / 1000, 1)
        diff     = h.get("difficulty", "medium")
        q_text   = h.get("question", "")
        selected = h.get("selected", "?")
        correct  = h.get("correct", "?")
        line = f"Q{i} [{diff.upper()}] {status} in {time_s}s — \"{q_text}\""
        if not h.get("isCorrect"):
            line += f" (chose {selected}, correct was {correct})"
        lines.append(line)

    summary_block = "\n".join(lines)
    score = sum(1 for h in history if h.get("isCorrect"))

    prompt = f"""A student just completed a {len(history)}-question adaptive MCQ quiz on "{topic}".
They scored {score}/{len(history)}.

Here is a breakdown of every question:
{summary_block}

Write a short, encouraging, and personalised study note (3–5 sentences) for this student that:
1. Acknowledges their overall performance warmly.
2. Identifies the specific weak areas or question types they struggled with (use the data above).
3. Gives 1–2 concrete, actionable study tips to improve.
4. Ends with a motivating closing line.

Write in second person ("You did well on…"). Be specific — reference the actual topics from the questions they got wrong. Do NOT use bullet points or headers, just flowing paragraphs."""

    completion = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": "You are a supportive and insightful study coach."},
            {"role": "user",   "content": prompt},
        ],
        temperature=1,
        max_completion_tokens=400,
        top_p=1,
        reasoning_effort="medium",
        stream=False,
        stop=None,
    )

    feedback_text = (completion.choices[0].message.content or "").strip()
    return jsonify({"feedback": feedback_text})


# ═══════════════════════════════════════════════════════════════════════════════
# Route 3 /submit  — full adaptive engine (ΔD formula)
# ═══════════════════════════════════════════════════════════════════════════════
@app.route("/submit", methods=["POST"])
def submit_answer():
    """
    Expected payload:
    {
      "userId":          "user_789",
      "questionId":      "q_101",
      "timeTakenMs":     14500,
      "finalAnswer":     "B",
      "confidenceLevel": "HIGH",
      "interactionLog":  [ {...}, ... ]
    }

    Returns:
    {
      "result":          { "correct": true, "correct_answer": "B", "explanation": "..." },
      "algorithm":       { "delta_d": 0.58, "d_prev": 5.0, "d_next": 5.58 },
      "next_question":   { ... }   // null when no stored question is available
    }
    """
    payload = request.get_json(force=True)

    user_id         = payload.get("userId", "anonymous")
    question_id     = payload.get("questionId")
    time_taken_ms   = int(payload.get("timeTakenMs", 0))
    final_answer    = payload.get("finalAnswer", "")
    confidence      = payload.get("confidenceLevel", "MEDIUM")
    interaction_log = payload.get("interactionLog", [])

    # ── 1. Fetch the answered question from DB ────────────────────────────────
    q_row = get_question(question_id)
    if not q_row:
        return jsonify({"error": f"Question '{question_id}' not found in database"}), 404

    correct_answer   = q_row["correct_answer"]
    expected_time_ms = q_row["expected_time_ms"]
    topic            = q_row["topic"]

    is_correct = (final_answer.upper() == correct_answer.upper())
    a_score    = 1 if is_correct else -1

    # ── 2. Fetch user's current difficulty ────────────────────────────────────
    d_current = get_or_create_user(user_id)

    # ── 3. Run the adaptive difficulty formula ────────────────────────────────
    d_next, delta_d = compute_next_difficulty(
        current_difficulty=d_current,
        a_score=a_score,
        time_taken_ms=time_taken_ms,
        expected_time_ms=expected_time_ms,
        confidence_level=confidence,
        interaction_log=interaction_log,
        alpha=0.5,
        beta=0.3,
        gamma=0.2,
    )

    # ── 4. Persist updated difficulty + log ───────────────────────────────────
    update_user_difficulty(user_id, d_next)
    log_interaction(user_id, question_id, payload, delta_d, d_next)

    # ── 5. Find next question from DB (nearest difficulty, same topic first) ──
    next_q_row = get_nearest_question(d_next, exclude_id=question_id, topic=topic)
    if not next_q_row:
        # Fall back to cross-topic search
        next_q_row = get_nearest_question(d_next, exclude_id=question_id)

    next_question_payload = None
    if next_q_row:
        next_question_payload = {
            "question_id":       next_q_row["question_id"],
            "question":          {
                "question":     next_q_row["question_text"],
                "options":      next_q_row["options"],
                "correct":      next_q_row["correct_answer"],
                "explanation":  "",            # stored questions omit explanation
            },
            "difficulty":         difficulty_to_label(next_q_row["difficulty"]),
            "difficulty_numeric": next_q_row["difficulty"],
        }

    return jsonify({
        "result": {
            "correct":        is_correct,
            "correct_answer": correct_answer,
            "explanation":    q_row.get("explanation", ""),
            "your_answer":    final_answer,
        },
        "algorithm": {
            "delta_d":  delta_d,
            "d_prev":   d_current,
            "d_next":   d_next,
            "label":    difficulty_to_label(d_next),
            # Breakdown for frontend transparency:
            "breakdown": {
                "alpha":              0.5,
                "beta":               0.3,
                "gamma":              0.2,
                "a_score":            a_score,
                "time_taken_ms":      time_taken_ms,
                "expected_time_ms":   expected_time_ms,
                "confidence_level":   confidence,
                "option_changes":     sum(1 for e in interaction_log if e.get("action") == "CHANGED_OPTION"),
            },
        },
        "next_question": next_question_payload,
    })


# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app.run(debug=True, port=8000)
