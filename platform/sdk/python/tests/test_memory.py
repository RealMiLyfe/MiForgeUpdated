"""Tests for miforge.memory — tier selection and context tier (no external deps)."""

from miforge.memory import MemoryOS


class TestTierSelection:
    def setup_method(self):
        # No external backends — context tier works standalone
        self.mem = MemoryOS(redis_url="redis://nonexistent:1", mem0_api_key="", cognee_api_url="http://nonexistent:1")

    def test_high_importance_routes_to_graph(self):
        m = self.mem.remember("Critical fact", scope="user_1", importance=0.95)
        assert m.tier == "graph"

    def test_medium_importance_routes_to_episodic(self):
        m = self.mem.remember("Important fact", scope="user_1", importance=0.75)
        assert m.tier == "episodic"

    def test_low_importance_routes_to_working(self):
        m = self.mem.remember("Session fact", scope="user_1", importance=0.5)
        assert m.tier == "working"

    def test_trivial_routes_to_context(self):
        m = self.mem.remember("Trivial", scope="user_1", importance=0.1)
        assert m.tier == "context"


class TestContextTier:
    def setup_method(self):
        self.mem = MemoryOS(redis_url="redis://nonexistent:1", mem0_api_key="", cognee_api_url="http://nonexistent:1")

    def test_store_and_recall(self):
        self.mem.remember("User likes TypeScript", scope="user_1", importance=0.1)
        results = self.mem.recall("TypeScript", scope="user_1", tiers=["context"])
        assert len(results) > 0
        assert "TypeScript" in results[0].content

    def test_scope_isolation(self):
        self.mem.remember("Secret A", scope="alice", importance=0.1)
        self.mem.remember("Secret B", scope="bob", importance=0.1)
        results_a = self.mem.recall("Secret", scope="alice", tiers=["context"])
        results_b = self.mem.recall("Secret", scope="bob", tiers=["context"])
        assert len(results_a) == 1
        assert "A" in results_a[0].content
        assert len(results_b) == 1
        assert "B" in results_b[0].content

    def test_forget_clears_context(self):
        self.mem.remember("Remember this", scope="user_1", importance=0.1)
        self.mem.forget("user_1")
        results = self.mem.recall("Remember", scope="user_1", tiers=["context"])
        assert len(results) == 0

    def test_unique_ids(self):
        m1 = self.mem.remember("First", scope="user_1", importance=0.1)
        m2 = self.mem.remember("Second", scope="user_1", importance=0.1)
        assert m1.id != m2.id
        assert m1.id.startswith("mem_")
