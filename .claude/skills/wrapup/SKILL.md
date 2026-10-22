---
name: wrapup
description: Safely end a session — update the build plan, then review, commit, merge, push, and confirm the working tree is clean before exiting.
user-invocable: true
---

Wrap up this coding session safely. First make sure the build plan reflects what actually happened, then make sure all work is committed, merged, and pushed, with nothing left behind. Walk through these steps and report back at each one — do NOT skip the review steps, and STOP and ask me before doing anything destructive.

1. **Update the build plan FIRST.** Find the project's build plan (look for `BUILD_PLAN.md`, `build-plan.md`, `PLAN.md`, `docs/build-plan.md`, or similar; if you can't find one, ask me where it is or whether to create one). Then, based on what we actually did this session:
   - Tick off (`- [x]`) every task we completed, and add the date it was done (use today's actual date — check it, don't assume).
   - For anything we did NOT complete but started, note current status so future-me knows where it stands.
   - **Record deviations.** Wherever we did something different from what the plan said — a different approach, a skipped step, a new task that came up — add a short dated note explaining WHAT changed and WHY. This is the most important part: the plan is the record of why the build went the way it did, not just a checklist.
   - Add any new tasks that surfaced this session so they're not lost.
   - Show me the diff of the build plan before moving on, and let me correct it.

2. **Update any other project/build docs** that went stale this session — README, architecture notes, data-model docs, env/setup instructions. Only touch what actually changed; tell me what you updated.

3. **Show the git state.** Run `git status` and `git branch --show-current`. Tell me which branch I'm on and list every modified, staged, and untracked file (the build-plan and doc edits should now show up here).

4. **Review the changes.** Run `git diff` (and `git diff --staged` if anything is staged). Summarize what actually changed in plain language. If you see anything unexpected — files I didn't mean to touch, large deletions, secrets, `.env` files, build artifacts, or anything that looks like it shouldn't be committed — flag it and STOP for my confirmation before staging.

5. **Stage and commit.** Once I've confirmed the changes look right, stage them (`git add` — prefer naming files over a blanket `git add .` if anything questionable showed up in step 4) and commit with a clear, specific message describing what changed. Show me the message before committing.

6. **Merge if on a branch.** If I'm NOT on `main`:
   - Ask me whether to merge into `main` now or leave the branch for a PR.
   - If merging: `git checkout main`, `git pull`, `git merge <branch>`, and resolve or report any conflicts. Do NOT force anything.
   - After a clean merge, ask before deleting the branch.

7. **Push.** Run `git push`. Remind me that pushing to `main` triggers the Vercel production deploy for Cookie Central, and confirm I want that live before pushing to main.

8. **Final clean check.** Run `git status` once more. Confirm it reads "working tree clean" and "up to date with origin." Report the final state.

9. **Shutdown checklist.** Remind me to:
   - Stop the dev server if it's running (`Ctrl + C`).
   - Kill any background agents (`Ctrl + F` twice).
   - Confirm no worktrees are left unmerged (`git worktree list`).
   - Then exit with `/exit`.

End with a one-line summary: build plan updated (y/n), branch, last commit, and whether everything is pushed and clean.
