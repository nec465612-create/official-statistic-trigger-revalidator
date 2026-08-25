import os
import pytest
import requests

BLS_LIVE_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/CUSR0000SA0?startyear=2024&endyear=2024"
BLS_METADATA_URL = "https://data.bls.gov/timeseries/CUSR0000SA0"
BLS_HEADERS = {"User-Agent": "Official-Statistic-Trigger-Revalidator/1.0"}
MAX_METADATA_RESPONSE_LEN = 128000
MAX_METADATA_EXCERPT_LEN = 6000


def bounded_excerpt(metadata_text: str) -> str:
    anchors = ["CUSR0000SA0", "Series Title:", "Seasonally Adjusted", "Area:", "Item:", "Base Period:"]
    assert 0 < len(metadata_text) <= MAX_METADATA_RESPONSE_LEN
    lowered = metadata_text.lower()
    excerpts = []
    for anchor in anchors:
        position = lowered.find(anchor.lower())
        assert position >= 0, f"Missing public series metadata: {anchor}"
        excerpts.append(metadata_text[max(0, position - 160):position + len(anchor) + 480])
    result = "\n---\n".join(excerpts)
    assert 0 < len(result) <= MAX_METADATA_EXCERPT_LEN
    return result


@pytest.mark.live
def test_live_bls_public_api_availability():
    """
    Opt-in live read test against official BLS Public API.
    Excluded from default deterministic test runs unless RUN_LIVE_TESTS=1.
    """
    if os.environ.get("RUN_LIVE_TESTS") != "1":
        pytest.skip("Opt-in live test skipped (enable with RUN_LIVE_TESTS=1)")

    try:
        response = requests.get(BLS_LIVE_URL, headers=BLS_HEADERS, timeout=10)
        assert response.status_code == 200, f"BLS API returned HTTP {response.status_code}"
        data = response.json()
        assert data.get("status") == "REQUEST_SUCCEEDED", f"Status: {data.get('status')}"
        series = data.get("Results", {}).get("series", [])
        assert len(series) > 0, "No series returned"
        assert series[0].get("seriesID") == "CUSR0000SA0", "Mismatch in seriesID"
        assert not series[0].get("catalog"), "Anonymous GET unexpectedly returned registered catalog metadata"

        metadata_response = requests.get(BLS_METADATA_URL, headers=BLS_HEADERS, timeout=10)
        assert metadata_response.status_code == 200
        metadata_text = metadata_response.text
        assert len(metadata_text) > 20000, "Live response no longer exercises the prior oversized-response failure"
        excerpt = bounded_excerpt(metadata_text)
        for required_text in (
            "CUSR0000SA0",
            "Series Title:",
            "Seasonally Adjusted",
            "Area:",
            "Item:",
            "Base Period:",
        ):
            assert required_text in excerpt, f"Bounded excerpt omitted metadata: {required_text}"
    except requests.exceptions.RequestException as e:
        pytest.skip(f"Live BLS API unavailable or rate-limited: {e}")
