// ===== Read Gemini scores, keep the best jobs, build tracker row + Telegram message =====
const MIN_SCORE = 70;      // only send jobs scoring at least this
const MAX_PER_RUN = 5;     // 2 runs a day -> up to 10 jobs a day
const N8N_URL = 'http://localhost:5678';

const raw = String($input.first().json.text || $input.first().json.output || "").replace(/`{3}json|`{3}/g, '').trim();
let scores = [];
try { scores = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)); } catch (e) { throw new Error('Could not read Gemini JSON: ' + raw.slice(0, 300)); }
const jobs = $('Filter & build prompt').first().json.jobs;
const byId = Object.fromEntries(jobs.map(j => [j.jobId, j]));
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = $now.setZone('Asia/Kolkata').toFormat('yyyy-MM-dd');

const best = scores
  .filter(s => byId[s.id] && Number(s.score) >= MIN_SCORE)
  .sort((a, b) => b.score - a.score)
  .slice(0, MAX_PER_RUN);

return best.map(s => {
  const j = byId[s.id];
  const company = s.company || j.company;
  const role = s.role || j.role;
  const type = j.companyType || s.companyType || 'Unknown';
  const base = `${N8N_URL}/webhook/job-decision?id=${encodeURIComponent(j.jobId)}`;
  const text =
`<b>🎯 ${s.score}/100 · ${esc(role)}</b>
🏢 ${esc(company)} (${esc(type)})
📍 ${esc(s.location || j.location || j.zone)} · ${esc(s.workMode || j.workMode || '?')}
💰 ${esc(s.salary || j.salary || 'not stated')}
✅ ${esc(s.why)}
⚠️ ${esc(s.gaps)}
📨 ${esc(j.source)}

<a href="${base}&d=apply&u=${encodeURIComponent(j.link)}">✅ Apply (opens job + marks Applied)</a>
<a href="${base}&d=skip">❌ Skip</a>`;
  return {
    json: {
      row: {
        'Job ID': j.jobId, 'Date Found': today, 'Source': j.source, 'Company': company, 'Role': role,
        'Location': s.location || j.location || j.zone, 'Work Mode': s.workMode || j.workMode || '',
        'Salary': s.salary || j.salary || '', 'Company Type': type, 'Fit Score': s.score,
        'Why It Fits': s.why || '', 'Gaps': s.gaps || '', 'Link': j.link, 'Status': 'Pending',
        'Applied On': '', 'Follow-up On': '', 'Notes': '',
      },
      tgText: text,
      link: j.link,
    },
  };
});
