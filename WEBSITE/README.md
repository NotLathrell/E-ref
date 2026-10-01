# E-REF Super Admin console

A web console for **Super Admins**. It uses the same server, accounts and data as the mobile
app, and the same look (the app's cream, espresso-brown and terracotta palette, with the
app's own dark-mode colours).

| Page | What a Super Admin can do |
| --- | --- |
| **Overview** | Accounts per tier, datasets, activity over the last 14 days, most-stocked foods, latest events |
| **User Accounts** | See every account in all tiers (Super Admin, Admin, Employee); create accounts; change name, email or tier; set a new password; disable / enable; delete |
| **Food Categories** | Add, describe, recolour, rename and remove categories. The four built-in ones (Produce, Dairy, Meat, Pantry) can be described but not renamed or removed, because the app's bundled foods use them |
| **Recipe Dataset** | Add, edit and remove the recipes the content-based recommender ranks: required and optional ingredients, tags, time and summary |
| **Activity Logs** | Every sign-in (including failed ones), password change, account change, inventory change and dataset edit, with filters, paging and CSV export |

## Running it

The API serves the console, so there is nothing to build or install:

```bash
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

Then open **http://localhost:8000/web/** (or `http://<PC's LAN IP>:8000/web/` from another
computer). Opening `index.html` from any other static server also works: set the server
address under **Server** on the sign-in screen.

## Who can sign in

Only **Super Admin** accounts. The first account ever created on a server is the Super Admin.
On a database from before the three tiers existed, the oldest administrator (or the oldest
account, if there were none) became the Super Admin, other administrators stay **Admins**,
and everyone else became an **Employee**. Admins and Employees who try to sign in are told
to use the app instead.

A Super Admin cannot change their own tier, disable or delete themselves, so the console is
never left without someone who can sign in. Make a second Super Admin first if the role
needs to move to someone else.

## How changes reach the phones

- **Categories** are served with the food database (`GET /foods`). Adding one gives every
  phone a new Shelf tab and a new choice when adding food on its next refresh.
- **Recipes** are served at `GET /recipes`. The app replaces its bundled recipes with the
  server's dataset, keeps a copy for offline use, and rebuilds the recommender's index.
- **Disabled accounts** are signed out on their next request and cannot sign in again until
  they are enabled.

The server first loads its recipe dataset from `backend/seed/recipes.json`, which is written
from the app's bundled recipes by `node mobile/scripts/export-seed.js`. `npm test` checks
that the seed files are up to date.

## Files

```
index.html          page shell
css/styles.css      theme tokens (light and dark) and components
js/api.js           API client: session, server address, errors
js/ui.js            templating, icons, dialogs, toasts, formatters
js/app.js           sign-in, navigation, routing, appearance
js/views/*.js       one module per page
img/                logo and favicon, copied from mobile/assets
```

The API endpoints are in `backend/superadmin.py`; their tests are
`backend/tests/test_superadmin.py` (`TC-F-SUP-01…15`).
