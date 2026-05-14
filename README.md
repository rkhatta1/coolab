# Coolab

Coolab is a focused collaboration space for social media projects, campaign planning, and creative deliverables.

The product is built around a simple idea: creative work rarely starts as a neat task list. It starts as references, rough copy, screenshots, URLs, moodboards, feedback, and half-formed angles. Coolab gives teams a shared canvas where those pieces can live together, be discussed in context, and slowly turn into structured campaign work.

## Aim

Coolab is meant to stay lean. The goal is not to become a heavyweight project management suite, but to create a fast collaborative room for creative teams, founders, editors, strategists, and social teams to shape ideas visually.

Each project contains sessions. A session is a working canvas: a place to collect references, write notes, group related ideas, discuss decisions, and invite collaborators with the right level of access.

## Core Experience

- A project/session hierarchy keeps work organized without turning the app into a dashboard-first tool.
- The canvas is the primary surface, not a secondary preview area.
- Nodes can hold markdown text, pasted copy, pasted images, and links.
- URLs are detected inside normal text nodes instead of becoming a separate node type.
- Images render as images, not as heavy cards.
- Nodes can be grouped into moodboard-like clusters and moved together.
- Chat sits beside the canvas so discussion and visual context stay close.
- Chat messages can tag specific nodes or groups, and clicking a tag recenters the canvas on that item.
- Presence and avatars are used to make collaboration feel live without adding unnecessary chrome.

## UX Decisions

Coolab favors direct manipulation over forms. Users can paste text or images straight onto the canvas, drag nodes around, resize them from edges or corners, and group selected nodes visually.

Node editing is intentionally two-step:

- First click selects and prepares the node for movement.
- A second click enters edit mode.

This keeps dragging predictable while still making text editing easy. The same idea is used in the sidebar for session titles: first click selects the session, second click edits the title.

The UI is deliberately sparse:

- The left sidebar is only for projects and sessions.
- The canvas toolbar is a small creation pill.
- Node headings are hidden until hover, sliding into view only when needed.
- Group names follow the same hover reveal pattern.
- Chat can collapse and resize, keeping the canvas dominant.
- Icon-only controls are used where the action is obvious.

## Collaboration Model

Sessions have collaborators with roles:

- `owner`: manages members, roles, and invitations.
- `editor`: can participate and modify session content.
- `viewer`: can be invited with limited access.

Invitations appear as in-app notifications. Accepted users become collaborators on that session; rejected invitations disappear from the member list and notify the inviter.

## Product Direction

Coolab is aimed at the messy middle of social media production: the stage between scattered references and final deliverables. The current foundation focuses on canvas-native collaboration, lightweight project structure, contextual chat, and fast creative organization.

Future work can build on this with email notifications, notification preferences, richer permissions, version history, export flows, and tighter deliverable handoff.
