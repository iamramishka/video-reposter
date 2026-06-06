# Video Reposter UX Fix Backlog

This document converts the current desktop-app usability findings into implementation tasks. Tasks are ordered to create one clear customer workflow and reduce duplicated or conflicting controls.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed

## Priority Guide

- **P0**: Blocks successful processing or gives customers incorrect/conflicting information.
- **P1**: Strong user-confusion risk or duplicated workflow.
- **P2**: Important usability improvement.
- **P3**: Polish and consistency.

## Recommended Product Flow

The desktop app should guide customers through:

`Add videos -> Select preset -> Adjust video -> Choose output -> Process -> Review results`

Recommended final pages:

1. **Dashboard**: Summary and recent jobs only.
2. **New Batch**: Add videos, choose preset, adjustments, output folder, and start processing.
3. **Queue**: Active, waiting, and failed jobs.
4. **History**: Completed and failed past jobs.
5. **Presets**: Browse presets and select the default preset.
6. **Settings**: Default output folder, default workers, license/package details, and logs.

## Phase 1: Fix Blocking and Conflicting Behavior

### Task 1: Replace Customer-Facing Developer Errors

- **Priority:** P0
- **Affected areas:** Processing page, Processing Log, retry behavior
- [x] Replace errors such as `FFmpeg unavailable: Start with npm run browser...` with customer-readable messages.
- [x] Keep technical details only in the processing log.
- [x] Add a clear recovery action such as reinstall/contact support.
- [x] Disable Retry when retrying cannot resolve the underlying failure.

**Acceptance checks**

- Customers never see npm commands or developer-only instructions.
- FFmpeg failure explains what happened and what the customer should do.
- Retry is only enabled for retryable failures.

### Task 2: Establish One Source of Truth for Preset Selection

- **Priority:** P0
- **Affected areas:** Processing, Presets, Settings
- [x] Separate `current batch preset` from `default preset`.
- [x] Processing/New Batch controls the current batch preset.
- [x] Presets page clearly shows the selected default preset.
- [x] Settings shows the default preset only, without presenting a conflicting active preset.
- [x] Add visible labels: `Current Batch Preset` and `Default Preset`.

**Acceptance checks**

- A customer can always identify which preset the current batch will use.
- Changing the default preset does not unexpectedly change an active batch.
- No page shows conflicting preset values without explaining the difference.

### Task 3: Record Failed Jobs in History

- **Priority:** P0
- **Affected areas:** Queue, History
- [x] Save failed jobs to History.
- [x] Show failure reason, attempted preset, time, and source file.
- [x] Allow retry from History only when the failure is retryable.
- [x] Add filters for All, Completed, and Failed.

**Acceptance checks**

- Every completed or failed processing attempt is visible in History.
- Failed jobs do not disappear after clearing the current queue.

### Task 4: Make Processing Actions State-Aware

- **Priority:** P0
- **Affected areas:** Processing/New Batch, Queue
- [x] Disable Start when there are no valid videos.
- [x] Disable Pause when no job is actively processing.
- [x] Disable Stop when no job is active.
- [x] Prevent Start when FFmpeg is unavailable.
- [x] Show a short reason near disabled actions when practical.

**Acceptance checks**

- Customers cannot trigger actions that have no effect.
- Button states accurately reflect the queue and processing state.

## Phase 2: Remove Duplicate Workflows

### Task 5: Replace Videos and Processing With a Clear New Batch Flow

- **Priority:** P1
- **Affected areas:** Videos, Processing, sidebar navigation
- **Depends on:** Tasks 2 and 4
- [x] Create a `New Batch` page containing video import, preset selection, processing adjustments, output folder, and Start.
- [x] Remove duplicate import controls from other pages.
- [x] Remove duplicate summary cards from Videos and Processing.
- [x] Keep current queue controls out of New Batch after jobs start.

**Acceptance checks**

- A first-time customer can prepare and start a batch from one page.
- Import, preset, adjustments, output, and Start are not duplicated across pages.

### Task 6: Create a Dedicated Queue Page

- **Priority:** P1
- **Affected areas:** Videos, Processing, Queue
- **Depends on:** Task 5
- [x] Move active, waiting, paused, and failed queue items into one Queue page.
- [x] Remove Processing Queue from the old Videos/Processing pages.
- [x] Show status, progress, preset, output path, and available actions per item.
- [x] Keep queue-level actions together.

**Acceptance checks**

- The processing queue appears in exactly one page.
- Customers can understand what is active, waiting, failed, or completed.

### Task 7: Simplify Import Actions

- **Priority:** P1
- **Affected areas:** New Batch
- **Depends on:** Task 5
- [x] Remove the ambiguous duplicate `Import Videos` and `Add Videos` actions.
- [x] Keep two clear actions: `Add Videos` and `Add Folder`.
- [x] Use consistent icons and wording.

**Acceptance checks**

- Customers understand the difference between adding files and adding a folder.
- No two buttons perform the same file-selection action.

### Task 8: Remove Duplicate Output, Worker, Preset, and Log Controls

- **Priority:** P1
- **Affected areas:** New Batch, Processing, Settings, Presets
- **Depends on:** Tasks 2 and 5
- [x] Current batch output folder belongs only in New Batch.
- [x] Default output folder belongs only in Settings.
- [x] Current batch worker count belongs only in New Batch when needed.
- [x] Default worker count belongs only in Settings.
- [x] Active processing log belongs only in Queue.
- [x] Open full log belongs only in Settings.

**Acceptance checks**

- Every control has one clear location and purpose.
- Current-batch values and saved defaults are visibly separated.

## Phase 3: Clarify Data and Destructive Actions

### Task 9: Improve Video Preview and File Information

- **Priority:** P2
- **Affected areas:** New Batch, Queue, History
- [x] Generate and show real video thumbnails.
- [x] Add a play/pause preview where practical.
- [x] Show duration, resolution, format, and file size.
- [x] Show source and output paths where relevant.
- [x] Keep before/after preview deferred until the now-reliable basic preview has production feedback.

**Acceptance checks**

- Customers can identify imported videos without relying only on filenames.
- Preview failures show a clear fallback instead of a decorative placeholder.

### Task 10: Rename Ambiguous Reset Actions

- **Priority:** P2
- **Affected areas:** Processing adjustments, Settings
- [x] Rename processing Reset to `Reset Adjustments`.
- [x] Rename settings Reset to `Restore Default Settings`.
- [x] Add confirmation before restoring saved defaults.
- [x] State what values will be reset.

**Acceptance checks**

- Customers know exactly what each reset action changes.
- Resetting adjustments does not unexpectedly reset saved defaults.

### Task 11: Protect Clear and Delete Actions

- **Priority:** P2
- **Affected areas:** Queue, History
- [x] Add confirmation dialogs for `Clear Queue` and `Clear History`.
- [x] Explain whether source/output files are affected.
- [x] Rename `Clear Finished` if needed to clarify it removes queue entries only.
- [x] Disable clear actions when there is nothing to clear.

**Acceptance checks**

- Clear actions never delete source/output files unless explicitly stated and confirmed.
- Customers understand what will be removed before confirming.

### Task 12: Improve License and Package Visibility

- **Priority:** P2
- **Affected areas:** Sidebar, Settings
- [x] Keep the sidebar license status compact.
- [x] Add a License & Package section in Settings.
- [x] Show package name, expiry date, video limit, preset limit, and worker limit.
- [x] Show device binding status and license refresh status.
- [x] Explain when cached/offline limits are being used.

**Acceptance checks**

- Customers can see what their package includes and when it expires.
- Package-limit errors link users to understandable license/package information.

## Phase 4: Naming and UI Consistency

### Task 13: Use One Product Name Everywhere

- **Priority:** P2
- **Affected areas:** Desktop title, sidebar, installer, admin dashboard, documentation
- [x] Choose `Video Reposter` as the customer-facing product name.
- [x] Replace `Video Batch Processor` where it refers to the product.
- [x] Keep descriptive phrases only as subtitles where useful.

**Acceptance checks**

- Installer, desktop app, admin dashboard, and documentation use the same product name.

### Task 14: Clarify Presets Page Interaction

- **Priority:** P2
- **Affected areas:** Presets
- **Depends on:** Task 2
- [x] Show a visible `Default` badge on the default preset.
- [x] Add a clear `Set as Default` action.
- [x] Show preset details consistently.
- [x] Explain package-limited presets without hiding why they are unavailable.

**Acceptance checks**

- Customers know whether clicking a preset previews it or selects it.
- Package-restricted presets clearly explain the restriction.

### Task 15: Add Tooltips and Accessible Labels to Icon Buttons

- **Priority:** P3
- **Affected areas:** Settings, Queue, History, New Batch
- [x] Add tooltips and `aria-label` values to copy, retry, remove, open-folder, and similar icon buttons.
- [x] Replace unfamiliar icons with icon-plus-text actions when clarity is more important than compactness.
- [x] Confirm keyboard focus states are visible.

**Acceptance checks**

- Every icon-only button has an understandable tooltip and accessible name.
- Customers do not need to guess what a copy icon will copy.

### Task 16: Improve Empty States and First-Use Guidance

- **Priority:** P3
- **Affected areas:** Dashboard, New Batch, Queue, History
- [x] Make empty states state what the customer should do next.
- [x] Add a prominent New Batch action to Dashboard.
- [x] Keep guidance short and action-oriented.
- [x] Do not show technical implementation details.

**Acceptance checks**

- A first-time customer can identify the next action from every empty page.

## Final Verification Task

### Task 17: Full Customer Workflow Usability Test

- **Priority:** P0 before release
- **Depends on:** Tasks 1-16
- [x] Activate Starter, Pro, and Enterprise test licenses.
- [x] Complete the full workflow with each package.
- [x] Confirm package-limit messages are clear.
- [x] Confirm current batch and default settings never conflict.
- [x] Confirm failed jobs appear in History.
- [x] Confirm clear/reset/retry actions behave as described.
- [x] Check desktop layout at minimum supported window size.
- [~] Check installer and portable builds on a clean Windows PC. Fresh-location install and portable launch passed on this Windows host. `npm run verify:windows-release` automates local verification, and `.github/workflows/windows-release-verification.yml` runs it on a fresh GitHub-hosted Windows runner. The hosted run must pass before completing this item.

**Acceptance checks**

- A new customer can complete a batch without assistance.
- No duplicated control creates uncertainty about which value will be used.
- No developer-only error appears in the customer interface.

## Suggested Implementation Order

1. Task 1: Replace customer-facing developer errors.
2. Task 2: Establish one source of truth for presets.
3. Task 3: Record failed jobs in History.
4. Task 4: Make processing actions state-aware.
5. Task 5: Build the New Batch flow.
6. Task 6: Create the dedicated Queue page.
7. Tasks 7-8: Remove duplicated controls.
8. Tasks 9-12: Improve previews, destructive actions, and package clarity.
9. Tasks 13-16: Finish naming, accessibility, and empty-state polish.
10. Task 17: Run the full customer workflow test.
