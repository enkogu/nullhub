# Journey Coverage Manifest

This manifest maps canonical scenarios `S1`-`S10` from
`docs/specs/user-scenarios.md` to the current NullHub fixture-mode Playwright
suite. It is intentionally conservative: fixture-mode specs prove routed UI,
DOM state, screenshots, and mocked API side effects, not full PocketBase,
public-screen, scheduler, Telegram, or live runtime behavior.

## Run Lanes

```bash
npm --prefix ui run test:e2e:smoke
npm --prefix ui run test:e2e:full
npm --prefix ui run test:e2e:nightly
npm --prefix ui run test:e2e
```

- Smoke: currently `playwright test --grep @smoke`; tagged specs cover app
  shell/Home degradation, Inbox approve/evidence, scheduled order lifecycle,
  Market catalog, and empty Space creation/scoping.
- Full: runs all Playwright fixture-mode specs.
- Nightly: currently equivalent to Full; no separate long-running project or
  live-provider lane is defined here.
- `test:e2e`: canonical raw Playwright entrypoint, also all specs.

## Scenario Coverage

| Scenario | Current fixture-mode coverage | Lane | Residual gap / boundary |
|---|---|---|---|
| S1 First visit to first workspace | Out of scope for #62. Partial fragments only: `oauth-callback.spec.ts` exercises callback error states; `app-shell.spec.ts` starts after a workspace already exists. | None for full S1 | S1 is PB/public-screen/control-plane: landing, sign-in, Google OAuth, onboarding, secret storage, workspace provisioning, and proxy handoff are not proven by NullHub fixture mode. |
| S2 Claim a workspace via Telegram | Out of scope for #62. Partial fragment: `channels-connect-telegram.spec.ts` exercises a System Channels connect dialog against mocked control-plane routes. | Full/Nightly fragment only | S2 is PB/public-screen/control-plane plus Telegram first-sender claim: claim page polling, `telegram_claim.check`, `allow_from` write, bot reply, and container restart are not covered. |
| S3 First contact with studio shell | `app-shell.spec.ts`, `route-remount.spec.ts`, `home-charter.spec.ts`, and `morning-flow.spec.ts` cover shell load, canonical IA routes, Home/Charter fragments, command palette, route remounts, scoped reads, and nonblank states. | Smoke + Full/Nightly | Fixture assertions do not prove authenticated proxy entry, real multi-source Home aggregation, or all-sources-down production degradation beyond mocked route failures. |
| S4 Give an Order (scheduled) | `order-editor.spec.ts`, `orders-registry.spec.ts`, `order-detail.spec.ts`, `order-schedule-lifecycle.spec.ts` (`E2E-38`), `trigger-breaker-flow.spec.ts` (`E2E-47`), `work-activity.spec.ts`, and `work-live.spec.ts` cover create/edit/detail, scheduled fire, pause/resume, event evidence, and Work surfacing through mocked APIs. | Smoke + Full/Nightly | Does not prove the real scheduler, dispatcher, persistence, fake-provider execution, or cross-process event creation. |
| S5 Inbox triage and approval | `inbox/decide-flows.spec.ts` covers approve, return for rework, reject, question reply, and error state; `morning-flow.spec.ts`, `trigger-breaker-flow.spec.ts`, and `install-pack-round-trip.spec.ts` cover approval-like journey fragments. | Smoke for approve; Full/Nightly for all | Current coverage records mocked approval/evidence effects only. It does not prove a live agent pause/resume, approval timeout handling, or Telegram notification behavior. |
| S6 Run a Loop | `work-delegate-flow.spec.ts`, `work-live.spec.ts`, `work-run-detail.spec.ts`, `work-results.spec.ts`, `loop-marketplace.spec.ts`, `loop-promote-order.spec.ts`, `hire-promote-journeys.spec.ts` (`UJ-8`), and `install-pack-round-trip.spec.ts` cover loop install/select/promote, delegated work, live cards, detail, artifacts, and results. | Full/Nightly | Does not prove real NullTickets lifecycle, repeated iteration execution, review engine behavior, or durable backend state outside fixture/API effects. |
| S7 Compose a Workflow | `work-live.spec.ts`, `work-activity.spec.ts`, `mission-control.spec.ts`, and `route-remount.spec.ts` cover workflow run visibility, activity fragments, Mission Control remount, and Work IA placement. | Full/Nightly | No graph builder coverage yet: branch/fan-out/checkpoints, loop-as-node composition, manual/order start, and real NullBoiler orchestration remain gaps. |
| S8 Install from the Market | `market.spec.ts`, `install-pack-round-trip.spec.ts` (`E2E-4/E2E-7`), `new-space-flow.spec.ts`, and `loop-marketplace.spec.ts` cover catalog states, package detail, required secret text, install, library update, pack/export, blueprint handoff, and recreated-space fragments. | Smoke + Full/Nightly | Proves mocked install/package state only. Real installer safety, rollback, missing-secret blocking, external registry, entitlements, and package updates are outside this lane. |
| S9 Create and switch Spaces | `app-shell.spec.ts`, `new-space-flow.spec.ts`, `home-charter.spec.ts`, `morning-flow.spec.ts` (`E2E-9`), and `install-pack-round-trip.spec.ts` cover space switcher behavior, `?space=` scoped reads, All spaces mode, deep links, empty/blueprint space creation, charter edit, and recreated-space fragments. | Smoke + Full/Nightly | Fixture spaces are not PB workspace provisioning. The suite does not prove backend-wide tenant isolation or every product API's space-scoping contract. |
| S10 Team management and provider/channel config | `hire-promote-journeys.spec.ts` (`UJ-10`), `agent-detail.spec.ts`, `channels-connect-telegram.spec.ts`, `system-usage.spec.ts`, `route-remount.spec.ts`, and `app-shell.spec.ts` cover agent hire/detail, instance tabs, usage, channel connect, System providers route reachability, and no synthesized status/cost values. | Full/Nightly | Provider-key add/save/write-only behavior and real secret persistence are not covered. Channel connect is a mocked control-plane call, and instance panels are fixture-rendered rather than live MCP/skills/memory operations. |

## Labeled Journey Aliases

| Label in suite | Spec | Canonical scenario relationship |
|---|---|---|
| `E2E-1` | `morning-flow.spec.ts` | S3/S5 fragment: Home digest to Inbox decision to quiet Work state. |
| `E2E-4/E2E-7` | `install-pack-round-trip.spec.ts` | S8 plus S5/S9 fragments: install kit, approve probation, export blueprint, recreate Space. |
| `E2E-9` | `morning-flow.spec.ts` | S9 fragment: All spaces drill-in to attention Space. |
| `UJ-8` | `hire-promote-journeys.spec.ts` | S6/S4 fragment: repeated Work promoted into draft Order. |
| `UJ-10` | `hire-promote-journeys.spec.ts` | S10 fragment: hire Team agent and open agent detail. |
| `E2E-38` | `order-schedule-lifecycle.spec.ts` | S4 fragment: scheduled order fires evidence and pause blocks future runs. |
| `E2E-47` | `trigger-breaker-flow.spec.ts` | S4/S5/S12 fragment: trigger order, tiered Inbox gate, circuit breaker nonblank recovery. |

## Reviewer Reading Notes

- Treat every mapping above as fixture-mode unless a spec explicitly says
  otherwise. The current suite intercepts NullHub APIs and asserts UI/effect
  shape; it is not a substitute for PB hook tests, Zig backend tests, runtime
  smoke, or fake-provider integration.
- S1 and S2 should not be counted as covered by #62. They need PB/public-screen
  and control-plane gates.
- S3-S10 have useful reviewer coverage, but several are partial by product
  design: when a spec only mutates fixtures, the manifest names it as a fragment
  rather than full product behavior.
