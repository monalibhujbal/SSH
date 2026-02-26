"""
agent.py
────────
Core agentic layer for the quiz backend.

Architecture
────────────
QuizAgent wraps a tool registry and exposes two ways to invoke tools:

  1.  agent.call(tool_name, **kwargs)
      Direct invocation — bypasses the LLM orchestrator entirely.
      Used by Flask routes for reliable, structured outputs.

  2.  agent.run(task, system, max_turns)
      Full LLM-orchestrated agent loop using llama-3.3-70b-versatile.
      The orchestrator decides which tools to call and in what order.
      Use this for complex, multi-step tasks or future workflow expansion.

Adding a new tool
─────────────────
    from tools.my_tool import create_my_tool
    agent.register(create_my_tool(groq_client))
    # Done — the tool is now available for both agent.call() and agent.run()
"""

from __future__ import annotations

import json
import logging
from typing import Any

from tools import Tool

logger = logging.getLogger(__name__)


class QuizAgent:
    """
    An agent that manages a registry of callable tools and can orchestrate
    them either directly (agent.call) or via an LLM (agent.run).
    """

    # Model used for the LLM orchestration loop.
    # llama-3.3-70b-versatile supports Groq's tool-calling API natively.
    ORCHESTRATOR_MODEL = "llama-3.3-70b-versatile"

    def __init__(self, groq_client) -> None:
        self._client = groq_client
        self._registry: dict[str, Tool] = {}

    # ── Registration ───────────────────────────────────────────────────────────

    def register(self, tool: Tool) -> "QuizAgent":
        """
        Register a Tool object.  Returns self so calls can be chained:
            agent.register(tool_a).register(tool_b)
        """
        if tool.name in self._registry:
            logger.warning("Tool '%s' is already registered — overwriting.", tool.name)
        self._registry[tool.name] = tool
        logger.info("Registered tool: %s", tool.name)
        return self

    def add_tool(
        self,
        name: str,
        description: str,
        parameters: dict,
        func,
    ) -> "QuizAgent":
        """
        Convenience wrapper — build and register a Tool in one call:
            agent.add_tool("my_tool", "Does X", MY_PARAMS, my_func)
        """
        return self.register(Tool(name=name, description=description,
                                  parameters=parameters, func=func))

    def list_tools(self) -> list[str]:
        """Return the names of all registered tools."""
        return list(self._registry.keys())

    # ── Direct invocation ──────────────────────────────────────────────────────

    def call(self, tool_name: str, **kwargs: Any) -> Any:
        """
        Invoke a registered tool directly by name (no LLM overhead).

        This is the primary method used by Flask routes for reliable,
        latency-predictable, structured output.

        Raises ValueError if the tool is not registered.
        """
        tool = self._registry.get(tool_name)
        if tool is None:
            available = ", ".join(self._registry) or "(none)"
            raise ValueError(
                f"Tool '{tool_name}' not registered. Available: {available}"
            )
        logger.debug("Calling tool '%s' with args: %s", tool_name, list(kwargs))
        return tool.func(**kwargs)

    # ── LLM-orchestrated agent loop ────────────────────────────────────────────

    def _tool_schemas(self) -> list[dict]:
        """Convert registered tools to Groq / OpenAI tool-calling schema."""
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in self._registry.values()
        ]

    def run(
        self,
        task: str,
        system: str = (
            "You are a helpful quiz assistant. "
            "Use the available tools to complete the task precisely. "
            "When a tool returns a result, relay it verbatim without adding extra commentary."
        ),
        max_turns: int = 6,
    ) -> str:
        """
        Run the full LLM-orchestrated agent loop.

        The orchestrator (llama-3.3-70b-versatile) sees the task, decides
        which tools to call, executes them, observes results, and eventually
        produces a final text response.

        Parameters
        ----------
        task      : Natural-language task description.
        system    : System prompt for the orchestrator.
        max_turns : Maximum number of LLM ↔ tool round-trips before giving up.

        Returns
        -------
        str  — The orchestrator's final text response.
        """
        messages: list[dict] = [
            {"role": "system", "content": system},
            {"role": "user",   "content": task},
        ]

        schemas = self._tool_schemas()

        for turn in range(max_turns):
            resp = self._client.chat.completions.create(
                model=self.ORCHESTRATOR_MODEL,
                messages=messages,
                tools=schemas if schemas else None,
                tool_choice="auto" if schemas else None,
                temperature=0.2,
                max_tokens=2048,
            )

            choice = resp.choices[0]
            msg    = choice.message
            # Append the assistant message (may have tool_calls or content)
            messages.append(msg)

            if choice.finish_reason == "tool_calls" and msg.tool_calls:
                # ── Execute every tool the orchestrator requested ──────────────
                for tc in msg.tool_calls:
                    t_name = tc.function.name
                    t_args = json.loads(tc.function.arguments)
                    logger.debug(
                        "[turn %d] orchestrator → tool '%s' args=%s", turn, t_name, t_args
                    )

                    if t_name not in self._registry:
                        result = {"error": f"Unknown tool: {t_name}"}
                    else:
                        try:
                            result = self._registry[t_name].func(**t_args)
                        except Exception as exc:  # noqa: BLE001
                            logger.exception("Tool '%s' raised an exception.", t_name)
                            result = {"error": str(exc)}

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    })

            else:
                # ── Orchestrator has finished — return its response ────────────
                final = msg.content or ""
                logger.debug("[turn %d] orchestrator finished.", turn)
                return final

        # Exhausted max_turns — return whatever the last message said
        last = messages[-1]
        if isinstance(last, dict):
            return last.get("content", "")
        return getattr(last, "content", "") or ""
