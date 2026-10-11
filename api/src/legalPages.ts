// ---------------------------------------------------------------------------
// legalPages — public, static Support / Privacy / Terms pages. The App Store
// listing links to these, so they must stay reachable without auth and are
// mounted before the OpenAPI validator.
// ---------------------------------------------------------------------------

import express from "express";

export const SUPPORT_EMAIL = "tunatiff007@gmail.com";
const LAST_UPDATED = "October 11, 2026";
const HTML_CACHE_CONTROL = "public, max-age=3600";

export type LegalPage = { path: string; title: string; body: string };

const mail = `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;

export const SUPPORT_PAGE: LegalPage = {
    path: "/support",
    title: "Support",
    body: `
<p>YellowBook is a private notebook for the people you care about and the plans you want to make with them. We're glad you're here.</p>

<h2>Get help</h2>
<p>Email ${mail} with a short description of what happened and, if you can, a screenshot. We read every message and usually reply within two business days.</p>

<h2>Common questions</h2>
<h3>Is YellowBook social media?</h3>
<p>No. There are no feeds, followers, likes or public profiles. The people and notes you add are visible only to you.</p>

<h3>Do my friends need the app?</h3>
<p>No. YellowBook works on its own as a private notebook. If a friend does use YellowBook, you can connect and share specific plans with them—only when you choose to.</p>

<h3>How do I turn off notifications?</h3>
<p>Open the iOS Settings app, tap Notifications, choose YellowBook and switch off Allow Notifications.</p>

<h3>How do I delete my account?</h3>
<p>In the app, tap your profile, tap the settings icon in the top-right corner, then tap <strong>Delete Account</strong>. Your profile, people, plans, notes and connections are permanently removed. You can also email ${mail} and we'll delete it for you.</p>

<p><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
`,
};

export const PRIVACY_PAGE: LegalPage = {
    path: "/privacy",
    title: "Privacy Policy",
    body: `
<p class="muted">Last updated ${LAST_UPDATED}</p>
<p>YellowBook is built to be private by default. We collect only what we need to make the app work for you, we never sell your data, and we don't use advertising or third-party analytics.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account details.</strong> When you sign in, our sign-in provider (Auth0) gives us a unique account identifier. You may also add a display name, birthday and profile photo.</li>
  <li><strong>What you write in the app.</strong> The people you add (names, pronouns, neighborhoods, birthdays, notes) and the plans you create (titles, dates, places, notes and participants).</li>
  <li><strong>Connections and sharing.</strong> If you connect with another YellowBook user or share a plan, we store that connection and which plans you shared.</li>
  <li><strong>Push notification token.</strong> If you allow notifications, we store your device's push token so we can tell you when a connection shares a plan with you.</li>
</ul>
<p>We do not access your contacts, location, messages or photo library beyond a photo you explicitly choose for your profile.</p>

<h2>How we use it</h2>
<p>Only to provide YellowBook's features: showing you your people and plans, syncing them across your devices, sharing plans you choose to share, and sending notifications you've allowed. We don't track you across other apps or websites.</p>

<h2>Who can see it</h2>
<p>Your people and notes are visible only to you. A plan is visible to someone else only if you share it with them or invite them to it. Connected users can see your display name and profile photo.</p>

<h2>Service providers</h2>
<p>We rely on a small number of providers to run YellowBook: Auth0 (sign-in), Railway (app servers and database), Cloudflare R2 (profile photo storage) and Expo / Apple Push Notification service (notifications). They process data only on our behalf.</p>

<h2>Keeping and deleting your data</h2>
<p>We keep your data while your account exists. You can delete your account at any time from the app (Profile → Settings → Delete Account). This permanently removes your profile, people, plans, notes, connections and push tokens from our systems. You can also request deletion or a copy of your data by emailing ${mail}.</p>

<h2>Children</h2>
<p>YellowBook is not directed to children under 13, and we don't knowingly collect their personal information.</p>

<h2>Changes</h2>
<p>If we change this policy, we'll update the date above and, for meaningful changes, let you know in the app.</p>

<h2>Contact</h2>
<p>Questions about privacy? Email ${mail}.</p>
`,
};

export const TERMS_PAGE: LegalPage = {
    path: "/terms",
    title: "Terms of Service",
    body: `
<p class="muted">Last updated ${LAST_UPDATED}</p>
<p>By using YellowBook you agree to these terms. If you don't agree, please don't use the app.</p>

<h2>Your account</h2>
<p>You're responsible for activity on your account and for keeping your sign-in secure. You can delete your account at any time from within the app.</p>

<h2>Your content</h2>
<p>You own what you write in YellowBook. You give us permission to store and process it only to operate the app for you, including showing shared plans to the people you share them with.</p>

<h2>Acceptable use</h2>
<p>Don't use YellowBook to harass anyone, to break the law, or to interfere with the service or other people's use of it. We may suspend accounts that do.</p>

<h2>No warranty</h2>
<p>YellowBook is provided "as is". We work hard to keep it reliable, but we can't promise it will always be available or error-free, and to the extent permitted by law we aren't liable for indirect or consequential losses.</p>

<h2>Changes</h2>
<p>We may update these terms; when we do, we'll change the date above. Continuing to use YellowBook means you accept the updated terms.</p>

<h2>Contact</h2>
<p>Email ${mail}.</p>

<p><a href="/privacy">Privacy Policy</a> · <a href="/support">Support</a></p>
`,
};

export function renderLegalPage(page: LegalPage): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${page.title} · YellowBook</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    background: #FBF8F3;
    color: #2A2420;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 680px; margin: 0 auto; padding: 48px 20px 64px; }
  .brand { font-weight: 700; color: #B8860B; letter-spacing: 0.02em; text-decoration: none; }
  h1 { font-size: 32px; margin: 12px 0 16px; }
  h2 { font-size: 20px; margin: 32px 0 8px; }
  h3 { font-size: 17px; margin: 20px 0 4px; }
  p, li { font-size: 16px; color: #3D342E; }
  .muted { color: #8A7D72; font-size: 14px; }
  a { color: #8A5A00; }
</style>
</head>
<body>
  <main>
    <a class="brand" href="/support">YellowBook</a>
    <h1>${page.title}</h1>
    ${page.body}
  </main>
</body>
</html>`;
}

export function makeLegalPagesRouter(): express.Router {
    const router = express.Router();
    for (const page of [SUPPORT_PAGE, PRIVACY_PAGE, TERMS_PAGE]) {
        const html = renderLegalPage(page);
        router.get(page.path, (_req, res) => {
            res.type("html").set("Cache-Control", HTML_CACHE_CONTROL).send(html);
        });
    }
    return router;
}
