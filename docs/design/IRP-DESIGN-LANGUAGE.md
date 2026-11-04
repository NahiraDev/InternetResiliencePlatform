# IRP Signal design language

One visual language for every user-facing IRP surface. The source of truth is
[`irp-design-tokens.json`](./irp-design-tokens.json); each platform mirrors it natively and
`apps/api/src/design-tokens.test.ts` fails when a surface drifts from it.

| Surface | Implementation |
| --- | --- |
| Web Control Center | `apps/api/src/dashboard.ts` |
| Linux client local dashboard | `packages/linux-client/src/local-dashboard.ts` |
| macOS client local dashboard | `packages/macos-client/src/local-dashboard.ts` |
| Android | `clients/android/app/src/main/java/com/nahiradev/irp/ui/` (Jetpack Compose, Material 3) |
| iOS | `clients/ios/Sources/IRPiOSClient/UI/` (SwiftUI) |

## Principles

1. **Truthful.** A screen shows only what the backend, runtime or operating system reported. A
   value that is not reported is shown as "Not reported" with the reason; it is never estimated,
   defaulted to a healthy-looking number, or animated to look live.
2. **Controls work or do not exist.** Every button, toggle and link performs an existing action.
   Where a surface is read-only by design (local dashboards, which cannot hold the control token),
   it says so and points at the canonical control path.
3. **State is never colour alone.** Every status pairs a colour with a glyph and a word
   (● Healthy, ▲ Degraded, ■ Unavailable, ◆ Observe only, ○ Unknown).
4. **Native first.** Same tokens, hierarchy and vocabulary; native navigation (bottom navigation
   on Android, tab bar on iOS, sidebar on desktop web) and native controls.
5. **Every view has four states:** loading, content, empty, error. Stale content stays visible,
   marked with its age, when a refresh fails.

## Foundations

- **Colour.** Dark and light palettes in the token file. Every text/status colour on every
  surface is at least 4.5:1 (WCAG AA); the test enforces this.
- **Type.** Platform system fonts (Inter-like grotesque on web via the system UI stack, Roboto on
  Android, SF on iOS). Eyebrow labels 11–12 px uppercase, body 14–16, metric values 28–32 with
  tabular numerals. No text below 11 px.
- **Shape and space.** Cards 16 radius, controls 10, pills fully rounded; 4-pt spacing scale.
- **Motion.** Short fades only; disabled under `prefers-reduced-motion`.

## Shared vocabulary

Overview · Connectivity · Performance · Tunnel · Security · Automation · Diagnostics.

Tunnel, security and automation text comes from the backend payloads (`network`, `tunnel`,
`security`, `autopilot`, `decision`) or the client runtime status, unchanged.
