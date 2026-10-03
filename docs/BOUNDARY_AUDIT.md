# Message Bus v0.1 Boundary Audit

## What was tested

After implementing the governed Ø-CREW Message Bus, I audited whether the boundaries I thought existed were actually enforced.

The audit separated four different questions:

- authority isolation
- sender identity
- denied-action side effects
- renderer storage isolation

Evidence came from reading the code, the automated tests in [`test/message-bus.test.js`](../test/message-bus.test.js), and one temporary runtime check described below.

## Confirmed

### Authority does not transfer through collaboration

A request is authorised only by:

`can(actor, capability)`

where `actor` is the receiving pet and the capability comes from the message's intent (`INTENT_MAP`), never from the message contents.

The sender's capabilities are not inputs to the permission decision. A pet that holds a capability cannot lend it to a pet that does not, and a pet with no capabilities can still ask another pet to use its own.

Tests: `authority non-inheritance: sender capability never contributes`, `authority check is called with (actor, capability) only, never the sender`.

### Sender identity is main-process stamped

Renderers cannot choose their own `from` identity; a submission that includes one is rejected.

The main process derives the sender from the actual Electron window (`BrowserWindow.fromWebContents`) and its own window-to-character map, and rejects senders that are not crew windows (including Ø-House) or are not the window's main frame.

Tests: `bus:send handler: main stamps the real sender; house, sub-frames and strangers rejected`, `forged provenance and forged capability fields are rejected`.

### Denied requests do not execute handlers

The denied `MOVE_BEEO` test reaches:

`DENIED / NO_CAPABILITY`

with no action handler call, even when a handler for it is present. The bus has no timers, queues, or retries, and the app registers no handler for `MOVE_BEEO` at all.

Tests: `denial has zero side effect: MOVE_BEEO`, `main: bus wiring, demo flag and the single handler`.

That BEEØ's window does not move was checked by watching the running demo, not by an automated test.

## Storage finding

The five pets run in separate BrowserWindows, but currently share:

- the default Electron session
- the same `file://` origin

A temporary runtime check opened KITTØ and DOGGØ renderers with the app's window settings, had KITTØ write an audit-only `localStorage` key containing dummy data, and had DOGGØ read it directly. DOGGØ could read it without using the Message Bus. A control window given its own Electron partition could not. The dummy key was removed afterwards, and no real memory was read or changed.

Therefore:

`Message isolation is enforced.`

`Storage isolation is not mechanically enforced.`

Per-character memory is currently separated by namespaced keys (`ocrew.<character>.memory.v1`), not by separate storage partitions.

## Decision

No storage migration was made in v0.1.

Partitioning remains parked because changing Electron sessions would also require deciding how existing local memory should migrate.

## Principle

`permission isolation ≠ memory isolation`

Or, less formally:

> Two pets becoming friends does not grant either one admin rights.
>
> Two pets having different names does not mean they have different cupboards.
