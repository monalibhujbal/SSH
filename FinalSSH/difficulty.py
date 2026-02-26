"""
difficulty.py — Adaptive Difficulty Engine
==========================================
Computes ΔD using the formula:

    ΔD = α(A_score) + β((T_expected - T_actual) / T_expected) + γ(C_score)

with edge-case handling for time cap, critical misconceptions, and
interaction-log guessing penalties.
"""

# ── Constants ─────────────────────────────────────────────────────────────────
TIME_CAP_MS = 180_000           # 3-minute AFK cap

CONFIDENCE_SCORE: dict[str, int] = {
    "LOW":    -1,
    "MEDIUM":  0,
    "HIGH":    1,
}

DIFFICULTY_BOUNDS = (0.0, 10.0)   # clamp range for D_{n+1}


# ── Core math ─────────────────────────────────────────────────────────────────
def compute_delta_d(
    a_score: int,               # 1 = correct, -1 = wrong
    time_taken_ms: int,
    expected_time_ms: int,
    confidence_level: str,      # "LOW" | "MEDIUM" | "HIGH"
    interaction_log: list[dict],
    alpha: float = 0.5,
    beta: float = 0.3,
    gamma: float = 0.2,
) -> float:
    """
    Returns the raw ΔD value (unbounded).
    Positive values increase difficulty; negative values decrease it.
    """

    # 1. Accuracy term ─────────────────────────────────────────────────────────
    accuracy_term = alpha * a_score

    # 2. Time term — cap T_actual at TIME_CAP_MS to neutralise AFK anomalies ──
    t_actual = min(time_taken_ms, TIME_CAP_MS)
    # Positive when faster than expected → reward; negative when slower → penalise
    time_ratio = (expected_time_ms - t_actual) / max(expected_time_ms, 1)
    time_term = beta * time_ratio

    # 3. Confidence term ───────────────────────────────────────────────────────
    c_score = CONFIDENCE_SCORE.get(confidence_level.upper(), 0)

    # Rule 4: Critical misconception — wrong answer + HIGH confidence
    # Invert & triple the gamma weight so the HIGH-confidence wrong signal
    # actively pulls difficulty DOWN (forces a revisit of foundational content).
    effective_gamma = gamma
    if a_score == -1 and confidence_level.upper() == "HIGH":
        effective_gamma = -3.0 * gamma   # e.g. 0.2 → -0.60

    confidence_term = effective_gamma * c_score

    # 4. Interaction penalty — repeated option changes indicate guessing ────────
    # Rule 5: Count CHANGED_OPTION events in the log
    option_changes = sum(
        1 for entry in interaction_log
        if entry.get("action") == "CHANGED_OPTION"
    )
    # More than 2 changes → penalise confidence/fluency assessment
    interaction_penalty = -0.10 * max(0, option_changes - 2)

    delta_d = accuracy_term + time_term + confidence_term + interaction_penalty
    return round(delta_d, 4)


def compute_next_difficulty(
    current_difficulty: float,
    a_score: int,
    time_taken_ms: int,
    expected_time_ms: int,
    confidence_level: str,
    interaction_log: list[dict],
    alpha: float = 0.5,
    beta: float = 0.3,
    gamma: float = 0.2,
) -> tuple[float, float]:
    """
    Returns (D_{n+1}, ΔD) clamped to DIFFICULTY_BOUNDS.

    Example
    -------
    >>> d_new, delta = compute_next_difficulty(5.0, 1, 12000, 25000, "HIGH", [])
    >>> d_new, delta
    (5.856, 0.856)
    """
    delta = compute_delta_d(
        a_score, time_taken_ms, expected_time_ms,
        confidence_level, interaction_log, alpha, beta, gamma,
    )
    lo, hi = DIFFICULTY_BOUNDS
    d_new = max(lo, min(hi, current_difficulty + delta))
    return round(d_new, 4), delta


# ── Helpers ───────────────────────────────────────────────────────────────────
def difficulty_to_label(d: float) -> str:
    """Map numeric difficulty [0–10] to a human-readable label."""
    if d < 4.0:
        return "easy"
    if d < 7.0:
        return "medium"
    return "hard"


def label_to_difficulty(label: str) -> float:
    """Canonical numeric value for each label (used when seeding questions)."""
    return {"easy": 3.0, "medium": 5.0, "hard": 8.0}.get(label.lower(), 5.0)


def label_to_expected_time(label: str) -> int:
    """Expected response time in ms per difficulty label."""
    return {"easy": 15_000, "medium": 25_000, "hard": 45_000}.get(label.lower(), 25_000)
