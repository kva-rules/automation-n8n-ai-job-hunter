# Setup guide

This guide rebuilds the whole system from nothing on a Mac or a Linux machine, in about an hour.

## 1. Run n8n

**Check that Node is installed.** Run `node -v`. You need version 22 or later. If it's missing, install nvm, then run `nvm install 22`.

**First start:**

```
mkdir n8n && cd n8n
npx n8n
```

Open http://localhost:5678 and create the n8n owner account.

**Keep n8n running permanently with pm2:**

```
npm install -g pm2
NODE_OPTIONS="--dns-result-order=ipv4first" pm2 start "npx n8n" --name n8n
pm2 save
pm2 startup     # run the sudo line it prints
```

`--dns-result-order=ipv4first` avoids `ENETUNREACH` errors when your network has no IPv6. Telegram fails without it on such networks.

Useful commands: `pm2 status`, `pm2 logs n8n` and `pm2 restart n8n --update-env`.

**Data and schedules.** n8n keeps all its data in `~/.n8n`:

- `database.sqlite` holds workflows, credentials and run history.
- `config` holds the encryption key.

Back up that folder. Schedules only run while the machine is awake.

## 2. Gemini API key (Google AI Studio)

1. Go to aistudio.google.com and click **Get API key**, then **Create API key**.
2. Copy the key. It only goes into n8n.

| Model | Role |
| --- | --- |
| `models/gemini-3.5-flash` | Main scorer |
| `models/gemini-flash-lite-latest` | Automatic fallback when the main model is busy |

The model dropdown in n8n lists the models your key can use. Newer keys can't use `gemini-2.5-flash` and get a 404 error.

## 3. Google Cloud OAuth (for Gmail and Sheets)

**3.1 Create a project.** At console.cloud.google.com, create a new project (for example `n8n-jobs`).

**3.2 Enable APIs.** Go to APIs & Services → Library, then enable:

- Gmail API
- Google Sheets API
- Google Drive API

**3.3 Set up the consent screen.** Go to Google Auth Platform → Get started.

1. Enter an app name and set Audience to **External**.
2. Under Audience, **add your Gmail as a test user**. Without this, sign-in fails with "Access blocked … has not completed verification".
3. In Testing mode the sign-in expires every 7 days. Publishing the app removes that limit.

**3.4 Create the OAuth client.** Go to Clients → Create client.

1. Choose **Web application**.
2. Add the redirect URI `http://localhost:5678/rest/oauth2-credential/callback`.
3. Copy the **Client ID** and **Client secret**.

If a secret leaks, add a new secret, switch n8n to it, then delete the old one. An `invalid_client` error means the wrong secret is in n8n.

## 4. Telegram bot

1. Message @BotFather with `/newbot`, choose a name and a username ending in `bot`, then copy the **token**.
2. Open your bot and press **Start**. A bot can't message you until you do.
3. Get your numeric chat ID from @userinfobot.
4. If the token leaks, send `/revoke` to @BotFather and paste the new token into n8n.

## 5. Tracker sheet and job alerts

**The tracker sheet.** Create a Google Sheet and put these headers in row 1 of Sheet1:

`Job ID | Date Found | Source | Company | Role | Location | Work Mode | Salary | Company Type | Fit Score | Why It Fits | Gaps | Link | Status | Applied On | Follow-up On | Notes`

The long ID in the sheet's URL is your `YOUR_GOOGLE_SHEET_ID`.

**Job alerts.** Turn on daily email alerts in LinkedIn (Jobs → search → Set alert) and Naukri. The workflow reads the last day of emails from linkedin.com, naukri.com, instahyre.com, cutshort.io and wellfound.com.

## 6. Credentials in n8n

All four are created in Overview → Credentials → Create credential.

| Credential type | What to enter |
| --- | --- |
| Google Gemini(PaLM) API | The AI Studio API key |
| Gmail OAuth2 API | Client ID + secret → **Sign in with Google** → Continue past "unverified app" → allow |
| Google Sheets OAuth2 API | The same client ID + secret → Sign in with Google |
| Telegram API | The bot token |

When the Gmail or Sheets nodes fail with an auth error, open the credential and click **Reconnect**.

## 7. The workflows

**7.1 Import the workflows**

1. Create a new workflow, open the ⋯ menu and choose **Import from File**.
2. Import each file in `workflows/`.
3. Then, in every workflow:
   - pick your credentials in each node that uses one;
   - replace `YOUR_GOOGLE_SHEET_ID` and `YOUR_TELEGRAM_CHAT_ID`;
   - set the timezone under ⋯ → Settings;
   - click Execute workflow to test it, then **Publish**.

In n8n 2.x you must publish again after every edit, because scheduled runs use the last published version.

### Workflow 1 – Job Hunter (10 AM and 8 PM)

| # | Node | Type and key settings |
| --- | --- | --- |
| 1 | Every day 10 AM & 8 PM | Schedule Trigger, cron `0 10,20 * * *` |
| 2 | Run manually (test) | Manual Trigger |
| 3 | Gmail - job alert emails | Gmail → Get Many, limit 30, **Simplify off**, search `newer_than:1d -category:promotions (from:linkedin.com OR from:naukri.com OR from:instahyre.com OR from:cutshort.io OR from:wellfound.com)`, Always Output Data, On Error = Continue |
| 4 | Collect jobs | Code, `src/collect-jobs.js`: parses email job links, calls Remotive, RemoteOK, Himalayas, WeWorkRemotely RSS and the Greenhouse/Lever/Ashby APIs (company list in `ATS`) |
| 5 | Skip jobs already seen | Remove Duplicates → Remove Items Processed in Previous Executions, value `{{ 'v4-' + $json.jobId }}`, history 50000 |
| 6 | Filter & build prompt | Code, `src/filter-and-prompt.js`: rules (`RULES`, `ROLE`, `EXCLUDE`, `TARGETS`), ranking, top 40, one Gemini prompt with your `profile` |
| 7 | Gemini - score jobs | Basic LLM Chain, prompt `{{ $json.prompt }}`, Enable Fallback Model, retry 3× |
| 8 | Gemini 3.5 Flash (main) | Google Gemini Chat Model, temperature 0.2, max tokens 16000 |
| 9 | Gemini Flash Lite (backup) | Google Gemini Chat Model on the Fallback input |
| 10 | Pick top jobs | Code, `src/pick-top-jobs.js`: score ≥ 70, best 5, Sheet row + Telegram text |
| 11 | Log to Job Tracker sheet | Google Sheets → Append or Update Row, match on Job ID, each column `{{ $json.row['<column>'] }}` |
| 12 | Send job to Telegram | Telegram → Send Message, text `{{ $('Pick top jobs').item.json.tgText }}`, inline button "Open job posting" → `{{ $('Pick top jobs').item.json.link }}`, Parse Mode HTML |

### Workflow 2 – Apply/Skip handler

| # | Node | Type and key settings |
| --- | --- | --- |
| 1 | Apply or Skip link clicked | Webhook GET, path `job-decision`, respond using a Respond to Webhook node |
| 2 | Work out status | Code, `src/apply-skip-status.js` |
| 3 | Update row in tracker | Google Sheets → Update Row, match on Job ID: Status, Applied On, Follow-up On |
| 4 | Show result page | Respond to Webhook, HTML text (Apply redirects to the job posting), header `Content-Type: text/html` |

The Telegram links point at `http://localhost:5678/webhook/job-decision?...`, so they work on the machine running n8n.

### Workflow 3 – Daily digest (9 PM)

Schedule `0 21 * * *` → Google Sheets Get Row(s) → Code `src/daily-digest.js` → Telegram Send Message (HTML).

## 8. How a run works

1. The trigger fires.
2. Gmail returns the last day's alert emails.
3. Collect builds a list of a few hundred jobs.
4. Already-seen jobs are dropped.
5. The filter removes these:
   - wrong roles and excluded titles;
   - stale posts (job boards older than 7 days, careers pages older than 60);
   - jobs needing 7+ years;
   - overseas jobs without visa sponsorship;
   - jobs below the salary floor, when a salary is stated.
6. Up to 40 jobs go to Gemini in one prompt. Gemini returns JSON with, for each job:
   - a score and a clean title, company and location;
   - product or service company;
   - a salary estimate;
   - why it fits, and the main gap.
7. The best 5 jobs scoring 70 or more are written to the Sheet as Pending and sent to Telegram.
8. Clicking Apply marks the job Applied, sets a follow-up date 7 days later and opens the posting. Skip marks it Skipped.
9. The 9 PM digest summarises the day.

## 9. Customising

| Change | Where |
| --- | --- |
| Salary floors, countries, how many jobs are scored, post age | `RULES` in `filter-and-prompt.js` |
| Roles to keep or drop | `ROLE`, `EXCLUDE` |
| Companies to rank first | `TARGETS` |
| Your profile for Gemini | `profile` |
| Minimum score, jobs per run | `MIN_SCORE`, `MAX_PER_RUN` in `pick-top-jobs.js` |
| Company careers pages | `ATS` in `collect-jobs.js` (slug from `boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>`) |
| Run times | Schedule Trigger cron |
| Local model instead of Gemini fallback | Ollama Chat Model (`ollama pull llama3.1:8b`, base URL `http://localhost:11434`) |

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Access blocked … not completed verification" | Add your Gmail as a test user (Google Auth Platform → Audience) |
| `invalid_client` / "Client authentication failed" | Wrong client secret in n8n; create a new one and update both Google credentials |
| Gmail or Sheets auth error after a week | Reconnect the credential, or publish the OAuth app |
| Telegram `ENETUNREACH` (IPv6 address) | Start n8n with `NODE_OPTIONS="--dns-result-order=ipv4first"` |
| Gemini 404 "no longer available to new users" | Pick a current model from the node's dropdown |
| Gemini "Service unavailable" | The fallback model answers; nothing to do |
| Bot sends nothing | Press Start in your bot; check the chat ID |
| No new jobs | Everything was already seen; change the dedupe prefix only for testing |
| Edits not used by the schedule | Click Publish |
