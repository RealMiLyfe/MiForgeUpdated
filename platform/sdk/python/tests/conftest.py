"""Pytest configuration for MiForge Python SDK tests."""

import sys
from pathlib import Path

# Add the SDK source to path
sys.path.insert(0, str(Path(__file__).parent.parent))
