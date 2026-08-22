# MatchDesk — User Guide

MatchDesk is a private matching tool for one recruiter. You give it job
descriptions and CVs; it reads them and shows evidence-backed match scores —
every number traceable to highlighted text in the actual document.
**Everything stays on your computer.** No CV, no job description, and no
score ever leaves your machine. Nothing here talks to the internet except the
one-time component install — the first run downloads the parts MatchDesk is
built from, and the start file opens the Node.js download page if Node.js is
missing — and any job links _you_ paste and ask it to fetch.

---

## Setting up (no technical knowledge needed)

You will do three things: download MatchDesk, install Node.js (the engine it
runs on), and double-click the start file. Ten minutes, once.

### Windows

1. **Download MatchDesk.** On the MatchDesk GitHub page, click the green
   **`<> Code`** button, then **Download ZIP**. When it finishes, right-click
   the ZIP in your Downloads folder and choose **Extract All…**. Put the
   extracted folder in your own user folder — for example
   `C:\Users\<you>\MatchDesk`. If your company uses OneDrive, avoid
   **Documents** and **Desktop**: OneDrive syncs every file in them and can
   interfere with the install. Worse, on a company laptop **Documents** is
   often redirected to a network location — and MatchDesk cannot run from
   there, so the start file **usually refuses to run** and asks you to move the
   folder. Extracting into `C:\Users\<you>\MatchDesk` avoids all of this.
   Extraction usually creates a folder inside a folder with the same name —
   keep opening folders until you see the one with many files in it.
2. **Install Node.js.** Go to <https://nodejs.org/en/download>, choose
   **Windows Installer (.msi)** for **Node.js 24**, run it, and click Next
   through every step with the default options. You do not need to tick any
   extra boxes. If your work computer asks for an administrator password you
   don't have, ask your IT team to install **"Node.js 24 LTS"** — that is the
   only thing they need to do.
3. **Start MatchDesk.** Open the extracted folder and double-click
   **`start-matchdesk-windows.cmd`**. It may show as just
   **`start-matchdesk-windows`**, because Windows hides file endings by
   default.
   - If Windows shows a blue **"Windows protected your PC"** screen, click
     **More info**, then **Run anyway** — this appears for any downloaded
     program that isn't from the Microsoft Store.
   - The first run installs MatchDesk's components (a few minutes, one time
     only). **Two black windows appear.** The first one is the start file
     itself; it closes on its own once your browser opens. If it stays open
     instead, it is telling you something — read it before you close it. The
     second window is named **"MatchDesk server"** — that is the one to keep
     open. Your browser opens MatchDesk itself once the server is ready — the
     first start can take a few minutes.
4. **Keep the "MatchDesk server" window open while you work.** Closing it
   stops MatchDesk. To use MatchDesk again later, just double-click
   `start-matchdesk-windows.cmd` again — it starts in seconds after the first time.

### Mac

1. **Download and extract** the ZIP the same way (the green **`<> Code`**
   button → **Download ZIP**; double-click the ZIP to extract).
2. **Install Node.js 24** from <https://nodejs.org/en/download> using the
   macOS Installer (.pkg).
3. **Start MatchDesk:** in the extracted folder, **right-click
   `start-matchdesk-mac.command` and choose "Open"** (only the first time —
   macOS warns about downloaded files), then click **Open** in the dialog.
   After the first time, a normal double-click works. The first run installs
   MatchDesk's components (a few minutes, one time only), and a browser tab
   opens by itself once the server is ready — the first start can take a few
   minutes.
4. Keep the terminal window open while you work; close it to stop MatchDesk.

### Where your data lives

Your uploaded documents and scores are stored in a `.matchdesk` folder in
your home directory (`C:\Users\<you>\.matchdesk` on Windows) — **not** inside
the MatchDesk folder. That means you can delete and re-download the MatchDesk
folder to update the app, and your jobs, CVs and scores survive untouched.
Extracting a new version **over** the old folder works too: the start file
notices the update and refreshes MatchDesk's components on the next launch.

---

## Using MatchDesk

### 1 · Add a job

Two ways, on the **Jobs** page:

- **Paste a link** to the job posting (LinkedIn's "apply on company site"
  link, a careers page, BambooHR, Ashby, Greenhouse…) into the box and click
  **Add from link**. MatchDesk fetches that one page, reads the posting, and
  uses the posting's own title unless you type one at the prompt.
- **Drop a file** — a PDF or Word (.docx) export of the description.

### 2 · Review the requirements — you are in charge, not the machine

Open the job. MatchDesk shows the skills it found _in the description_, with
a proposed minimum experience and degree when the text states one. Nothing
counts until you confirm it:

- **Tap a skill once** to include it; **tap again** to make it a
  **must-have** (candidates missing a must-have are marked ineligible, no
  matter their score).
- Adjust minimum years, degree, and how much each dimension matters.
- Click **Confirm requirements**.

### 3 · Add CVs

On the **Candidates** page, drop CV files (PDF or Word). Each card shows
**readable** or **needs attention** immediately.

### 4 · See what MatchDesk read — before any scoring

Click any candidate. The inspect page shows **exactly what evaluation will
use**: the skills it recognised, the employment ranges it counted (and the
total), degrees and certifications — each one highlighted in the document on
the right, so you can check every claim against the CV itself. If something
is missing here, the score will not include it — no hidden magic.

### 5 · Score, in whichever direction you're working

- **One job, many CVs:** open the job, click **Score all candidates**.
  Eligible candidates rank above ineligible ones; click a row for the full
  breakdown with evidence highlighted.
- **One CV, many jobs:** open the candidate, tick the jobs you care about,
  click **Score selected jobs**. Best match first. Jobs whose requirements
  you haven't confirmed yet say so — confirm them first.

### 6 · "Needs attention" is a refusal, not a failure

MatchDesk **never scores a document it could not fully read** — a confident
wrong number about a real person is the one mistake it refuses to make. A
document goes to _needs attention_ when it is scanned (no readable text),
not in English, partly in another language, or a job link that only renders
with JavaScript. The card always says why and what to do — usually "export
a cleaner PDF" or "save the posting as PDF and upload that". You can always
delete it.

### 7 · Deleting

Delete buttons live on every candidate and job page. Deleting removes the
stored file and every score derived from it, permanently. An audit log keeps
only an anonymous ID and the fact that a deletion happened — never the
content.

---

## What the score means

- **The number (0–100)** blends how well the CV covers the skills you chose,
  the years of experience found, and education/certifications — weighted the
  way you set in the job's requirements.
- **Eligible / Ineligible** is about **must-haves only**: one unmet
  must-have makes a candidate ineligible even with a high number.
- **Every claim has evidence.** The detail views highlight the exact words
  in the document that produced each part of the score. If you can't see
  it highlighted, it isn't in the score.

---

## Common issues and fixes

| Problem                                                                                               | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ERR_PNPM_NO_PKG_MANIFEST`** / "No package.json found", with a path containing `AppData\Local\Temp` | The start file was run from **inside the ZIP**, so Windows unpacked only that one file. Right-click the ZIP in Downloads → **Extract All…**, then double-click `start-matchdesk-windows.cmd` in the extracted folder — the one where `package.json` sits next to it. This is not a network problem. Current versions of the start file catch this themselves and say so in plain English, so this row mostly applies to older downloads.                                                                                                                   |
| **"MatchDesk is in a network folder"** message when starting                                          | MatchDesk can only run from a normal folder on this computer, and a company **Documents** or **Desktop** folder is often a network location. Move the whole MatchDesk folder into your user folder — for example `C:\Users\<you>\MatchDesk` — then double-click `start-matchdesk-windows` there.                                                                                                                                                                                                                                                           |
| **"Windows protected your PC"** when starting                                                         | Click **More info** → **Run anyway**. Windows shows this for any downloaded program.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Windows asks for an administrator password** when installing Node.js                                | On a work-managed computer you may not have one. Ask your IT team to install **"Node.js 24 LTS"** — nothing else in MatchDesk needs admin rights.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Browser opens but shows "can't reach this page"                                                       | The browser normally waits for the server, so this usually means the server window itself hit an error. Look at the **"MatchDesk server"** window (on a Mac, the Terminal window the start file opened) in your taskbar: if it shows red text, close it and double-click the start file again. On rare Windows machines that lack the `curl` helper the start file cannot wait for the server — it falls back to a short fixed wait, so the browser may open early. Then this message only means the server needs longer: wait a minute and press refresh. |
| **"MatchDesk is taking longer than expected"** message                                                | The server did not answer within a few minutes. Look at the **"MatchDesk server"** window (on a Mac, the Terminal window the start file opened): if it shows **red text**, close it and double-click the start file again. Otherwise MatchDesk is probably still starting — wait a moment, then open <http://127.0.0.1:3900> in your browser yourself.                                                                                                                                                                                                     |
| **"The server is running an older build"** message                                                    | You updated MatchDesk while it was running. Close the "MatchDesk server" window (on a Mac, the Terminal window the start file opened) and double-click the start file again.                                                                                                                                                                                                                                                                                                                                                                               |
| A job link comes back **needs attention: "renders with JavaScript"**                                  | That site ships no readable text. Open the posting in your browser, use Print → **Save as PDF**, and drop that file in instead.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A CV shows **0 years counted** but the person has experience                                          | MatchDesk counts **dated ranges** ("Jan 2019 – Mar 2023") and **digit statements** ("7 years of experience"). Tenure written only in words ("seven years") or in unreadable date formats is listed on the inspect page with the reason.                                                                                                                                                                                                                                                                                                                    |
| **Port already in use** message in the server window                                                  | Normally you will not see this: the start file notices MatchDesk is already running and simply opens your browser instead of starting a second server. If you ever do see a red **`EADDRINUSE`** message in a **"MatchDesk server"** window, that window is the extra one — close it. The working MatchDesk is the other one.                                                                                                                                                                                                                              |
| **"MatchDesk is already setting itself up in another window"**                                        | You double-clicked the start file twice. Close this window and let the first one finish — the first-time setup takes a few minutes. If **no** other MatchDesk window is open, an earlier setup was cut off partway: open the MatchDesk folder, delete the folder named `node_modules`, then double-click the start file again.                                                                                                                                                                                                                             |
| **"Your Node.js is missing the helper tools MatchDesk needs"**                                        | Install **Node.js 24** from <https://nodejs.org/en/download> with all the default options, then run the start file again.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| First-time install fails on Windows with a long red error                                             | **Check the `ERR_PNPM_NO_PKG_MANIFEST` row above first** — running from inside the ZIP is the most common cause. Otherwise the start file retries a second way when it can, so read the red text: wording about a **network**, a **proxy**, or a **certificate** means a blocked work network — try again on a normal connection, or ask your IT team to allow downloads from `registry.npmjs.org`.                                                                                                                                                        |
| **"'corepack' is not recognized"**, or a **"keyid"** / signature error                                | Your Node.js is old, or its `corepack` helper is broken. The start file now works around this by itself; if you still see it, install **Node.js 24** from <https://nodejs.org/en/download> and run the start file again — and restart the computer once if you installed Node.js just before.                                                                                                                                                                                                                                                              |
| You want to start over completely                                                                     | Close the server window, delete the `.matchdesk` folder in your home directory (this erases all uploaded documents and scores), and start MatchDesk again.                                                                                                                                                                                                                                                                                                                                                                                                 |

On a locked-down work laptop some of these steps can be blocked by company
policy — your IT team can install Node.js 24 LTS and unblock the MatchDesk
folder, which is everything MatchDesk needs from them.

---

## Honest limitations (by design)

- **English only.** Non-English or mixed-language documents are refused with
  a reason, never half-scored.
- **No scanned-document reading (OCR).** A scanned PDF has no text to read;
  export a real PDF from Word or the original source.
- **Job links that render only with JavaScript** and follow no known
  job-board convention can't be read — save them as PDF instead.
- **MatchDesk is an assistant, not a decision-maker.** It finds and weighs
  the evidence you told it to look for. Reviewing candidates fairly —
  including everything a CV can't capture — is your job, and the tool is
  built to keep you in charge of every requirement that counts.
