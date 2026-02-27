from __future__ import annotations
import json
import logging
from typing import Any
from groq import Groq
from tools import Tool

logger = logging.getLogger(__name__)

IMPROVEMENT_SYSTEM_PROMPT = """
You are a highly experienced Educational Mentor and Study Coach.
Your task is to analyze a student's weak skills and provide a highly targeted improvement plan.

For each skill provided, you MUST:
1. Identify 2-3 specific sub-topics where students usually struggle in that area.
2. Provide a 'Conceptual Note' (1-2 sentences) explaining a core principle.
3. Provide a list of 'Actionable Resources':
   - 1 high-quality YouTube link (from channels like fireship, freecodecamp, traversy media, or similar reputable ones).
   - 1 specific documentation or tutorial link.
   - 1 interactive resource (if applicable).
4. Suggest a 'Mini-Project' or 'Practice Challenge' to master that skill.

OUTPUT FORMAT:
You must return ONLY a JSON object with the following structure:
{
  "skills_analysis": [
    {
      "skill": "Skill Name",
      "avg_score": 45,
      "status": "Priority",
      "sub_topics": ["Topic A", "Topic B"],
      "conceptual_note": "Core principle summary...",
      "resources": [
        {"title": "Video Guide", "url": "https://youtube.com/...", "type": "youtube"},
        {"title": "Documentation", "url": "https://...", "type": "link"}
      ],
      "practice_challenge": "Build a X that does Y..."
    }
  ],
  "overall_strategy": "A brief encouraging summary of what to focus on first."
}
"""

def create_improvement_tool(client: Groq) -> Tool:
    def generate_improvement_plan(low_performing_skills: list[dict]) -> dict:
        """
        Generates a targeted study plan and resource list for weak skills.
        low_performing_skills: List of { "skill": str, "avg_score": float }
        """
        if not low_performing_skills:
            return {
                "skills_analysis": [],
                "overall_strategy": "Keep practicing! Take more assessments to identify areas for improvement."
            }

        prompt = f"Analyze these weak skills and generate a study plan:\n{json.dumps(low_performing_skills)}"
        
        try:
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": IMPROVEMENT_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            return json.loads(resp.choices[0].message.content)
        except Exception as e:
            logger.exception("Improvement tool failed")
            return {"error": str(e)}

    return Tool(
        name="generate_improvement_plan",
        description="Generates a study plan, conceptual notes, and resource links for a list of weak skills.",
        parameters={
            "type": "object",
            "properties": {
                "low_performing_skills": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "skill": {"type": "string"},
                            "avg_score": {"type": "number"}
                        }
                    }
                }
            },
            "required": ["low_performing_skills"]
        },
        func=generate_improvement_plan
    )
