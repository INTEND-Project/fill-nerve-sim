import uuid
import datetime
import os
import yaml
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request, Response, Body
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

from database import get_db
from models import NodeCreate, NodeStateUpdate, WorkloadCreate, WorkloadVersionCreate
from logging_utils import log_event, get_log_dir

app = FastAPI(title="Simulated TTTech Nerve API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_id() -> str:
    """Generate a UUID4 string for database objects."""
    return str(uuid.uuid4())


@app.get("/nerve/nodes/list")
def list_nodes(serialNumber: Optional[str] = Query(default=None)):
    """List all nodes or filter by serial number."""
    db = get_db()
    query = {}
    if serialNumber:
        query["serialNumber"] = serialNumber
    nodes = list(db.nodes.find(query))
    return {"nodes": nodes}


@app.get("/nerve/node/{serialNumber}")
def get_node(serialNumber: str):
    """Get a single node by its serial number."""
    db = get_db()
    node = db.nodes.find_one({"serialNumber": serialNumber})
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@app.put("/nerve/node/{serialNumber}/state")
def update_node_state(serialNumber: str, payload: NodeStateUpdate):
    """Update a node's state (ONLINE/OFFLINE)."""
    next_state = payload.state.strip().upper()
    if next_state not in {"ONLINE", "OFFLINE"}:
        log_event("node.state_change_failed", {"serialNumber": serialNumber, "reason": "invalid_state"})
        raise HTTPException(status_code=400, detail="State must be ONLINE or OFFLINE")
    db = get_db()
    result = db.nodes.update_one({"serialNumber": serialNumber}, {"$set": {"state": next_state}})
    if result.matched_count == 0:
        log_event("node.state_change_failed", {"serialNumber": serialNumber, "reason": "not_found"})
        raise HTTPException(status_code=404, detail="Node not found")
    node = db.nodes.find_one({"serialNumber": serialNumber})
    log_event("node.state_changed", {"serialNumber": serialNumber, "state": next_state})
    return node


@app.post("/nerve/node")
def create_node(node: NodeCreate):
    """Create a new node."""
    db = get_db()
    # Ensure serial number is unique
    existing = db.nodes.find_one({"serialNumber": node.serialNumber})
    if existing:
        log_event("node.create_failed", {"serialNumber": node.serialNumber, "reason": "already_exists"})
        raise HTTPException(status_code=409, detail="Node with this serial number already exists")

    doc = node.dict()
    doc["_id"] = generate_id()
    requested_state = (node.state or "OFFLINE").strip().upper()
    if requested_state not in {"ONLINE", "OFFLINE", "UNKNOWN"}:
        raise HTTPException(status_code=400, detail="State must be ONLINE, OFFLINE, or UNKNOWN")
    doc["state"] = requested_state
    doc["createdAt"] = datetime.datetime.utcnow()
    doc["deployed_workloads"] = []

    db.nodes.insert_one(doc)
    log_event(
        "node.created",
        {
            "serialNumber": doc["serialNumber"],
            "state": doc["state"],
            "name": doc.get("name"),
            "model": doc.get("model"),
        },
    )
    return doc


@app.get("/nerve/v3/workloads")
def list_workloads(limit: int = Query(default=200, gt=0)):
    """List workloads with an optional limit."""
    db = get_db()
    workloads = list(db.workloads.find().limit(limit))
    return {"data": workloads, "totalCount": len(workloads)}


@app.post("/nerve/v3/workloads")
def create_workload(workload: WorkloadCreate):
    """Create a new workload."""
    db = get_db()
    # Ensure unique name
    existing = db.workloads.find_one({"name": workload.name})
    if existing:
        log_event("workload.create_failed", {"name": workload.name, "reason": "already_exists"})
        raise HTTPException(status_code=409, detail="Workload with this name already exists")
    doc = workload.dict()
    doc["_id"] = generate_id()
    doc["versions"] = []
    db.workloads.insert_one(doc)
    log_event("workload.created", {"id": doc["_id"], "name": doc["name"], "type": doc["type"]})
    return doc


@app.get("/nerve/v3/workloads/{workload_id}")
def get_workload(workload_id: str):
    """Get workload details by ID."""
    db = get_db()
    workload = db.workloads.find_one({"_id": workload_id})
    if not workload:
        raise HTTPException(status_code=404, detail="Workload not found")
    return workload


@app.post("/nerve/v3/workloads/{workload_id}/versions")
def create_workload_version(workload_id: str, version: WorkloadVersionCreate):
    """Create a new version for a workload."""
    db = get_db()
    workload = db.workloads.find_one({"_id": workload_id})
    if not workload:
        log_event("workload_version.create_failed", {"workload_id": workload_id, "reason": "workload_not_found"})
        raise HTTPException(status_code=404, detail="Workload not found")
    version_id = generate_id()
    now = datetime.datetime.utcnow()
    version_doc = {
        "_id": version_id,
        "name": version.name,
        "releaseName": version.releaseName or version.name,
        "selectors": version.selectors or [],
        "createdAt": now,
    }
    db.workloads.update_one({"_id": workload_id}, {"$push": {"versions": version_doc}})
    log_event(
        "workload_version.created",
        {
            "workload_id": workload_id,
            "workload_name": workload.get("name"),
            "version_id": version_id,
            "version_name": version_doc["name"],
        },
    )
    return version_doc


@app.get("/nerve/v3/workloads/{workload_id}/versions")
def list_workload_versions(workload_id: str):
    """List versions of a workload."""
    db = get_db()
    workload = db.workloads.find_one({"_id": workload_id}, {"versions": 1})
    if not workload:
        raise HTTPException(status_code=404, detail="Workload not found")
    return {"versions": workload.get("versions", [])}


@app.get("/nerve/dna/{serialNumber}/target")
def get_dna_target(serialNumber: str):
    """Get the target DNA configuration for a node as YAML."""
    db = get_db()
    node = db.nodes.find_one({"serialNumber": serialNumber}, {"deployed_workloads": 1})
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    deployed_workloads = node.get("deployed_workloads", [])
    config = {"schema_version": 1, "workloads": deployed_workloads}
    # Convert dict to YAML string
    yaml_str = yaml.safe_dump(config)
    return PlainTextResponse(content=yaml_str, media_type="text/yaml")


@app.put("/nerve/dna/{serialNumber}/target")
def apply_dna_target(
    serialNumber: str,
    body: bytes = Body(..., media_type="text/yaml"),
    continueInCaseOfRestart: Optional[bool] = False,
    restartAllWorkloads: Optional[bool] = False,
    removeDockerImages: Optional[bool] = True,
):
    """Apply a target DNA configuration from YAML payload."""
    db = get_db()
    node = db.nodes.find_one({"serialNumber": serialNumber})
    if not node:
        log_event("dna.apply_failed", {"serialNumber": serialNumber, "reason": "node_not_found"})
        raise HTTPException(status_code=404, detail="Node not found")
    if node.get("state") == "OFFLINE":
        log_event("dna.apply_failed", {"serialNumber": serialNumber, "reason": "node_offline"})
        raise HTTPException(status_code=409, detail="Node is OFFLINE; deployment is not possible")
    if not body:
        log_event("dna.apply_failed", {"serialNumber": serialNumber, "reason": "empty_body"})
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        yaml_str = body.decode("utf-8")
        config_dict = yaml.safe_load(yaml_str)
    except Exception as e:
        log_event("dna.apply_failed", {"serialNumber": serialNumber, "reason": "invalid_yaml"})
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
    if not isinstance(config_dict, dict) or "workloads" not in config_dict:
        log_event("dna.apply_failed", {"serialNumber": serialNumber, "reason": "invalid_format"})
        raise HTTPException(status_code=400, detail="Invalid target configuration format")
    if not isinstance(config_dict.get("workloads"), list):
        log_event("dna.apply_failed", {"serialNumber": serialNumber, "reason": "invalid_workloads"})
        raise HTTPException(status_code=400, detail="Invalid target configuration format")
    # Validate workload/version pairs against known workloads (case-insensitive).
    valid_pairs = set()
    for workload in db.workloads.find({}, {"name": 1, "versions": 1}):
        workload_name = (workload.get("name") or "").strip().lower()
        if not workload_name:
            continue
        for version in workload.get("versions", []):
            version_name = (version.get("name") or "").strip().lower()
            if version_name:
                valid_pairs.add((workload_name, version_name))
    invalid_entries = []
    for entry in config_dict.get("workloads", []):
        if not isinstance(entry, dict):
            invalid_entries.append({"workload": None, "version": None})
            continue
        workload_name = (entry.get("name") or "").strip()
        version_name = (entry.get("version") or "").strip()
        if not workload_name or not version_name:
            invalid_entries.append({"workload": workload_name or None, "version": version_name or None})
            continue
        pair = (workload_name.lower(), version_name.lower())
        if pair not in valid_pairs:
            invalid_entries.append({"workload": workload_name, "version": version_name})
    if invalid_entries:
        log_event(
            "dna.apply_failed",
            {"serialNumber": serialNumber, "reason": "invalid_workload_versions", "invalid": invalid_entries},
        )
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid workload-version pairs in target",
                "invalid": invalid_entries,
            },
        )
    existing = node.get("deployed_workloads", [])
    existing_map = {}
    for entry in existing:
        if not isinstance(entry, dict):
            continue
        name = (entry.get("name") or "").strip()
        version = (entry.get("version") or "").strip()
        if not name or not version:
            continue
        existing_map[(name.lower(), version.lower())] = entry
    new_map = {}
    for entry in config_dict.get("workloads", []):
        if not isinstance(entry, dict):
            continue
        name = (entry.get("name") or "").strip()
        version = (entry.get("version") or "").strip()
        if not name or not version:
            continue
        new_map[(name.lower(), version.lower())] = entry
    deployed_keys = sorted(set(new_map.keys()) - set(existing_map.keys()))
    undeployed_keys = sorted(set(existing_map.keys()) - set(new_map.keys()))
    # Update node with deployed workloads only
    db.nodes.update_one(
        {"serialNumber": serialNumber},
        {
            "$set": {
                "deployed_workloads": config_dict.get("workloads", []),
            }
        },
    )
    for key in deployed_keys:
        entry = new_map.get(key)
        if entry:
            log_event(
                "workload_version.deployed",
                {
                    "serialNumber": serialNumber,
                    "workload": entry.get("name"),
                    "version": entry.get("version"),
                },
            )
    for key in undeployed_keys:
        entry = existing_map.get(key)
        if entry:
            log_event(
                "workload_version.undeployed",
                {
                    "serialNumber": serialNumber,
                    "workload": entry.get("name"),
                    "version": entry.get("version"),
                },
            )
    log_event(
        "dna.target_applied",
        {"serialNumber": serialNumber, "workloadCount": len(config_dict.get("workloads", []))},
    )
    return JSONResponse(content={"message": "DNA configuration accepted and will be applied"}, status_code=202)


@app.delete("/nerve/node/{serialNumber}")
def delete_node(serialNumber: str):
    """
    Delete a node by its serial number.
    """
    db = get_db()
    node = db.nodes.find_one({"serialNumber": serialNumber}, {"serialNumber": 1, "name": 1, "model": 1})
    result = db.nodes.delete_one({"serialNumber": serialNumber})
    if result.deleted_count == 0:
        log_event("node.delete_failed", {"serialNumber": serialNumber, "reason": "not_found"})
        raise HTTPException(status_code=404, detail="Node not found")
    log_event(
        "node.deleted",
        {
            "serialNumber": serialNumber,
            "name": node.get("name") if node else None,
            "model": node.get("model") if node else None,
        },
    )
    # Optionally remove any target/deployed config for this node if needed.
    return {"message": "Node deleted"}


@app.delete("/nerve/v3/workloads/{workload_id}")
def delete_workload(workload_id: str):
    """
    Delete an entire workload by its ID.
    """
    db = get_db()
    workload = db.workloads.find_one({"_id": workload_id}, {"_id": 1, "name": 1, "type": 1})
    result = db.workloads.delete_one({"_id": workload_id})
    if result.deleted_count == 0:
        log_event("workload.delete_failed", {"id": workload_id, "reason": "not_found"})
        raise HTTPException(status_code=404, detail="Workload not found")
    log_event(
        "workload.deleted",
        {"id": workload_id, "name": workload.get("name") if workload else None, "type": workload.get("type") if workload else None},
    )
    # Optionally, you could also clean up references in node DNA configs here.
    return {"message": "Workload deleted"}


@app.delete("/nerve/v3/workloads/{workload_id}/versions/{version_id}")
def delete_workload_version(workload_id: str, version_id: str):
    """
    Delete a specific workload version by its ID.
    """
    db = get_db()
    workload = db.workloads.find_one({"_id": workload_id}, {"_id": 1, "name": 1, "versions": 1})
    version_name = None
    if workload:
        for version in workload.get("versions", []):
            if version.get("_id") == version_id:
                version_name = version.get("name")
                break
    result = db.workloads.update_one(
        {"_id": workload_id},
        {"$pull": {"versions": {"_id": version_id}}}
    )
    # modified_count > 0 indicates that a version was removed
    if result.modified_count == 0:
        log_event(
            "workload_version.delete_failed",
            {"workload_id": workload_id, "version_id": version_id, "reason": "not_found"},
        )
        raise HTTPException(
            status_code=404,
            detail="Workload or version not found"
        )
    log_event(
        "workload_version.deleted",
        {
            "workload_id": workload_id,
            "workload_name": workload.get("name") if workload else None,
            "version_id": version_id,
            "version_name": version_name,
        },
    )
    return {"message": "Workload version deleted"}


@app.get("/nerve/logs")
def list_logs():
    """List available audit log files."""
    log_dir = get_log_dir()
    if not os.path.isdir(log_dir):
        return {"logs": []}
    logs = [
        name
        for name in os.listdir(log_dir)
        if name.endswith(".log") and os.path.isfile(os.path.join(log_dir, name))
    ]
    logs.sort()
    return {"logs": logs}


@app.get("/nerve/logs/{filename}")
def get_log_file(filename: str):
    """Get a specific audit log file as plain text."""
    if not filename.endswith(".log") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid log file name")
    log_dir = get_log_dir()
    path = os.path.join(log_dir, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Log file not found")
    with open(path, "r", encoding="utf-8") as handle:
        content = handle.read()
    return PlainTextResponse(content=content, media_type="text/plain")
