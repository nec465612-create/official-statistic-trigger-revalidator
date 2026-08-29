import json
from pathlib import Path
import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
CONTRACT_PATH = Path(__file__).parent.parent / "contracts" / "official_statistic_trigger_revalidator.py"


def read_fixture(filename: str) -> str:
    with open(FIXTURES_DIR / filename, "r", encoding="utf-8") as f:
        return f.read()


def deploy(direct_deploy, sender=None):
    return direct_deploy(str(CONTRACT_PATH))


METADATA_HTML = """
<h4>Consumer Price Index for All Urban Consumers (CPI-U)</h4>
<div>Series Id: CUSR0000SA0</div><div>Seasonally Adjusted</div>
<div>Series Title: All items in U.S. city average, all urban consumers, seasonally adjusted</div>
<div>Area: U.S. city average</div><div>Item: All items</div><div>Base Period: 1982-84=100</div>
"""


def mock_bls_web(vm, body_str: str, status: int = 200, metadata_body: str = METADATA_HTML, metadata_status: int = 200):
    vm._web_mocks.clear()
    vm._web_mocks_hit.clear()
    vm.mock_web(r".*api\.bls\.gov.*", {"status": status, "body": body_str})
    vm.mock_web(r".*data\.bls\.gov/timeseries/.*", {"status": metadata_status, "body": metadata_body})


def mock_llm_comparability(vm, comparability: str = "COMPARABLE", reason: str = "Official revision"):
    vm._llm_mocks.clear()
    vm._llm_mocks_hit.clear()
    vm.mock_llm(r"(?s).*comparability.*", json.dumps({
        "catalog": {
            "series_title": "All items in U.S. city average, all urban consumers, seasonally adjusted",
            "series_id": "CUSR0000SA0",
            "seasonality": "Seasonally Adjusted",
            "area": "U.S. city average",
            "item": "All items",
            "base_period": "1982-84=100",
        },
        "comparability": comparability,
        "reason": reason,
    }))


# ---------------------------------------------------------------------------
# 1. Decimal Parsing & Scale Tests
# ---------------------------------------------------------------------------
def test_create_trigger_valid_decimals(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)

    # 3 decimal places
    t1 = contract.create_trigger("nonce-1", "CUSR0000SA0", "2024", "M01", "GE", "314.069")
    assert t1 == "trg-0001"
    data1 = json.loads(contract.get_trigger(t1))
    assert data1["threshold_scaled"] == 314069

    # 2 decimal places
    t2 = contract.create_trigger("nonce-2", "CUSR0000SA0", "2024", "M02", "GE", "314.50")
    assert t2 == "trg-0002"
    data2 = json.loads(contract.get_trigger(t2))
    assert data2["threshold_scaled"] == 314500

    # 1 decimal place
    t3 = contract.create_trigger("nonce-3", "CUSR0000SA0", "2024", "M03", "GE", "314.5")
    assert t3 == "trg-0003"
    data3 = json.loads(contract.get_trigger(t3))
    assert data3["threshold_scaled"] == 314500

    # integer
    t4 = contract.create_trigger("nonce-4", "CUSR0000SA0", "2024", "M04", "GE", "300")
    assert t4 == "trg-0004"
    data4 = json.loads(contract.get_trigger(t4))
    assert data4["threshold_scaled"] == 300000

    # leading plus
    t5 = contract.create_trigger("nonce-5", "CUSR0000SA0", "2024", "M05", "GE", "+300.25")
    assert t5 == "trg-0005"
    data5 = json.loads(contract.get_trigger(t5))
    assert data5["threshold_scaled"] == 300250

    # negative decimal
    t6 = contract.create_trigger("nonce-6", "CUSR0000SA0", "2024", "M06", "GE", "-15.5")
    assert t6 == "trg-0006"
    data6 = json.loads(contract.get_trigger(t6))
    assert data6["threshold_scaled"] == -15500


def test_create_trigger_invalid_decimals(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)

    # Excess precision (>3 decimals)
    with pytest.raises(Exception, match="Excess precision"):
        contract.create_trigger("nonce-e1", "CUSR0000SA0", "2024", "M05", "GE", "314.1234")

    # Exponent notation
    with pytest.raises(Exception, match="Exponent notation"):
        contract.create_trigger("nonce-e2", "CUSR0000SA0", "2024", "M05", "GE", "1e5")

    # Malformed / empty / ambiguous signs
    with pytest.raises(Exception):
        contract.create_trigger("nonce-e3", "CUSR0000SA0", "2024", "M05", "GE", "")

    with pytest.raises(Exception):
        contract.create_trigger("nonce-e4", "CUSR0000SA0", "2024", "M05", "GE", "++10.0")

    with pytest.raises(Exception):
        contract.create_trigger("nonce-e5", "CUSR0000SA0", "2024", "M05", "GE", "abc")


# ---------------------------------------------------------------------------
# 2. Allowlist & Validation Tests
# ---------------------------------------------------------------------------
def test_series_allowlist(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)

    # Both allowlisted series are accepted
    t1 = contract.create_trigger("n1", "CUSR0000SA0", "2024", "M05", "GE", "300.0")
    assert t1 == "trg-0001"
    t2 = contract.create_trigger("n2", "CUUR0000SA0", "2024", "M05", "GE", "300.0")
    assert t2 == "trg-0002"

    # Non-allowlisted series rejected
    with pytest.raises(Exception, match="Series not allowlisted"):
        contract.create_trigger("n3", "WPU00000000", "2024", "M05", "GE", "300.0")


def test_year_and_period_validation(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)

    # Invalid year
    with pytest.raises(Exception, match="Year"):
        contract.create_trigger("n1", "CUSR0000SA0", "1980", "M05", "GE", "300.0")
    with pytest.raises(Exception, match="Year"):
        contract.create_trigger("n2", "CUSR0000SA0", "2105", "M05", "GE", "300.0")
    with pytest.raises(Exception, match="Year"):
        contract.create_trigger("n3", "CUSR0000SA0", "24", "M05", "GE", "300.0")

    # Invalid period
    with pytest.raises(Exception, match="Period"):
        contract.create_trigger("n4", "CUSR0000SA0", "2024", "M00", "GE", "300.0")
    with pytest.raises(Exception, match="Period"):
        contract.create_trigger("n5", "CUSR0000SA0", "2024", "M13", "GE", "300.0")
    with pytest.raises(Exception, match="Period"):
        contract.create_trigger("n6", "CUSR0000SA0", "2024", "Q01", "GE", "300.0")


def test_operator_validation(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)

    t1 = contract.create_trigger("n1", "CUSR0000SA0", "2024", "M05", "GE", "300.0")
    t2 = contract.create_trigger("n2", "CUSR0000SA0", "2024", "M05", "LE", "300.0")
    assert t1 and t2

    with pytest.raises(Exception, match="Operator"):
        contract.create_trigger("n3", "CUSR0000SA0", "2024", "M05", "GT", "300.0")
    with pytest.raises(Exception, match="Operator"):
        contract.create_trigger("n4", "CUSR0000SA0", "2024", "M05", "EQ", "300.0")


# ---------------------------------------------------------------------------
# 3. Duplicate Prevention & Caps
# ---------------------------------------------------------------------------
def test_owner_nonce_replay_rejected(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    contract.create_trigger("fixed-nonce", "CUSR0000SA0", "2024", "M05", "GE", "300.0")

    with pytest.raises(Exception, match="Trigger already created with this owner and client nonce"):
        contract.create_trigger("fixed-nonce", "CUSR0000SA0", "2024", "M06", "GE", "305.0")


def test_active_canonical_duplicate_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy, direct_alice)
    contract.create_trigger("nonce-a", "CUSR0000SA0", "2024", "M05", "GE", "300.0")

    # Bob attempts to create identical active trigger
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="Active trigger with identical canonical definition already exists"):
        contract.create_trigger("nonce-b", "CUSR0000SA0", "2024", "M05", "GE", "300.0")


def test_max_triggers_cap(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    for i in range(64):
        contract.create_trigger(f"cap-nonce-{i}", "CUSR0000SA0", "2024", "M01", "GE", str(100 + i))

    assert contract.get_trigger_count() == 64
    with pytest.raises(Exception, match="Maximum 64 triggers reached"):
        contract.create_trigger("cap-nonce-65", "CUSR0000SA0", "2024", "M01", "GE", "999")


# ---------------------------------------------------------------------------
# 4. Freeze & Immutability Tests
# ---------------------------------------------------------------------------
def test_freeze_trigger_auth_and_state(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-f", "CUSR0000SA0", "2024", "M05", "GE", "300.0")

    # Bob cannot freeze Alice's trigger
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="Only the trigger owner may freeze"):
        contract.freeze_trigger(trg_id)

    # Alice freezes
    direct_vm.sender = direct_alice
    res = contract.freeze_trigger(trg_id)
    assert res == "FROZEN"

    data = json.loads(contract.get_trigger(trg_id))
    assert data["state"] == "FROZEN"

    # Cannot freeze twice
    with pytest.raises(Exception, match="Only DRAFT triggers can be frozen"):
        contract.freeze_trigger(trg_id)


# ---------------------------------------------------------------------------
# 5. Initial Observation Lifecycle Tests
# ---------------------------------------------------------------------------
def test_observe_initial_above_threshold_ge(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    # Threshold 310.000, value in fixture is 314.069 -> condition met (GE)
    trg_id = contract.create_trigger("nonce-o1", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    fixture_body = read_fixture("bls_sa_2024_may_valid.json")
    mock_bls_web(direct_vm, fixture_body)
    mock_llm_comparability(direct_vm, "COMPARABLE")

    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNCHANGED_ABOVE"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "CONFIRMED_ACTIVE"
    assert trg["effective_state"] == "CONFIRMED_ACTIVE"
    assert trg["vintage_count"] == 1

    v0 = json.loads(contract.get_vintage(trg_id, 0))
    assert v0["raw_value"] == "314.069"
    assert v0["value_scaled"] == 314069
    assert v0["outcome"] == "UNCHANGED_ABOVE"
    assert v0["is_hold"] is False
    assert len(v0["footnotes"]) == 1
    assert v0["footnotes"][0]["code"] == "P"


def test_observe_initial_below_threshold_ge(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    # Threshold 320.000, value is 314.069 -> condition not met (GE)
    trg_id = contract.create_trigger("nonce-o2", "CUSR0000SA0", "2024", "M05", "GE", "320.0")
    contract.freeze_trigger(trg_id)

    fixture_body = read_fixture("bls_sa_2024_may_valid.json")
    mock_bls_web(direct_vm, fixture_body)
    mock_llm_comparability(direct_vm, "COMPARABLE")

    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNCHANGED_BELOW"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "CONFIRMED_INACTIVE"


def test_observe_initial_le_operator(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    # LE operator: condition met if value <= threshold
    # 314.069 <= 320.000 -> CONFIRMED_ACTIVE
    trg_id = contract.create_trigger("nonce-le1", "CUSR0000SA0", "2024", "M05", "LE", "320.0")
    contract.freeze_trigger(trg_id)

    fixture_body = read_fixture("bls_sa_2024_may_valid.json")
    mock_bls_web(direct_vm, fixture_body)
    mock_llm_comparability(direct_vm, "COMPARABLE")

    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNCHANGED_ABOVE"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "CONFIRMED_ACTIVE"


def test_observe_initial_boundary_equality(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    # Exactly equal threshold: 314.069
    trg_id = contract.create_trigger("nonce-eq", "CUSR0000SA0", "2024", "M05", "GE", "314.069")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")

    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNCHANGED_ABOVE"
    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "CONFIRMED_ACTIVE"


# ---------------------------------------------------------------------------
# 6. Revalidation & Revision Lifecycle Tests
# ---------------------------------------------------------------------------
def test_revalidate_identical_fingerprint_refreshes_ttl_without_duplicate(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-rv1", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    valid_json = read_fixture("bls_sa_2024_may_valid.json")
    mock_bls_web(direct_vm, valid_json)
    mock_llm_comparability(direct_vm, "COMPARABLE")

    contract.observe_initial(trg_id)
    assert contract.get_vintage_count(trg_id) == 1

    # Time passes, same data returned by BLS
    direct_vm.warp("2026-09-10T12:00:00+00:00")
    mock_bls_web(direct_vm, valid_json)
    mock_llm_comparability(direct_vm, "COMPARABLE")
    outcome = contract.revalidate_trigger(trg_id)
    assert outcome == "UNCHANGED_ABOVE"

    # Vintage count remains 1 to avoid cluttering 5-vintage history
    assert contract.get_vintage_count(trg_id) == 1
    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["latest_observed_at"] == "2026-09-10T12:00:00+00:00"


def test_revalidate_revised_still_above(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-rv2", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    contract.observe_initial(trg_id)

    # BLS releases upward revision to 315.200 (still above 310.0)
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_revised_higher.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    outcome = contract.revalidate_trigger(trg_id)
    assert outcome == "REVISED_STILL_ABOVE"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "RECONFIRMED"
    assert trg["vintage_count"] == 2

    v1 = json.loads(contract.get_vintage(trg_id, 1))
    assert v1["value_scaled"] == 315200
    assert v1["outcome"] == "REVISED_STILL_ABOVE"


def test_revalidate_revised_below_threshold_reverses_trigger(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    # Threshold 313.000: initial 314.069 was ACTIVE; downward revision to 312.500 reverses trigger
    trg_id = contract.create_trigger("nonce-rv3", "CUSR0000SA0", "2024", "M05", "GE", "313.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    contract.observe_initial(trg_id)

    # Revision downward to 312.500
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_revised_lower.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    outcome = contract.revalidate_trigger(trg_id)
    assert outcome == "REVISED_BELOW"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "REVERSED_BY_REVISION"
    assert trg["effective_state"] == "REVERSED_BY_REVISION"


def test_revalidate_activated_by_revision(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    # Threshold 315.000: initial 314.069 was INACTIVE; revision to 315.200 activates trigger
    trg_id = contract.create_trigger("nonce-rv4", "CUSR0000SA0", "2024", "M05", "GE", "315.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    contract.observe_initial(trg_id)
    assert json.loads(contract.get_trigger(trg_id))["state"] == "CONFIRMED_INACTIVE"

    # Upward revision to 315.200
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_revised_higher.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    outcome = contract.revalidate_trigger(trg_id)
    assert outcome == "REVISED_STILL_ABOVE"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "ACTIVATED_BY_REVISION"
    assert trg["effective_state"] == "ACTIVATED_BY_REVISION"


# ---------------------------------------------------------------------------
# 7. Metadata Comparability & Prompt Safety Tests
# ---------------------------------------------------------------------------
def test_material_definition_change_causes_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-comp1", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    contract.observe_initial(trg_id)

    # Revalidation indicates material definition change
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_revised_higher.json"))
    mock_llm_comparability(direct_vm, "MATERIAL_SERIES_DEFINITION_CHANGE", "Index base re-weighted")

    outcome = contract.revalidate_trigger(trg_id)
    assert outcome == "NOT_COMPARABLE"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "HOLD"
    assert trg["effective_state"] == "HOLD"

    eff = json.loads(contract.get_effective_trigger_state(trg_id))
    assert eff["is_hold"] is True
    assert eff["is_effective_active"] is False


def test_unknown_comparability_causes_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-comp2", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    contract.observe_initial(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_revised_higher.json"))
    mock_llm_comparability(direct_vm, "UNKNOWN", "Ambiguous series catalog metadata")

    outcome = contract.revalidate_trigger(trg_id)
    assert outcome == "NOT_COMPARABLE"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "HOLD"


def test_anonymous_api_uses_public_series_report_metadata(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-public-metadata", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    api_body = json.loads(read_fixture("bls_sa_2024_may_valid.json"))
    del api_body["Results"]["series"][0]["catalog"]
    mock_bls_web(direct_vm, json.dumps(api_body))
    mock_llm_comparability(direct_vm, "COMPARABLE", "Official series report metadata matched")

    assert contract.observe_initial(trg_id) == "UNCHANGED_ABOVE"
    vintage = json.loads(contract.get_vintage(trg_id, 0))
    assert vintage["comparability"] == "COMPARABLE"
    assert vintage["catalog"]["series_id"] == "CUSR0000SA0"
    assert vintage["catalog"]["base_period"] == "1982-84=100"


def test_live_sized_metadata_is_deterministically_bounded_before_llm(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-bounded-metadata", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    api_body = json.loads(read_fixture("bls_sa_2024_may_valid.json"))
    del api_body["Results"]["series"][0]["catalog"]
    live_sized_html = ("x" * 32000) + METADATA_HTML + ("y" * 32000)
    assert len(live_sized_html) > 20000
    mock_bls_web(direct_vm, json.dumps(api_body), metadata_body=live_sized_html)
    mock_llm_comparability(direct_vm, "COMPARABLE", "Bounded authoritative metadata matched")

    assert contract.observe_initial(trg_id) == "UNCHANGED_ABOVE"
    assert json.loads(contract.get_vintage(trg_id, 0))["comparability"] == "COMPARABLE"


def test_missing_api_and_series_report_metadata_fails_safe_to_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-missing-metadata", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    api_body = json.loads(read_fixture("bls_sa_2024_may_valid.json"))
    del api_body["Results"]["series"][0]["catalog"]
    mock_bls_web(direct_vm, json.dumps(api_body), metadata_body="", metadata_status=503)

    assert contract.observe_initial(trg_id) == "NOT_COMPARABLE"
    trigger = json.loads(contract.get_trigger(trg_id))
    vintage = json.loads(contract.get_vintage(trg_id, 0))
    assert trigger["state"] == "HOLD"
    assert vintage["comparability"] == "UNKNOWN"


def test_oversized_series_report_fails_safe_to_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-oversized-metadata", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    api_body = json.loads(read_fixture("bls_sa_2024_may_valid.json"))
    del api_body["Results"]["series"][0]["catalog"]
    mock_bls_web(direct_vm, json.dumps(api_body), metadata_body=METADATA_HTML + ("z" * 128000))

    assert contract.observe_initial(trg_id) == "NOT_COMPARABLE"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "HOLD"


# ---------------------------------------------------------------------------
# 8. Source Availability & Failure Tests (429, 500, Missing Data)
# ---------------------------------------------------------------------------
def test_transport_failure_causes_hold_never_false_reversal(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-tf", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    # Initial observation fails with HTTP 500
    mock_bls_web(direct_vm, "", status=500)
    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "HOLD"

    v0 = json.loads(contract.get_vintage(trg_id, 0))
    assert v0["is_hold"] is True
    assert v0["source_status"] == "UNRESOLVED"


def test_rate_limit_429_causes_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-429", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, "Too Many Requests", status=429)
    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "HOLD"


def test_missing_period_causes_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-mp", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_missing_period.json"))
    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "HOLD"


def test_duplicate_period_causes_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-dp", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_duplicate_period.json"))
    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"


def test_wrong_series_id_causes_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-ws", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_wrong_series.json"))
    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"


def test_malformed_decimal_causes_hold(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-md", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_malformed_decimal.json"))
    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"


def test_bls_api_status_failure(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-sf", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(direct_vm, read_fixture("bls_status_failure.json"))
    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"


def test_bls_api_status_failure_falls_back_to_official_series_page(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-page-fallback", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    mock_bls_web(
        direct_vm,
        json.dumps({"status": "REQUEST_NOT_PROCESSED", "Results": {}}),
        metadata_body=read_fixture("bls_series_page_2024_may.html"),
    )
    mock_llm_comparability(direct_vm, "COMPARABLE", "Official series page fallback matched")

    assert contract.observe_initial(trg_id) == "UNCHANGED_ABOVE"
    vintage = json.loads(contract.get_vintage(trg_id, 0))
    assert vintage["raw_value"] == "313.175"
    assert vintage["value_scaled"] == 313175
    assert vintage["exact_url"] == "https://data.bls.gov/timeseries/CUSR0000SA0"


# ---------------------------------------------------------------------------
# 9. TTL & Effective State Tests
# ---------------------------------------------------------------------------
def test_ttl_stale_boundary_derivation(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-ttl", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    direct_vm.warp("2026-08-01T12:00:00+00:00")
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    contract.observe_initial(trg_id)

    # 15 days later: still fresh (within 30 days)
    direct_vm.warp("2026-08-16T12:00:00+00:00")
    eff1 = json.loads(contract.get_effective_trigger_state(trg_id))
    assert eff1["is_effective_active"] is True
    assert eff1["is_stale"] is False
    assert eff1["effective_state"] == "CONFIRMED_ACTIVE"

    # Exactly 30 days + 1 second later: STALE (2026-08-31T12:00:01)
    direct_vm.warp("2026-08-31T12:00:01+00:00")
    eff2 = json.loads(contract.get_effective_trigger_state(trg_id))
    assert eff2["is_effective_active"] is False
    assert eff2["is_stale"] is True
    assert eff2["effective_state"] == "STALE"


# ---------------------------------------------------------------------------
# 10. Close Trigger & Lifecycle
# ---------------------------------------------------------------------------
def test_close_trigger(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-close", "CUSR0000SA0", "2024", "M05", "GE", "310.0")

    # Bob cannot close Alice's trigger
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="Only the trigger owner may close"):
        contract.close_trigger(trg_id)

    # Alice closes trigger
    direct_vm.sender = direct_alice
    res = contract.close_trigger(trg_id)
    assert res == "CLOSED"

    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "CLOSED"
    assert trg["effective_state"] == "CLOSED"

    # Cannot close already closed trigger
    with pytest.raises(Exception, match="already closed"):
        contract.close_trigger(trg_id)


# ---------------------------------------------------------------------------
# 11. Consumer Binding Tests
# ---------------------------------------------------------------------------
def test_consumer_namespace_binding(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-bind", "CUSR0000SA0", "2024", "M05", "GE", "310.0")

    # Bob binds his namespace to Alice's trigger
    direct_vm.sender = direct_bob
    binding_key = contract.bind_consumer("cpi-policy-dept", trg_id)
    assert binding_key == f"{direct_bob.as_hex}:cpi-policy-dept"

    resolved_id = contract.get_consumer_binding(str(direct_bob.as_hex), "cpi-policy-dept")
    assert resolved_id == trg_id

    # Invalid namespace rejected
    with pytest.raises(Exception, match="Namespace"):
        contract.bind_consumer("", trg_id)


# ---------------------------------------------------------------------------
# 12. Pagination & Views
# ---------------------------------------------------------------------------
def test_pagination_and_views(direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    for i in range(5):
        contract.create_trigger(f"nonce-p{i}", "CUSR0000SA0", "2024", f"M{i+1:02d}", "GE", str(300 + i))

    assert contract.get_trigger_count() == 5

    # Page 1: limit 3
    page1 = json.loads(contract.get_triggers_page(0, 3))
    assert len(page1) == 3
    assert page1[0]["id"] == "trg-0001"
    assert page1[2]["id"] == "trg-0003"

    # Page 2: offset 3, limit 3
    page2 = json.loads(contract.get_triggers_page(3, 3))
    assert len(page2) == 2
    assert page2[0]["id"] == "trg-0004"
    assert page2[1]["id"] == "trg-0005"

    # Lookup by owner + nonce
    found_id = contract.get_owner_nonce_trigger(str(direct_alice.as_hex), "nonce-p2")
    assert found_id == "trg-0003"


# ---------------------------------------------------------------------------
# 13. Contract Upgrade Tests
# ---------------------------------------------------------------------------
def test_upgrade_contract_auth(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_deploy, direct_alice)
    assert contract.get_upgrader() == direct_alice

    # Bob cannot upgrade
    direct_vm.sender = direct_bob
    with pytest.raises(Exception, match="Only the recorded upgrader"):
        contract.upgrade(b"new-contract-code-bytes")

    # Empty code rejected
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="empty"):
        contract.upgrade(b"")

    # Valid upgrade succeeds
    contract.upgrade(b"# new contract version code")


# ---------------------------------------------------------------------------
# 14. Blocker 6 Regression Tests: Evidence Bounds, HOLD Recovery, Canonical Key Release
# ---------------------------------------------------------------------------
def test_catalog_and_footnote_evidence_bounds(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-bound1", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    # 1. Test unallowlisted catalog key causes UNRESOLVED
    bad_catalog_json = json.loads(read_fixture("bls_sa_2024_may_valid.json"))
    bad_catalog_json["Results"]["series"][0]["catalog"]["malicious_key_or_injection"] = "some value"
    mock_bls_web(direct_vm, json.dumps(bad_catalog_json))

    outcome = contract.observe_initial(trg_id)
    assert outcome == "UNRESOLVED"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "HOLD"

    # 2. Test excess footnotes count (> 5) causes UNRESOLVED
    trg2 = contract.create_trigger("nonce-bound2", "CUSR0000SA0", "2024", "M06", "GE", "310.0")
    contract.freeze_trigger(trg2)

    excess_fn_json = json.loads(read_fixture("bls_sa_2024_may_valid.json"))
    excess_fn_json["Results"]["series"][0]["data"][0]["period"] = "M06"
    excess_fn_json["Results"]["series"][0]["data"][0]["footnotes"] = [
        {"code": f"F{i}", "text": f"Footnote number {i}"} for i in range(8)
    ]
    mock_bls_web(direct_vm, json.dumps(excess_fn_json))

    outcome2 = contract.observe_initial(trg2)
    assert outcome2 == "UNRESOLVED"
    assert json.loads(contract.get_trigger(trg2))["state"] == "HOLD"


def test_hold_recovery_to_active_without_false_revision(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    # Threshold 310.0: initial value 314.069 -> CONFIRMED_ACTIVE
    trg_id = contract.create_trigger("nonce-hr1", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    # Step 1: Initial observation succeeds
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    res1 = contract.observe_initial(trg_id)
    assert res1 == "UNCHANGED_ABOVE"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "CONFIRMED_ACTIVE"
    assert contract.get_vintage_count(trg_id) == 1

    # Step 2: BLS infrastructure outage (HTTP 500) -> transitions to HOLD
    mock_bls_web(direct_vm, "", status=500)
    res2 = contract.revalidate_trigger(trg_id)
    assert res2 == "UNRESOLVED"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "HOLD"
    assert contract.get_vintage_count(trg_id) == 2

    # Step 3: Outage recovers, BLS returns original 314.069
    # Recovery must compare against Vintage 0 (314.069), NOT the failed Vintage 1!
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    res3 = contract.revalidate_trigger(trg_id)
    assert res3 == "UNCHANGED_ABOVE"
    trg = json.loads(contract.get_trigger(trg_id))
    assert trg["state"] == "RECONFIRMED"
    assert trg["effective_state"] == "RECONFIRMED"

    # Step 4: Subsequent real revision higher to 315.200
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_revised_higher.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    res4 = contract.revalidate_trigger(trg_id)
    assert res4 == "REVISED_STILL_ABOVE"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "RECONFIRMED"


def test_initial_hold_recovery_semantics(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)
    trg_id = contract.create_trigger("nonce-ihr", "CUSR0000SA0", "2024", "M05", "GE", "310.0")
    contract.freeze_trigger(trg_id)

    # Initial observation fails with 500 -> HOLD
    mock_bls_web(direct_vm, "", status=500)
    res1 = contract.observe_initial(trg_id)
    assert res1 == "UNRESOLVED"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "HOLD"

    # Revalidation succeeds with 314.069 -> Evaluates with initial observation semantics
    mock_bls_web(direct_vm, read_fixture("bls_sa_2024_may_valid.json"))
    mock_llm_comparability(direct_vm, "COMPARABLE")
    res2 = contract.revalidate_trigger(trg_id)
    assert res2 == "UNCHANGED_ABOVE"
    assert json.loads(contract.get_trigger(trg_id))["state"] == "CONFIRMED_ACTIVE"


def test_canonical_key_release_on_close(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_deploy, direct_alice)

    # 1. Create trigger with specific canonical definition
    t1 = contract.create_trigger("nonce-rel1", "CUSR0000SA0", "2024", "M05", "GE", "300.0")
    assert t1 == "trg-0001"

    # 2. Cannot create duplicate while t1 is active
    with pytest.raises(Exception, match="Active trigger with identical canonical definition already exists"):
        contract.create_trigger("nonce-rel2", "CUSR0000SA0", "2024", "M05", "GE", "300.0")

    # 3. Close trigger t1
    contract.close_trigger(t1)
    assert json.loads(contract.get_trigger(t1))["state"] == "CLOSED"

    # 4. Creating the same canonical trigger now succeeds because canonical key was released
    t2 = contract.create_trigger("nonce-rel3", "CUSR0000SA0", "2024", "M05", "GE", "300.0")
    assert t2 == "trg-0002"
