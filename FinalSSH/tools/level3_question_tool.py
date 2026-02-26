"""
tools/level3_question_tool.py
──────────────────────────────
Level 3 Agent — Branching Decision Tree scenario generator.

Level 3 is the MASTERY level.  Instead of a single open question, it places
the student inside a real-world crisis or strategic challenge and asks three
sequential, consequence-aware decisions.

Design principles
─────────────────
• Focus  : Real-world strategy and consequence management
• Format : Branching Decision Tree (multi-step "What happens next?" scenarios)
• Purpose: Test high-level mastery — Consistency across decision points is the
           measure of expertise, not just the quality of any single answer.
• Stakes : Each decision has real, named consequences (numbers, roles, deadlines).

Exports: create_level3_question_tool(groq_client) → Tool
"""

from tools import Tool, repair_json

_SYSTEM_PROMPT = """\
You are a senior mastery-assessment designer specialising in high-stakes real-world scenarios.
Create a BRANCHING DECISION TREE: a dynamic crisis or strategic challenge where the student
makes 3 sequential, consequential decisions. Each step MUST build on the previous outcome.

Always respond with ONLY valid JSON, no markdown, no extra text.
Format (follow this exactly):
{
  "scenario": "You are [specific role] at [specific organisation/place]. [Crisis in 2-3 sentences with real numbers, names, stakes. Make it vivid and urgent.]",
  "context": "Domain: [field] | Challenge: [strategic challenge type]",
  "decision_points": [
    {
      "step": 1,
      "situation": "[Immediate trigger — what just happened. What is your FIRST decision?]",
      "hint": "[1-sentence nudge toward expert thinking — don't give the answer away]"
    },
    {
      "step": 2,
      "situation": "[Direct consequence of step 1 outcome + a new complication. What do you do NEXT?]",
      "hint": "[Nudge for step 2 — highlight the trade-off or key consideration]"
    },
    {
      "step": 3,
      "situation": "[Final strategic challenge — long-term or systemic issue. What is your final strategy?]",
      "hint": "[Nudge for step 3 — think consequence management, stakeholders, systemic fix]"
    }
  ],
  "sample_answers": {
    "1": "[Expert step-1 answer in 2-3 sentences]",
    "2": "[Expert step-2 answer in 2-3 sentences]",
    "3": "[Expert step-3 answer in 2-3 sentences]"
  },
  "total_max_score": 30
}

Rules:
- Use SPECIFIC details: real-sounding numbers, roles, organisations, timelines.
- Each step_2 situation MUST reference the outcome of step_1.
- Each step_3 situation MUST reference the post-step-2 state.
- Scenario categories: Leadership crisis, product/tech failure, brand integrity,
  ethical dilemma, system design emergency, financial decision, HR escalation.
- The sample_answers represent what a true expert would do — be specific.
"""

# ── Difficulty calibration ─────────────────────────────────────────────────────
_DIFFICULTY_CONTEXT = {
    "easy": (
        "Create a manageable, single-domain crisis. The right decisions are challenging "
        "but reasonably clear. Stakes: medium. Scenario length: brief. "
        "Good for students who just reached L3."
    ),
    "medium": (
        "Create a complex scenario with competing priorities and real trade-offs. "
        "No obviously correct answer. Stakes: high. Multiple stakeholders involved. "
        "The student must balance short-term and long-term thinking."
    ),
    "hard": (
        "Create a high-stakes, multi-stakeholder crisis with cascading consequences. "
        "The 'right' choice is deeply ambiguous and requires expert strategic thinking. "
        "Include ethical tensions, resource constraints, and time pressure. "
        "Only genuine experts will navigate this consistently well."
    ),
}

# ── Proficiency calibration ────────────────────────────────────────────────────
_PROFICIENCY_CONTEXT = {
    "beginner":     "Use accessible, everyday scenarios (team conflict, simple product bug, customer complaint).",
    "intermediate": "Use industry-specific scenarios with moderate technical or organisational complexity.",
    "advanced":     "Use expert-level scenarios with deep domain complexity (board-level decisions, architectural crises, regulatory pressure).",
}

# ── JSON Schema ────────────────────────────────────────────────────────────────
L3_QUESTION_PARAMETERS: dict = {
    "type": "object",
    "properties": {
        "topic": {"type": "string", "description": "Subject / domain area."},
        "difficulty": {
            "type": "string",
            "enum": ["easy", "medium", "hard"],
            "description": "Difficulty tier within L3 (calibrated to student performance).",
        },
        "proficiency": {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"],
            "description": "Student's overall proficiency level.",
        },
        "asked_questions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Scenario openings already used this session (avoid repeating themes).",
        },
    },
    "required": ["topic"],
}


def _generate(groq_client, topic: str, difficulty: str,
              proficiency: str, asked_questions: list[str]) -> dict:
    avoid = ""
    if asked_questions:
        avoid = "\nDo NOT reuse themes from:\n" + "\n".join(f"- {q[:80]}…" for q in asked_questions)

    diff_ctx = _DIFFICULTY_CONTEXT.get(difficulty, _DIFFICULTY_CONTEXT["medium"])
    prof_ctx = _PROFICIENCY_CONTEXT.get(proficiency.lower(), _PROFICIENCY_CONTEXT["intermediate"])

    user_msg = (
        f"Proficiency: {proficiency}. {prof_ctx}\n"
        f"Difficulty tier: {difficulty}. {diff_ctx}\n\n"
        f"Domain / topic: {topic}{avoid}\n\n"
        "Generate the branching decision-tree scenario. Return ONLY the JSON."
    )

    completion = groq_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        temperature=1,
        max_completion_tokens=2000,
        top_p=1,
        reasoning_effort="high",   # Higher reasoning for complex scenario design
        stream=False,
        stop=None,
    )

    text = (completion.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    if not text:
        raise ValueError("Groq returned empty response for L3 scenario.")
    return repair_json(text)


def create_level3_question_tool(groq_client) -> Tool:
    """Factory: L3 branching decision tree scenario tool."""
    def func(topic: str, difficulty: str = "medium", proficiency: str = "intermediate",
             asked_questions: list[str] | None = None) -> dict:
        return _generate(groq_client, topic, difficulty, proficiency, asked_questions or [])

    return Tool(
        name="generate_scenario",
        description=(
            "Generate a Branching Decision Tree scenario for Level 3 mastery assessment. "
            "Places the student in a real-world crisis with 3 sequential decision points "
            "where each choice has consequences for the next. "
            "Returns {scenario, context, decision_points[], sample_answers, total_max_score}."
        ),
        parameters=L3_QUESTION_PARAMETERS,
        func=func,
    )
