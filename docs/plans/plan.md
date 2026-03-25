## Feats
**Major:**
x- tooltips
x- update readme
x- ext icon total timer
x- day timeline
x- hour summaries (time spent per hour, divided color wise by domain)
x- make default direction of tooltips go up
x- sorted list of domains with most active time (visit counts shown too)
    - turn the domain list into a generic reorderable list and supply domain cards and the sort function? I wonder if there's already a library for this.
    - in the timer pill variant, drop the seconds from the time spent field
- icon state change notifications
- timer-based pomodoro warning
    - provide a pomodoro config control in the utility icon set
        - time
        - message
- session interval (>15 min gaps between active sessions) tracking
- persist day's activity bar on the minimal version of the timer pill
- Add a dashboard view
- make icons set act as an anchor for dragging
- make drag toggleable so that whole card can be a drag-anchor
    - show drag indicator on main pill when draggable
    - RiDragMoveLine
    - "Turn on/off draggable card"
    - when card is draggable show RiDragMoveLine, and add drag indicator icons to card
- add cicd
- add channel for people to report issues
- add configurable time limits for sites. When time limit reached, timer pill background fades to red (maybe make this a configurable color)
    - also show how much over you go when you do
    - configure limits for day or hour

**Minor:**
- document release process in it's own doc under /docs
- Add a gpl v3 license (https://claude.ai/share/361273c0-a82e-45b4-ae8d-483b1532a25c)
- change extions bar time display to white background
- add tooltips explaininng how to read graphs
- pretty gradient outline (border thing): https://lattice.com/
- when using the locator feature, don't hide the gradient border until it's hovered over
- clarify purpose of sections in popup (some of the wording is really confusing)
    - add "Today's Activity" to the graph in the timer pill
- Add domain's selected color in the domain list as a background to the card item (with significant transparency), and fill the bar up to the percent of max time that the domain contributes—indicating weight of a particular domain
- be able to choose which domains to highlight active time for in the popup
    - combine multiple domains in the same limit rule
- refactor code to reduce duplication, organize components more granularly
    - too many things repeat the logic of updating time display in real time. should localize this
- dark mode
- select to show active time per hour intervals as the sessions during that interval (i.e. 30 mins active, 15 mins inactive, 20 mins active, 2 hours inactive, etc.) 
- show how much time is spent on websites with time limits to give a sense of what can be regained
- export/import data

- Attribution tag:
Made with ❤️ by
[log] TurtleWave

[Ways to support](link to website: information and donation page)

---
## Bugs
x- fix orphaned pills
- change plugin badge time background to white
- prevent hover interactions while dragging the pill
- fix utility icon tooltips location desync
- Address issue with popup and timer not correctly updating presented times on day rollover
    - timer pill active sites don't reset (can't remember if popup sites did--double-check)
    - extension badge time doesn't update automatically at 00:00
- incorrect site can be marked as active somehow (desync on reload?)
    - also resulted in popup being stuck in a loading state
    - looks like there might be a disconnect with the backend service because the timer pill also disappears. Tab state is detected and mentioned in logs, so something is still operating in the background.
- tests take a long time to run. determine why
x- is the contentscriptmanager unnecessarily managing the sorting of domain items that are passed to the domainlist?

--
## Thoughts
- create a heartbeat service for syncing everything to the same second increment?
- create a clock service too in order to control time
