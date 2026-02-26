"""
tools/
─────
Each module in this package defines one or more Tool objects that can be
registered with a QuizAgent.  To add a new capability:

    1.  Create tools/my_tool.py
    2.  Implement the function and fill in PARAMETERS (JSON Schema)
    3.  Export  create_my_tool(groq_client) -> Tool
    4.  Register it in main.py:  agent.register(create_my_tool(client))
"""

import json
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class Tool:
    """
    A single capability that the QuizAgent can invoke.

    Attributes
    ----------
    name        : Unique identifier (used when calling the tool).
    description : Human/LLM-readable description of what the tool does.
    parameters  : JSON Schema object describing the function's parameters
                  (used by the LLM orchestrator when calling tools).
    func        : The Python callable that implements the tool.
                  Must accept keyword arguments matching `parameters`.
    """
    name: str
    description: str
    parameters: dict
    func: Callable[..., Any]


# ── Shared utilities ──────────────────────────────────────────────────────────

def repair_json(text: str) -> dict:
    """
    Best-effort JSON repair for truncated model responses.
    Tries json.loads first; on failure, closes any open strings / brackets and retries.
    Raises json.JSONDecodeError if the text is still invalid after repair.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        rep = text.rstrip()
        while rep and rep[-1] in (",", ":", '"'):
            rep = rep[:-1]
        if rep.count('"') % 2 == 1:
            rep += '"'
        opens  = {"[": "]", "{": "}"}
        closes = {"]", "}"}
        stack: list[str] = []
        for ch in rep:
            if ch in opens:
                stack.append(opens[ch])
            elif ch in closes and stack:
                stack.pop()
        rep += "".join(reversed(stack))
        return json.loads(rep)
