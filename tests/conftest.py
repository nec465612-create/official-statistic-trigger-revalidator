import os
import sys
from pathlib import Path

import pytest
from gltest.direct.loader import create_address
from gltest.direct.sdk_loader import setup_sdk_paths
from gltest.direct.vm import VMContext


CONTRACT_PATH = Path(__file__).parents[1] / "contracts" / "official_statistic_trigger_revalidator.py"

# Setup SDK paths before creating address fixtures
setup_sdk_paths(CONTRACT_PATH)


def _sdk_address(seed: str):
    setup_sdk_paths(CONTRACT_PATH)
    return create_address(seed)


@pytest.fixture
def direct_alice():
    return _sdk_address("alice")


@pytest.fixture
def direct_bob():
    return _sdk_address("bob")


@pytest.fixture
def direct_charlie():
    return _sdk_address("charlie")


@pytest.fixture
def direct_zero_address():
    setup_sdk_paths(CONTRACT_PATH)
    from genlayer.py.types import Address
    return Address(bytes(20))


# Patch VMContext._refresh_gl_message to ensure datetime is updated on warp
_original_refresh_gl_message = VMContext._refresh_gl_message


def _refresh_gl_message_with_datetime(self):
    _original_refresh_gl_message(self)
    if "genlayer.gl" in sys.modules:
        gl = sys.modules["genlayer.gl"]
        if hasattr(gl, "message_raw") and gl.message_raw is not None:
            gl.message_raw["datetime"] = self._datetime


VMContext._refresh_gl_message = _refresh_gl_message_with_datetime


if os.name == "nt":
    import gltest.direct.loader as _direct_loader

    _original_inject_message = _direct_loader._inject_message_to_fd0
    _original_load_module = _direct_loader._load_module

    def _inject_message_windows_compat(vm):
        try:
            _original_inject_message(vm)
        except PermissionError as error:
            if getattr(error, "winerror", None) != 32:
                raise

    _direct_loader._inject_message_to_fd0 = _inject_message_windows_compat

    def _load_module_with_contract_isolation(contract_path):
        registry = sys.modules.get("genlayer.gl.genvm_contracts")
        if registry is not None:
            registry.__known_contract__ = None
        return _original_load_module(contract_path)

    _direct_loader._load_module = _load_module_with_contract_isolation


@pytest.fixture(autouse=True)
def configure_direct_mode(direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.strict_mocks = False
    direct_vm.check_pickling = True
    direct_vm.warp("2026-08-25T12:00:00+00:00")
    yield
