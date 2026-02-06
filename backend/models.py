from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# Node models
class NodeCreate(BaseModel):
    name: str
    model: str
    secureId: Optional[str] = None
    serialNumber: str
    labels: Optional[List[str]] = Field(default_factory=list)
    remoteConnections: Optional[List[dict]] = Field(default_factory=list)
    state: Optional[str] = None


class Node(NodeCreate):
    id: str = Field(alias="_id")
    state: str = "OFFLINE"
    createdAt: datetime


class NodeStateUpdate(BaseModel):
    state: str


# Workload models
class WorkloadCreate(BaseModel):
    name: str
    type: str
    description: Optional[str] = ""
    disabled: bool = False


class WorkloadVersionCreate(BaseModel):
    name: str
    releaseName: Optional[str] = None
    selectors: Optional[List[str]] = Field(default_factory=list)


class WorkloadVersion(BaseModel):
    id: str = Field(alias="_id")
    name: str
    releaseName: Optional[str]
    createdAt: datetime
    selectors: List[str] = Field(default_factory=list)


class Workload(WorkloadCreate):
    id: str = Field(alias="_id")
    versions: List[WorkloadVersion] = Field(default_factory=list)


# DNA models
class DNAWorkloadEntry(BaseModel):
    name: str
    version: str
    hash: Optional[str] = None
    compose_env: Optional[str] = Field(default=None, alias="compose_env")


class DNAConfig(BaseModel):
    schema_version: int
    workloads: List[DNAWorkloadEntry]
