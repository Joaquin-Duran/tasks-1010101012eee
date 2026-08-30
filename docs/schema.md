# pm_* schema

Generated from the live database. Regenerate after any migration:

```sql
select string_agg(format('%-22s %-28s %s%s', c.table_name, c.column_name,
         c.data_type, case when c.is_nullable='NO' then ' NOT NULL' else '' end),
       E'\n' order by c.table_name, c.ordinal_position)
from information_schema.columns c
join information_schema.tables t on t.table_schema=c.table_schema
 and t.table_name=c.table_name and t.table_type='BASE TABLE'
where c.table_schema='public' and c.table_name like 'pm\_%';
```

Read `CONTEXT.md` section 3 before touching any of it. Every table has RLS on
with zero policies; the page reaches all of it through `pm_bootstrap` and the
`pm_save_*` functions, never directly.

```
pm_activity            id, task_id, task_title, actor, action, detail, at, entity
pm_areas               key, label, color, sort_order
pm_assets              id, name, category, kind, url, location, description, owner,
                       sort_order, archived, created_at, updated_at, lang
pm_config              id, passcode_hash, updated_at
pm_docs                id, key, title, section, icon, summary, body, sort_order,
                       archived, updated_by, created_at, updated_at
pm_files               id, path, name, folder, kind, url, bytes, sort_order,
                       archived, created_at, lang, thumb_url
pm_goals               id, key, name, area, statement, why, metric_name, metric_unit,
                       metric_baseline, metric_target, metric_current, horizon, owner,
                       status, starts, ends, color, sort_order, archived,
                       created_at, updated_at, lower_is_better
pm_ideas               id, title, body, kind, status, url, author, sort_order,
                       archived, created_at, updated_at
pm_journey_steps       id, journey, key, name, subtitle, description, step_no, branch,
                       status, note, task_code, goal_key, archived, created_at,
                       updated_at, shot_url
pm_login_attempts      ip, failures, first_at, last_at, locked_until
pm_metric_points       id, goal_id, on_date, value, note, entered_by, at
pm_milestones          id, goal_id, code, name, description, owner, status, starts,
                       ends, sort_order, archived, created_at, updated_at
pm_people              id, name, initials, color, role, active, sort_order, photo_url
pm_phases              key, name, theme, starts, ends, success_criteria, color,
                       sort_order, verdict
pm_providers           id, name, category, purpose, url, plan, cost_amount,
                       cost_currency, cost_cycle, renewal_date, owner, account_email,
                       sensitivity, username, secret, vault_location, access_note,
                       notes, sort_order, archived, created_at, updated_at
pm_sessions            token, created_at, expires_at
pm_tasks               id, code, title, category, priority, effort, phase_key, status,
                       owners, target_date, description, notes, created_by, sort_order,
                       archived, created_at, updated_at, goal_id, milestone_id, start_date
```

## Constraints worth knowing

- `pm_providers` has `check (sensitivity = 'low' or secret is null)`. A critical
  account physically cannot hold a password.
- `pm_goals.horizon` is one of `impulse`, `someday`, `year`, `quarter`. The UI
  labels `impulse` as "Mission"; the stored value is unchanged.
- `pm_metric_points` is unique on `(goal_id, on_date)`, so a second reading on the
  same day updates rather than duplicates.
- `pm_files.path` is unique, which is what makes `pm_reindex_files` idempotent.

## Functions the page calls

`pm_login`, `pm_bootstrap`, `pm_save_task`, `pm_set_status`, `pm_delete_task`,
`pm_save_goal`, `pm_delete_goal`, `pm_save_milestone`, `pm_delete_milestone`,
`pm_save_metric`, `pm_save_doc`, `pm_save_provider`, `pm_delete_provider`,
`pm_reveal_secret`, `pm_save_asset`, `pm_delete_asset`, `pm_save_phase`,
`pm_move_phase_tasks`, `pm_save_journey_step`, `pm_save_idea`, `pm_delete_idea`,
`pm_reindex_files`.

Every one calls `pm__require(p_token)` first.
