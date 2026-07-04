# API client modules

HTTP wrappers around backend routes. All modules use `client.js` for auth headers and base URL.

```
api/
  client.js          Shared fetch helper (request, API_BASE_URL)
  index.js           Barrel re-export (also exposed via services/api.js)
  admin/             SuperAdmin — admin/admin.js → adminAPI
  common/            Cross-role — notifications.js, profile.js
  expert/            Subject Expert — questions.js → questionAPI
  org/               OrgAdmin & org auth — auth, dashboard, tests, students, …
  public/            Unauthenticated — contact.js
  reviewer/          Reviewer — reviewers.js → reviewerAPI
  student/           Student portal — auth.js, dashboard.js
```

Prefer importing from `services/api.js` in app code. Direct paths (e.g. `api/public/contact`) are fine for isolated public endpoints.
