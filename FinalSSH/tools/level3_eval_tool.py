"""
tools/level3_eval_tool.py
──────────────────────────
Level 3 Helper / Evaluator Agent — Scenario Consistency Assessor.

Evaluates a student's full set of sequential decisions in a branching
decision-tree scenario.  Scores each decision individually AND measures
CONSISTENCY across all decision points — the key signal for "Expert" status.

Mastery is defined as:
  • High individual scores  (correct, specific, actionable decisions)
  • High consistency score  (decisions build logically on each other)
  • Expert strategic framing (trade-off awareness, stakeholder thinking)

Exports: create_level3_eval_tool(groq_client) → Tool
"""

from tools import Tool, repair_json

_SYSTEM_PROMPT = """\
You are a senior mastery assessor for branching decision scenarios.
Evaluate the student's sequential decisions BOTH individually AND for their
strategic coherence across the full scenario.

Key assessment dimensions:
1. Individual decision quality (accuracy, specificity, appropriateness)
2. Consequence awareness (did they account for what happened in prior steps?)
3. Consistency (do decisions form a coherent, expert-level strategy?)
4. Strategic depth (trade-offs, stakeholder thinking, long-term impact)

Always respond with ONLY valid JSON, no markdown, no extra text.
Format:
{
  "decision_scores": [
    {
      "step": 1,
      "score": <0-10>,
      "max_score": 10,
      "grade": "Excellent|Good|Fair|Needs Work",
      "feedback": "2 sentences: what they got right + what they missed in this specific decision"
    },
    {
      "step": 2,
      "score": <0-10>,
      "max_score": 10,
      "grade": "Excellent|Good|Fair|Needs Work",
      "feedback": "..."
    },
    {
      "step": 3,
      "score": <0-10>,
      "max_score": 10,
      "grade": "Excellent|Good|Fair|Needs Work",
      "feedback": "..."
    }
  ],
  "consistency_score": <0-10>,
  "consistency_note": "1-2 sentences: did their decisions form a coherent strategy? Were later decisions consistent with earlier ones?",
  "total_score": <sum of all decision scores>,
  "total_max_score": 30,
  "overall_grade": "Excellent|Good|Fair|Needs Work",
  "expert_assessment": "2 sentences: does this student demonstrate Expert-level mastery? What separates their thinking from a true expert?",
  "model_approach": "How a domain expert would approach this ENTIRE scenario in 4-5 sentences — covering all 3 decisions as a coherent strategy."
}

Grade thresholds: Excellent ≥ 8, Good ≥ 6, Fair ≥ 4, Needs Work < 4.
Consistency: 10 = perfectly coherent expert strategy, 5 = mostly consistent, 1 = contradictory decisions.
Overall grade: based on (total_score/30 * 100): Excellent ≥ 80%, Good ≥ 60%, Fair ≥ 40%, Needs Work < 40%.
"""

L3_EVAL_PARAMETERS: dict = {
    "type": "object",
    "properties": {
        "scenario": {"type": "string", "description": "The full scenario description."},
        "decision_points": {
            "type": "array",
            "description": "The list of decision point objects (step, situation, hint).",
            "items": {"type": "object"},
        },
        "user_answers": {
            "type": "object",
            "description": 'Student answers keyed by step number string, e.g. {"1": "...", "2": "...", "3": "..."}.',
        },
        "sample_answers": {
            "type": "object",
            "description": 'Expert reference answers keyed by step, e.g. {"1": "...", "2": "..."}.',
        },
        "proficiency": {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"],
            "description": "Student's proficiency level — calibrates scoring expectations.",
        },
    },
    "required": ["scenario", "decision_points", "user_answers"],
}


def _evaluate(groq_client, scenario: str, decision_points: list[dict],
              user_answers: dict, sample_answers: dict, proficiency: str) -> dict:
    """Build a structured prompt and call Groq for full scenario evaluation."""

    # ── Build decision summary block ───────────────────────────────────────────
    blocks: list[str] = []
    for dp in decision_points:
        step   = str(dp.get("step", "?"))
        sit    = dp.get("situation", "")
        answer = user_answers.get(step, "(no answer provided)")
        expert = sample_answers.get(step, "")

        block = f"DECISION {step}:\nSituation: {sit}\nStudent Answer: {answer}"
        if expert:
            block += f"\nExpert Reference: {expert}"
        blocks.append(block)

    decisions_block = "\n\n".join(blocks)

    # Check for empty answers
    if all(not v.strip() for v in user_answers.values()):
        return {
            "decision_scores": [
                {"step": i+1, "score": 0, "max_score": 10, "grade": "Needs Work", "feedback": "No answer provided."}
                for i in range(len(decision_points))
            ],
            "consistency_score": 0,
            "consistency_note": "No answers provided.",
            "total_score": 0,
            "total_max_score": 30,
            "overall_grade": "Needs Work",
            "expert_assessment": "No attempt was made.",
            "model_approach": sample_answers.get("1", "") + " " + sample_answers.get("2", "") + " " + sample_answers.get("3", ""),
        }

    user_msg = (
        f"Proficiency level: {proficiency}\n\n"
        f"SCENARIO:\n{scenario}\n\n"
        f"{decisions_block}\n\n"
        "Evaluate all decisions above. Pay special attention to:\n"
        "- Whether step 2 and 3 answers acknowledge the consequences of earlier decisions.\n"
        "- Whether the overall strategy is coherent and expert-level.\n"
        "Return ONLY the JSON evaluation."
    )

    completion = groq_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        temperature=0.7,
        max_completion_tokens=1200,
        top_p=1,
        reasoning_effort="medium",
        stream=False,
        stop=None,
    )

    text = (completion.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    if not text:
        raise ValueError("Groq returned empty L3 evaluation response.")
    return repair_json(text)


def create_level3_eval_tool(groq_client) -> Tool:
    """Factory: L3 scenario evaluator with Groq client injected."""
    def func(scenario: str, decision_points: list[dict], user_answers: dict,
             sample_answers: dict | None = None, proficiency: str = "intermediate") -> dict:
        return _evaluate(groq_client, scenario, decision_points,
                         user_answers, sample_answers or {}, proficiency)

    return Tool(
        name="evaluate_scenario",
        description=(
            "Evaluate a student's sequential decisions in a Level 3 Branching Decision Tree scenario. "
            "Scores each decision point individually AND measures consistency/coherence across all decisions. "
            "Returns {decision_scores[], consistency_score, consistency_note, total_score, "
            "total_max_score, overall_grade, expert_assessment, model_approach}."
        ),
        parameters=L3_EVAL_PARAMETERS,
        func=func,
    )
