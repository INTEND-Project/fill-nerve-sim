import yaml
from typing import Any, Dict

class InvalidConfigError(Exception):
    """Raised when the YAML is invalid or structure/types are wrong."""

class MissingKeyError(InvalidConfigError):
    """Raised when a required key is missing."""

class BaseProxy:
    def get_node_config(self, serial_number: str) -> dict:
        return """
schema_version: 1
workloads:
  - name: DC1
    version: version1
    hash: hash1
    compose_env: .env
  - name: DC2
    version: version2
        """
    
    def apply_node_config(self, serial_number: str, config: str) -> bool:
        
        """
        Parse and validate a node config YAML string.

        Raises:
        - InvalidConfigError: for parse errors or wrong types
        - MissingKeyError: if required keys ('workloads', 'name', 'version') are missing
        Returns:
        The parsed dict (safe_load result).
        """
        try:
            data = yaml.safe_load(config)
        except yaml.YAMLError as e:
            raise InvalidConfigError("YAML parse error") from e

        if not isinstance(data, dict):
            raise InvalidConfigError("Top-level YAML must be a mapping (dict).")

        if "workloads" not in data:
            raise MissingKeyError("Missing required key: 'workloads'")

        workloads = data["workloads"]
        if not isinstance(workloads, list):
            raise InvalidConfigError("'workloads' must be a list.")

        for i, w in enumerate(workloads):
            if not isinstance(w, dict):
                raise InvalidConfigError(f"Workload at index {i} must be a mapping (dict).")
            if "name" not in w:
                raise MissingKeyError(f"Missing required key 'name' in workload at index {i}")
            if "version" not in w:
                raise MissingKeyError(f"Missing required key 'version' in workload at index {i}")
            if not isinstance(w["name"], str) or not w["name"].strip():
                raise InvalidConfigError(f"'name' in workload at index {i} must be a non-empty string.")
            if not isinstance(w["version"], str) or not w["version"].strip():
                raise InvalidConfigError(f"'version' in workload at index {i} must be a non-empty string.")

        return data


# Example usage / quick test
if __name__ == "__main__":
    sample = """schema_version: 1
workloads:
  - name: DC1
    version: version1
    hash: hash1
    compose_env: .env
  - name: DC2
    version: version2
"""
    proxy = BaseProxy()
    cfg = proxy.apply_node_config("serial123", sample)
    assert cfg["workloads"][0]["name"] == "DC1"       