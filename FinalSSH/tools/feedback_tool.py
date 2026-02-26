"""
tools/feedback_tool.py
───────────────────────
Generates a personalised, encouraging study-coach note after a quiz session.
Exports create_feedback_tool(groq_client) → Tool.
"""

from tools import Tool

# ── JSON Schema for the tool ───────────────────────────────────────────────────
FEEDBACK_PARAMETERS: dict = {
    "type": "object",
    "properties": {
        "topic": {
            "type": "string",
            "description": "The quiz topic (e.g. 'Python', 'World War II').",
        },
        "history": {
            "type": "array",
            "description": "List of question-result objects from the completed quiz session.",
            "items": {
                "type": "object",
                "properties": {
                    "question":   {"type": "string"},
                    "difficulty": {"type": "string"},
                    "timeTaken":  {"type": "number"},
                    "isCorrect":  {"type": "boolean"},
                    "selected":   {"type": "string"},
                    "correct":    {"type": "string"},
                },
            },
        },
    },
    "required": ["topic", "history"],
}


# ── Private implementation ─────────────────────────────────────────────────────

def _generate_feedback(groq_client, topic: str, history: list[dict]) -> str:
    """Build a personalised study note from the quiz history."""
    lines: list[str] = []
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

    prompt = f"""\
A student just completed a {len(history)}-question adaptive MCQ quiz on "{topic}".
They scored {score}/{len(history)}.

Here is a breakdown of every question:
{summary_block}

Write a short, encouraging, and personalised study note (3–5 sentences) for this student that:
1. Acknowledges their overall performance warmly.
2. Identifies the specific weak areas or question types they struggled with (use the data above).
3. Gives 1–2 concrete, actionable study tips to improve.
4. Ends with a motivating closing line.

Write in second person ("You did well on…"). Be specific — reference the actual topics from \
the questions they got wrong. Do NOT use bullet points or headers, just flowing paragraphs."""

    completion = groq_client.chat.completions.create(
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

    return (completion.choices[0].message.content or "").strip()


# ── Public factory ─────────────────────────────────────────────────────────────

def create_feedback_tool(groq_client) -> Tool:
    """
    Build and return the generate_feedback Tool with the Groq client injected.

    Usage in main.py:
        agent.register(create_feedback_tool(client))
    """
    def func(topic: str, history: list[dict]) -> dict:
        text = _generate_feedback(groq_client, topic, history)
        return {"feedback": text}

    return Tool(
        name="generate_feedback",
        description=(
            "Generate a personalised study-coach note for a student after completing a quiz. "
            "Analyses their performance history and returns an encouraging paragraph with "
            "specific weak areas identified and actionable study tips."
        ),
        parameters=FEEDBACK_PARAMETERS,
        func=func,
    )
