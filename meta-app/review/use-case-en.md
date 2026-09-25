# App Review — use case text (English)

Paste each block into the matching permission/feature in *App Review → Permissions and Features*. Replace `TU-WEB` with your domain.

## App description (all requests)
Turistero is a web app that helps people find tours, trips and events published by local tour operators and venues. Each user builds a personal list of public pages they already follow (for example a tour operator's Facebook Page or Instagram professional account). Turistero reads only the public event announcements of the pages on that list, extracts date, place and price, and shows them in one agenda that always links back to the original post. Turistero never posts, messages, or reads private content. It does not scrape Facebook or Instagram; it uses only official Meta APIs, at most once per source per day.

## Facebook Login — `public_profile`, `email`
We use Facebook Login only to identify the user and create their Turistero account. `public_profile` provides name and picture shown in the account menu. `email` is used as the account contact/identifier and is never shared with third parties. Users can also sign in with other providers; Facebook is optional.

## `pages_show_list`
Used after the user connects a Facebook account so they can pick which of *their own* Pages (or, for Instagram, which linked professional account) to use as the connection for reading public posts. We display the list of Pages the user manages and store only the ID the user selects.

## `instagram_basic`
Used to read the ID of the user's own Instagram professional account linked to their Page. That ID is required as the caller in the Business Discovery endpoint (`/{ig-user-id}?fields=business_discovery.username(...)`), which we use to read **public media (caption, permalink, timestamp, image) of other Instagram professional accounts (tour operators)** that the user explicitly added to their list.

## `pages_read_engagement`
Used to read public post content of Pages the user manages or has added to their personal list, only to detect event announcements (title, date, place, price). We display the extracted event and link to the original post.

## Feature: Page Public Content Access
Our core function is to show, in one agenda, the public event announcements from Facebook Pages of tour operators that each user adds to their own list. We need to read public posts (message, permalink, created time, picture) of Pages we do not own. We only request the Pages the user added, at most once per day per Page, we always attribute and link to the original post, we store no data about people who interact with those posts, and we do not use the data for advertising, profiling or resale.

## Data handling
- Access tokens are stored encrypted (AES-256-GCM) and deleted when the user deauthorizes the app or requests deletion.
- Data Deletion Request Callback: `https://TU-API/api/meta/data-deletion`. Deauthorize callback: `https://TU-API/api/meta/deauthorize`.
- Privacy policy: `https://TU-WEB/privacy`. Terms: `https://TU-WEB/terms`. Deletion instructions/status: `https://TU-WEB/data-deletion`.

## Test instructions for the reviewer
1. Open `https://TU-WEB/login` and choose *Continue with Meta (Facebook)*.
2. Go to *Mis fuentes* (My sources) and add a public Facebook Page or Instagram professional account URL.
3. The app shows the read status and the extracted events; each event links to the original post.
4. Test credentials (a test user we created): `REVIEWER_EMAIL` / `REVIEWER_PASSWORD` (email + password login is available).
