import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDirectory = path.resolve("supabase/templates");
const checkOnly = process.argv.includes("--check");

const templates = {
  confirmation: {
    subject: "Confirm your A Deafening Noise account",
    preheader: "Confirm your email address to finish creating your concert archive.",
    label: "Welcome",
    title: "Confirm your account",
    body: "Confirm your email address to finish creating your private concert archive.",
    action: "Confirm email",
    href: "{{ .ConfirmationURL }}",
    note: "If you did not create this account, you can safely ignore this email.",
  },
  recovery: {
    subject: "Reset your A Deafening Noise password",
    preheader: "Use this secure link to choose a new password.",
    label: "Account recovery",
    title: "Reset your password",
    body: "We received a request to reset your password. Use the secure link below to choose a new one.",
    action: "Reset password",
    href: "{{ .ConfirmationURL }}",
    note: "If you did not request this, ignore this email. Your password will not change.",
  },
  invite: {
    subject: "You are invited to A Deafening Noise",
    preheader: "Accept your invitation and start building your concert archive.",
    label: "Invitation",
    title: "Your archive is waiting",
    body: "You have been invited to A Deafening Noise. Accept the invitation to create your account.",
    action: "Accept invitation",
    href: "{{ .ConfirmationURL }}",
    note: "If you were not expecting this invitation, you can safely ignore it.",
  },
  magic_link: {
    subject: "Your A Deafening Noise sign-in link",
    preheader: "Use this secure one-time link to sign in.",
    label: "Secure sign in",
    title: "Sign in to your archive",
    body: "Use the secure link below to sign in. It can only be used once and expires shortly.",
    action: "Sign in",
    href: "{{ .ConfirmationURL }}",
    note: "If you did not request this link, you can safely ignore this email.",
  },
  email_change: {
    subject: "Confirm your new email address",
    preheader: "Confirm the new email address for your A Deafening Noise account.",
    label: "Account security",
    title: "Confirm your new email",
    body: "Confirm {{ .NewEmail }} as the new email address for your account.",
    action: "Confirm new email",
    href: "{{ .ConfirmationURL }}",
    note: "If you did not request this change, do not use this link.",
  },
  reauthentication: {
    subject: "{{ .Token }} is your verification code",
    preheader: "Verify your identity before changing sensitive account details.",
    label: "Account security",
    title: "Verify it is you",
    body: "Enter this one-time code in A Deafening Noise to continue. It expires shortly.",
    code: "{{ .Token }}",
    note: "Never share this code. If you did not request it, you can safely ignore this email.",
  },
  password_changed: {
    subject: "Your password was changed",
    preheader: "The password for your A Deafening Noise account has changed.",
    label: "Security notice",
    title: "Password changed",
    body: "The password for your A Deafening Noise account was changed successfully.",
    note: "If this was not you, reset your password from the sign-in screen immediately.",
  },
  email_changed: {
    subject: "Your email address was changed",
    preheader: "The email address for your A Deafening Noise account has changed.",
    label: "Security notice",
    title: "Email address changed",
    body: "Your account email was changed from {{ .OldEmail }} to {{ .Email }}.",
    note: "If this was not you, contact the administrator immediately.",
  },
};

function render({ preheader, label, title, body, action, href, code, note }) {
  const primary = action
    ? `<tr><td style="padding:4px 0 24px"><a href="${href}" style="display:inline-block;border-radius:8px;background:#2563eb;color:#ffffff;padding:14px 22px;font-size:13px;font-weight:800;line-height:1;text-decoration:none;text-transform:uppercase">${action}</a></td></tr>`
    : code
      ? `<tr><td style="padding:4px 0 24px"><div style="display:inline-block;border:1px solid #30343a;border-radius:8px;background:#111418;color:#f4f4f5;padding:14px 20px;font-size:28px;font-weight:900;letter-spacing:6px">${code}</div></td></tr>`
      : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 2px 22px;color:#f4f4f5;font-size:18px;font-weight:900;letter-spacing:.3px;text-transform:uppercase">A Deafening Noise</td></tr>
        <tr><td style="border:1px solid #30343a;border-radius:8px;background:#15191e;padding:30px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 0 10px;color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">${label}</td></tr>
            <tr><td style="padding:0 0 12px;color:#f4f4f5;font-size:30px;font-weight:900;line-height:1.08;text-transform:uppercase">${title}</td></tr>
            <tr><td style="padding:0 0 22px;color:#a1a1aa;font-size:14px;line-height:1.65">${body}</td></tr>
${primary}
            <tr><td style="border-top:1px solid #30343a;padding:18px 0 0;color:#71717a;font-size:12px;line-height:1.6">${note}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 8px 0;color:#71717a;font-size:11px;line-height:1.6;text-align:center">Private concert archive · adeafeningnoise.com</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}

await mkdir(outputDirectory, { recursive: true });
let stale = false;
for (const [name, template] of Object.entries(templates)) {
  const file = path.join(outputDirectory, `${name}.html`);
  const html = render(template);
  if (checkOnly) {
    const current = await readFile(file, "utf8").catch(() => "");
    if (current !== html) {
      console.error(`${path.relative(process.cwd(), file)} is missing or out of date`);
      stale = true;
    }
  } else {
    await writeFile(file, html);
  }
}

if (stale) process.exitCode = 1;
else console.log(`${Object.keys(templates).length} authentication email templates ${checkOnly ? "verified" : "generated"}`);
