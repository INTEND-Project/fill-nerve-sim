---
name: inswitch-fill
description: Orchestrate intent-based management for FILL machine analytics by coordinating system reasoning, Nerve API invocation, and optional iExplain reporting. Use when users ask to deploy, manage, or explain analytics workloads for a machine.
---

# InSwitch for FILL Machine Analytics Management

This is about how to achieve intent-based management of FILL's machine analytics system. FILL manages a number of machine tools, on each of which can be deployed with several workloads (with a specific version) for data analytics.

## Critical Rules (MANDATORY)

1. **Always delegate to `fill-system-reasoning`** when the user expresses an intent that does NOT explicitly name the workloads to deploy (e.g., "monitor", "analyze", "detect", "optimize"). Do NOT guess workloads yourself.

2. **Preserve existing workloads by default**. When deploying new workloads, merge them with the ones already on the node. Only remove workloads if the user explicitly asks to remove, replace, or reset them.

3. **Never invent data** that does not exist in the NERVE API. Only report fields actually returned by the specific endpoint response you called. For node-related responses, common valid fields include `_id`, `name`, `state`, `deployed_workloads`, `serialNumber`, `model`, `secureId`, `labels`, `remoteConnections`, and `createdAt`. Do NOT report invented fields like "Health", "Last seen", "CPU usage", "uptime", etc. because these do not exist in this system.

## Input

The user provides intents about what they want to achieve for a machine. A serial number of the target machine is mandatory. Ask the user if this is missing.

The user will normally not directly mention which workloads to deploy, so this requires the system reasoning step (Step 1).

Alternatively, if the user asks to explain what happened in the underlying system, skip Step 1 and 2, and go directly to the Explanation step.

## Step 1: System reasoning (MANDATORY for any deployment intent)

Before delegating to the reasoning agent, you MUST determine the machine type of the target node:

1. Call the NERVE API: `GET http://fill_app:3000/nerve/node/{serialNumber}`
2. Read the `model` field from the response (e.g., "Machine1", "Machine2", etc.)
3. Delegate to the `fill-system-reasoning` agent with BOTH the user intent AND the machine type

Example delegation task: "Perform system reasoning for intent: 'monitor Fingerprint'. Machine type: Machine1. Return only container names."

- Folder path to delegate to: `fill-system-reasoning`
- The output is a list of workload (container) names (no versions, no explanation, no extra text)

Do NOT proceed to Step 2 without completing Step 1 when the intent is underspecified.

## Step 2: API invocation

Once the list of workloads is obtained (from Step 1 or directly from the user), delegate to the `fill-api-invocation` agent to deploy them via the NERVE API.

- Default API host: `http://fill_app:3000`
- Folder path to delegate to: `fill-api-invocation`

**IMPORTANT — Preserve existing workloads**: Before applying a new DNA target, always retrieve the current target and merge the new workloads with the existing ones. Never replace the full list.

## Step 3: Explanation (optional)

If the user wants to know what happened in the underlying system, delegate to the `fill-iexplain` agent.

- Folder path to delegate to: `fill-iexplain`
