## Obsidian TODO Plugin

Text-based GTD in Obsidian.

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="BuyMeACoffee" width="100">](https://www.buymeacoffee.com/larslockefeer)

### Features
- Aggregates all outstanding TODOs in your vault and lists them in a single view
- Split out TODOs by type ("Today", "Scheduled", "Inbox" and "Someday/Maybe")
- Schedule a TODO for a specific date by adding a tag
- Mark a TODO as Someday/Maybe by adding a tag #someday
- Complete TODOs from the list view
- Quickly jump to the file in which a TODO is found from the list view
- Integrates with the Daily Notes plugin: TODOs without a due date will inherit the date of the daily note as due date
- Schedule a TODO relative to a note's `todo.date` property with `#T[n]` tags (e.g. `#T1`, `#T-7`)

### Relative date tags

A note can define a base date in its frontmatter (Obsidian Properties):

```yaml
---
todo:
  date: 2026-10-08
---
```

Tasks in that note can then be scheduled relative to that base date with a `#T[n]` tag. The tag is kept in the task text (it remains a regular Obsidian tag) and the resolved date is shown next to it:

| Tag | Meaning |
| --- | --- |
| `#T0` | the base date |
| `#T1` | one day after the base date |
| `#T-7` | seven days before the base date |

`#T+1` is not supported, because `+` is not allowed in Obsidian tags. Use `#T1` instead. Without a `todo.date` property, `#T[n]` is just a regular tag and is not resolved.

### Settings
**Date tag format**: Customise the format you use to add due dates to your tasks. Defaults to `#%date%`.

**Date format**: Customise the date format. Uses luxon under the hood. See [their documentation](https://moment.github.io/luxon/#/formatting?id=table-of-tokens) for supported tokens. Defaults to `yyyy-MM-dd`.

**Open files in a new leaf**: When enabled, files opened from within the plugin will open in a new leaf rather than replacing the currently opened file.

### Screenshots
![](./assets/today.png)
![](./assets/scheduled.png)
![](./assets/inbox.png)
![](./assets/someday.png)

### Roadmap
- [ ] Scroll to correct line in file when jumping from list view
- [ ] (Re)schedule TODOs from the list view
- [ ] Persist cache, on reopening only reindex files changed since Obsidian was closed
- [ ] Filter items list view by tags / freeform search
- [ ] Improve UI and themeability
