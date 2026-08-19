"""Tests for miforge.safety — 7 Sacred Human Gates."""

from miforge.safety import SafetyGateway, Gate, safe_execute


class TestGate1IrreversibleActions:
    def setup_method(self):
        self.gw = SafetyGateway()

    def test_blocks_delete(self):
        result = self.gw.check_action("delete all user data")
        assert result is not None
        assert result[0] == Gate.IRREVERSIBLE_ACTION

    def test_blocks_deploy(self):
        result = self.gw.check_action("deploy to production")
        assert result is not None
        assert result[0] == Gate.IRREVERSIBLE_ACTION

    def test_blocks_rm_rf(self):
        result = self.gw.check_action("rm -rf /var/data")
        assert result is not None
        assert result[0] == Gate.IRREVERSIBLE_ACTION

    def test_blocks_git_push(self):
        result = self.gw.check_action("git push origin main --force")
        assert result is not None
        assert result[0] == Gate.IRREVERSIBLE_ACTION

    def test_blocks_publish(self):
        result = self.gw.check_action("publish npm package")
        assert result is not None
        assert result[0] == Gate.IRREVERSIBLE_ACTION


class TestGate5PII:
    def setup_method(self):
        self.gw = SafetyGateway()

    def test_detects_ssn(self):
        result = self.gw.check_action("Process user 123-45-6789")
        assert result is not None
        assert result[0] == Gate.LEGAL_COMPLIANCE


class TestGate6QualityThreshold:
    def setup_method(self):
        self.gw = SafetyGateway()

    def test_blocks_low_confidence(self):
        result = self.gw.check_action("generate report", confidence=0.45)
        assert result is not None
        assert result[0] == Gate.QUALITY_THRESHOLD

    def test_passes_high_confidence(self):
        result = self.gw.check_action("generate report", confidence=0.95)
        assert result is None  # None = safe


class TestGate7SelfModification:
    def setup_method(self):
        self.gw = SafetyGateway()

    def test_blocks_routing_changes(self):
        result = self.gw.check_action("modify_routing table")
        assert result is not None
        assert result[0] == Gate.SELF_MODIFICATION


class TestSafeActions:
    def setup_method(self):
        self.gw = SafetyGateway()

    def test_allows_reading_files(self):
        assert self.gw.check_action("read file config.yaml") is None

    def test_allows_running_tests(self):
        assert self.gw.check_action("run test suite npm test") is None

    def test_allows_ai_completion(self):
        assert self.gw.check_action("call LLM with prompt explain recursion") is None


class TestSafeExecute:
    def test_executes_safe_function(self):
        result = safe_execute("read config file", lambda: 42)
        assert result == 42

    def test_blocks_unsafe_function(self):
        result = safe_execute("delete database", lambda: "should not run")
        assert result is None


class TestAuditLog:
    def test_starts_empty(self):
        gw = SafetyGateway()
        assert len(gw.audit_log) == 0

    def test_logs_after_request(self):
        gw = SafetyGateway()
        gw.request_approval(Gate.IRREVERSIBLE_ACTION, "test reason", "test action")
        assert len(gw.audit_log) == 1
        assert gw.audit_log[0].gate == Gate.IRREVERSIBLE_ACTION
        assert gw.audit_log[0].approved is False  # Default deny
