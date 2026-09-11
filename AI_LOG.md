# AI usage log

## Tools used

Codex was used for this repository review and five-phase implementation. Earlier AI interactions recorded by the candidate involved help formatting the architecture explanation and assistance around assignment/activity; the earlier log did not identify the assistant by product name.

## How AI was used

- Read the assessment and compare the working repository with upstream `engtechno/Full-Stack-Assessment-Task` at `27c84d8`.
- Review gaps, discuss self-unassignment and transaction consistency, implement the agreed phases, generate regression/browser tests, investigate test failures, and draft documentation/PR descriptions.
- Run TypeScript, lint, MongoDB-backed API tests, and Playwright browser checks; visually inspect the mobile result. Also run a temporary smoke harness against production Next.js, compiled NestJS, and an isolated real replica set, verifying persisted assignment/unassignment history.
- The candidate authored the assignment/activity foundation in `aa5e8d1`. The later candidate commit `9432dd2` also contains the ID tie-breaker activity index and debug-log cleanup. The five subsequent PRs extend that candidate work. It must not be represented as functionality inherited from the starter or as newly invented by this implementation pass.

## Suggestions rejected or significantly changed

- The candidate rejected the review's framing that assignment/activity were merely pre-existing functionality to fix. Comparison with upstream confirmed their authorship, and the notes and PR descriptions were corrected accordingly.
- The standalone-MongoDB option with separate task/activity writes was not selected. The candidate chose transactional writes and accepted replica-set setup to avoid partial history.
- The initial mobile layout left assignment below the entire timeline. Visual review led to moving assignment controls before the long content on small screens.

## Generated code modified

- The first browser setup reused `.next`; Windows reported a file-lock/rename error. It was changed to use an isolated `.next-browser` output directory.
- The first browser URL used `127.0.0.1`, which Next.js rejected for its dev HMR connection. The test page origin was changed to `localhost` so hydration and API fixtures could run normally.
- The initial failed-save test matched every alert, including Next.js's route announcer. The locator was narrowed to the assignment error. The rerun verified the retained value and successful retry.
- The existing candidate implementation was extended to normalize IDs, permit self-unassignment, remove the unsupported completed-task restriction, and write activity transactionally. These are incremental changes to the candidate's feature, not a claim that assignment/history came from the starter.

This log records work performed and decisions made in the session. It does not claim the candidate has already reviewed every generated line or invent an earlier rejected suggestion. The candidate remains responsible for reviewing and explaining the submission.
