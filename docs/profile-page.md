# Profile page

Authenticated browser accounts now leave the account flow for `profile.html` after
their learning profile is saved or loaded. Profile/security settings remain at
`account.html?settings`. Navbar links render the account avatar, or its name/email
initial, and link to the profile on pages using the shared site script.

The profile uses the signed-in service allowance: used, remaining, monthly limit,
and percentage remaining. The service supplies the next UTC calendar-month reset;
the UI shows the timestamp in the browser's timezone with a minute countdown. The
circular gauge represents remaining allowance, including empty and exhausted plans.
No weekly/hourly quota or lesson-progress metric is invented.

`GET /v1/browser/academy/library` uses the authenticated actor and existing RLS to
return enrolled and authored releases, capped at 100 per list. Published-course
links open that exact release's Academy preview. Local drafts and progress are not
uploaded by this feature. A library outage leaves usage visible and shows an error
instead of an empty library. Profile photos are read from existing Auth metadata;
this change does not add a photo upload service.

Verification: account/API tests, real PostgreSQL/RLS isolation tests, and browser
journeys on desktop and mobile cover redirects, usage/reset values, photo fallback,
course tabs, empty states, failure recovery, and logout. Provider/browser responses
are mocked in UI tests; database isolation runs in disposable PGlite PostgreSQL.
