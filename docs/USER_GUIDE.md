# MatchDesk — User Guide

MatchDesk is a private matching tool for one recruiter. You give it job
descriptions and CVs; it reads them and shows evidence-backed match scores —
every number traceable to highlighted text in the actual document.
**Everything stays on your computer.** No CV, no job description, and no
score ever leaves your machine. The only time MatchDesk touches the internet
is when _you_ paste a job link and ask it to fetch that page.

---

## Setting up (no technical knowledge needed)

You will do three things: download MatchDesk, install Node.js (the engine it
runs on), and double-click the start file. Ten minutes, once.

### Windows

1. **Download MatchDesk.** On the MatchDesk GitHub page, click the green
   **`<> Code`** button, then **Download ZIP**. When it finishes, right-click
   the ZIP in your Downloads folder and choose **Extract All…**. Put the
   extracted folder somewhere you'll find it again (Documents is fine).
2. **Install Node.js.** Go to <https://nodejs.org/en/download>, choose
   **Windows Installer (.msi)** for **Node.js 24**, run it, and click Next
   through every step with the default options. You do not need to tick any
   extra boxes.
3. **Start MatchDesk.** Open the extracted folder and double-click
   **`start-matchdesk.cmd`**.
   - If Windows shows a blue **"Windows protected your PC"** screen, click
     **More info**, then **Run anyway** — this appears for any downloaded
     program that isn't from the Microsoft Store.
   - The first run installs MatchDesk's components (a few minutes, one time
     only). After that, a small **"MatchDesk server"** window opens and your
     browser opens MatchDesk itself.
4. **Keep the "MatchDesk server" window open while you work.** Closing it
   stops MatchDesk. To use MatchDesk again later, just double-click
   `start-matchdesk.cmd` again — it starts in seconds after the first time.

### Mac

1. **Download and extract** the ZIP the same way (the green **`<> Code`**
   button → **Download ZIP**; double-click the ZIP to extract).
2. **Install Node.js 24** from <https://nodejs.org/en/download> using the
   macOS Installer (.pkg).
3. **Start MatchDesk:** in the extracted folder, **right-click
   `start-matchdesk.command` and choose "Open"** (only the first time —
   macOS warns about downloaded files), then click **Open** in the dialog.
   After the first time, a normal double-click works.
4. Keep the terminal window open while you work; close it to stop MatchDesk.

### Where your data lives

Your uploaded documents and scores are stored in a `.matchdesk` folder in
your home directory (`C:\Users\<you>\.matchdesk` on Windows) — **not** inside
the MatchDesk folder. That means you can delete and re-download the MatchDesk
folder to update the app, and your jobs, CVs and scores survive untouched.

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

| Problem                                                              | Fix                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Windows protected your PC"** when starting                        | Click **More info** → **Run anyway**. Windows shows this for any downloaded program.                                                                                                                                                    |
| Browser opens but shows "can't reach this page"                      | The server was still starting. Wait ten seconds and refresh. If it persists, check the "MatchDesk server" window for a message.                                                                                                         |
| **"The server is running an older build"** message                   | You updated MatchDesk while it was running. Close the "MatchDesk server" window and double-click the start file again.                                                                                                                  |
| A job link comes back **needs attention: "renders with JavaScript"** | That site ships no readable text. Open the posting in your browser, use Print → **Save as PDF**, and drop that file in instead.                                                                                                         |
| A CV shows **0 years counted** but the person has experience         | MatchDesk counts **dated ranges** ("Jan 2019 – Mar 2023") and **digit statements** ("7 years of experience"). Tenure written only in words ("seven years") or in unreadable date formats is listed on the inspect page with the reason. |
| **Port already in use** message in the server window                 | MatchDesk is already running in another window — close one of them.                                                                                                                                                                     |
| First-time install fails on Windows with a long red error            | Usually a blocked download on a work network. Try again on a normal connection; if it still fails, install pnpm directly: open "Command Prompt" and run `npm install -g pnpm`, then run the start file again.                           |
| You want to start over completely                                    | Close the server window, delete the `.matchdesk` folder in your home directory (this erases all uploaded documents and scores), and start MatchDesk again.                                                                              |

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
