"""
tools/level2_eval_tool.py
──────────────────────────
Level 2 Helper / Evaluator Agent.

Scores a student's open text answer to a "Why / Explain / Scenario" question
against the sample answer and a set of rubric criteria.

Exports: create_level2_eval_tool(groq_client) → Tool
"""

from tools import Tool, repair_json

_SYSTEM_PROMPT = """\
You are an expert educational evaluator assessing conceptual understanding.
Evaluate the student's answer to an open-ended "Why / Explain / Scenario" question.
Score objectively 0–10 based on: accuracy, depth of reasoning, completeness, and clarity.
Always respond with ONLY valid JSON, no markdown, no extra text.
Format:
{
  "score": <integer 0-10>,
  "max_score": 10,
  "grade": "Excellent|Good|Fair|Needs Work",
  "feedback": "2-3 sentences of specific, constructive feedback",
  "key_points_hit": ["point the student correctly made", ...],
  "missing_points": ["key concept they missed", ...],
  "model_answer": "The ideal complete answer in 3-5 sentences."
}
Grade thresholds: Excellent ≥ 8, Good ≥ 6, Fair ≥ 4, Needs Work < 4.
"""

L2_EVAL_PARAMETERS: dict = {
    "type": "object",
    "properties": {
        "question":     {"type": "string", "description": "The original question."},
        "user_answer":  {"type": "string", "description": "The student's typed answer."},
        "sample_answer":{"type": "string", "description": "The ideal sample answer (from question generation)."},
        "proficiency":  {
            "type": "string",
            "enum": ["beginner", "intermediate", "advanced"],
            "description": "Student's proficiency — adjusts scoring expectations.",
        },
    },
    "required": ["question", "user_answer", "sample_answer"],
}


def _evaluate(groq_client, question: str, user_answer: str,
              sample_answer: str, proficiency: str) -> dict:
    if not user_answer.strip():
        return {
            "score": 0, "max_score": 10, "grade": "Needs Work",
            "feedback": "No answer was provided.",
            "key_points_hit": [], "missing_points": ["No attempt made."],
            "model_answer": sample_answer,
        }

    user_msg = (
        f"Proficiency level: {proficiency}\n\n"
        f"QUESTION:\n{question}\n\n"
        f"EXPECTED ANSWER (for reference):\n{sample_answer}\n\n"
        f"STUDENT'S ANSWER:\n{user_answer}\n\n"
        "Evaluate the student's answer. Return ONLY the JSON evaluation."
    )

    completion = groq_client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        temperature=0.7,
        max_completion_tokens=800,
        top_p=1,
        reasoning_effort="medium",
        stream=False,
        stop=None,
    )

    text = (completion.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.split("```")[1].lstrip("json").strip()
    if not text:
        raise ValueError("Groq returned empty evaluation response.")
    return repair_json(text)


def create_level2_eval_tool(groq_client) -> Tool:
    """Factory: build the L2 evaluator tool with the Groq client injected."""
    def func(question: str, user_answer: str, sample_answer: str,
             proficiency: str = "intermediate") -> dict:
        return _evaluate(groq_client, question, user_answer, sample_answer, proficiency)

    return Tool(
        name="evaluate_why_answer",
        description=(
            "Evaluate a student's open text answer to a Level 2 'Why / Explain / Scenario' question. "
            "Returns {score, max_score, grade, feedback, key_points_hit, missing_points, model_answer}."
        ),
        parameters=L2_EVAL_PARAMETERS,
        func=func,
    )
