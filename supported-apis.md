# TTTech Nerve API methods

Below are common management system (MS) endpoints for **Nerve API**.  The examples are based on TTTech’s `nerve‑lib` library, which maps directly to the REST endpoints.  Each operation includes the HTTP method, the endpoint, and sample input/output.  The serial numbers and IDs in the samples are illustrative.

## 1 List all nodes

- **HTTP method:** `GET`
- **Endpoint:** `/nerve/nodes/list`  
  This endpoint returns all registered nodes.  A `serialNumber` query parameter can be added to filter by serial number【267046878551359†L718-L744】.

**Sample request:**
```http
GET /nerve/nodes/list HTTP/1.1
Host: <management‑system>
Authorization: Bearer <token>
```

**Sample response (JSON):**
```json
{
  "nodes": [
    {
      "_id": "60e0b7f4e8a2d12345678901",
      "name": "node‑01",
      "model": "TTTech‑R1",
      "state": "ONLINE",
      "serialNumber": "SN1234",
      "secureId": "SEC1234",
      "labels": ["factory", "lineA"],
      "remoteConnections": [],
      "createdAt": "2025‑04‑12T10:20:00Z"
    },
    {
      "_id": "60e0b7f4e8a2d12345678902",
      "name": "node‑02",
      "model": "TTTech‑R1",
      "state": "OFFLINE",
      "serialNumber": "SN5678",
      "secureId": "SEC5678",
      "labels": ["factory", "lineB"],
      "remoteConnections": []
    }
  ]
}
```

## 2 Show details of a node by serial number

To fetch detailed information about a specific node you use the node’s serial number directly in the path, rather than filtering through the list.

- **HTTP method:** `GET`
- **Endpoint:** `/nerve/node/{serialNumber}`  
  The library’s `get_details` function resolves the node ID and then calls the Management System endpoint `/nerve/node/{id}`【267046878551359†L980-L987】.  Nerve’s documentation exposes a similar endpoint that accepts a **serial number** instead of an ID.  For example, `/nerve/node/SN1234` returns the details for node `SN1234`.

**Sample request:**
```http
GET /nerve/node/SN1234 HTTP/1.1
Host: <management‑system>
Authorization: Bearer <token>
```

**Sample response:**
```json
{
  "_id": "60e0b7f4e8a2d12345678901",
  "name": "node‑01",
  "model": "TTTech‑R1",
  "state": "ONLINE",
  "serialNumber": "SN1234",
  "secureId": "SEC1234",
  "labels": ["factory", "lineA"],
  "remoteConnections": [],
  "createdAt": "2025‑04‑12T10:20:00Z"
}
```

## 3 Create a node

- **HTTP method:** `POST`
- **Endpoint:** `/nerve/node`【267046878551359†L799-L838】  
  Creates a new node in the management system.  The payload defines the node’s name, model, secure ID and serial number.

**Sample request:**
```http
POST /nerve/node HTTP/1.1
Host: <management‑system>
Authorization: Bearer <token>
Content‑Type: application/json

{
  "name": "node‑03",
  "model": "TTTech‑R2",
  "secureId": "SEC9012",
  "serialNumber": "SN9012",
  "labels": ["factory", "lineC"],
  "remoteConnections": []
}
```

**Sample response:**
```json
{
  "_id": "60e0b7f4e8a2d12345678903",
  "name": "node‑03",
  "model": "TTTech‑R2",
  "state": "OFFLINE",
  "serialNumber": "SN9012",
  "secureId": "SEC9012",
  "labels": ["factory", "lineC"],
  "remoteConnections": [],
  "message": "Node created successfully"
}
```

## 4 Get list of all workloads

- **HTTP method:** `GET`
-- **Endpoint:** `/nerve/v3/workloads?limit=200`  
  Uses the **v3** workload API to retrieve up to 200 workloads【682744847917953†L1003-L1013】.  The `v3` endpoint returns the same payload structure as `v2` but is the current recommended version.

**Sample request:**
```http
GET /nerve/v3/workloads?limit=200 HTTP/1.1
Host: <management‑system>
Authorization: Bearer <token>
```

**Sample response:**
```json
{
  "data": [
    {
      "_id": "6500b3e6d4f9c12345678910",
      "name": "temperature‑collector",
      "type": "docker",
      "disabled": false
    },
    {
      "_id": "6500b3e6d4f9c12345678911",
      "name": "pressure‑analytics",
      "type": "docker‑compose",
      "disabled": false
    }
  ],
  "totalCount": 2
}
```

## 5 Get data of a workload by ID

- **HTTP method:** `GET`
-- **Endpoint:** `/nerve/v3/workloads/{workload_id}`  
  Returns metadata about a single workload, including its versions.  To fetch only the versions or a specific version, call `/nerve/v3/workloads/{workload_id}/versions` or `/nerve/v3/workloads/{workload_id}/versions/{version_id}` respectively【682744847917953†L1003-L1013】.

**Sample request:**
```http
GET /nerve/v3/workloads/6500b3e6d4f9c12345678910 HTTP/1.1
Host: <management‑system>
Authorization: Bearer <token>
```

**Sample response:**
```json
{
  "_id": "6500b3e6d4f9c12345678910",
  "name": "temperature‑collector",
  "type": "docker",
  "description": "Collects temperature data from sensors",
  "disabled": false,
  "versions": [
    {
      "_id": "6500b3e6d4f9c12345678912",
      "name": "1.0.0",
      "releaseName": "1.0.0",
      "createdAt": "2025‑05‑01T12:00:00Z",
      "selectors": ["factory", "lineA"]
    }
  ]
}
```

To fetch only the versions, call:
```http
GET /nerve/v3/workloads/6500b3e6d4f9c12345678910/versions HTTP/1.1
```
and to fetch details for a specific version (e.g., version ID `6500b3e6d4f9c12345678912`) call:
```http
GET /nerve/v3/workloads/6500b3e6d4f9c12345678910/versions/6500b3e6d4f9c12345678912 HTTP/1.1
```
These `v3` endpoints are used by the library to obtain version data【682744847917953†L1003-L1013】.

## 6 Add a new version of a selected workload

- **HTTP method:** `POST` (or `PATCH` if updating an existing version)
- **Endpoint:** `/nerve/v3/workloads/{workload_id}/versions`【682744847917953†L2140-L2183】  
  This endpoint creates a new version for the specified workload.  If `patchVersion` is true and a version ID is provided, a `PATCH` request is sent to `/nerve/v3/workloads/{workload_id}/versions/{version_id}`【682744847917953†L2140-L2183】.

**Sample request to create a version:**
```http
POST /nerve/v3/workloads/6500b3e6d4f9c12345678910/versions HTTP/1.1
Host: <management‑system>
Authorization: Bearer <token>
Content‑Type: application/json

{
  "name": "1.1.0",
  "releaseName": "1.1.0",
  "selectors": ["factory", "lineA"],
  "restartPolicy": "always",
  "resources": {},
  "environmentVariables": [],
  "secrets": []
}
```

**Sample response:**
```json
{
  "_id": "6500b3e6d4f9c12345678913",
  "name": "1.1.0",
  "releaseName": "1.1.0",
  "createdAt": "2025‑06‑01T09:00:00Z",
  "selectors": ["factory", "lineA"],
  "message": "Version created"
}
```

## 7 Get list of versions of a selected workload

- **HTTP method:** `GET`
- **Endpoint:** `/nerve/v3/workloads/{workload_id}/versions`【682744847917953†L1003-L1013】

**Sample request:**
```http
GET /nerve/v3/workloads/6500b3e6d4f9c12345678910/versions HTTP/1.1
Host: <management‑system>
Authorization: Bearer <token>
```

**Sample response:**
```json
{
  "versions": [
    {
      "_id": "6500b3e6d4f9c12345678912",
      "name": "1.0.0",
      "releaseName": "1.0.0",
      "createdAt": "2025‑05‑01T12:00:00Z",
      "selectors": ["factory", "lineA"]
    },
    {
      "_id": "6500b3e6d4f9c12345678913",
      "name": "1.1.0",
      "releaseName": "1.1.0",
      "createdAt": "2025‑06‑01T09:00:00Z",
      "selectors": ["factory", "lineA"]
    }
  ]
}
```

## 8 Use DNA to get target node configuration
    Nerve’s **DNA API** manages desired and current configurations for each node.  The **target** configuration defines which workloads and settings should be active.  When there are only YAML definitions, the API returns the YAML file; if extra files (such as `.env` files) are part of the configuration, the API returns a ZIP containing those files along with the YAML【454521264523735†L99-L117】.

    - **HTTP method:** `GET`
    - **Endpoint:** `/nerve/dna/{serialNumber}/target`【454521264523735†L99-L117】  
      The `nerve‑lib` `get_target` method calls this endpoint and parses the returned YAML or ZIP into a dictionary【454521264523735†L99-L117】.

    **Sample request:**
    ```http
    GET /nerve/dna/SN1234/target HTTP/1.1
    Host: <management‑system>
    Authorization: Bearer <token>
    ```

    **Sample response (YAML file):**
    ```yaml
    schema_version: 1
    workloads:
      - name: DC1
        version: version1
        hash: hash1
        compose_env: .env
      - name: DC2
        version: version2
      - name: DC3
        version: version3
        compose_env: folderLocation/envFileName3.env
      - name: docker1
        version: version-d1
      - name: vm1
        version: version-vm2
        hash: hash4
      - name: docker2
        version: version-d2
        hash: hash-d2
    ```

    In this YAML example, six workloads are defined: Docker Compose workloads can optionally reference an environment file (`compose_env`); `hash` is recommended for precise identification but not required.  When the configuration includes only the YAML document, the API returns this YAML directly.  If `.env` files or other supporting files are present, the API returns a ZIP archive containing the YAML and those files; the library extracts the ZIP and presents the contents as a dictionary【454521264523735†L99-L117】.

## 9 Apply target configuration to the selected node (DNA)

    The target configuration can be **uploaded as a YAML document**.  A ZIP archive is only required when additional files (e.g. `.env` files referenced by `compose_env`) accompany the YAML.  The same endpoint handles both forms of upload.

    - **HTTP method:** `PUT`
    - **Endpoint:** `/nerve/dna/{serialNumber}/target`【454521264523735†L131-L142】【454521264523735†L154-L202】  
      The `nerve‑lib` `put_target` method sends the configuration and retries until the server returns `202 Accepted`【454521264523735†L154-L202】.  Query parameters can control whether the configuration continues after a restart, whether workloads are restarted and whether Docker images are removed【454521264523735†L154-L202】.

    **Sample request (YAML payload):**
    ```http
    PUT /nerve/dna/SN1234/target?continueInCaseOfRestart=false&restartAllWorkloads=false&removeDockerImages=true HTTP/1.1
    Host: <management‑system>
    Authorization: Bearer <token>
    Content-Type: text/yaml

    schema_version: 1
    workloads:
      - name: DC1
        version: version1
        hash: hash1
        compose_env: .env
      - name: DC2
        version: version2
      - name: docker1
        version: version-d1
    ```

    If other files are needed (for example the `.env` referenced by `compose_env`), compress the YAML and the additional files into a ZIP archive and send it as `multipart/form-data`.  The API accepts both forms and responds with `202 Accepted` when the upload begins【454521264523735†L154-L202】.

    **Sample response:**
    ```json
    {
      "message": "DNA configuration accepted and will be applied"
    }
    ```

    After applying the configuration you may need to re‑apply or cancel it:
    - **Reapply target:** `PUT /nerve/dna/{serialNumber}/target/re-apply`【454521264523735†L220-L226】 – re‑applies the current target configuration.
    - **Cancel configuration:** `PATCH /nerve/dna/{serialNumber}/target/cancel`【454521264523735†L230-L243】 – cancels an ongoing configuration.

    These endpoints complete the workflow for uploading and applying DNA configurations using YAML.
