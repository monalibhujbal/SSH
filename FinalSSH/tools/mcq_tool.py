"""
tools/mcq_tool.py
─────────────────
Generates adaptive multiple-choice questions using Groq (openai/gpt-oss-120b).
Exports create_mcq_tool(groq_client) → Tool.
"""

import json
from tools import Tool

# ── System prompt sent to the question-generation model ───────────────────────
_SYSTEM_PROMPT = """\
You are an MCQ generator. Always respond with ONLY valid JSON (no markdown, no extra text).
Format:
{
  "question": "...",
  "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "correct": "A",
  "explanation": "..."
}"""

# ── Per-proficiency calibration context ───────────────────────────────────────
PROFICIENCY_CONTEXT: dict[str, str] = {
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

# ── JSON Schema for the tool (used by the LLM orchestrator) ───────────────────
MCQ_PARAMETERS: dict = {
    "type": "object",
    "properties": {
        "topic": {
            "type": "string",
            "description": "Subject topic for the question (e.g. 'Python', 'World War II').",
        },
        "difficulty": {
            "type": "string",
            "enum": ["easy", "medium", "hard"],
            "description": "Desired difficulty level within the student's proficiency band.",
        },
        "proficiency": {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"],
            "description": "Overall proficiency level of the student (calibrates question depth).",
        },
        "asked_questions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of question texts already asked this session (to avoid repeats).",
        },
    },
    "required": ["topic", "difficulty"],
}


# ── Private helpers ────────────────────────────────────────────────────────────

def _try_repair_json(text: str) -> dict:
    """
    Last-resort JSON repair for truncated model responses.
    Closes any open string, array, or object and retries json.loads once.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        repairable = text.rstrip()
        while repairable and repairable[-1] in (",", ":", '"'):
            repairable = repairable[:-1]
        if repairable.count('"') % 2 == 1:
            repairable += '"'
        opens = {"[": "]", "{": "}"}
        closes = {"]", "}"}
        stack: list[str] = []
        for ch in repairable:
            if ch in opens:
                stack.append(opens[ch])
            elif ch in closes and stack:
                stack.pop()
        repairable += "".join(reversed(stack))
        return json.loads(repairable)


def _generate_mcq(
    groq_client,
    topic: str,
    difficulty: str,
    proficiency: str = "intermediate",
    asked_questions: list[str] | None = None,
) -> dict:
    """Core implementation — calls Groq and returns a validated question dict."""
    asked_questions = asked_questions or []
    avoid = ""
    if asked_questions:
        avoid = "\nDo NOT repeat these questions:\n" + "\n".join(f"- {q}" for q in asked_questions)

    prof_ctx = PROFICIENCY_CONTEXT.get(proficiency.lower(), PROFICIENCY_CONTEXT["intermediate"])

    user_msg = (
        f"{prof_ctx}\n\n"
        f"Generate a {difficulty} difficulty MCQ about: {topic}.{avoid}\n"
        "Return ONLY the JSON object. Keep the explanation under 30 words."
    )

    # Non-streaming required: reasoning models route reasoning tokens separately,
    # which makes streamed delta.content empty.
    completion = groq_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
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

    # Strip markdown fences if model wraps the JSON
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1].lstrip("json").strip()

    if not text:
        raise ValueError("Groq returned an empty response — check API key and model access.")

    return _try_repair_json(text)


# ── Public factory ─────────────────────────────────────────────────────────────

def create_mcq_tool(groq_client) -> Tool:
    """
    Build and return the generate_mcq Tool with the Groq client injected.

    Usage in main.py:
        agent.register(create_mcq_tool(client))
    """
    def func(
        topic: str,
        difficulty: str,
        proficiency: str = "intermediate",
        asked_questions: list[str] | None = None,
    ) -> dict:
        return _generate_mcq(groq_client, topic, difficulty, proficiency, asked_questions)

    return Tool(
        name="generate_mcq",
        description=(
            "Generate a fresh multiple-choice question for a given topic and difficulty level, "
            "calibrated to the student's proficiency band. Returns a dict with keys: "
            "question, options (A-D), correct (letter), explanation."
        ),
        parameters=MCQ_PARAMETERS,
        func=func,
    )
