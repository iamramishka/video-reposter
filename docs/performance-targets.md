# Performance Targets

These local profiling targets keep release checks repeatable without adding external telemetry. Run them from the repository root:

```powershell
npm run profile:performance
```

The command writes `docs/performance-report.md`. Target misses are warnings, not hard failures, because local hardware varies. The script exits nonzero only when one of the profiled commands fails.

## Warning Targets

| Target | Warning threshold |
| --- | ---: |
| Backend build | 45 seconds |
| Admin build | 45 seconds |
| Desktop build | 90 seconds |
| Backend tests | 60 seconds |
| Desktop tests | 60 seconds |
| Admin smoke tests | 30 seconds |
| Admin built assets | 5 MB |
| Desktop renderer assets | 8 MB |

## Profiled Commands

| Area | Command |
| --- | --- |
| Backend build | `npm run build -w backend` |
| Admin build | `npm run build -w admin-dashboard` |
| Desktop build | `npm run build -w desktop-app` |
| Backend tests | `npm run test -w backend` |
| Desktop tests | `npm run test -w desktop-app` |
| Admin smoke tests | `npm run test -w admin-dashboard` |

## Report Contents

Each report records the timestamp, git branch and commit, Node/npm versions, OS, CPU, memory, exact command timings, command output tails, and build output sizes for `admin-dashboard/dist` and `desktop-app/dist-renderer`.
