import React, { useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const API_BASE = 'http://localhost:3000';

export interface Node {
  id: string;              // maps from _id
  name: string;
  model?: string;
  status: string;          // maps from state (ONLINE/OFFLINE/...)
  serialNumber: string;
  secureId?: string;
  labels?: string[];
  createdAt?: string;
  configYaml?: string;     // loaded from DNA API
}

export interface WorkloadVersion {
  id: string;              // _id
  version: string;         // name or releaseName
  image?: string;          // we use releaseName here for display
  createdAt?: string;
}

export interface Workload {
  id: string;              // _id
  name: string;
  type?: string;
  description?: string;    // we map from type
  versions: WorkloadVersion[];
  versionsLoaded?: boolean; // to know if we've already fetched versions
}

type ModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  children: React.ReactNode;
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  children
}) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-window" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={onSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                Node List Card                              */
/* -------------------------------------------------------------------------- */

type NodeListCardProps = {
  nodes: Node[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onNodesUpdated: (nodes: Node[]) => void;
};

const NodeListCard: React.FC<NodeListCardProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  onNodesUpdated
}) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newNode, setNewNode] = useState<Partial<Node>>({
    name: 'node-01',
    model: 'TTTech-R1',
    serialNumber: 'SN0001',
    status: 'ONLINE'
  });
  const [labelsInput, setLabelsInput] = useState('factory,lineA');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleRemove = async () => {
    if (!selectedNode) return;
    if (
      !window.confirm(
        `Remove node "${selectedNode.name}" (serial ${selectedNode.serialNumber})?`
      )
    ) {
      return;
    }

    try {
      setBusy(true);
      // DELETE /nerve/node/{serialNumber}
      await fetch(
        `${API_BASE}/nerve/node/${encodeURIComponent(selectedNode.serialNumber)}`,
        { method: 'DELETE' }
      );
      const updated = nodes.filter((n) => n.id !== selectedNode.id);
      onNodesUpdated(updated);
    } catch (err) {
      console.error(err);
      alert('Failed to remove node.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => {
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    try {
      setBusy(true);

      const labels =
        labelsInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? [];

      // POST /nerve/node
      const response = await fetch(`${API_BASE}/nerve/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newNode.name,
          model: newNode.model ?? 'TTTech-R1',
          secureId:
            newNode.secureId ?? `SEC${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          serialNumber: newNode.serialNumber,
          labels,
          remoteConnections: []
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = await response.json();

      const created: Node = {
        id: raw._id,
        name: raw.name,
        model: raw.model,
        status: raw.state ?? 'UNKNOWN',
        serialNumber: raw.serialNumber,
        secureId: raw.secureId,
        labels: raw.labels ?? [],
        createdAt: raw.createdAt,
        configYaml: ''
      };

      onNodesUpdated([...nodes, created]);
      setCreateOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to create node.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Nodes</h2>
      </div>
      <div className="card-body node-list">
        {nodes.length === 0 && <p className="muted">No nodes yet.</p>}
        <ul>
          {nodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            return (
              <li
                key={node.id}
                className={`node-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectNode(node.id)}
              >
                <div className="node-main-row">
                  <div className="node-name">{node.name}</div>
                  <div className={`node-status status-${node.status.toLowerCase()}`}>
                    {node.status}
                  </div>
                </div>
                {isSelected && (
                  <div className="node-details">
                    <div>
                      <span className="label">Serial:</span> {node.serialNumber}
                    </div>
                    {node.model && (
                      <div>
                        <span className="label">Model:</span> {node.model}
                      </div>
                    )}
                    {node.labels && node.labels.length > 0 && (
                      <div>
                        <span className="label">Labels:</span> {node.labels.join(', ')}
                      </div>
                    )}
                    {node.createdAt && (
                      <div>
                        <span className="label">Created:</span>{' '}
                        {new Date(node.createdAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="card-footer card-footer-actions">
        <button
          className="square-button danger"
          disabled={!selectedNode || busy}
          onClick={handleRemove}
          title="Remove selected node"
        >
          -
        </button>
        <button
          className="square-button primary"
          disabled={busy}
          onClick={handleCreate}
          title="Create new node"
        >
          +
        </button>
      </div>

      <Modal
        isOpen={createOpen}
        title="Create Node"
        onClose={() => setCreateOpen(false)}
        onSubmit={submitCreate}
        submitLabel="Create"
      >
        <div className="form-field">
          <label>Name</label>
          <input
            value={newNode.name ?? ''}
            onChange={(e) => setNewNode((n) => ({ ...n, name: e.target.value }))}
          />
        </div>
        <div className="form-field">
          <label>Serial number</label>
          <input
            value={newNode.serialNumber ?? ''}
            onChange={(e) => setNewNode((n) => ({ ...n, serialNumber: e.target.value }))}
          />
        </div>
        <div className="form-field">
          <label>Model</label>
          <input
            value={newNode.model ?? ''}
            onChange={(e) => setNewNode((n) => ({ ...n, model: e.target.value }))}
          />
        </div>
        <div className="form-field">
          <label>Status</label>
          <select
            value={newNode.status ?? 'ONLINE'}
            onChange={(e) => setNewNode((n) => ({ ...n, status: e.target.value }))}
          >
            <option value="ONLINE">ONLINE</option>
            <option value="OFFLINE">OFFLINE</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </div>
        <div className="form-field">
          <label>Labels (comma separated)</label>
          <input
            value={labelsInput}
            onChange={(e) => setLabelsInput(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                             DNA Config (YAML) Card                         */
/* -------------------------------------------------------------------------- */

type DnaConfigCardProps = {
  selectedNode: Node | null;
  onNodeUpdated: (node: Node) => void;
};

const DnaConfigCard: React.FC<DnaConfigCardProps> = ({ selectedNode, onNodeUpdated }) => {
  const [editOpen, setEditOpen] = useState(false);

  // YAML currently displayed in the main card
  const [viewYaml, setViewYaml] = useState('');

  // YAML being edited in the modal (independent from viewYaml while typing)
  const [editorYaml, setEditorYaml] = useState('');

  // Load DNA from backend when the selected node (by serial) changes
  useEffect(() => {
    if (!selectedNode) {
      setViewYaml('');
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/nerve/dna/${encodeURIComponent(selectedNode.serialNumber)}/target`
        );
        const text = await res.text();
        setViewYaml(text);
        // NOTE: we DO NOT call onNodeUpdated here to avoid loops
      } catch (e) {
        console.error(e);
        setViewYaml('# Failed to load DNA configuration');
      }
    })();
  }, [selectedNode?.serialNumber]); 

  const openEditor = () => {
    if (!selectedNode) return;
    // Seed editor with a copy of whatever is currently visible
    setEditorYaml(viewYaml);
    setEditOpen(true);
  };

  const submitYaml = async () => {
    if (!selectedNode) return;

    try {
      const response = await fetch(
        `${API_BASE}/nerve/dna/${encodeURIComponent(
          selectedNode.serialNumber
        )}/target?continueInCaseOfRestart=false&restartAllWorkloads=false&removeDockerImages=false`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'text/yaml' },
          body: editorYaml
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Update view + node only when upload succeeds
      setViewYaml(editorYaml);
      onNodeUpdated({ ...selectedNode, configYaml: editorYaml });

      setEditOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to update DNA configuration.');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Node DNA configuration</h2>
      </div>
      <div className="card-body dna-body">
        {!selectedNode && <p className="muted">Select a node to view its DNA configuration.</p>}
        {selectedNode && (
          <SyntaxHighlighter language="yaml" style={oneDark} customStyle={{ maxHeight: 400 }}>
            {viewYaml || '# Empty configuration'}
          </SyntaxHighlighter>
        )}
      </div>
      <div className="card-footer card-footer-actions">
        <button
          className="square-button primary"
          disabled={!selectedNode}
          onClick={openEditor}
          title="Edit DNA configuration"
        >
          +
        </button>
      </div>

      <Modal
        isOpen={editOpen}
        title={
          selectedNode
            ? `Edit DNA configuration for ${selectedNode.name}`
            : 'Edit DNA configuration'
        }
        onClose={() => setEditOpen(false)}
        onSubmit={submitYaml}
        submitLabel="Upload"
      >
        <div className="form-field">
          <label>DNA YAML</label>
          <textarea
            rows={16}
            value={editorYaml}
            onChange={(e) => setEditorYaml(e.target.value)}
            spellCheck={false}
          />
        </div>
      </Modal>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Workloads & Versions                          */
/* -------------------------------------------------------------------------- */

type WorkloadCardProps = {
  workloads: Workload[];
  onWorkloadsUpdated: (workloads: Workload[]) => void;
};

const WorkloadCard: React.FC<WorkloadCardProps> = ({ workloads, onWorkloadsUpdated }) => {
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const [createWorkloadOpen, setCreateWorkloadOpen] = useState(false);
  const [createVersionOpen, setCreateVersionOpen] = useState(false);

  const [newWorkload, setNewWorkload] = useState<{ name: string; type: string }>({
    name: 'temperature-collector',
    type: 'docker'
  });

  const [newVersion, setNewVersion] = useState<Partial<WorkloadVersion>>({
    version: '1.0.0',
    image: '1.0.0'
  });

  const selectedWorkload = workloads.find((w) => w.id === selectedWorkloadId) ?? null;
  const selectedVersion = selectedWorkload?.versions.find((v) => v.id === selectedVersionId) ?? null;

  const loadVersionsForWorkload = async (workload: Workload) => {
    try {
      const res = await fetch(
        `${API_BASE}/nerve/v3/workloads/${encodeURIComponent(workload.id)}/versions`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const versions: WorkloadVersion[] = (json.versions ?? []).map((v: any) => ({
        id: v._id,
        version: v.name ?? v.releaseName,
        image: v.releaseName,
        createdAt: v.createdAt
      }));

      onWorkloadsUpdated(
        workloads.map((w) =>
          w.id === workload.id
            ? { ...w, versions, versionsLoaded: true }
            : w
        )
      );
    } catch (err) {
      console.error(err);
      alert('Failed to load versions for workload.');
    }
  };

  const handleWorkloadClick = (w: Workload) => {
    setSelectedWorkloadId(w.id);
    setSelectedVersionId(null);
    if (!w.versionsLoaded) {
      loadVersionsForWorkload(w);
    }
  };

  const handleVersionClick = (w: Workload, v: WorkloadVersion) => {
    setSelectedWorkloadId(w.id);
    setSelectedVersionId(v.id);
  };

  const handleRemove = async () => {
    if (!selectedWorkload) return;

    // Delete version if selected, else delete whole workload
    if (selectedVersion) {
      if (
        !window.confirm(
          `Remove version "${selectedVersion.version}" from workload "${selectedWorkload.name}"?`
        )
      ) {
        return;
      }

      try {
        await fetch(
          `${API_BASE}/nerve/v3/workloads/${encodeURIComponent(
            selectedWorkload.id
          )}/versions/${encodeURIComponent(selectedVersion.id)}`,
          { method: 'DELETE' }
        );

        const updatedWorkloads = workloads.map((w) =>
          w.id === selectedWorkload.id
            ? {
                ...w,
                versions: w.versions.filter((v) => v.id !== selectedVersion.id)
              }
            : w
        );
        onWorkloadsUpdated(updatedWorkloads);
        setSelectedVersionId(null);
      } catch (err) {
        console.error(err);
        alert('Failed to remove workload version.');
      }
    } else {
      if (!window.confirm(`Remove workload "${selectedWorkload.name}"?`)) return;
      try {
        await fetch(
          `${API_BASE}/nerve/v3/workloads/${encodeURIComponent(selectedWorkload.id)}`,
          { method: 'DELETE' }
        );
        const updated = workloads.filter((w) => w.id !== selectedWorkload.id);
        onWorkloadsUpdated(updated);
        setSelectedWorkloadId(null);
      } catch (err) {
        console.error(err);
        alert('Failed to remove workload.');
      }
    }
  };

  const openCreateWorkload = () => {
    setNewWorkload({
      name: 'new-workload',
      type: 'docker'
    });
    setCreateWorkloadOpen(true);
  };

  const submitCreateWorkload = async () => {
    try {
      // NOTE: The spec snippet you gave doesn’t explicitly list a workload-create endpoint,
      // but the usual Nerve pattern would be POST /nerve/v3/workloads.
      const response = await fetch(`${API_BASE}/nerve/v3/workloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWorkload.name,
          type: newWorkload.type,
          disabled: false
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();

      const created: Workload = {
        id: raw._id,
        name: raw.name,
        type: raw.type,
        description: raw.type,
        versions: [],
        versionsLoaded: false
      };

      onWorkloadsUpdated([...workloads, created]);
      setCreateWorkloadOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to create workload (adjust endpoint if your MS uses a different path).');
    }
  };

  const openCreateVersion = () => {
    if (!selectedWorkload) return;
    setNewVersion({
      version: '1.0.0',
      image: '1.0.0'
    });
    setCreateVersionOpen(true);
  };

  const submitCreateVersion = async () => {
    if (!selectedWorkload) return;
    try {
      const response = await fetch(
        `${API_BASE}/nerve/v3/workloads/${encodeURIComponent(selectedWorkload.id)}/versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newVersion.version,
            releaseName: newVersion.version,
            selectors: [],
            restartPolicy: 'always',
            resources: {},
            environmentVariables: [],
            secrets: []
          })
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();

      const created: WorkloadVersion = {
        id: raw._id,
        version: raw.name ?? raw.releaseName,
        image: raw.releaseName,
        createdAt: raw.createdAt
      };

      const updatedWorkloads = workloads.map((w) =>
        w.id === selectedWorkload.id
          ? { ...w, versions: [...w.versions, created], versionsLoaded: true }
          : w
      );
      onWorkloadsUpdated(updatedWorkloads);
      setCreateVersionOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to create workload version.');
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Workloads &amp; versions</h2>
      </div>
      <div className="card-body workload-list">
        {workloads.length === 0 && <p className="muted">No workloads yet.</p>}
        <ul>
          {workloads.map((w) => {
            const wSelected = w.id === selectedWorkloadId;
            return (
              <li key={w.id} className={`workload-item ${wSelected ? 'selected' : ''}`}>
                <div className="workload-main-row" onClick={() => handleWorkloadClick(w)}>
                  <div className="workload-name">{w.name}</div>
                  <div className="workload-version-count">
                    {w.versions.length} versions
                  </div>
                </div>
                {wSelected && (
                  <div className="workload-details">
                    {w.description && <p className="muted">Type: {w.description}</p>}
                    <ul className="version-list">
                      {w.versions.map((v) => {
                        const vSelected = v.id === selectedVersionId;
                        return (
                          <li
                            key={v.id}
                            className={`version-item ${vSelected ? 'selected' : ''}`}
                            onClick={() => handleVersionClick(w, v)}
                          >
                            <div className="version-main-row">
                              <span className="version-tag">{v.version}</span>
                              {v.image && (
                                <span className="version-image">
                                  release: {v.image}
                                </span>
                              )}
                            </div>
                            {v.createdAt && (
                              <div className="version-meta">
                                Created: {new Date(v.createdAt).toLocaleString()}
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {w.versions.length === 0 && (
                        <li className="muted">
                          No versions for this workload (click +V to add one).
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="card-footer card-footer-actions three-buttons">
        <button
          className="square-button danger"
          disabled={!selectedWorkload}
          onClick={handleRemove}
          title="Remove workload / version"
        >
          -
        </button>
        <button
          className="square-button primary"
          onClick={openCreateWorkload}
          title="Add new workload"
        >
          +W
        </button>
        <button
          className="square-button primary"
          disabled={!selectedWorkload}
          onClick={openCreateVersion}
          title="Add new workload version"
        >
          +V
        </button>
      </div>

      {/* Create workload modal */}
      <Modal
        isOpen={createWorkloadOpen}
        title="Create workload"
        onClose={() => setCreateWorkloadOpen(false)}
        onSubmit={submitCreateWorkload}
        submitLabel="Create"
      >
        <div className="form-field">
          <label>Name</label>
          <input
            value={newWorkload.name}
            onChange={(e) =>
              setNewWorkload((w) => ({ ...w, name: e.target.value }))
            }
          />
        </div>
        <div className="form-field">
          <label>Type</label>
          <select
            value={newWorkload.type}
            onChange={(e) =>
              setNewWorkload((w) => ({ ...w, type: e.target.value }))
            }
          >
            <option value="docker">docker</option>
            <option value="docker-compose">docker-compose</option>
          </select>
        </div>
      </Modal>

      {/* Create version modal */}
      <Modal
        isOpen={createVersionOpen}
        title={
          selectedWorkload
            ? `Create version for ${selectedWorkload.name}`
            : 'Create version'
        }
        onClose={() => setCreateVersionOpen(false)}
        onSubmit={submitCreateVersion}
        submitLabel="Create"
      >
        <div className="form-field">
          <label>Version name</label>
          <input
            value={newVersion.version ?? ''}
            onChange={(e) =>
              setNewVersion((v) => ({ ...v, version: e.target.value }))
            }
          />
        </div>
      </Modal>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                    App                                     */
/* -------------------------------------------------------------------------- */

const App: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [workloads, setWorkloads] = useState<Workload[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);

        // GET /nerve/nodes/list  and  GET /nerve/v3/workloads?limit=200
        const [nodesRes, workloadsRes] = await Promise.all([
          fetch(`${API_BASE}/nerve/nodes/list`),
          fetch(`${API_BASE}/nerve/v3/workloads?limit=200`)
        ]);

        if (!nodesRes.ok) {
          throw new Error(`Failed to load nodes (HTTP ${nodesRes.status})`);
        }
        if (!workloadsRes.ok) {
          throw new Error(`Failed to load workloads (HTTP ${workloadsRes.status})`);
        }

        const nodesJson = await nodesRes.json();
        const workloadsJson = await workloadsRes.json();

        const nodesData: Node[] = (nodesJson.nodes ?? []).map((n: any): Node => ({
          id: n._id,
          name: n.name,
          model: n.model,
          status: n.state ?? 'UNKNOWN',
          serialNumber: n.serialNumber,
          secureId: n.secureId,
          labels: n.labels ?? [],
          createdAt: n.createdAt,
          configYaml: ''
        }));

        const workloadsData: Workload[] = (workloadsJson.data ?? []).map((w: any): Workload => ({
          id: w._id,
          name: w.name,
          type: w.type,
          description: w.type,
          versions: [],
          versionsLoaded: false
        }));

        setNodes(nodesData);
        setWorkloads(workloadsData);
        if (nodesData.length > 0) {
          setSelectedNodeId(nodesData[0].id);
        }
      } catch (err: any) {
        console.error(err);
        setLoadError(err?.message ?? 'Failed to load initial data.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleNodeUpdated = (updatedNode: Node) => {
    setNodes((prev) => prev.map((n) => (n.id === updatedNode.id ? updatedNode : n)));
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Simulated Nerve API for FILL machine analytics</h1>
      </header>
      <main className="app-main">
        {loading && <div className="banner info">Loading data from Nerve API…</div>}
        {loadError && <div className="banner error">{loadError}</div>}

        <div className="card-grid">
          <NodeListCard
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onNodesUpdated={setNodes}
          />
          <DnaConfigCard selectedNode={selectedNode} onNodeUpdated={handleNodeUpdated} />
          <WorkloadCard workloads={workloads} onWorkloadsUpdated={setWorkloads} />
        </div>
      </main>
    </div>
  );
};

export default App;