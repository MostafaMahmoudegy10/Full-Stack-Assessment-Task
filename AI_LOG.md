## Previous AI Interaction

**My prompt:**
I provided my own answer to the assessment question "How is the application structured, and what are the major modules?" in rough English, and asked the AI to fix the syntax and write it into `ASSESSMENT_NOTES.md`.

**AI response summary:**
The AI took my draft, corrected grammar and spelling, and structured it into clear sections (backend structure, frontend structure, major modules) while keeping my original meaning and voice.

**What I did:**
Reviewed the formatted output, confirmed it matched my understanding of the codebase, and accepted the write to the file.

**Where it was applied:**
- `ASSESSMENT_NOTES.md` — the answer to the first assessment question.

## Example AI Interaction

**What I asked:**
I asked for task assignment and unassignment with project-membership validation, role-based permissions, assignee-change activity logging, and a paginated activity endpoint.

**AI response summary:**
The AI added the assignment service flow, validated request DTOs, controller endpoints, assignee-change logging, and an authorized activity query optimized with batching and an index.

**What I implemented:**
I applied the requested assignment rules and added latest-first activity pagination without per-record actor queries.

**Where it was applied:**
- `TasksService`
- `TasksController`
- task assignment and activity DTOs, activity schema, and shared API types
