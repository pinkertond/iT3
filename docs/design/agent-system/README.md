# iT3 agent-system design

1. Read the [Specification](specification.md) for the user workflow, architecture, data contracts, failure semantics and eight acceptance criteria.
2. Review the [Plan](plan.md), then open a task below for its output, dependencies and checks.
3. Review the [upstream exception register](upstream-exceptions.md) before approving a host modification.
4. The [candidate Commission](commission.md) describes the implementation boundary and proposed resource ceiling. The [Intent](intent.md) records the user purpose.

These records use Braid Studio's **candidate 0.1.0** envelope and kind schemas at revision `f9aa7e3c2c0ad70a7df70276f0759bdca3c8e832`. The architecture and task hierarchy are an iT3 proposal. Draft metadata confers no execution or release authority. Parent links express containment; typed dependencies express execution order. Task references use real earlier Git revisions of the plan and specification.

[Braid schema index](https://github.com/pinkertond/Braid-OS/tree/f9aa7e3c2c0ad70a7df70276f0759bdca3c8e832/00-docs/schemas) · [Braid seat design](https://github.com/pinkertond/Braid-OS/blob/f9aa7e3c2c0ad70a7df70276f0759bdca3c8e832/00-docs/studio/06c-agent-seats.md) · [iT3 release baseline](https://github.com/pinkertond/iT3/tree/65eab18b69c8067515f3d7421b27559d9214b83a) · [Repository documentation](../../README.md)

The [editable architecture diagram](architecture.json) maps the first handoff from the project roster through the extension to the native T3 thread.

## Proposed manager loop

[Automatic work in active projects](active-project-loop.md) defines when a ready task may start, how a shared account reserves capacity, and how the manager chooses a model and context. This extends the initial handoff design.

[Visual project workflows](workflow-canvas.md) connects the team, workflow and run views to the native workflow engine.

## Tasks and subtasks

- [1. Prove the native seams](tasks/01-baseline.md)
  - [1.1 Inventory host touchpoints](tasks/01-01-inventory.md)
  - [1.2 Probe native dispatch and retries](tasks/01-02-probe.md)
  - [1.3 Select the narrowest host boundary](tasks/01-03-boundary.md)
- [2. Build the bundled extension contract](tasks/02-host.md)
  - [2.1 Register and negotiate contributions](tasks/02-01-manifest.md)
  - [2.2 Preserve caller authority in the adapter](tasks/02-02-authorization.md)
  - [2.3 Mount a project view and command](tasks/02-03-slots.md)
- [3. Implement the project seat directory](tasks/03-seats.md)
  - [3.1 Persist project-owned seat records](tasks/03-01-store.md)
  - [3.2 Bind and replace an occupant](tasks/03-02-bindings.md)
  - [3.3 Expose roster and seat inspector](tasks/03-03-roster.md)
- [4. Deliver and reconcile handoffs](tasks/04-handoffs.md)
  - [4.1 Implement receipt and outbox transactions](tasks/04-01-outbox.md)
  - [4.2 Expose scoped seat operations to agents](tasks/04-02-address.md)
  - [4.3 Demonstrate the first round trip](tasks/04-03-roundtrip.md)
- [5. Report context honestly](tasks/05-visibility.md)
  - [5.1 Normalize provider observations](tasks/05-01-observations.md)
  - [5.2 Show supported context fields](tasks/05-02-inspector.md)
- [6. Prove upgrade and release compatibility](tasks/06-upgrade.md)
  - [6.1 Run the compatibility matrix](tasks/06-01-matrix.md)
  - [6.2 Rehearse an upstream update](tasks/06-02-rehearse.md)
  - [6.3 Prepare a candidate Result](tasks/06-03-release.md)
