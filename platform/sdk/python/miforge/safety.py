"""
MiForge Safety — 7 Sacred Human Gates (Python SDK)

Universal safety wrapper for all agent actions.
"""

import os
import re
import time
import functools
from enum import IntEnum
from dataclasses import dataclass, field
from typing import Callable, Optional, Any

import httpx


class Gate(IntEnum):
    IRREVERSIBLE_ACTION = 1
    CREDENTIALS = 2
    NOVEL_SITUATION = 3
    MULTI_AGENT_CONFLICT = 4
    LEGAL_COMPLIANCE = 5
    QUALITY_THRESHOLD = 6
    SELF_MODIFICATION = 7


@dataclass
class GateDecision:
    gate: Gate
    reason: str
    action: str
    approved: bool
    timestamp: float = field(default_factory=time.time)
    decided_by: str = "auto"  # "human" | "auto"


IRREVERSIBLE_KEYWORDS = [
    "delete", "drop", "rm -rf", "git push", "deploy",
    "send_email", "charge", "payment", "publish",
    "kubectl delete", "terraform destroy", "merge",
]

PII_PATTERNS = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),           # SSN
    re.compile(r"\b4[0-9]{12}(?:[0-9]{3})?\b"),     # Visa
    re.compile(r"\b5[1-5][0-9]{14}\b"),             # Mastercard
]


class SafetyGateway:
    """Checks every action against the 7 Sacred Human Gates."""

    def __init__(self, telegram_token: Optional[str] = None, telegram_chat_id: Optional[str] = None):
        self._telegram_token = telegram_token or os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self._telegram_chat_id = telegram_chat_id or os.environ.get("TELEGRAM_CHAT_ID", "")
        self._audit_log: list[GateDecision] = []

    def check_action(self, action: str, confidence: Optional[float] = None) -> Optional[tuple[Gate, str]]:
        """Returns (Gate, reason) if blocked, None if safe."""
        action_lower = action.lower()

        # Gate 1: Irreversible
        for kw in IRREVERSIBLE_KEYWORDS:
            if kw in action_lower:
                return (Gate.IRREVERSIBLE_ACTION, f"Irreversible action: '{kw}'")

        # Gate 5: PII
        for pattern in PII_PATTERNS:
            if pattern.search(action):
                return (Gate.LEGAL_COMPLIANCE, "PII detected in action payload")

        # Gate 6: Quality threshold
        if confidence is not None and confidence < 0.70:
            return (Gate.QUALITY_THRESHOLD, f"Low confidence: {confidence:.2f}")

        # Gate 7: Self-modification
        if any(x in action_lower for x in ["modify_routing", "change_memory_rules", "update_safety_config"]):
            return (Gate.SELF_MODIFICATION, "Agent self-modification attempt")

        return None  # Safe

    def request_approval(self, gate: Gate, reason: str, action: str) -> bool:
        """Send Telegram notification. Returns False (safe default) without listener."""
        message = (
            f"🔴 MiForge Safety Gate {gate.value} Triggered\n\n"
            f"Reason: {reason}\n"
            f"Action: {action[:200]}\n\n"
            f"Reply YES to approve, NO to block."
        )

        if self._telegram_token and self._telegram_chat_id:
            try:
                httpx.post(
                    f"https://api.telegram.org/bot{self._telegram_token}/sendMessage",
                    json={"chat_id": self._telegram_chat_id, "text": message},
                    timeout=5,
                )
            except Exception as e:
                print(f"[Safety] Telegram notification failed: {e}")

        # Log decision (denied by default without human listener)
        self._audit_log.append(GateDecision(
            gate=gate, reason=reason, action=action[:500], approved=False, decided_by="auto"
        ))
        return False

    @property
    def audit_log(self) -> list[GateDecision]:
        return list(self._audit_log)


def safe_execute(action_description: str, fn: Callable, gateway: Optional[SafetyGateway] = None, **kwargs) -> Any:
    """Execute a function with safety gate checks."""
    gw = gateway or SafetyGateway()
    blocked = gw.check_action(action_description, confidence=kwargs.get("confidence"))

    if blocked:
        gate, reason = blocked
        approved = gw.request_approval(gate, reason, action_description)
        if not approved:
            print(f"[Safety] BLOCKED by Gate {gate.value}: {reason}")
            return None

    return fn()
