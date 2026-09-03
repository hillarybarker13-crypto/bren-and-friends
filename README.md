# Work Hub — Final Phone-First Build

A focused work-assignment app. No episode system, no video watching, and no video uploads.

## What is included
- Personal PIN login with remembered device session
- Live Firestore syncing across devices
- Phone-first layout with bottom navigation + hidden drawer
- Clean Home screen with only urgent/next-up information
- My Work with search and filters
- Starred, open, due-soon, overdue, and completed views
- Separate Deadlines screen
- Separate Projects screen
- Separate Updates screen
- Assignment detail pages
- Status workflow: Not Started / In Progress / Blocked / Completed
- Priority levels: Low / Medium / High / Urgent
- Checklists
- Notes/conversation on every assignment
- Reference links
- Categories + project grouping
- Activity/history log
- Admin assignment creator
- Auto-saved assignment drafts on the admin device
- Admin assignment editing and reassignment
- Admin duplicate assignment
- Admin archive + delete controls
- Team progress screen
- Completion percentages and overdue counts
- Firebase connection status
- Responsive desktop fallback
- Vercel-ready configuration

## Firebase
This build is configured for the existing `bren-and-friends` Firebase web project and stores Work Hub data in the separate Firestore collection:

`workHubAssignments`

The app itself cannot change Firebase Console rules. Your Firestore rules must allow this collection to be read/written for live sync to work.

## Important security note
The current PIN system is a lightweight app gate for a private/family/team project. The PIN list is present in the client code, so it is not appropriate for confidential, regulated, financial, medical, or other sensitive work. For stronger security, use Firebase Authentication and user-based Firestore rules.

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Deploy on Vercel
1. Unzip this project.
2. Upload the project files to a GitHub repository.
3. Import that repository into Vercel.
4. Framework preset: **Vite**.
5. Build command: **npm run build**.
6. Output directory: **dist**.
7. Deploy.

No Vercel environment variables are required for this build because the Firebase web configuration is already in `src/firebase.ts`.
