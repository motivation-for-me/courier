# Courier Management System Architecture

## Status

Part 1 foundation document. This repository currently contains UI reference exports only. No runtime implementation is introduced in Part 1.

## Goals

Build a production-grade courier and logistics platform with an operations web application, mobile-friendly rider workflows, shipment lifecycle control, tracking, delivery proof, COD handling, returns, documents, reporting, configurable authorization, and auditability.

## Target Architecture

```text
Next.js web application / rider-friendly web experience
                    |
                    v
          NestJS REST API (/api/v1)
                    |
                    v
        Application and domain services
                    |
                    v
              Prisma ORM
                    |
                    v
             PostgreSQL database
```

Supporting infrastructure:

- Redis and BullMQ only for work that benefits from asynchronous processing, such as large PDF generation, notifications, reconciliation, and scheduled reports.
- S3-compatible object storage behind a storage abstraction for payment proofs, POD media, labels, manifests, and generated documents.
- Supabase PostgreSQL for runtime and migrations; Docker Compose only for non-database local dependencies such as Redis and an S3-compatible development storage service.
- OpenAPI/Swagger generated from the NestJS API contract.

The frontend never connects directly to PostgreSQL and never owns business rules, authorization, status transitions, payment verification, or document authority.

## Repository Direction

The future implementation should be a workspace with clear application boundaries. The preferred initial structure is:

```text
apps/
  web/                  Next.js + TypeScript + Tailwind + reusable UI system
  api/                  NestJS + TypeScript + REST + OpenAPI
packages/
  contracts/            Shared API DTO and generated client types where useful
  config/               Shared linting, formatting, and TypeScript settings
prisma/
  schema.prisma
  migrations/
docs/
infra/
  docker-compose.yml
```

The backend remains a modular monolith. Modules are organized by business capability, not by generic controller/service folders:

- auth, users, roles, permissions
- organizations, branches, hubs, locations
- customers, consignments, packages, pricing, booking, pickups
- manifests, transit, riders, delivery, tracking
- payments, COD, returns
- notifications, documents, reports, audit, settings

Each module owns its application services, domain policies, persistence mapping, DTO validation, and authorization checks. Cross-module coordination uses application services and explicit contracts.

## Core Design Rules

1. A consignment is the central aggregate for shipment operations.
2. Current status is a projection of a controlled state machine; tracking events are append-oriented history.
3. Domain commands replace generic status mutation endpoints.
4. Multi-record operational changes execute in PostgreSQL transactions.
5. Mobile and scanner requests use idempotency keys for operations that can be retried.
6. Scope is enforced in backend queries and policies, never by frontend filtering.
7. Public shipment identifiers are collision-safe CNs, separate from internal database IDs.
8. Barcode and QR values identify a shipment only; they are never credentials.
9. Generated PDFs are backend-controlled documents and are subject to authorization.
10. Audit records are created for important mutations and sensitive reads.

## UI Reference Contract

The `/ui` exports are the visual source of truth for later frontend work:

- Light operational canvas with white panels and pale blue/slate surfaces.
- Inter for interface text and JetBrains Mono for CNs, AWBs, measurements, money, OTPs, and dense operational values.
- Deep courier navy/slate structure and safety orange for dispatch actions and active states.
- Sky, amber, indigo, emerald, rose, orange, and violet state tokens with high-contrast text on soft tinted backgrounds.
- Compact 4-6px geometry, dense tables, small status pills, structural borders, and restrained shadows.
- Desktop left navigation rail and command/search bar; mobile header, bottom navigation, card lists, and scan-first actions.
- Desktop split panes and inspection drawers collapse into stacked mobile views.
- The design includes operations dashboard, consignment list/detail, booking, and manifest ingestion workflows.

The later frontend should turn these patterns into reusable components rather than copying exported HTML.

## Document and Job Architecture

A document record stores document type, owning entity, storage key, generated version, checksum, mime type, and authorization context. The API streams or signs access after authorization. Generation may be synchronous for small labels and asynchronous for large reports.

Notifications and jobs must be retryable, observable, and idempotent. Job payloads contain internal IDs and an idempotency key, not trusted client authorization data.

## Observability and Operations

The implementation should use structured logs with request IDs, actor IDs, organization scope, and domain operation names. Metrics should cover API latency, transition failures, queue failures, scan throughput, manifest discrepancies, delivery completion, COD reconciliation, and document generation. Sensitive values must be redacted.

## Part 1 Boundary

This document establishes the target architecture only. No framework scaffold, database migration, API endpoint, authentication flow, queue, or infrastructure file is implemented until a later part is explicitly requested.
