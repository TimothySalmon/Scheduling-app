# Scheduling-app

A lightweight, browser-based production scheduler built around the CatFace / Aphmau
production-schedule workflow: everything lives on a **15-minute grid**, and every task
in a video runs back to back, so the schedule cascades on its own.

## Why

The team plans in a Google Sheet where each column is a 15-minute chunk. Moving one task
means hand-dragging every task after it. This app does that part for you.

## What it does

- **Add a video** (episode / shoot) with a call time, team, showrunner and an optional video link.
- **Add tasks** with a name, a type (BL, Prod, Recording, WT / Revs, Wrap, SP, Admin Tasks,
  Prod Mgmt Scrum, Lunch, Other) and a length in 15-minute steps. Each new task is dropped
  onto the timeline automatically, right after the previous one.
- **Move a task and every task after it follows.** Drag a block sideways on the timeline and it
  snaps to the nearest 15 minutes; everything later in that video shifts by the same amount.
- **Make a task shorter or longer and the rest re-flows.** Drag the right-hand edge of a block,
  or use the -15 / +15 buttons in the task list and inspector.
- **Reorder tasks** by dragging them in the task list (or with the Up / Down buttons); all the
  times recalculate instantly. A task can also be moved onto another video.
- **Gaps are supported** - give a task a gap before it if the team needs breathing room.
- Keyboard: left / right arrows nudge the selected task, Shift + left / right shorten or lengthen
  it, Delete removes it.
- **Autosaves** to your browser, plus Save JSON / Load JSON to hand a day to someone else.
- **Export CSV** writes one column per 15 minutes and one row per video, matching the layout of
  the production spreadsheet, so it pastes straight back into Sheets.
- Print gives a clean timeline-only view.

## Run it

Open `index.html` in any modern browser. No build step and no dependencies.

To publish it for the team: Settings > Pages > Deploy from a branch > `main` / root.

## Files

- `index.html` - markup, toolbar and the add-video dialog
- `styles.css` - dark theme and the 15-minute grid
- `app.js` - schedule model, cascading move / resize, reordering, import / export
