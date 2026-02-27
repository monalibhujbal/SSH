"""
tools/interview_tool.py
────────────────────────
AI Interview Agent — Three tools for a one-on-one spoken assessment.

  1. generate_interview_question  — Creates a verbal-style open-ended question
  2. evaluate_interview_answer    — Semantic analysis of the spoken/typed response
  3. generate_interview_analysis  — Final comprehensive performance report

Uses openai/gpt-oss-120b for all generation. Whisper transcription
is handled directly in the Flask route (not a tool).
"""

from tools import Tool, repair_json

# ── System Prompts ──────────────────────────────────────────────────────────────

_QUESTION_PROMPT = """\
You are an expert technical interviewer conducting a one-on-one spoken assessment.
Generate a single engaging, open-ended interview question.

Rules:
- Must encourage a 1-3 minute spoken explanation (not a yes/no answer)
- Length and complexity should match the proficiency level and question number
- Must be meaningfully different from previously asked questions
- Suitable for verbal delivery—conversational, not textbook-style

Respond with ONLY valid JSON, no markdown:
{
  "question": "The full question text",
  "expected_concepts": ["key concept 1", "key concept 2", "key concept 3"],
  "hint": "A subtle one-line hint (shown only on request)",
  "category": "conceptual|practical|problem-solving|scenario"
}"""

_EVAL_PROMPT = """\
You are an expert AI evaluator performing semantic analysis on a candidate's spoken answer.

Evaluation dimensions:
1. Conceptual accuracy — is what they said factually correct?
2. Key concept coverage — did they mention the expected concepts?
3. Depth and clarity — did they explain with sufficient detail?
4. Communication — was the answer coherent and structured?

Important: Be fair to spoken answers. They are less polished than written ones.
Accept informal language, minor hesitations, and natural speech patterns.

Grade thresholds: Excellent ≥ 8, Good ≥ 6, Partial ≥ 4, Incorrect < 4

Respond with ONLY valid JSON, no markdown:
{
  "is_correct": true|false,
  "score": <0-10>,
  "grade": "Excellent|Good|Partial|Incorrect",
  "concepts_covered": ["concept they explained correctly"],
  "concepts_missing": ["important concept they omitted or got wrong"],
  "feedback": "2-3 sentences of specific, actionable feedback on their answer",
  "complete_answer": "The ideal comprehensive answer in 3-5 sentences",
  "encouragement": "One brief positive/motivating closing line"
}"""

_ANALYSIS_PROMPT = """\
You are generating a comprehensive end-of-interview performance report.
Analyze all Q&A pairs holistically for depth, accuracy, consistency, and communication.

Respond with ONLY valid JSON, no markdown:
{
  "overall_score": <0-100>,
  "performance_level": "Expert|Proficient|Developing|Beginner",
  "summary": "2-3 sentence executive summary of the candidate's overall performance",
  "strengths": ["specific demonstrated strength 1", "strength 2", "strength 3"],
  "improvement_areas": ["specific knowledge gap 1", "gap 2"],
  "topic_coverage": {
    "strong": ["subtopics they knew well"],
    "weak":   ["subtopics they struggled with"]
  },
  "recommendation": "3-4 sentence personalised learning recommendation",
  "study_plan": [
    "Specific study action 1 with a resource suggestion",
    "Specific study action 2",
    "Specific study action 3"
  ]
}"""


# ── Core functions ──────────────────────────────────────────────────────────────

def _gen_question(client, topic: str, proficiency: str, question_num: int,
                  total: int, asked: list[str]) -> dict:
    asked_text = "\n".join(f"- {q}" for q in asked) if asked else "None yet."
    msg = (
        f"Topic: {topic}\n"
        f"Proficiency level: {proficiency}\n"
        f"This is question {question_num} of {total}.\n"
        f"Previously asked questions:\n{asked_text}\n\n"
        "Generate the next interview question. Make it meaningfully different from previous ones."
    )
    r = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "system", "content": _QUESTION_PROMPT},
                  {"role": "user",   "content": msg}],
        temperature=0.85, max_completion_tokens=500, top_p=1, stream=False,
    )
    raw = (r.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return repair_json(raw)


def _eval_answer(client, question: str, expected_concepts: list[str],
                 user_answer: str, proficiency: str) -> dict:
    concepts_str = ", ".join(expected_concepts) if expected_concepts else "general understanding"
    msg = (
        f"Question asked: {question}\n"
        f"Expected key concepts: {concepts_str}\n"
        f"Proficiency level: {proficiency}\n\n"
        f"Candidate's spoken answer:\n\"{user_answer}\"\n\n"
        "Perform semantic evaluation of this spoken answer."
    )
    r = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "system", "content": _EVAL_PROMPT},
                  {"role": "user",   "content": msg}],
        temperature=0.2, max_completion_tokens=800,
        reasoning_effort="medium", top_p=1, stream=False,
    )
    raw = (r.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return repair_json(raw)


def _gen_analysis(client, topic: str, proficiency: str, history: list[dict]) -> dict:
    qa_block = ""
    for i, item in enumerate(history, 1):
        missing = ", ".join(item.get("concepts_missing", [])) or "—"
        qa_block += (
            f"Q{i}: {item.get('question', '')}\n"
            f"Answer: {item.get('user_answer', '(no answer)')}\n"
            f"Score: {item.get('score', 0)}/10 | Grade: {item.get('grade', 'N/A')}\n"
            f"Missing concepts: {missing}\n\n"
        )
    msg = (
        f"Topic: {topic}\n"
        f"Proficiency: {proficiency}\n"
        f"Total questions answered: {len(history)}\n\n"
        f"Full interview transcript:\n{qa_block}"
        "Generate the comprehensive final performance analysis."
    )
    r = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "system", "content": _ANALYSIS_PROMPT},
                  {"role": "user",   "content": msg}],
        temperature=0.2, max_completion_tokens=1000, top_p=1, stream=False,
    )
    raw = (r.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return repair_json(raw)


# ── Tool factory functions ──────────────────────────────────────────────────────

def create_interview_question_tool(groq_client) -> Tool:
    def func(topic: str, proficiency: str = "intermediate", question_num: int = 1,
             total: int = 5, asked_questions: list = None) -> dict:
        return _gen_question(groq_client, topic, proficiency,
                             question_num, total, asked_questions or [])
    return Tool(
        name="generate_interview_question",
        description=(
            "Generate a single open-ended, verbal-style interview question for a "
            "one-on-one AI assessment session. Returns the question text, expected "
            "key concepts, and a hint."
        ),
        parameters={
            "type": "object",
            "properties": {
                "topic":           {"type": "string", "description": "Subject being assessed"},
                "proficiency":     {"type": "string", "enum": ["beginner", "intermediate", "advanced"]},
                "question_num":    {"type": "integer", "description": "Current question number (1-indexed)"},
                "total":           {"type": "integer", "description": "Total questions in session"},
                "asked_questions": {"type": "array",  "items": {"type": "string"},
                                    "description": "List of previously asked questions to avoid repetition"},
            },
            "required": ["topic"],
        },
        func=func,
    )


def create_interview_eval_tool(groq_client) -> Tool:
    def func(question: str, user_answer: str,
             expected_concepts: list = None, proficiency: str = "intermediate") -> dict:
        return _eval_answer(groq_client, question, expected_concepts or [],
                            user_answer, proficiency)
    return Tool(
        name="evaluate_interview_answer",
        description=(
            "Semantically evaluate a candidate's spoken (or typed) interview answer. "
            "Checks concept coverage, accuracy, and depth. Returns score, grade, "
            "feedback, missing concepts, and the complete ideal answer."
        ),
        parameters={
            "type": "object",
            "properties": {
                "question":          {"type": "string"},
                "user_answer":       {"type": "string", "description": "The candidate's spoken/typed answer"},
                "expected_concepts": {"type": "array", "items": {"type": "string"},
                                      "description": "Key concepts the answer should cover"},
                "proficiency":       {"type": "string"},
            },
            "required": ["question", "user_answer"],
        },
        func=func,
    )


def create_interview_analysis_tool(groq_client) -> Tool:
    def func(topic: str, interview_history: list, proficiency: str = "intermediate") -> dict:
        return _gen_analysis(groq_client, topic, proficiency, interview_history)
    return Tool(
        name="generate_interview_analysis",
        description=(
            "Generate a comprehensive end-of-interview performance analysis report "
            "covering overall score, strengths, gaps, topic coverage, and a personalised study plan."
        ),
        parameters={
            "type": "object",
            "properties": {
                "topic":             {"type": "string"},
                "interview_history": {
                    "type": "array", "items": {"type": "object"},
                    "description": "List of {question, user_answer, score, grade, concepts_missing} dicts",
                },
                "proficiency":       {"type": "string"},
            },
            "required": ["topic", "interview_history"],
        },
        func=func,
    )
