import os
import pytest
import requests

BLS_LIVE_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/CUSR0000SA0?startyear=2024&endyear=2024"
BLS_HEADERS = {"User-Agent": "Official-Statistic-Trigger-Revalidator/1.0"}


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
    except requests.exceptions.RequestException as e:
        pytest.skip(f"Live BLS API unavailable or rate-limited: {e}")
