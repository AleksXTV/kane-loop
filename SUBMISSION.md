# Kane CLI Online Hackathon: ответы для формы

**Кратко по-русски (для Александра).** Проект kane-loop: обёртка вокруг Kane CLI, которая сопоставляет git diff с
сохранёнными Kane-флоу (`_test.md`), прогоняет нужные флоу в headless Chrome (повторы бесплатны) и при падении
пишет `.kane/last-failure.md`: шаг, ожидаемое и увиденное значение, triage от Kane, кусок diff'а, скриншот и evidence pack.
Есть MCP-сервер (verify_changed, verify_flow, last_failure, rerun_failed, list_flows), режим watch, pre-commit hook и
демо-приложение Splitly. Всё проверено на реальном Kane: регрессия поймана (сессия `d6599835-…`: ожидалось $33.00,
на странице $39.00), исправлена, повтор зелёный (`143977c5-…`). Видео 2:04, израсходовано около 165 кредитов из 1200.
Что нужно от тебя: создать публичный репозиторий на GitHub, указать свои name/email в git и запушить; залить
`demo/kane-loop-demo.mp4` на YouTube как Unlisted; вставить ссылки вместо `<REPO_URL>` и `<VIDEO_URL>` в README и сюда;
впиши, каким агентом пользовался (вопросы 7 и 10); отправь форму до **20.11 01:29 по Бангкоку** (19.11, 23:59 IST).

Form: https://www.surveymonkey.com/r/kane-cli-hackathon-submission

---

**1. Solo or team?** Solo

**2. Signed up on TestMu AI and claimed the free credits before building?** Yes

**3. Name:** Aleksandr Kulikov

**4. Email:** `<YOUR_EMAIL>`

**5. GitHub repository:** `<REPO_URL>`

**6. Demo video (YouTube unlisted):** `<VIDEO_URL>`

**7. One-paragraph description:**

kane-loop is a verification loop between a coding agent and Kane CLI, for developers who let agents
change their web apps. When code changes, kane-loop maps the git diff to the saved Kane `_test.md`
flows that cover the changed files and replays only those with `kane-cli testmd run --agent
--headless`, which takes about 7 seconds per flow and costs 0 credits. When a flow fails, it parses
Kane's NDJSON and recordings into `.kane/last-failure.md`: the failing step, the value Kane expected
next to the value it saw, Kane's own triage, the diff hunk that triggered the run, and the screenshot
and evidence pack. The agent reads that file through an MCP server (`verify_changed`,
`last_failure`, `rerun_failed`, `verify_flow`), fixes the app, and re-runs until Kane is green. The
same loop also runs from the CLI, as a watcher on save, and as a pre-commit hook. I built it with
`<AGENT>`, together with a demo split-the-bill app, Splitly. In the demo, Kane caught a real
regression that the unit tests missed (expected $33.00 per person, the page showed $39.00, Kane
session d6599835), the agent fixed it from the report, and the replay went green (session 143977c5).

**8. Live URL or install command:**

```bash
git clone <REPO_URL> kane-loop && cd kane-loop && npm run app   # app on http://localhost:4173
npm i -g @testmuai/kane-cli && npm run verify:all              # Kane replays the 3 flows headless
```

**9. Lane:** Verification baked into your workflow (it also fits "Apps that verify themselves")

**10. Coding agents used:** `<AGENT>` (tick it; the MCP server is agent-agnostic, with configs for Cursor and Claude Code in the repo)
