# Third-Party Libraries & Solvers — CIT Campus Scheduler

This document complies with Section 6 of the official CIT Campus Scheduling Problem Statement.

---

## 1. Constraint Solvers

* **Google OR-Tools (`ortools`)** — Version 9.x
  - **Purpose:** Mathematical constraint programming and CP-SAT solver for generating clash-free weekly timetables (`app/scheduling/solver.py`) and minimal-move disruption rescheduling (`app/rescheduling/engine.py`).
  - **License:** Apache License 2.0.

---

## 2. Web & Backend Framework

* **FastAPI** (`fastapi`) — Web API framework, request validation, and OpenAPI documentation generation.
  - **License:** MIT License.
* **Uvicorn** (`uvicorn`) — ASGI web server for running the FastAPI application.
  - **License:** BSD License.
* **Pydantic** (`pydantic`) — Data validation and schema enforcement.
  - **License:** MIT License.
* **HTTPX** (`httpx`) — Asynchronous and synchronous HTTP client for REST API communication.
  - **License:** BSD License.

---

## 3. Database & Authentication

* **SQLAlchemy** (`sqlalchemy`) — Object-relational mapping and database engine.
  - **License:** MIT License.
* **Alembic** (`alembic`) — Database migration management for PostgreSQL schema evolution.
  - **License:** MIT License.
* **Psycopg v3** (`psycopg`, `psycopg-binary`) — PostgreSQL database adapter.
  - **License:** GNU LGPL v3.
* **Python-Jose** (`python-jose`) & **Cryptography** (`cryptography`) — JWT cryptographic signature verification (ES256, RS256, HS256) and JWKS handling.
  - **License:** MIT / Apache License 2.0.

---

## 4. Testing & Verification

* **Pytest** (`pytest`) — Python testing framework.
  - **License:** MIT License.

