"""
Seed script for the FILL NERVE simulator.
Creates all machines (nodes) and workloads (Container1-42) from the FILL knowledge graph.

Usage:
    python3 seed.py [--host http://fill_app:3000]

Waits for the API to be ready before starting.
Skips any nodes or workloads that already exist.
"""

import requests
import sys
import time

HOST = sys.argv[1] if len(sys.argv) > 1 else "http://fill_app:3000"
MAX_RETRIES = 30
RETRY_DELAY = 2

# ── Machines from the TTL knowledge graph ──────────────────────────────────
NODES = [
    {"name": "node-01", "serialNumber": "SN0001", "model": "Machine1", "secureId": "ID161124_Active_Machine1", "ip": "10.4.200.001",  "labels": ["factory", "lineA"], "state": "ONLINE"},
    {"name": "node-02", "serialNumber": "SN0002", "model": "Machine4", "secureId": "ID161124_Active_Machine2", "ip": "10.4.200.002",  "labels": ["factory", "lineA"], "state": "ONLINE"},
    {"name": "node-03", "serialNumber": "SN0003", "model": "Machine2", "secureId": "ID161124_Active_Machine3", "ip": "192.168.10.001","labels": ["factory", "lineA"], "state": "ONLINE"},
    {"name": "node-04", "serialNumber": "SN0004", "model": "Machine2", "secureId": "ID161124_Active_Machine4", "ip": "192.168.10.002","labels": ["factory", "lineA"], "state": "ONLINE"},
    {"name": "node-05", "serialNumber": "SN0005", "model": "Machine1", "secureId": "ID161124_Active_Machine5", "ip": "10.2.45.01",   "labels": ["factory", "lineB"], "state": "ONLINE"},
    {"name": "node-06", "serialNumber": "SN0006", "model": "Machine4", "secureId": "ID161124_Active_Machine6", "ip": "10.2.45.02",   "labels": ["factory", "lineB"], "state": "ONLINE"},
    {"name": "node-07", "serialNumber": "SN0007", "model": "Machine3", "secureId": "ID161124_Active_Machine7", "ip": "192.168.6.001", "labels": ["factory", "lineB"], "state": "ONLINE"},
    {"name": "node-08", "serialNumber": "SN0008", "model": "Machine5", "secureId": "ID161124_Active_Machine8", "ip": "192.168.8.002", "labels": ["factory", "lineB"], "state": "ONLINE"},
]

NUM_CONTAINERS = 42
VERSION_NAME = "1.0.0"


def wait_for_api():
    print(f"Waiting for NERVE API at {HOST}...")
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(f"{HOST}/nerve/nodes/list", timeout=5)
            if resp.status_code == 200:
                print(f"  API is ready (attempt {attempt})")
                return True
        except requests.exceptions.ConnectionError:
            pass
        print(f"  Attempt {attempt}/{MAX_RETRIES} — not ready, retrying in {RETRY_DELAY}s...")
        time.sleep(RETRY_DELAY)
    print("ERROR: API did not become ready in time.")
    sys.exit(1)


def get_existing_nodes():
    """Return a set of existing serial numbers."""
    resp = requests.get(f"{HOST}/nerve/nodes/list")
    resp.raise_for_status()
    data = resp.json()
    nodes = data.get("nodes", []) if isinstance(data, dict) else data
    return {node["serialNumber"] for node in nodes}


def get_existing_workloads():
    """Return a set of existing workload names."""
    resp = requests.get(f"{HOST}/nerve/v3/workloads?limit=200")
    resp.raise_for_status()
    data = resp.json()
    workloads = data.get("data", []) if isinstance(data, dict) else data
    return {w["name"] for w in workloads}


def seed_nodes():
    print("\n── Seeding nodes ──")
    existing = get_existing_nodes()
    print(f"  Existing nodes: {sorted(existing)}")

    created = 0
    skipped = 0

    for node in NODES:
        if node["serialNumber"] in existing:
            print(f"  SKIP {node['name']} ({node['serialNumber']}) — already exists")
            skipped += 1
            continue

        resp = requests.post(
            f"{HOST}/nerve/node",
            json={
                "name": node["name"],
                "model": node["model"],
                "serialNumber": node["serialNumber"],
                "secureId": node["secureId"],
                "labels": node["labels"],
                "state": node["state"],
            },
        )
        if resp.status_code in (200, 201):
            print(f"  OK {node['name']} (SN={node['serialNumber']}, type={node['model']}, IP={node['ip']})")
            created += 1
        else:
            print(f"  ERROR {node['name']}: {resp.status_code} {resp.text}")

    print(f"  Nodes: {created} created, {skipped} skipped, {len(NODES)} total expected")


def seed_workloads():
    print("\n── Seeding workloads ──")
    existing = get_existing_workloads()
    print(f"  Existing workloads: {len(existing)} found")

    created = 0
    skipped = 0

    for i in range(1, NUM_CONTAINERS + 1):
        name = f"Container{i}"

        if name in existing:
            print(f"  SKIP {name} — already exists")
            skipped += 1
            continue

        resp = requests.post(
            f"{HOST}/nerve/v3/workloads",
            json={"name": name, "type": "docker", "disabled": False},
        )
        if resp.status_code not in (200, 201):
            print(f"  ERROR creating {name}: {resp.status_code} {resp.text}")
            continue

        workload_id = resp.json()["_id"]

        resp = requests.post(
            f"{HOST}/nerve/v3/workloads/{workload_id}/versions",
            json={
                "name": VERSION_NAME,
                "releaseName": VERSION_NAME,
                "selectors": [],
                "restartPolicy": "always",
                "resources": {},
                "environmentVariables": [],
                "secrets": [],
            },
        )
        if resp.status_code not in (200, 201):
            print(f"  ERROR creating version for {name}: {resp.status_code} {resp.text}")
            continue

        print(f"  OK {name} (id={workload_id}, version={VERSION_NAME})")
        created += 1

    print(f"  Workloads: {created} created, {skipped} skipped, {NUM_CONTAINERS} total expected")


def verify():
    print("\n── Verification ──")
    nodes_data = requests.get(f"{HOST}/nerve/nodes/list").json()
    nodes = nodes_data.get("nodes", []) if isinstance(nodes_data, dict) else nodes_data
    workloads_data = requests.get(f"{HOST}/nerve/v3/workloads?limit=200").json()
    workload_count = workloads_data.get("totalCount", len(workloads_data.get("data", [])))
    print(f"  Nodes in DB: {len(nodes)}")
    print(f"  Workloads in DB: {workload_count}")


def main():
    print(f"FILL NERVE Simulator — Database Seed")
    print(f"Host: {HOST}\n")

    wait_for_api()
    seed_nodes()
    seed_workloads()
    verify()

    print("\nDone.")


if __name__ == "__main__":
    main()