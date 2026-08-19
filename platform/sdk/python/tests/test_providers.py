"""Tests for miforge.providers — catalog validation and confidence router."""

from miforge.providers import FREE_PROVIDERS, ROUTING_TABLE, ConfidenceRouter


class TestFreeProviders:
    def test_has_minimum_providers(self):
        assert len(FREE_PROVIDERS) >= 7

    def test_all_providers_have_required_fields(self):
        for p in FREE_PROVIDERS:
            assert p.name
            assert p.base_url
            assert p.test_model
            assert p.rpm_limit > 0
            assert len(p.best_for) > 0

    def test_includes_local_fallbacks(self):
        names = [p.name for p in FREE_PROVIDERS]
        assert "ollama" in names

    def test_local_providers_no_key_required(self):
        ollama = next(p for p in FREE_PROVIDERS if p.name == "ollama")
        assert ollama.api_key_env == ""

    def test_local_unlimited_rpm(self):
        ollama = next(p for p in FREE_PROVIDERS if p.name == "ollama")
        assert ollama.rpm_limit >= 9999


class TestRoutingTable:
    def test_has_all_task_types(self):
        assert "coding" in ROUTING_TABLE
        assert "speed" in ROUTING_TABLE
        assert "deep_reasoning" in ROUTING_TABLE
        assert "long_context" in ROUTING_TABLE
        assert "general" in ROUTING_TABLE

    def test_general_has_fallbacks(self):
        assert len(ROUTING_TABLE["general"]) >= 3

    def test_all_routes_reference_valid_providers(self):
        names = {p.name for p in FREE_PROVIDERS}
        for task_type, routes in ROUTING_TABLE.items():
            for route in routes:
                assert route["provider"] in names, f"{route['provider']} not in catalog ({task_type})"
                assert route["model"], f"Empty model in {task_type}"


class TestConfidenceRouter:
    def test_routes_to_provider(self):
        router = ConfidenceRouter()
        result = router.route("coding")
        assert result["provider"]
        assert result["model"]

    def test_tracks_zero_cost(self):
        router = ConfidenceRouter()
        router.record_request("groq", 500)
        router.record_request("nvidia_nim", 1000)
        assert router.total_tokens == 1500
        assert router.total_cost == 0.00

    def test_detects_near_rate_limit(self):
        router = ConfidenceRouter()
        # Groq: 30 RPM, threshold at 85% = 25.5
        for _ in range(26):
            router.record_request("groq", 10)
        assert router.is_near_rate_limit("groq") is True

    def test_not_near_limit_when_quiet(self):
        router = ConfidenceRouter()
        router.record_request("groq", 10)
        assert router.is_near_rate_limit("groq") is False

    def test_falls_back_to_ollama_when_all_limited(self):
        router = ConfidenceRouter()
        # Saturate all cloud providers
        for p in FREE_PROVIDERS:
            if p.name != "ollama" and p.api_key_env:
                for _ in range(p.rpm_limit + 1):
                    router.record_request(p.name, 10)
        result = router.route("general")
        assert result["provider"] == "ollama"
