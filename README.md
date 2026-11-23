# DC Department Site Follow-Up (متابعة المواقع — إدارة مراقبة الوثائق)

An Arabic (RTL) React + Vite + TypeScript + Firebase web application for construction Document Control (DC) teams to manage daily site reports, engineering submittals, executed works, site deliverables, tasks, issues, Excel logs, personal notes, and system activity audits.

## Prerequisites

- Node.js 20+
- A Firebase project with **Authentication (Email/Password)** and **Cloud Firestore** enabled
- Firebase CLI (`npm i -g firebase-tools`) for deploying Firestore rules and composite indexes

## Setup & Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (optional `.env.local`):
   ```env
   # Optional public URL shown in the Share modal (falls back to window.location.origin)
   VITE_APP_URL=https://your-production-domain.example.com
   ```

3. Start the development server (runs on port `3000`):
   ```bash
   npm run dev
   ```

4. Type-check and build for production:
   ```bash
   npm run lint
   npm run build
   ```

## Firebase Configuration

1. Ensure `firebase-applet-config.json` at the project root points to your Firebase Web App credentials and `firestoreDatabaseId`.
2. In the **Firebase Console -> Authentication -> Sign-in method**, enable **Email/Password**.
3. Create the primary Super Admin user (`elmassacloud@gmail.com`) in Firebase Auth and make sure its email is **verified** (`emailVerified: true`), as `firestore.rules` enforces `request.auth.token.email_verified == true` for super admin privileges.
4. Create additional site/admin users from the in-app **إدارة المستخدمين** panel (Admin only).

## Deploying Firestore Rules & Indexes

Whenever `firestore.rules` or `firestore.indexes.json` changes, deploy them to your Firebase project:

```bash
# Deploy security rules
firebase deploy --only firestore:rules

# Deploy composite indexes required by bounded realtime & pagination queries
firebase deploy --only firestore:indexes

# Or deploy both together
firebase deploy --only firestore
```

> **Note:** If you use a named Firestore database (configured via `firestoreDatabaseId` in `firebase-applet-config.json`), make sure your `firebase.json` specifies the target database ID under `firestore.database`.
