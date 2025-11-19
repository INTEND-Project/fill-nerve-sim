import uuid
import datetime
import yaml
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request, Response, Body
from fastapi.responses import JSONResponse, PlainTextResponse

from database import get_db
from models import NodeCreate, WorkloadCreate, WorkloadVersionCreate

app = FastAPI(title="Simulated TTTech Nerve API")


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


@app.post("/nerve/node")
def create_node(node: NodeCreate):
    """Create a new node."""
    db = get_db()
    # Ensure serial number is unique
    existing = db.nodes.find_one({"serialNumber": node.serialNumber})
    if existing:
        raise HTTPException(status_code=409, detail="Node with this serial number already exists")

    doc = node.dict()
    doc["_id"] = generate_id()
    doc["state"] = "OFFLINE"
    doc["createdAt"] = datetime.datetime.utcnow()
    # Initialize target configuration fields
    doc["target_config"] = None
    doc["deployed_workloads"] = []

    db.nodes.insert_one(doc)
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
        raise HTTPException(status_code=409, detail="Workload with this name already exists")
    doc = workload.dict()
    doc["_id"] = generate_id()
    doc["versions"] = []
    db.workloads.insert_one(doc)
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
    node = db.nodes.find_one({"serialNumber": serialNumber}, {"target_config": 1})
    if not node or not node.get("target_config"):
        raise HTTPException(status_code=404, detail="Target configuration not found")
    config = node["target_config"]
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
        raise HTTPException(status_code=404, detail="Node not found")
    if not body:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        yaml_str = body.decode("utf-8")
        config_dict = yaml.safe_load(yaml_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
    if not isinstance(config_dict, dict) or "workloads" not in config_dict:
        raise HTTPException(status_code=400, detail="Invalid target configuration format")
    # Update node with target configuration and deployed workloads
    db.nodes.update_one(
        {"serialNumber": serialNumber},
        {
            "$set": {
                "target_config": config_dict,
                "deployed_workloads": config_dict.get("workloads", []),
            }
        },
    )
    return JSONResponse(content={"message": "DNA configuration accepted and will be applied"}, status_code=202)
