# AGENTS.md — ITECSA

## Scope and priorities

These instructions apply to the entire repository. Follow explicit task requirements first, while preserving security, authorization, and data integrity. If a request conflicts with these safeguards, explain the conflict instead of silently weakening them.

- Make the smallest coherent change that satisfies the request. Avoid unrelated refactors, new dependencies, or alterations to unrelated modules.
- Inspect existing code, conventions, components, tests, and shared styles before implementing anything new.
- Reuse existing components, utilities, CSS variables, design tokens, Toast notifications, confirmation dialogs, and PIN flows. Create new implementations only when reuse is unsuitable and explain why.
- Never hardcode sample data from mockups into application logic. Mockups guide presentation, not data contracts or authorization.

## Frontend: `capaVista/`

- Preserve responsive behavior for desktop, tablet, and mobile. Avoid overflow, clipped content, accidental stretching, and impractical touch targets.
- Preserve keyboard access, semantic controls, accessible names, focus states, and appropriate ARIA attributes.
- Use the existing corporate colors and shared style variables. Do not introduce arbitrary hex colors or parallel design tokens. Keep semantic status colors consistent.
- Follow existing React, component, CSS Module, and folder patterns. Prefer scoped changes over global CSS overrides.
- Preserve existing loading, empty, disabled, hover, and error states. Use existing Toast feedback for operation errors; do not create ad-hoc inline error panels for actions when a Toast pattern exists.
- Do not change visible actions, permissions, or workflow behavior as part of a visual-only request.
- For Kanban changes, preserve drag-and-drop, per-role actions, existing badges/indicators, subprocess rules, and all required PIN authorizations.

## Backend: `capaServidor/`

- Maintain existing API contracts, validation, transaction semantics, error handling, logging conventions, and database compatibility unless the task explicitly requires a change.
- Never bypass server-side authorization or trust frontend visibility checks as a security boundary.
- Do not log credentials, PINs, access tokens, session secrets, or sensitive personal data.
- Do not change database schemas, migrations, secrets, or deployment configuration without an explicit requirement and impact analysis.

## Authentication and security

- Preserve the existing Keycloak integration and authorization policy. Do not revive deprecated Auth0 flows without an explicit migration requirement.
- Reuse centralized authentication, roles, permissions, PIN confirmation, and session management. Do not duplicate security mechanisms in individual components.
- Do not weaken checks or introduce browser storage of sensitive tokens/secrets for convenience.
- Avoid adding new external services or Internet dependencies to flows intended to work on the company intranet without explicit approval.

## Workflow for every task

1. Locate the affected files and trace the existing data and interaction flow.
2. State any meaningful ambiguity or security concern; otherwise implement the narrowest solution.
3. Preserve shared components and global design conventions.
4. Add or adjust focused tests for behavior changes and regressions.
5. Run the relevant checks available in the repository (tests, lint, build) when feasible. If a check cannot run, say so; never claim it passed.
6. Summarize files changed, behavior changed, checks run, and any residual risks.

## Change boundaries

- A visual redesign must not silently change role access, record ordering, API requests, state transitions, persistence, or audit history.
- A functional change must retain current visual conventions unless redesign is explicitly requested.
- Do not remove existing user-visible fields or interactions without explicit instruction.
- Prefer concise, maintainable code and avoid speculative features.
