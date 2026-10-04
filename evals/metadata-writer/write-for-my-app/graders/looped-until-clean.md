---
type: llm
focus: mock_calls
---

These are the calls the agent made to validate_metadata, with each answer.

PASS if the agent's LAST validate_metadata call returned every check with "ok": true. Also PASS
if the only checks still failing in that last call are warnings that the input shows can't
reasonably be fixed (for example keywords_fill_space when no more relevant words exist), and no
error-severity check (title_length, subtitle_length, keywords_length) fails.

FAIL if there are no validate_metadata calls, if the last call has a failing error-severity
check, or if the last call still fails warnings that the next draft could easily have fixed
(spaces after commas, repeated words, plurals, filler words).
