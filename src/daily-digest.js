// ===== 9 PM daily digest =====
const today = $now.setZone('Asia/Kolkata').toFormat('yyyy-MM-dd');
const rows = $input.all().map(i => i.json).filter(r => r['Job ID']);
const found = rows.filter(r => r['Date Found'] === today);
const applied = rows.filter(r => r['Applied On'] === today);
const skipped = found.filter(r => r['Status'] === 'Skipped');
const pending = rows.filter(r => r['Status'] === 'Pending');
const follow = rows.filter(r => r['Status'] === 'Applied' && r['Follow-up On'] && r['Follow-up On'] <= today);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const line = r => `• ${esc(r['Role'])} – ${esc(r['Company'])} (${r['Fit Score']}) <a href="${esc(r['Link'])}">link</a>`;
let t = `<b>📊 Job digest – ${today}</b>\n\nFound today: <b>${found.length}</b>\nApplied today: <b>${applied.length}</b>\nSkipped today: <b>${skipped.length}</b>\nStill pending (all days): <b>${pending.length}</b>`;
if (applied.length) t += `\n\n<b>Applied today</b>\n` + applied.map(line).join('\n');
if (pending.length) t += `\n\n<b>Pending – decide on these</b>\n` + pending.slice(0, 10).map(line).join('\n');
if (follow.length) t += `\n\n<b>⏰ Follow-ups due</b> (applied 7+ days ago)\n` + follow.slice(0, 10).map(line).join('\n');
t += `\n\n<a href="https://docs.google.com/spreadsheets/d/YOUR_GOOGLE_SHEET_ID">Open tracker</a>`;
return [{ json: { text: t } }];
