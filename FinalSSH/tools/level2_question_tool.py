"""
tools/level2_question_tool.py
──────────────────────────────
Level 2 Agent — "Why / Explain / Scenario" question generator.
Supports easy / medium / hard difficulty variants within the level,
calibrated to the student's proficiency band.

Exports: create_level2_question_tool(groq_client) → Tool
"""

from tools import Tool, repair_json

_SYSTEM_PROMPT = """\
You are an expert assessment designer specialising in conceptual-understanding questions.
Generate ONE open-ended question that requires the student to EXPLAIN or REASON — not just recall a fact.
Question types you may use: "Why…", "Explain why…", "In the following scenario, why does…",
"What would happen if… and why".
Always respond with ONLY valid JSON, no markdown, no extra text.
Format:
{
  "question": "...",
  "hint": "...",
  "sample_answer": "...",
  "max_score": 10
}
- hint        : 1 sentence nudging the student without giving the answer.
- sample_answer : Complete ideal answer, 2–4 sentences.
"""

# ── Difficulty calibration within Level 2 ────────────────────────────────────
_DIFFICULTY_CONTEXT = {
    "easy":   "Ask about ONE simple, direct cause-effect relationship. One clear 'why' with a well-defined answer.",
    "medium": "Ask about a multi-step scenario requiring explanation of 2–3 connected causes or consequences.",
    "hard":   "Ask about a nuanced scenario involving competing factors, exceptions, or counterintuitive behaviour.",
}

# ── Proficiency calibration ───────────────────────────────────────────────────
_PROFICIENCY_CONTEXT = {
    "beginner":     "Keep the scenario simple; focus on foundational cause-effect concepts.",
    "intermediate": "Use realistic scenarios; expect multi-step reasoning.",
    "advanced":     "Use complex, nuanced scenarios; expect deep mechanistic explanation.",
}

# ── JSON Schema ───────────────────────────────────────────────────────────────
L2_QUESTION_PARAMETERS: dict = {
    "type": "object",
    "properties": {
        "topic": {"type": "string", "description": "Subject topic."},
        "difficulty": {
            "type": "string",
            "enum": ["easy", "medium", "hard"],
            "description": "Difficulty level within L2 (calibrated to student performance).",
        },
        "proficiency": {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"],
            "description": "Student's overall proficiency level.",
        },
        "asked_questions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Questions already asked this session (avoid repeats).",
        },
    },
    "required": ["topic"],
}


def _generate(groq_client, topic: str, difficulty: str,
              proficiency: str, asked_questions: list[str]) -> dict:
    avoid = ""
    if asked_questions:
        avoid = "\nDo NOT repeat these questions:\n" + "\n".join(f"- {q}" for q in asked_questions)

    diff_ctx = _DIFFICULTY_CONTEXT.get(difficulty, _DIFFICULTY_CONTEXT["medium"])
    prof_ctx = _PROFICIENCY_CONTEXT.get(proficiency.lower(), _PROFICIENCY_CONTEXT["intermediate"])

    user_msg = (
        f"Proficiency: {proficiency}. {prof_ctx}\n"
        f"Difficulty within this level: {difficulty}. {diff_ctx}\n\n"
        f"Topic: {topic}{avoid}\n"
        "Generate a WHY / EXPLAIN / SCENARIO question. Return ONLY the JSON."
    )

    completion = groq_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        temperature=1,
        max_completion_tokens=1000,
        top_p=1,
        reasoning_effort="medium",
        stream=False,
        stop=None,
    )

    text = (completion.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    if not text:
        raise ValueError("Groq returned an empty response for L2 question.")
    return repair_json(text)


def create_level2_question_tool(groq_client) -> Tool:
    """Factory: L2 question tool with Groq client injected."""
    def func(topic: str, difficulty: str = "medium", proficiency: str = "intermediate",
             asked_questions: list[str] | None = None) -> dict:
        return _generate(groq_client, topic, difficulty, proficiency, asked_questions or [])

    return Tool(
        name="generate_why_question",
        description=(
            "Generate a 'Why / Explain / Scenario' open-ended question for Level 2 assessment. "
            "Supports easy/medium/hard difficulty calibration within the level. "
            "Returns {question, hint, sample_answer, max_score}."
        ),
        parameters=L2_QUESTION_PARAMETERS,
        func=func,
    )
