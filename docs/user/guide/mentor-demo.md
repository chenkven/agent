---
description: "Run the Agent Base mentor demonstration and verify permissions, models, capabilities, and delegation."
kind: "tutorial"
---

# Mentor demo

English | [中文](mentor-demo.zh.md)

## Prerequisites

Complete the [source setup](../../../README.md#run-from-source), use a disposable project directory, and have a valid model API Key with available quota. Keep the Host process running. A role delegates through the parent model, so the selected model must support tools.

## Demonstration

1. Start `pnpm run agent-base web` from the repository and open the complete printed URL. In **Capabilities → Models**, configure a provider credential. Show the provider and model catalog, then send a simple message in a conversation and verify a real answer.
2. Open **Capabilities → Permissions**, choose the same conversation, and apply **read-only**. Show the sandbox and approval explanation and confirm the conversation's permission selection matches. Use a disposable workspace to demonstrate blocked writes or approval requests; do not demonstrate with important files.
3. Open **Skill**, inspect the source and invocation flags. To demonstrate editing, use a project-owned Skill under `.agents/skills` or `.dsh/skills`. Bundled Skills are read-only here.
4. Open **MCP**, add a connection to a server you control, and show that it starts disabled. Enable it and confirm runtime activation before asking the model to use a tool. Inspect **Prompt**, preview a preset composition, and show its default applies to a new conversation.
5. Open **Multi-Agent**, add the researcher example, and show its persona, model inheritance, and `read`, `glob`, `grep` allowlist. Choose the conversation and submit: “Use delegate_researcher to read README.md and summarize the platform's capabilities with evidence. Summarize its result.” Watch the parent call the delegation tool, refresh child records, and open the child conversation. The child uses its own context, inherits the parent sandbox, and cannot request broader access.
6. Restart the Host, reopen the full printed URL, and verify the role remains. Demonstrate editing, disabling, reenabling, and deleting it. Existing child history remains available after role deletion.

## Reuse

The [profile manager](../../../packages/boot/plugin-manager/README.md) persists editable roles and MCP connections. New model families extend adapters and the shared [Models editor](../../../packages/client/ui-settings-models/README.md); new delegation backends implement the existing [subagent contract](../../subsystems/subagent.md). Product pages consume typed Remotes and slot contributions, so these extensions keep the core loop unchanged.

## Verification evidence

The keyless [role integration test](../../../apps/cli/tests/profiles/web/tests/capability-agents.expected.e2e.ts) boots the shipped Web profile, persists and restores a role, runs an actual in-process child through a deterministic model adapter, checks model/persona/tool inputs and inherited sandbox/approval, then deletes the tool. The [MCP integration test](../../../apps/cli/tests/profiles/web/tests/capability-mcp.expected.e2e.ts) covers managed MCP and project Skill operations. These tests establish runtime wiring; they do not verify a paid provider credential or external network quality.

<a id="remote-access"></a>
## Remote access

Local Web startup requires its complete authentication URL. Plain port mapping through PeanutHull or another tunnel does not add visitor credential isolation or enable restricted remote settings. The local demo gateway kept under `.artifacts/` is excluded from this repository. For independent visitor API Keys, deploy an authenticated gateway that creates a separate runtime and credential store per visitor, test it from another device, and keep the Host and mapping processes running. Production authentication, quotas, and tenant isolation need separate deployment work.

## Troubleshooting

- `MISSING_CREDENTIAL`: configure the key for the exact provider route selected in the conversation or role; a key for another route is insufficient.
- No child record: submission means the parent inbox accepted the request. Check that the role is enabled and ready, the model invoked `delegate_<name>`, and the parent call did not fail.
- `restart-required`: restart the Host; that profile does not apply configuration live.
- `settings are unavailable in this browser`: the browser is using restricted remote settings. Use the local settings editor or a gateway's dedicated credential flow.
