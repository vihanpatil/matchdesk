# MatchDesk — User Guide

MatchDesk is a private matching tool for one recruiter. You give it job
descriptions and CVs; it reads them and shows evidence-backed match scores —
every number traceable to highlighted text in the actual document.
**Everything stays on your computer.** No CV, no job description, and no
score ever leaves your machine. MatchDesk uses the internet in only two
places: while it sets itself up the first time (Setup B and the Mac steps
below — Setup A arrives complete and downloads nothing at all), and when
_you_ paste a job link and ask it to fetch that posting (on some sites that
takes a second page from the same website — never anywhere else).

---

## Setting up (no technical knowledge needed)

### Step 1 — Open the download page

Click this link: <https://github.com/vihanpatil/matchdesk/releases/latest>

It goes straight to the download list. The page opens on the newest version,
at the top. Scroll down to its list of files — if you see a grey heading
called **Assets**, click it to open the list.

### Step 2 — Choose your setup

Look at that list of files.

- **You can see a file named `MatchDesk-windows-x64.zip`** → follow **Setup
  A** below. It is quicker and needs nothing installed on your computer.
- **You cannot see that file** → follow **Setup B** below.
- **You are on a Mac** → follow **Setup on a Mac** below.
  `MatchDesk-windows-x64.zip` is for Windows only, so it is not your file
  even when it is there.

Setup A and Setup B use start files with **different names**, so follow only
one of them. If the file a step tells you to double-click is not in your
folder, you are on the other path — go back and read the other setup.

### Setup A — the ready-made download (Windows)

Everything MatchDesk needs is already inside the folder you are about to
extract. There is nothing to install and no password to enter.

3. **Download MatchDesk.** In that list of files, click
   **`MatchDesk-windows-x64.zip`**. The download is large and can take
   several minutes on a work connection — that is normal, let it finish.
   After it has downloaded, the rest takes about two minutes.
   - Your browser may say the file **"isn't commonly downloaded"** or **"may
     be unsafe"**. That warning appears for any large program that isn't from
     the Microsoft Store. Click the **…** next to the warning and choose
     **Keep** to finish the download. If the file disappears instead, your
     company's security software removed it — ask your IT team to allow it.
4. **Extract it.** Right-click the ZIP in your **Downloads** folder and
   choose **Extract All…**. A box appears with a location already filled in.
   **Leave that location exactly as it is and click Extract** — MatchDesk
   unpacks next to the ZIP, in Downloads, and Downloads is a fine place to
   run it from. Do not move it to **Desktop** or **Documents**: on a work
   laptop those are often stored on the company network (usually through
   OneDrive), and MatchDesk usually cannot run from a network folder.
   - You may end up with a folder inside a folder. Keep opening folders
     until you see one that contains a file called **Start-MatchDesk**. That
     is the MatchDesk folder — everything from here happens in it.
   - Do **not** open the ZIP and double-click the start file from inside it:
     Windows unpacks only that one file, and MatchDesk will tell you so.
5. **Double-click `Start-MatchDesk.cmd`.** It may show as just
   **`Start-MatchDesk`**, because Windows hides file endings by default.
   - If Windows shows a blue **"Windows protected your PC"** screen, click
     **More info**, then **Run anyway** — this appears for any downloaded
     program that isn't from the Microsoft Store.
   - **Two black windows open.** One of them is titled **MatchDesk server** —
     **that is the one to leave alone.** The other is titled just
     **MatchDesk**, and it has done its job: it may close by itself, or it may
     say `You can close this window once MatchDesk is working.` and then wait
     at Windows's own `Press any key to continue . . .`. Either is fine —
     press a key, or close it. Only stop and read it if it shows a message you
     did not expect.
6. **Keep the "MatchDesk server" window open while you work.** Closing it
   stops MatchDesk. The window says so itself when it starts:
   `Keep the "MatchDesk server" window open while you work.`

**That is all of Setup A.** Skip Setup B and the Mac steps and go straight to
**How you know it worked**.

### Setup B — the long way (Windows)

Three things: download MatchDesk, install Node.js, double-click the start
file. Ten minutes, once.

3. **Download MatchDesk.** Click this link:
   <https://github.com/vihanpatil/matchdesk/archive/refs/heads/main.zip> —
   the file it downloads is called **`matchdesk-main.zip`**. That is the right
   file, even though the name looks odd. (It is the same download as the green
   **`<> Code`** button → **Download ZIP** on the MatchDesk page.)
   - If your browser says the file **"isn't commonly downloaded"** or **"may
     be unsafe"**, click the **…** next to the warning and choose **Keep**. If
     the file disappears instead, your company's security software removed
     it — ask your IT team to allow it.
4. **Extract it.** Right-click `matchdesk-main.zip` in your **Downloads**
   folder and choose **Extract All…**. A box appears with a location already
   filled in. **Leave that location exactly as it is and click Extract** — it
   unpacks next to the ZIP, in Downloads, and Downloads is a fine place to run
   it from. Do not move it to **Desktop** or **Documents**: on a work laptop
   those are often stored on the company network (usually through OneDrive),
   and MatchDesk usually cannot run from a network folder.
   - You may end up with a folder inside a folder. Keep opening folders until
     you see one that contains a file called **start-matchdesk-windows**. That
     is the MatchDesk folder — everything from here happens in it.
   - Do **not** open the ZIP and double-click the start file from inside it:
     Windows unpacks only that one file, and MatchDesk will tell you so.
5. **Install Node.js.** Go to <https://nodejs.org/en/download>. Make sure the
   buttons on that page say **Windows**, **x64** and **.msi** — usually they
   already do. Leave the version as whatever the page offers. Click the
   download button, run the file, and click **Next** on every screen without
   changing anything. You do not need to tick any boxes. If your work computer
   asks for an administrator password you do not have, ask your IT team to
   install **"Node.js 24 LTS"** — that is the only thing they need to do, and
   it is the exact wording MatchDesk itself uses when it asks.
6. **Start MatchDesk.** Open the MatchDesk folder and double-click
   **`start-matchdesk-windows.cmd`**. It may show as just
   **`start-matchdesk-windows`**, because Windows hides file endings by
   default.
   - If Windows shows a blue **"Windows protected your PC"** screen, click
     **More info**, then **Run anyway** — this appears for any downloaded
     program that isn't from the Microsoft Store.
   - **The first time only, MatchDesk sets itself up.** The window says
     `First run: installing MatchDesk's components. This can take a few minutes and only happens once.`
     and then a lot of text scrolls past for several minutes, sometimes sitting
     still for a minute at a time. That is normal.
     **Don't close the window while this happens.** If it says
     `That did not finish - trying a different way. This is normal.`, that
     really is normal — let it carry on.
   - When the setup is done, a second window titled **MatchDesk server** opens
     and your browser opens by itself. While you wait, the first window prints
     `Still starting - the first start can take a few minutes...` every half
     a minute or so.
7. **Keep the "MatchDesk server" window open while you work.** Closing it
   stops MatchDesk. Next time you start MatchDesk it takes seconds — the
   setting-up only happens once.

**That is all of Setup B.** Skip the Mac steps and go to **How you know it
worked**.

### Setup on a Mac

3. **Download MatchDesk.** Click this link:
   <https://github.com/vihanpatil/matchdesk/archive/refs/heads/main.zip> —
   the file it downloads is called **`matchdesk-main.zip`**. That is the right
   file, even though the name looks odd. Double-click it in Finder to extract
   it. Everything from here happens inside the folder that appears next to it.
4. **Install Node.js.** Go to <https://nodejs.org/en/download>, choose the
   **macOS Installer (.pkg)**, and leave everything else as the page offers
   it. Run the downloaded file and click through every screen without changing
   anything.
5. **Start MatchDesk.** In that folder, **right-click
   `start-matchdesk-mac.command` and choose "Open"** — only the first time,
   because macOS warns about files downloaded from the internet — then click
   **Open** in the dialog. After the first time, a normal double-click works.
   - **The first time only, MatchDesk sets itself up.** The window says
     `First run: installing MatchDesk's components. This can take a few minutes and only happens once.`
     and then a lot of text scrolls past for several minutes, sometimes sitting
     still for a minute at a time. That is normal.
     **Don't close the window while this happens.** If it says
     `That did not finish - trying a different way. This is normal.`, that
     really is normal — let it carry on.
   - When it is ready, a browser tab opens by itself.
6. **Keep that window open while you work.** On a Mac there is only one
   window, and it is MatchDesk itself. The window says so:
   `Keep this window open while you work; close it to stop MatchDesk.`

### How you know it worked

A browser tab opens at `http://127.0.0.1:3900` showing a page with
**MatchDesk** at the top left, two links beside it — **Jobs** and
**Candidates** — and **Local · Private** on the right. The page itself is
headed **Jobs**, with "Pick a job to rank its candidates, or add a new one."
underneath, a box that says "Drop a job description here — PDF or DOCX", a box
for pasting a job posting link, and the line "No jobs yet — drop one above."

That empty page is a working MatchDesk. You are set up — click **Jobs** to add
your first job, or read **Using MatchDesk** below. If the tab shows an error
page instead, or no tab opens at all, see **Common issues and fixes**.

### Make MatchDesk easy to find again

MatchDesk is never installed, so it will not appear in your Start menu — next
week you would have to find the folder again. Fix that now, once:

- **Windows:** right-click the start file (**Start-MatchDesk** for Setup A,
  **start-matchdesk-windows** for Setup B), choose **Show more options** if the
  menu is short, then **Send to → Desktop (create shortcut)**. If the menu also
  offers **Pin to Start**, that works too. From then on MatchDesk is one
  double-click away and you never need to find the folder again.
- **Mac:** right-click `start-matchdesk-mac.command`, choose **Make Alias**,
  and drag the alias onto your Desktop.

Starting MatchDesk when it is already running does no harm: the start file
says `MatchDesk is already running - opening your browser.` and simply opens
the tab.

### Where your data lives

Your uploaded documents and scores are stored in a `.matchdesk` folder in your
home folder — on Windows, `C:\Users\yourname\.matchdesk`, where `yourname` is
your own Windows user name — **not** inside the MatchDesk folder. That means
you can delete and re-download the MatchDesk folder to update the app, and
your jobs, CVs and scores survive untouched.

How you update depends on which setup you used:

- **Setup A (the ready-made download):** extract each new version into its
  **own new folder**, then delete the old folder once the new one works.
- **Setup B, and the Mac:** extracting a new version **over** the old folder
  works too. The next time you start it, the window says
  `MatchDesk was updated - refreshing its components. A few minutes.` and
  brings itself up to date — leave it alone until your browser opens.

---

## Using MatchDesk

Everything below happens on the two links at the top of the page: **Jobs** and
**Candidates**.

### 1 · Add a job

Two ways, on the **Jobs** page:

- **Paste a link** to the job posting (LinkedIn's "apply on company site"
  link, a careers page, BambooHR, Ashby, Greenhouse…) into the box and click
  **Add from link**. MatchDesk fetches the posting — on some sites it needs a
  second page from the same website to reach the text — reads it, and uses
  the posting's own title unless you type one at the prompt.
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
with JavaScript. The card always says why and what to do — for example "Replace the file
with a cleaner export, or delete it." or "save the posting as PDF and
upload it instead". You can always delete it.

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

Find the words you can see on your screen in the left-hand column. If they are
not in the first table, look in the two tables below it.

### Any setup

| What you see                                                                                                              | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Double-clicking the start file does nothing, opens it as text in Notepad, or says it is blocked by your administrator** | Your company's security settings are blocking it. Ask your IT team: "Please allow me to run Start-MatchDesk.cmd in my own MatchDesk folder." That is the only thing they need to change. (On Setup B the file is called `start-matchdesk-windows.cmd`, and on a Mac `start-matchdesk-mac.command`.)                                                                                                                                                                                                                                                                                                                                           |
| **A blue "Windows protected your PC" screen** when you start it                                                           | Click **More info** → **Run anyway**. Windows shows this for any downloaded program.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **A black window filled with error text, mentioning a folder called `Temp`**                                              | The start file was run from **inside the ZIP**, so Windows unpacked only that one file. Right-click the ZIP in your Downloads folder → **Extract All…**, then double-click the start file in the extracted folder — the one with many other MatchDesk files sitting next to it. This is not a network problem and not a Node.js problem. (You may see `ERR_PNPM_NO_PKG_MANIFEST` or "No package.json found" in the text. This screen belongs to copies downloaded before late August 2026 — newer copies show the friendlier message in the next row instead.)                                                                                |
| **"It looks like this file was started from inside the ZIP"**                                                             | Right-click the ZIP in your Downloads folder → **Extract All…** and pick a place you will find again. Keep opening folders until you see the one with many files in it, then double-click the start file in there. This is not a network problem and not a Node.js problem.                                                                                                                                                                                                                                                                                                                                                                   |
| **"MatchDesk is in a network folder or a folder this computer cannot open"**                                              | MatchDesk can only run from a normal folder on this computer, and a work **Documents** or **Desktop** folder is often a network location. Move the whole MatchDesk folder into your **Downloads** folder, or the folder the message names — `C:\Users\yourname\MatchDesk`, with your own Windows user name in place of `yourname` — then double-click the start file there.                                                                                                                                                                                                                                                                   |
| **The browser opened, but the page says it cannot be reached**                                                            | Look at the **MatchDesk server** window — on a Mac, the Terminal window the start file opened. If it has stopped and shows a block of text you did not expect — especially anything containing the word **Error** — close that window and double-click the start file again. If it is still printing new lines, it is still working; give it another minute. On some Windows computers the start file cannot tell exactly when MatchDesk is ready, so the browser opens early; that window then also says `If the browser page says it cannot be reached, the server is still starting - wait a minute and press refresh.` — do exactly that. |
| **"MatchDesk is taking longer than expected"**                                                                            | Look at the **MatchDesk server** window — on a Mac, the Terminal window the start file opened. If it has stopped and shows a block of text you did not expect — especially anything containing the word **Error** — close that window and double-click the start file again. If it is still printing new lines, it is still working; give it another minute. If there is **no** such window at all, just double-click the start file again. If MatchDesk is simply still busy, give it a moment, then open <http://127.0.0.1:3900> in your browser yourself.                                                                                  |
| **Two "MatchDesk server" windows are open and one of them has stopped**                                                   | You have two and you only need one. Close the one that has stopped — the one showing a block of text you did not expect, perhaps mentioning a port already in use or `EADDRINUSE`. The other one is the working MatchDesk.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **"The server is running an older build"** inside MatchDesk itself                                                        | You updated MatchDesk while it was running. Close the **MatchDesk server** window (on a Mac, the Terminal window the start file opened), double-click the start file again, then try what you were doing once more.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| A job link comes back **needs attention: "renders with JavaScript"**                                                      | That site ships no readable text. Open the posting in your browser, use Print → **Save as PDF**, and drop that file in instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| A CV shows **0 years counted** but the person has experience                                                              | MatchDesk counts **dated ranges** ("Jan 2019 – Mar 2023") and **digit statements** ("7 years of experience"). Tenure written only in words ("seven years") is not counted at all. Dates in a format MatchDesk cannot read are listed on the candidate's **inspect page** with the reason, and when nothing could be counted the inspect page says so.                                                                                                                                                                                                                                                                                         |
| **You want to start over completely**                                                                                     | Close the **MatchDesk server** window (on a Mac, the Terminal window), delete the `.matchdesk` folder in your home folder (this erases all uploaded documents and scores), and start MatchDesk again.                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Setup B, and the Mac — while MatchDesk is setting itself up

| What you see                                                                                                                          | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"First run: installing MatchDesk's components."** and then minutes of scrolling text                                                | Nothing is wrong — this is the one-time setting-up. Leave the window alone: it takes several minutes and can sit still for a minute at a time. Your browser opens by itself when it finishes.                                                                                                                                                                                                                                                             |
| **"That did not finish - trying a different way. This is normal."**                                                                   | It really is normal. MatchDesk is setting itself up a second way, which usually works. Leave the window alone and give it a few more minutes.                                                                                                                                                                                                                                                                                                             |
| **"MatchDesk was updated - refreshing its components. A few minutes."**                                                               | You extracted a new version over the old folder, and MatchDesk is bringing itself up to date. Leave the window alone; your browser opens by itself when it finishes.                                                                                                                                                                                                                                                                                      |
| **"MatchDesk is already setting itself up in another window"**                                                                        | Close this window and let the other one finish — the first-time setting-up takes a few minutes. If **no** other MatchDesk window is open, an earlier setup was cut off partway: open the MatchDesk folder, delete the folder named `node_modules`, then double-click the start file again.                                                                                                                                                                |
| **"Node.js is not installed yet. It is the one thing MatchDesk needs."**                                                              | **A web page will open by itself — that's MatchDesk taking you to the Node.js download page. It is safe.** Take the download that page offers, run it, and click **Next** on every screen without changing anything. Then double-click the start file again. If your work computer asks for an administrator password you do not have, ask your IT team to install **"Node.js 24 LTS"** — that is all they need to do.                                    |
| **"This computer's Node.js is either older than MatchDesk needs or not working"** (on a Mac it starts **"This Mac's Node.js…"**)      | Your computer has Node.js, but an older one than MatchDesk can use. **A web page will open by itself — that's MatchDesk taking you to the Node.js download page. It is safe.** Install it with all the default options, then double-click the start file again. If you had only just installed Node.js when this appeared, restart the computer once and try again.                                                                                       |
| **"Your Node.js is missing the helper tools MatchDesk needs"**                                                                        | Install Node.js again from <https://nodejs.org/en/download> with all the default options, then double-click the start file again. **A web page opens by itself to that same download page — that's MatchDesk, and it is safe.**                                                                                                                                                                                                                           |
| **A black window filled with error text mentioning `corepack`, or a `keyid` / signature error**                                       | Your Node.js is old, or its `corepack` helper is broken. Install Node.js from <https://nodejs.org/en/download> with all the default options and double-click the start file again — and if you installed Node.js just before this happened, restart the computer once first.                                                                                                                                                                              |
| **"The install did not finish. The red text above says why."** (on a Mac: **"The install did not finish. The text above says why."**) | Read the text above that message. Wording about a **network**, a **proxy** or a **certificate** means a work network is blocking the download — try again on a normal connection, or ask your IT team to allow downloads from `registry.npmjs.org`. If it mentions a folder called `Temp`, MatchDesk was started from inside the ZIP: see the `Temp` row in the first table. On some screens that text is not actually red — look for the word **Error**. |
| **Windows asks for an administrator password** while you install Node.js                                                              | On a work-managed computer you may not have one. Ask your IT team to install **"Node.js 24 LTS"** — nothing else in MatchDesk needs administrator rights.                                                                                                                                                                                                                                                                                                 |

### Mac only

| What you see                                                     | What to do                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **"This file is running outside the MatchDesk folder."**         | The ZIP is not fully extracted, or you started the file from somewhere else. Double-click `matchdesk-main.zip` in Finder to extract it, open the folder that appears, and run **start-matchdesk-mac** from inside that folder. |
| **"MatchDesk could not open its own folder."**                   | Move the MatchDesk folder somewhere simple — your home folder — and run the file again.                                                                                                                                        |
| **The window is sitting at "Press Enter to close this window."** | That is MatchDesk holding the window open so you can read the message just above it. Read that message, find it in these tables, then press Enter.                                                                             |

On a locked-down work laptop some of these steps can be blocked by company
policy. Your IT team can allow the start file to run, install
**"Node.js 24 LTS"**, and unblock the MatchDesk folder — that is everything
MatchDesk ever needs from them.

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
