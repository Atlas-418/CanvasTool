# CanvasTool
A simple webpage thing to display data about the user's canvas account, including assignments, assignment status, classes, courses, grades, and more.

Working on styling for now, sent an email asking for API help because I only half know what I'm doing with that. 

## How it works

Canvas's API doesn't send CORS headers, so a browser can't call it directly from a page hosted elsewhere. This repo is split in two pieces to work around that:

- **Static site** (`index.html`, `app.js`) — hosted on GitHub Pages. You enter your Canvas domain and a Personal Access Token (PAT) once; both are saved only in your own browser's `localStorage` and never sent anywhere except the proxy below.
- **`worker/`** — a tiny Cloudflare Worker that does nothing but forward your request to your Canvas instance and add the missing CORS header back onto the response. It never stores or logs your token or domain, and only forwards to `*.instructure.com` hosts.

Each person who uses the hosted page brings their own domain + token, so no shared backend or database is needed.

## Setup

1. **Get a Canvas Personal Access Token**: in Canvas, go to Account → Settings → scroll to "Approved Integrations" → "New Access Token".
2. **Deploy the worker** (one-time, needs a free Cloudflare account):
   ```
   cd worker
   npx wrangler deploy
   ```
   Copy the resulting `*.workers.dev` URL.
3. **Point the site at your worker**: open `app.js` and set `PROXY_URL` to the URL from step 2.
   - Alternatively, the link already used in the repo will work. You only really need to do steps 2 & 3 if you need to change the worker.
4. **Enable GitHub Pages**: repo Settings → Pages → deploy from `main` / root.
5. Visit the page, open Settings, enter your Canvas domain (e.g. `district.instructure.com`) and the token from step 1.

## To do

- [x] Get courses / grades
- [ ] Get live class times 
- [ ] Make it look nice
  - [ ] courses
    - [ ] assignments
    - [x] the courses themselves
  - [ ] assignments
  - [ ] settings
    - [ ] themes
- [ ] onboarding page?
- [ ] link assignments to the corresponding page in canvas
- [ ] Proper OAuth (needs a district Canvas admin to create a Developer Key — no self-service path exists)
  - For now: each user generates their own PAT manually. This sits outside Canvas's stated preference (their policy asks devs not to have users hand over manually-generated tokens) — not pretending otherwise, just accepted as the realistic option without admin access
  - Revisit if a district admin is ever willing to set one up

## Resources

[Canvas developer docs](https://developerdocs.instructure.com/services/canvas)