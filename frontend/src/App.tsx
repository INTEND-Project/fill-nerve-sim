import React, { useEffect, useState } from 'react';
import intendLogo from './assets/intend-black.svg';
import yaml from 'js-yaml';
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
  hash?: string;
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

type LogModalProps = {
  isOpen: boolean;
  title: string;
  content: string;
  onClose: () => void;
};

const LogModal: React.FC<LogModalProps> = ({ isOpen, title, content, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-window log-modal" role="dialog" aria-modal="true" aria-labelledby="log-title">
        <div className="modal-header">
          <h2 id="log-title">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <pre className="log-viewer">{content || 'No log content found.'}</pre>
        </div>
        <div className="modal-footer">
          <button className="primary-button" onClick={onClose}>
            Close
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [newNode, setNewNode] = useState<Partial<Node>>({
    name: 'node-01',
    model: 'TTTech-R1',
    serialNumber: 'SN0001',
    status: 'ONLINE'
  });
  const [labelsInput, setLabelsInput] = useState('factory,lineA');
  const [bulkYaml, setBulkYaml] = useState(`- name: node-01
  serialNumber: SN0001
  model: TTTech-R1
  labels: [factory, lineA]
  state: ONLINE
- name: node-02
  serialNumber: SN0002
  state: OFFLINE
`);

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

  const handleOpenBulk = () => {
    setBulkOpen(true);
  };

  const handleToggleStatus = async (node: Node, event: React.MouseEvent) => {
    event.stopPropagation();
    const current = node.status.toUpperCase();
    if (current !== 'ONLINE' && current !== 'OFFLINE') return;
    const nextStatus = current === 'ONLINE' ? 'OFFLINE' : 'ONLINE';

    try {
      setStatusBusyId(node.id);
      const res = await fetch(
        `${API_BASE}/nerve/node/${encodeURIComponent(node.serialNumber)}/state`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: nextStatus })
        }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const updatedRaw = await res.json();
      const updatedNode: Node = {
        ...node,
        status: updatedRaw.state ?? nextStatus
      };
      onNodesUpdated(nodes.map((n) => (n.id === node.id ? updatedNode : n)));
    } catch (err) {
      console.error(err);
      alert('Failed to update node status.');
    } finally {
      setStatusBusyId(null);
    }
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
          remoteConnections: [],
          state: newNode.status ?? 'ONLINE'
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

  const submitBulkLoad = async () => {
    let parsed: unknown;
    try {
      parsed = yaml.load(bulkYaml);
    } catch (err) {
      console.error(err);
      alert('Invalid YAML. Please fix the syntax and try again.');
      return;
    }

    if (!Array.isArray(parsed)) {
      alert('YAML must be a list of node objects.');
      return;
    }

    const entries = parsed as Record<string, any>[];
    const createdNodes: Node[] = [];
    const errors: string[] = [];

    try {
      setBulkBusy(true);
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry || typeof entry !== 'object') {
          errors.push(`Row ${index + 1}: entry is not an object.`);
          continue;
        }

        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        const serialNumber =
          typeof entry.serialNumber === 'string' ? entry.serialNumber.trim() : '';

        if (!name || !serialNumber) {
          errors.push(`Row ${index + 1}: name and serialNumber are required.`);
          continue;
        }

        const rawState =
          typeof entry.state === 'string'
            ? entry.state
            : typeof entry.status === 'string'
              ? entry.status
              : 'ONLINE';
        const state = rawState.toUpperCase();
        if (!['ONLINE', 'OFFLINE', 'UNKNOWN'].includes(state)) {
          errors.push(
            `Row ${index + 1}: state must be ONLINE, OFFLINE, or UNKNOWN.`
          );
          continue;
        }

        let labels: string[] = [];
        if (Array.isArray(entry.labels)) {
          labels = entry.labels.map((label: any) => String(label)).filter(Boolean);
        } else if (typeof entry.labels === 'string') {
          labels = entry.labels
            .split(',')
            .map((label: string) => label.trim())
            .filter(Boolean);
        }

        try {
          const response = await fetch(`${API_BASE}/nerve/node`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              model: entry.model ?? 'TTTech-R1',
              secureId:
                entry.secureId ??
                `SEC${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
              serialNumber,
              labels,
              remoteConnections: [],
              state
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const raw = await response.json();
          createdNodes.push({
            id: raw._id,
            name: raw.name,
            model: raw.model,
            status: raw.state ?? state,
            serialNumber: raw.serialNumber,
            secureId: raw.secureId,
            labels: raw.labels ?? [],
            createdAt: raw.createdAt,
            configYaml: ''
          });
        } catch (err: any) {
          console.error(err);
          errors.push(
            `Row ${index + 1}: failed to create node "${name}" (${serialNumber}).`
          );
        }
      }
    } finally {
      setBulkBusy(false);
    }

    if (createdNodes.length > 0) {
      onNodesUpdated([...nodes, ...createdNodes]);
    }

    if (errors.length > 0) {
      alert(
        `Loaded ${createdNodes.length}/${entries.length} nodes.\n` +
          `Errors:\n${errors.join('\n')}`
      );
      return;
    }

    alert(`Loaded ${createdNodes.length} nodes.`);
    setBulkOpen(false);
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
            const statusUpper = node.status.toUpperCase();
            const canToggle = statusUpper === 'ONLINE' || statusUpper === 'OFFLINE';
            return (
              <li
                key={node.id}
                className={`node-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectNode(node.id)}
              >
                <div className="node-main-row">
                  <div className="node-name">{node.name}</div>
                  <button
                    type="button"
                    className={`node-status status-${node.status.toLowerCase()}`}
                    disabled={statusBusyId === node.id || !canToggle}
                    onClick={(event) => handleToggleStatus(node, event)}
                    title={`Toggle to ${
                      statusUpper === 'ONLINE' ? 'OFFLINE' : 'ONLINE'
                    }`}
                  >
                    {node.status}
                  </button>
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
          className="square-button"
          disabled={busy || bulkBusy}
          onClick={handleOpenBulk}
          title="Load nodes from YAML"
        >
          L
        </button>
        <button
          className="square-button primary"
          disabled={busy || bulkBusy}
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

      <Modal
        isOpen={bulkOpen}
        title="Load Nodes (YAML)"
        onClose={() => setBulkOpen(false)}
        onSubmit={submitBulkLoad}
        submitLabel="Load"
      >
        <p className="muted">
          Provide a list of nodes. Each entry must include <strong>name</strong> and{' '}
          <strong>serialNumber</strong>.
        </p>
        <div className="form-field">
          <label>Nodes YAML</label>
          <textarea
            rows={10}
            value={bulkYaml}
            onChange={(e) => setBulkYaml(e.target.value)}
            placeholder="Paste a YAML list of node objects."
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
  workloads: Workload[];
  onWorkloadsUpdated: (workloads: Workload[]) => void;
  onNodeUpdated: (node: Node) => void;
};

const DnaConfigCard: React.FC<DnaConfigCardProps> = ({
  selectedNode,
  workloads,
  onWorkloadsUpdated,
  onNodeUpdated
}) => {
  const [editOpen, setEditOpen] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

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
    ensureAllVersionsLoaded();
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

  const ensureAllVersionsLoaded = async () => {
    if (workloads.length === 0) return;
    const toLoad = workloads.filter((w) => !w.versionsLoaded);
    if (toLoad.length === 0) return;
    try {
      setSidebarLoading(true);
      setSidebarError(null);
      const updates: Workload[] = [];
      for (const workload of toLoad) {
        const res = await fetch(
          `${API_BASE}/nerve/v3/workloads/${encodeURIComponent(workload.id)}/versions`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const versions: WorkloadVersion[] = (json.versions ?? []).map((v: any) => ({
          id: v._id,
          version: v.name ?? v.releaseName,
          image: v.releaseName,
          hash: v.hash,
          createdAt: v.createdAt
        }));
        updates.push({ ...workload, versions, versionsLoaded: true });
      }
      const next = workloads.map((w) => updates.find((u) => u.id === w.id) ?? w);
      onWorkloadsUpdated(next);
    } catch (err) {
      console.error(err);
      setSidebarError('Failed to load workload versions.');
    } finally {
      setSidebarLoading(false);
    }
  };

  const handleAddWorkloadEntry = (workloadName: string, versionName: string, hash?: string) => {
    let config: any = {};
    try {
      config = yaml.load(editorYaml) ?? {};
    } catch (err) {
      console.error(err);
      alert('Unable to parse current YAML.');
      return;
    }
    if (typeof config !== 'object' || Array.isArray(config)) {
      config = {};
    }
    if (!config.schema_version) {
      config.schema_version = 1;
    }
    if (!Array.isArray(config.workloads)) {
      config.workloads = [];
    }
    const exists = config.workloads.some(
      (entry: any) =>
        (entry?.name ?? '').toLowerCase() === workloadName.toLowerCase() &&
        (entry?.version ?? '').toLowerCase() === versionName.toLowerCase()
    );
    if (!exists) {
      const entry: Record<string, string> = { name: workloadName, version: versionName };
      if (hash) {
        entry.hash = hash;
      }
      config.workloads.push(entry);
    }
    setEditorYaml(yaml.dump(config, { lineWidth: -1 }));
  };

  const workloadVersionOptions = workloads.flatMap((workload) =>
    (workload.versions ?? []).map((version) => ({
      key: `${workload.id}:${version.id}`,
      workloadName: workload.name,
      versionName: version.version,
      hash: version.hash
    }))
  );

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
        <div className="dna-editor-layout">
          <div className="dna-editor-main">
            <div className="form-field">
              <label>DNA YAML</label>
              <textarea
                rows={16}
                value={editorYaml}
                onChange={(e) => setEditorYaml(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
          <aside className="dna-editor-sidebar">
            <div className="dna-sidebar-header">
              <h3>Workload versions</h3>
              <button className="secondary-button" type="button" onClick={ensureAllVersionsLoaded}>
                Refresh
              </button>
            </div>
            {sidebarLoading && <p className="muted">Loading workload versions…</p>}
            {sidebarError && <p className="muted">{sidebarError}</p>}
            {!sidebarLoading && !sidebarError && workloadVersionOptions.length === 0 && (
              <p className="muted">No workload versions found.</p>
            )}
            <div className="dna-sidebar-list">
              {workloadVersionOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="dna-sidebar-item"
                  onClick={() =>
                    handleAddWorkloadEntry(item.workloadName, item.versionName, item.hash)
                  }
                >
                  {item.workloadName}:{item.versionName}
                  {item.hash ? `:${item.hash}` : ''}
                </button>
              ))}
            </div>
          </aside>
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [newWorkload, setNewWorkload] = useState<{ name: string; type: string }>({
    name: 'temperature-collector',
    type: 'docker'
  });

  const [newVersion, setNewVersion] = useState<Partial<WorkloadVersion>>({
    version: '1.0.0',
    image: '1.0.0'
  });

  const [bulkYaml, setBulkYaml] = useState(
    `- name: temperature-collector
  type: docker
  versions:
    - version: 1.0.0
      image: temperature-collector:1.0.0
- name: vibration-monitor
  type: docker-compose
`
  );

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

  const openBulkLoad = () => {
    setBulkYaml(
      `- name: temperature-collector
  type: docker
  versions:
    - version: 1.0.0
      image: temperature-collector:1.0.0
- name: vibration-monitor
  type: docker-compose
`
    );
    setBulkOpen(true);
  };

  const submitBulkLoad = async () => {
    let parsed: unknown;
    try {
      parsed = yaml.load(bulkYaml);
    } catch (err) {
      console.error(err);
      alert('Invalid YAML. Please fix the syntax and try again.');
      return;
    }

    if (!Array.isArray(parsed)) {
      alert('YAML must be a list of workload objects.');
      return;
    }

    const entries = parsed as Record<string, any>[];
    const createdWorkloads: Workload[] = [];
    const errors: string[] = [];

    try {
      setBulkBusy(true);
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry || typeof entry !== 'object') {
          errors.push(`Row ${index + 1}: entry is not an object.`);
          continue;
        }

        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name) {
          errors.push(`Row ${index + 1}: workload name is required.`);
          continue;
        }

        const type = typeof entry.type === 'string' ? entry.type.trim() : 'docker';

        let createdWorkload: Workload | null = null;
        try {
          const response = await fetch(`${API_BASE}/nerve/v3/workloads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              type,
              disabled: false
            })
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const raw = await response.json();
          createdWorkload = {
            id: raw._id,
            name: raw.name,
            type: raw.type,
            description: raw.type,
            versions: [],
            versionsLoaded: true
          };
        } catch (err) {
          console.error(err);
          errors.push(`Row ${index + 1}: failed to create workload "${name}".`);
          continue;
        }

        if (!createdWorkload) {
          errors.push(`Row ${index + 1}: failed to create workload "${name}".`);
          continue;
        }

        const versionsInput = Array.isArray(entry.versions) ? entry.versions : [];
        const createdVersions: WorkloadVersion[] = [];

        for (let vIndex = 0; vIndex < versionsInput.length; vIndex += 1) {
          const versionEntry = versionsInput[vIndex];
          if (!versionEntry || typeof versionEntry !== 'object') {
            errors.push(
              `Row ${index + 1} version ${vIndex + 1}: version entry is not an object.`
            );
            continue;
          }
          const versionName =
            typeof versionEntry.version === 'string' ? versionEntry.version.trim() : '';
          if (!versionName) {
            errors.push(
              `Row ${index + 1} version ${vIndex + 1}: version is required.`
            );
            continue;
          }

          const image =
            typeof versionEntry.image === 'string' ? versionEntry.image.trim() : '';
          const releaseName = image || versionName;

          try {
            const response = await fetch(
              `${API_BASE}/nerve/v3/workloads/${encodeURIComponent(
                createdWorkload.id
              )}/versions`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: versionName,
                  releaseName,
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
            createdVersions.push({
              id: raw._id,
              version: raw.name ?? raw.releaseName,
              image: raw.releaseName,
              createdAt: raw.createdAt
            });
          } catch (err) {
            console.error(err);
            errors.push(
              `Row ${index + 1} version ${vIndex + 1}: failed to create version "${versionName}".`
            );
          }
        }

        createdWorkloads.push({
          ...createdWorkload,
          versions: createdVersions
        });
      }
    } finally {
      setBulkBusy(false);
    }

    if (createdWorkloads.length > 0) {
      onWorkloadsUpdated([...workloads, ...createdWorkloads]);
    }

    if (errors.length > 0) {
      alert(
        `Loaded ${createdWorkloads.length}/${entries.length} workloads.\n` +
          `Errors:\n${errors.join('\n')}`
      );
      return;
    }

    alert(`Loaded ${createdWorkloads.length} workloads.`);
    setBulkOpen(false);
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
      <div className="card-footer card-footer-actions">
        <button
          className="square-button danger"
          disabled={!selectedWorkload || bulkBusy}
          onClick={handleRemove}
          title="Remove workload / version"
        >
          -
        </button>
        <button
          className="square-button"
          disabled={bulkBusy}
          onClick={openBulkLoad}
          title="Load workloads from YAML"
        >
          L
        </button>
        <button
          className="square-button primary"
          onClick={openCreateWorkload}
          disabled={bulkBusy}
          title="Add new workload"
        >
          +W
        </button>
        <button
          className="square-button primary"
          disabled={!selectedWorkload || bulkBusy}
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

      {/* Load workloads modal */}
      <Modal
        isOpen={bulkOpen}
        title="Load Workloads (YAML)"
        onClose={() => setBulkOpen(false)}
        onSubmit={submitBulkLoad}
        submitLabel="Load"
      >
        <p className="muted">
          Provide a list of workloads. Each workload requires <strong>name</strong>.{' '}
          Versions are nested under <strong>versions</strong> and require{' '}
          <strong>version</strong>.
        </p>
        <div className="form-field">
          <label>Workloads YAML</label>
          <textarea
            rows={12}
            value={bulkYaml}
            onChange={(e) => setBulkYaml(e.target.value)}
            placeholder="Paste a YAML list of workload objects."
          />
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
  const [logFiles, setLogFiles] = useState<string[]>([]);
  const [logMenuOpen, setLogMenuOpen] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logContent, setLogContent] = useState('');
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [selectedLogFile, setSelectedLogFile] = useState<string | null>(null);

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

        const workloadsWithVersions = await Promise.all(
          workloadsData.map(async (workload) => {
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

              return { ...workload, versions, versionsLoaded: true };
            } catch (err) {
              console.error(err);
              return workload;
            }
          })
        );

        setWorkloads(workloadsWithVersions);
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

  const loadLogList = async () => {
    try {
      setLogLoading(true);
      setLogError(null);
      const res = await fetch(`${API_BASE}/nerve/logs`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setLogFiles(json.logs ?? []);
    } catch (err) {
      console.error(err);
      setLogError('Failed to load logs.');
    } finally {
      setLogLoading(false);
    }
  };

  const toggleLogMenu = async () => {
    const next = !logMenuOpen;
    setLogMenuOpen(next);
    if (next) {
      await loadLogList();
    }
  };

  const handleLogSelect = async (filename: string) => {
    try {
      setLogLoading(true);
      setLogError(null);
      setSelectedLogFile(filename);
      const res = await fetch(`${API_BASE}/nerve/logs/${encodeURIComponent(filename)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      setLogContent(text);
      setLogModalOpen(true);
      setLogMenuOpen(false);
    } catch (err) {
      console.error(err);
      setLogError('Failed to load log file.');
    } finally {
      setLogLoading(false);
    }
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-header-row">
          <div className="app-title">
            <img src={intendLogo} alt="INTEND logo" className="app-logo" />
            <h1>FILL Machine Analytics</h1>
          </div>
          <div className="log-dropdown">
            <button className="secondary-button" onClick={toggleLogMenu} type="button">
              Logs ▾
            </button>
            {logMenuOpen && (
              <div className="log-menu" role="menu">
                {logLoading && <div className="log-menu-item muted">Loading…</div>}
                {logError && <div className="log-menu-item error">{logError}</div>}
                {!logLoading && !logError && logFiles.length === 0 && (
                  <div className="log-menu-item muted">No logs yet.</div>
                )}
                {!logLoading &&
                  !logError &&
                  logFiles.map((file) => (
                    <button
                      key={file}
                      className="log-menu-item"
                      onClick={() => handleLogSelect(file)}
                      type="button"
                    >
                      {file}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
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
          <DnaConfigCard
            selectedNode={selectedNode}
            workloads={workloads}
            onWorkloadsUpdated={setWorkloads}
            onNodeUpdated={handleNodeUpdated}
          />
          <WorkloadCard workloads={workloads} onWorkloadsUpdated={setWorkloads} />
        </div>
      </main>
      <LogModal
        isOpen={logModalOpen}
        title={selectedLogFile ? `Log: ${selectedLogFile}` : 'Log'}
        content={logContent}
        onClose={() => setLogModalOpen(false)}
      />
    </div>
  );
};

export default App;
