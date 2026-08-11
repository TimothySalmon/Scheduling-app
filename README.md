# Scheduling-app

test line
# Scheduling-app

A lightweight, browser-based production scheduler built around the CatFace / Aphmau
production-schedule workflow: everything lives on a **15-minute grid**, and steps cascade
automatically.

## Why

The team plans in a Google Sheet where every column is a 15-minute chunk. Moving one task
means hand-dragging every task after it. This app does that part for you.

## Features

- **Add a video** (episode / shoot) with a call time, team, owner and an optional video link.
- **Add tasks** with a name, a type (BL, Prod, Recording, WT/Revs, Wrap, SP, Admin Tasks,
  Prod Mgmt Scrum, Lunch) and a duration in 15-minute increments. The task is placed on the
  timeline automatically, right after the previous step.
- **Move a step and every step after it follows.** Drag a block left or right on the timeline
  (it snaps to 15 minutes) and everything later in that video shifts by the same amount.
- **Make a step shorter or longer and everything after it re-flows.** Drag the right edge of a
  block, or use the -15 / +15 buttons in the inspector.
- **Reorder steps** by dragging them in the step list; all times recalculate instantly.
- Keyboard: left / right arrows move the selected step, Shift + arrows shorten or lengthen it,
  Delete removes it.
- **Autosave** to the browser, plus Save / Load JSON and **Export CSV** using the same
  15-minute column layout as the spreadsheet, so it pastes straight back into Sheets.

## Run it

Open `index.html` in any modern browser. No build step, no dependencies.

To publish it: Settings > Pages > Deploy from a branch > `main` / root.

## Files

- `index.html` - markup, toolbar and dialogs
- `styles.css` - styling and the 15-minute grid
- `app.js` - schedule model, cascading logic, drag / resize, import / export
