---
name: fill-api-invocation
description: Use the simulated FILL Nerve API to list nodes/workloads, resolve workload versions with explicit user selection, and apply DNA target deployments. Use when users need to deploy, undeploy, or inspect machine analytics workloads.
---

# FILL API Invocation

This skill explains how to use the simulated Nerve API to manage FILL machine data analytics.
The APIs can be used to check and manage machine nodes, workloads/versions, and deploy or undeploy workload versions via DNA target configuration.

Sample URL (local): `http://<host>:3000` Ask host (and port) before starting.

## Key rules (mandatory)
- If the user specifies a workload WITH an explicit version, the agent MUST use that exact version and MUST NOT change or normalize it.
- If the user specifies a workload WITHOUT an explicit version, the agent MUST NOT assume or automatically select a version. The agent MUST list available versions and request the user's explicit selection before proceeding. The agent MUST NOT proceed with deployment until the user provides or confirms a version. There is no default or timeout-based fallback.
- Preserve already-deployed workloads on the node by default: when constructing a target, DO NOT remove or change workloads that the user did not explicitly request to remove or update. "Preserve" means keep those workloads in addition to any newly requested workloads; it does NOT permit skipping a requested deployment because other workloads exist.
- When the user requests deployment of a named workload (name provided), the agent MUST ensure that workload is added to the node's target and the target is applied once the version is specified or confirmed by the user. Do NOT skip the requested deployment simply because other workloads are already deployed on the node.
- If applying a requested workload (user-specified version) would replace a different version of the same workload that is already deployed on the target, the agent MUST NOT silently overwrite that deployed version. Instead, it MUST prompt the user to confirm replacing the deployed version before changing it. After the user explicitly requests the deployment or confirms replacement, the agent MUST carry out the change and perform post-apply verification (see "Post-apply verification").
- The agent MUST NOT write, create, save, or persist any files to disk or to the workspace. This includes log files, JSON dumps, node objects, API traces, or any other data. System-level tracing and external logs are recorded automatically outside the agent and MUST NOT be duplicated by the agent.
- The agent's ONLY chat output after performing NERVE API actions is the concise one- or two-sentence summary defined in "Output formatting (mandatory)". The agent MUST NOT output additional files or store API responses on disk.

## Output formatting (mandatory)
These rules apply whenever the agent responds in chat after performing any action via the NERVE API (deploy, undeploy, inspect):
- The agent MUST NOT print raw JSON responses, the full node object, or the list/details of API calls in its chat reply.
- The agent MUST summarize the outcome in one or two short plain-language sentences.
- The summary MUST state only: which workload and version was deployed, removed, or inspected; the node serial number; and whether the action succeeded.
- The summary MUST remain factual and MAY ONLY mention fields actually returned by the NERVE API. For node responses, acceptable fields include only: _id, name, state, deployed_workloads, serialNumber, model, secureId, labels, remoteConnections, createdAt. Do NOT invent or include other fields.
- If an action fails, the agent MUST clearly state that it failed and provide the reason using the API error message/fields returned.
- Keep the chat reply concise (one or two sentences).
- The agent MUST NOT create or write logs, files, or traces to disk. System-level tracing is handled externally; the agent must not duplicate or persist API responses, node objects, or call traces in the workspace or any folder.

## How to use the API to deploy workloads (procedure)
Follow this procedure when the user requests deploying workloads to a node.

1. Determine input format
   - If the input is workload entries that include explicit versions (name + version), treat the versions as authoritative and skip version selection.
   - If the input is workload names with no versions, DO NOT select a version automatically. Instead, obtain and present the available versions to the user and request their explicit selection. The agent MUST wait for the user's explicit selection before proceeding. The agent MUST NOT implement any automatic selection or timeout-based fallback.

2. Obtain available versions (when user did not provide a version)
   - For each workload name without an explicit version:
     a. Call GET /nerve/v3/workloads to find the workload id by name.
     b. Call GET /nerve/v3/workloads/{workload_id}/versions to list available versions.
     c. Present the available versions to the user and request selection. The agent MUST wait for the user's explicit selection and confirmation. DO NOT pick a version on the user's behalf.
     d. Use the user-selected version verbatim in the target payload.

3. Merge with current DNA target (preserve existing workloads by default)
   - Retrieve the current target YAML: GET /nerve/dna/{serialNumber}/target (Accept: text/yaml).
   - Build the new target by:
     a. Starting with all workloads currently present in the target (preserves existing workloads by default).
     b. For each workload the user requested (with explicit version or after the user selected a version), upsert that workload entry (name + version) into the workloads list. This guarantees requested workloads are added alongside existing workloads.
     c. Leave any other workload entries unchanged unless the user explicitly requested their removal.

4. Conflict handling: existing deployed version differs
   - If upserting a requested workload would change the version for a workload already present in the current target (i.e., deployed version differs from requested version):
     a. DO NOT overwrite the deployed version automatically.
     b. Prompt the user to confirm replacing the deployed version. If the user confirms, apply the change; otherwise, leave the deployed version unchanged.
   - After the user explicitly requested the deployment or confirmed replacement, the agent MUST perform the apply and then run post-apply verification.

5. Apply the target
   - Ensure the resulting YAML complies with the simulator requirements: a top-level "schema_version" and a "workloads" list of objects with "name" and "version" fields.
   - PUT /nerve/dna/{serialNumber}/target with the YAML payload.

6. Post-apply verification (mandatory)
   - After a successful PUT /nerve/dna/{serialNumber}/target, the agent MUST retrieve the node: GET /nerve/node/{serialNumber}.
   - Verify that the requested workload appears in the node's deployed_workloads list with the expected version:
     a. If the user requested a specific version, verify that exact version is present.
     b. If the user requested only the workload name (and selected the version when prompted), verify that the version the user selected and applied appears.
   - If the requested workload and version appear as expected, treat the operation as successful.
   - If the requested workload or version does NOT appear as expected, treat the operation as a failure. Report failure in chat and include the API error message/fields where available. Do NOT report success.

## Examples
- User input: ["temperature-collector:1.0.0", "vibration-monitor:2.1.3"]
  - Use the provided versions exactly. Merge with current target and prompt only if replacing existing deployed versions. After apply, GET /nerve/node/{serialNumber} and verify both workloads appear with the specified versions.

- User input: ["temperature-collector", "vibration-monitor"]
  - For each workload, list available versions and present them to the user. The agent MUST wait for the user's explicit selection and confirmation of versions. Do NOT choose a version automatically. After the user selects versions, add them to the target alongside existing workloads. Apply the target, then GET /nerve/node/{serialNumber} and verify the selected versions appear.

- Conflict replacement example:
  - If node already has temperature-collector:1.0.0 and user requests temperature-collector:1.1.0, prompt for confirmation. If user confirms, apply the change and verify that temperature-collector:1.1.0 appears in the node's deployed_workloads. If verification fails, report failure with reason.

## Nodes: list, create, update state, delete

List all nodes (optionally filter by serial number):
GET /nerve/nodes/list
GET /nerve/nodes/list?serialNumber=SN1234

Get a single node by serial number:
GET /nerve/node/{serialNumber}

Create a node:
POST /nerve/node
Content-Type: application/json

{
  "name": "node-01",
  "model": "TTTech-R1",
  "serialNumber": "SN1234",
  "secureId": "SEC1234",
  "labels": ["factory", "lineA"],
  "state": "ONLINE"
}

Update node state (ONLINE/OFFLINE):
PUT /nerve/node/{serialNumber}/state
Content-Type: application/json

{
  "state": "OFFLINE"
}

Delete a node:
DELETE /nerve/node/{serialNumber}

## Workloads: list, create, delete

List workloads:
GET /nerve/v3/workloads?limit=200

Create a workload:
POST /nerve/v3/workloads
Content-Type: application/json

{
  "name": "temperature-collector",
  "type": "docker",
  "disabled": false
}

Delete a workload:
DELETE /nerve/v3/workloads/{workload_id}

## Workload versions: list, create, delete

List versions for a workload:
GET /nerve/v3/workloads/{workload_id}/versions

Create a workload version:
POST /nerve/v3/workloads/{workload_id}/versions
Content-Type: application/json

{
  "name": "1.0.0",
  "releaseName": "1.0.0",
  "selectors": [],
  "restartPolicy": "always",
  "resources": {},
  "environmentVariables": [],
  "secrets": []
}

Delete a workload version:
DELETE /nerve/v3/workloads/{workload_id}/versions/{version_id}

## Deploy or undeploy via DNA target

The DNA target represents the desired workload versions on a node. Applying a
new target deploys any new workload/version pairs and undeploys any removed
pairs.

Get current target (YAML):
GET /nerve/dna/{serialNumber}/target
Accept: text/yaml

Apply target (YAML):
PUT /nerve/dna/{serialNumber}/target
Content-Type: text/yaml

schema_version: 1
workloads:
  - name: temperature-collector
    version: 1.0.0
  - name: vibration-monitor
    version: 2.1.3

Rules enforced by the simulator:
- The node must exist and not be OFFLINE.
- Each workload/version pair must exist in the workload catalog.
- `workloads` must be a list of objects with `name` and `version`.

To undeploy a workload version, remove it from the `workloads` list and reapply
the target.
