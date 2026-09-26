# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker, plus one repo-local role the skills don't know about.

| Label in mattpocock/skills          | Label in our tracker | Meaning                                                                                                                |
| ----------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `needs-triage`                      | `needs-triage`       | Maintainer needs to evaluate this issue                                                                                |
| `needs-info`                        | `needs-info`         | Waiting on reporter for more information                                                                               |
| `ready-for-agent`                   | `ready-for-agent`    | Fully specified, ready for an AFK agent                                                                                |
| `ready-for-human`                   | `ready-for-human`    | Requires human implementation                                                                                          |
| `wontfix`                           | `wontfix`            | Will not be actioned                                                                                                   |
| _(repo-local, no skill equivalent)_ | `done`               | Implemented, tested and code-reviewed; acceptance criteria checked off and a `## Comments` entry records what was done |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

When an implementer finishes a ticket (all acceptance criteria checked, `## Comments` written), set `Status: done` — don't leave it on whatever triage role it had before.

Edit the right-hand column to match whatever vocabulary you actually use.
