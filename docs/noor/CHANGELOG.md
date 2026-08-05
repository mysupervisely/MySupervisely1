# Noor — Changelog

All notable architectural and product decisions for the Noor patient
platform are recorded here, in addition to the standard git history.

## M0 — Architecture (unreleased, no code)

- Authored the complete M0 architecture deliverable
  (`docs/noor/ARCHITECTURE.md`): system diagram, recommended technology
  stack with rationale, initial normalized PostgreSQL schema, authentication
  architecture, RBAC authorization model, PHI/data classification, EHR
  abstraction (`PatientRecordProvider`, `AppointmentProvider`,
  `ClinicalMessagingProvider`, `DocumentProvider`), subscription
  architecture (`PaymentProvider` abstraction), AI abstraction (`AIProvider`
  interface with hard guardrails against diagnosis/risk-scoring), security
  architecture, deployment architecture (dev → staging → production),
  proposed monorepo structure, and an 11-step milestone roadmap (M0–M10).
- No application code written. Per the product brief, this milestone is
  planning-only and requires explicit approval before M1 begins.
- Recorded a consolidated list of decisions that require clinical
  leadership, legal/compliance, or product sign-off before they can be
  implemented (safety escalation protocol, EHR vendor selection, Noor
  Async pricing/SLA, patient MFA policy, multi-role account policy,
  elevated-admin clinical-data access, backup/retention policy) — see
  §N of `ARCHITECTURE.md`.
