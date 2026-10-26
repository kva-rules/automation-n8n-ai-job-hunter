// ===== Collect jobs: job-alert emails + remote job boards + company career pages =====
// Edit the lists below to change companies / sources.
const ATS = [
  // [system, slug, company name, product/service]
  ['lever', 'zeta', 'Zeta', 'Product'], ['greenhouse', 'devrev', 'DevRev', 'Product'],
  ['lever', 'cred', 'CRED', 'Product'], ['greenhouse', 'groww', 'Groww', 'Product'],
  ['lever', 'meesho', 'Meesho', 'Product'], ['lever', 'hevodata', 'Hevo Data', 'Product'],
  ['ashby', 'sarvam', 'Sarvam AI', 'Product'],
  ['greenhouse', 'stripe', 'Stripe', 'Product'], ['greenhouse', 'databricks', 'Databricks', 'Product'],
  ['greenhouse', 'gitlab', 'GitLab', 'Product'], ['greenhouse', 'cloudflare', 'Cloudflare', 'Product'],
  ['greenhouse', 'okta', 'Okta', 'Product'], ['greenhouse', 'intercom', 'Intercom', 'Product'],
  ['greenhouse', 'wise', 'Wise', 'Product'], ['greenhouse', 'n26', 'N26', 'Product'],
  ['greenhouse', 'adyen', 'Adyen', 'Product'], ['greenhouse', 'gocardless', 'GoCardless', 'Product'],
  ['greenhouse', 'agoda', 'Agoda', 'Product'], ['greenhouse', 'vercel', 'Vercel', 'Product'],
  ['ashby', 'n8n', 'n8n', 'Product'], ['ashby', 'miro', 'Miro', 'Product'],
  ['ashby', 'supabase', 'Supabase', 'Product'], ['ashby', 'posthog', 'PostHog', 'Product'],
  ['ashby', 'linear', 'Linear', 'Product'], ['ashby', 'replit', 'Replit', 'Product'],
  ['ashby', 'perplexity', 'Perplexity', 'Product'], ['ashby', 'cohere', 'Cohere', 'Product'],
  ['ashby', 'zapier', 'Zapier', 'Product'],
];
const ROLE = /(front[\s-]?end|frontend|react|full[\s-]?stack|fullstack|mern|node\.?js|javascript|typescript|next\.?js|\bui\b|\bai\b|artificial intelligence|machine learning|\bml\b|llm|gen ?ai|generative|agentic|software (engineer|developer)|\bsde\b|product engineer|application developer|java\b)/i;

const H = { 'User-Agent': 'Mozilla/5.0 (personal job alert bot)' };
const get = (url, json = true) => this.helpers.httpRequest({ url, json, timeout: 20000, headers: H }).catch(() => null);
const decode = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = s => decode(decode(s)).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const hash = s => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };
const jobs = [];
const stats = {};
const add = (j) => {
  if (!j.link || !j.role) return;
  stats[j.source] = (stats[j.source] || 0) + 1;
  jobs.push({ company: '', location: '', workMode: '', salary: '', companyType: '', posted: '', ...j, description: strip(j.description).slice(0, 1800) });
};

// ---------- 1. Job alert emails (Gmail node output) ----------
for (const item of $input.all()) {
  const m = item.json || {};
  const html = m.html || m.textAsHtml || '';
  if (!html) continue;
  const from = JSON.stringify(m.from || '').toLowerCase();
  const src = from.includes('linkedin') ? 'LinkedIn alert' : from.includes('naukri') ? 'Naukri alert' : from.includes('instahyre') ? 'Instahyre alert' : from.includes('cutshort') ? 'Cutshort alert' : from.includes('wellfound') ? 'Wellfound alert' : 'Email alert';
  const map = {};
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let a;
  while ((a = re.exec(html))) {
    const href = decode(a[1]);
    let id, link, mm;
    if ((mm = href.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/))) { id = 'li-' + mm[1]; link = 'https://www.linkedin.com/jobs/view/' + mm[1] + '/'; }
    else if ((mm = href.match(/naukri\.com\/(?:jd\/)?(job-listings-[a-z0-9-]+?-(\d{9,14}))(?=[?#]|$)/i))) { id = 'nk-' + mm[2]; link = 'https://www.naukri.com/' + mm[1]; }
    else if ((mm = href.match(/instahyre\.com\/job-(\d+)[^?#]*/))) { id = 'ih-' + mm[1]; link = 'https://www.' + mm[0].replace(/^.*?instahyre/, 'instahyre'); }
    else if ((mm = href.match(/cutshort\.io\/job\/[^?#]+/))) { link = 'https://' + mm[0]; id = 'cs-' + hash(mm[0]); }
    else if ((mm = href.match(/wellfound\.com\/jobs\/(\d+[^?#]*)/))) { link = 'https://wellfound.com/jobs/' + mm[1]; id = 'wf-' + mm[1].split('-')[0]; }
    else continue;
    const t = strip(a[2]);
    map[id] = map[id] || { id, link, texts: [] };
    if (t && !map[id].texts.includes(t)) map[id].texts.push(t);
  }
  for (const v of Object.values(map)) {
    let ctx = v.texts.join(' | ');
    let exp = '';
    const nm = v.link.match(/job-listings-(.+)-(\d+)-to-(\d+)-years-\d+$/);
    if (nm) { ctx = nm[1].replace(/-/g, ' ') + ' | ' + ctx; exp = nm[2] + '-' + nm[3] + ' yrs'; }
    if (!ctx.trim()) continue;
    add({ jobId: v.id, source: src, role: ctx.slice(0, 160), fromEmail: true, experience: exp, description: 'Job alert email text: ' + ctx + (exp ? ' | Experience: ' + exp : ''), link: v.link, posted: m.date || '' });
  }
}

// ---------- 2. Remote job boards ----------
const [rem, rok, him, wwr1, wwr2] = await Promise.all([
  get('https://remotive.com/api/remote-jobs?category=software-dev&limit=150'),
  get('https://remoteok.com/api'),
  get('https://himalayas.app/jobs/api?limit=100'),
  get('https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss', false),
  get('https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss', false),
]);
for (const j of (rem && rem.jobs) || []) add({ jobId: 'rm-' + j.id, source: 'Remotive', role: j.title, company: j.company_name, location: j.candidate_required_location || 'Remote', workMode: 'Remote', salary: j.salary || '', description: (j.tags || []).join(', ') + ' ' + j.description, link: j.url, posted: j.publication_date });
for (const j of (Array.isArray(rok) ? rok : []).filter(x => x.id && x.position)) add({ jobId: 'ro-' + j.id, source: 'RemoteOK', role: j.position, company: j.company, location: j.location || 'Remote', workMode: 'Remote', salary: j.salary_min ? `USD ${j.salary_min}-${j.salary_max} per year` : '', description: (j.tags || []).join(', ') + ' ' + j.description, link: j.url, posted: j.date });
for (const j of (him && him.jobs) || []) {
  let pd = j.pubDate; if (typeof pd === 'number') pd = new Date(pd < 1e12 ? pd * 1000 : pd).toISOString();
  add({ jobId: 'hm-' + hash(j.guid || j.applicationLink), source: 'Himalayas', role: j.title, company: j.companyName, location: (j.locationRestrictions || []).join(', ') || 'Worldwide', workMode: 'Remote', salary: j.minSalary ? `${j.currency || ''} ${j.minSalary}-${j.maxSalary || ''} ${j.salaryPeriod || ''}` : '', description: (j.excerpt || '') + ' ' + (j.description || ''), link: j.applicationLink || j.guid, posted: pd || '' });
}
for (const x of [wwr1, wwr2]) {
  for (const it of String(x || '').split('<item>').slice(1)) {
    const tag = n => { const mm = it.match(new RegExp('<' + n + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + n + '>')); return mm ? mm[1].trim() : ''; };
    const title = decode(tag('title')); const parts = title.split(':');
    const company = parts.length > 1 ? parts.shift().trim() : '';
    add({ jobId: 'ww-' + hash(tag('link')), source: 'WeWorkRemotely', role: parts.join(':').trim(), company, location: tag('region') || 'Remote', workMode: 'Remote', description: tag('description'), link: tag('link'), posted: tag('pubDate') });
  }
}

// ---------- 3. Company career pages (Greenhouse / Lever / Ashby public job APIs) ----------
await Promise.all(ATS.map(async ([sys, slug, name, type]) => {
  if (sys === 'greenhouse') {
    const d = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    const list = ((d && d.jobs) || []).filter(j => ROLE.test(j.title)).slice(0, 25);
    await Promise.all(list.map(async j => {
      const det = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${j.id}`);
      add({ jobId: 'gh-' + j.id, source: 'Careers: ' + name, role: j.title, company: name, companyType: type, location: (j.location && j.location.name) || '', description: det ? det.content : '', link: j.absolute_url, posted: j.updated_at });
    }));
  } else if (sys === 'lever') {
    const d = await get(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=300`);
    for (const j of (Array.isArray(d) ? d : []).filter(j => ROLE.test(j.text)).slice(0, 25)) {
      const sr = j.salaryRange ? `${j.salaryRange.currency} ${j.salaryRange.min}-${j.salaryRange.max} ${j.salaryRange.interval || ''}` : '';
      add({ jobId: 'lv-' + j.id, source: 'Careers: ' + name, role: j.text, company: name, companyType: type, location: ((j.categories && (j.categories.allLocations || [j.categories.location])) || []).join(', '), workMode: j.workplaceType || '', salary: sr, description: j.descriptionPlain || j.description, link: j.hostedUrl, posted: j.createdAt ? new Date(j.createdAt).toISOString() : '' });
    }
  } else if (sys === 'ashby') {
    const d = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
    for (const j of ((d && d.jobs) || []).filter(j => ROLE.test(j.title)).slice(0, 25)) {
      const locs = [j.location].concat((j.secondaryLocations || []).map(s => s.location)).filter(Boolean).join(', ');
      add({ jobId: 'ab-' + j.id, source: 'Careers: ' + name, role: j.title, company: name, companyType: type, location: locs, workMode: j.isRemote ? 'Remote' : (j.workplaceType || ''), salary: (j.compensation && j.compensation.compensationTierSummary) || '', description: j.descriptionPlain || j.descriptionHtml, link: j.jobUrl, posted: j.publishedAt });
    }
  }
}));

// de-duplicate inside this run
const seen = new Set();
const out = jobs.filter(j => !seen.has(j.jobId) && seen.add(j.jobId));
if (!out.length) return [];
return out.map(j => ({ json: { ...j, _stats: stats } }));
