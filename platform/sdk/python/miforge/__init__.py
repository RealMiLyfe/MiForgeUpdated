"""
MiForge AI Platform SDK

The complete free AI development stack for the MiLyfe ecosystem.
Zero credit cards. Unlimited tokens. 15+ providers stacked.

Usage:
    from miforge import MiForge

    forge = MiForge()
    result = forge.complete("Explain this code", task_type="coding")
    print(result.text)

    # Memory
    forge.memory.remember("User prefers TypeScript", scope="user_123", importance=0.8)
    memories = forge.memory.recall("coding preferences", scope="user_123")

    # RAG
    forge.rag.ingest([{"id": "doc1", "content": "..."}])
    results = forge.rag.retrieve("How does auth work?")

    # Safe execution
    result = forge.safe("deploy production", my_deploy_function)
"""

from miforge.client import MiForge
from miforge.providers import ConfidenceRouter, FREE_PROVIDERS
from miforge.memory import MemoryOS
from miforge.rag import RAGPipeline
from miforge.safety import SafetyGateway, Gate, safe_execute
from miforge.swarm import SwarmOrchestrator

__version__ = "1.0.0"
__all__ = [
    "MiForge",
    "ConfidenceRouter",
    "FREE_PROVIDERS",
    "MemoryOS",
    "RAGPipeline",
    "SafetyGateway",
    "Gate",
    "safe_execute",
    "SwarmOrchestrator",
]
