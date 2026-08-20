# GoPrep Team Board

A single-page task board for the GoPrep team, built from `GoPrep_Project_Management3.xlsx`.
Tasks are split by **person**, **area**, and **objective (roadmap phase)**.

- **Board** — Kanban by status, drag cards between columns
- **By person** — a column per team member, plus Unassigned
- **By area** — Feature / Bug / Content / Infra / Marketing / Mobile / Ops / UX
- **Timeline** — roadmap phases with progress and success criteria
- **Activity** — who changed what, most recent first

## Deploying to GitHub Pages

```bash
git init
git add .
git commit -m "GoPrep team board"
git branch -M main
git remote add origin git@github.com:<you>/goprep-board.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `root` → Save**.
The board appears at `https://<you>.github.io/goprep-board/` within a minute or two.

`.nojekyll` is included so GitHub serves the files as-is.

## How access works

The page is public; the data is not.

Every read and write goes through Postgres functions (`pm_login`, `pm_bootstrap`,
`pm_save_task`, `pm_set_status`, `pm_delete_task`). The `pm_*` tables have row-level
security enabled with **zero policies** and all table grants revoked, so the API key
embedded in this page cannot read or write a single row on its own. It can only call
those functions, and every function except `pm_login` refuses without a session token.

`pm_login` takes the shared team passcode, checks it against a bcrypt hash, and issues
a token that lasts 30 days. The passcode itself is never in this repo.

### Changing the passcode

In the Supabase SQL editor:

```sql
update public.pm_config
   set passcode_hash = extensions.crypt('the-new-passcode', extensions.gen_salt('bf', 10)),
       updated_at = now()
 where id = 1;

delete from public.pm_sessions;   -- signs everyone out
```

### Adding or removing a team member

```sql
insert into public.pm_people (name, initials, color, role, sort_order)
values ('Lena', 'LE', '#4C9A8F', 'Design', 8);

update public.pm_people set active = false where name = 'Simon';  -- hide, keep history
```

The name dropdown on the login screen is a short list near the bottom of `index.html`
(`function fillWho`) — add new names there too.

## Data model

| Table | What it holds |
|---|---|
| `pm_tasks` | Every task. Archived tasks stay in the table but leave the board. |
| `pm_people` | Roster: name, initials, avatar colour, role. |
| `pm_phases` | The roadmap phases used as objectives. |
| `pm_activity` | Append-only log of creates, edits, moves and archives. |
| `pm_config` | The bcrypt hash of the team passcode. |
| `pm_sessions` | Live session tokens with expiry. |

All of it lives in the existing **Goprep Pro** Supabase project, prefixed `pm_`. Nothing
references, triggers, or modifies the 22 tables the product itself uses.

## Conventions carried over from the workbook

- **Priority** — P0 blocks launch · P1 within 4 weeks · P2 next quarter · P3 backlog
- **Effort** — S under a day · M 1–3 days · L 4–10 days · XL over 2 weeks
- **Status** — Not Started · In Progress · Blocked · Done

Six task IDs were duplicated in the spreadsheet (two different tasks each claiming
GP-028 through GP-033). The second set was renumbered to GP-035…GP-040; each of those
says so in its comments field.
