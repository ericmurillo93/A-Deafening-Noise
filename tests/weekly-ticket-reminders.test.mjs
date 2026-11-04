import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { renderWeeklyTicketReminder, isReminderTime } from "../scripts/weekly-ticket-reminder-template.mjs";

test("weekly ticket reminder contains the whole list, localized copy and safe links", () => {
  const concerts = [{ artist: "ONE <BAND>", date: "01/01/2030", venue: "VENUE", city: "Madrid", country: "ES", ticketUrl: "https://example.invalid/tickets" }, { artist: "SECOND BAND", date: "02/02/2030", ticketUrl: "javascript:alert(1)" }];
  for (const language of ["en", "es"]) {
    const email = renderWeeklyTicketReminder("Eric <Admin>", concerts, language);
    assert.match(email.html, /ONE &lt;BAND&gt;/);
    assert.match(email.html, /SECOND BAND/);
    assert.match(email.html, /Eric &lt;Admin&gt;/);
    assert.match(email.html, /https:\/\/adeafeningnoise.com\/calendar/);
    assert.doesNotMatch(email.html + email.text, /javascript:/);
    assert.match(email.html, language === "es" ? /España/ : /Spain/);
    assert.match(email.subject, language === "es" ? /pendientes de comprar/ : /tickets still to buy/);
  }
});

test("weekly schedule follows Madrid time across daylight-saving changes", () => {
  assert.equal(isReminderTime(new Date("2027-01-04T06:00:00Z")), false);
  assert.equal(isReminderTime(new Date("2027-01-04T07:00:00Z")), true);
  assert.equal(isReminderTime(new Date("2027-07-05T06:00:00Z")), true);
  assert.equal(isReminderTime(new Date("2027-07-06T06:00:00Z")), false);
});

test("reminder dry runs never claim deliveries or contact the email provider", () => {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    process.argv.push('--dry-run');
    process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
    globalThis.fetch=async(url)=>{
      assert.equal(url,'https://example.invalid/rest/v1/rpc/get_weekly_ticket_reminder_recipients');
      return {ok:true,text:async()=>JSON.stringify([{userId:'example',displayName:'Example',language:'en',concerts:[{artist:'EXAMPLE BAND',date:'01/01/2030'}]}])};
    };
    await import(${JSON.stringify(new URL("../scripts/send-weekly-ticket-reminders.mjs", import.meta.url).href)});
  `], { encoding: "utf8" });
  assert.match(output, /1 eligible recipients; no emails sent or claims written/);
});
