// ===== Rule filter + build the Gemini prompt =====
// Your rules - edit here. Salary values are examples (LPA = lakh INR per year).
const RULES = {
  chennaiProductMinLPA: 12,
  chennaiServiceMinLPA: 14,
  outsideChennaiMinLPA: 20,
  preferredCountries: ['United States', 'United Kingdom', 'Germany', 'Singapore', 'Ireland', 'Canada', 'Australia', 'New Zealand', 'UAE (Dubai)'], // edit to your preferred countries
  maxJobsToScore: 40,
  maxPostAgeDays: 7,
};
const TARGETS = /(freshworks|zoho|chargebee|kissflow|uniphore|facilio|surveysparrow|hippo ?video|gofrugal|vue\.?ai|mad street den|detect technologies|saama|pickyourtrail|paypal|standard chartered|barclays|bank of america|citi|mr\.? cooper|temenos|amazon|walmart|comcast|ford|caterpillar|hmh|houghton|pearson|ideas2it|tiger analytics|payoda|indium|zeta|devrev|cred|groww|meesho|hevo|sarvam)/i;
const ROLE = /(front[\s-]?end|frontend|react|full[\s-]?stack|fullstack|mern|node\.?js|javascript|typescript|next\.?js|\bui\b|\bai\b|artificial intelligence|machine learning|\bml\b|llm|gen ?ai|generative|agentic|software (engineer|developer)|\bsde\b|product engineer|application developer|java\b)/i;
const EXCLUDE = /(principal|\bstaff\b|director|head of|\bvp\b|vice president|manager|\bintern\b|internship|trainee|fresher|android|\bios\b|embedded|sales|marketing|recruit|account exec|designer|\bqa\b|test engineer|sdet|devops|\bsre\b|site reliability|data engineer|\.net\b|php|golang|\bgo engineer|rust\b|salesforce|\bsap\b|mainframe|support engineer|security engineer|hardware|firmware|mechanical|electrical|scientist|researcher|research engineer)/i;
const INDIA = /(india|chennai|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|gurgaon|gurugram|noida|kochi|coimbatore|kolkata|ahmedabad|trivandrum|thiruvananthapuram|mysore|remote - in|\bin\b$)/i;
const OPEN_REMOTE = /(worldwide|anywhere|global|apac|asia|india|^remote$|^$)/i;
const VISA_YES = /(visa sponsorship|sponsor(ship)? (your |a |the )?visa|visa support|relocation (support|assistance|package|bonus)|we (will|can) sponsor|sponsorship (is )?available)/i;
const VISA_NO = /(no visa sponsorship|not (be )?(able to )?sponsor|unable to sponsor|cannot sponsor|can't sponsor|does not sponsor|without (the need for )?sponsorship|must (already )?have (the )?(right|authori[sz]ation) to work)/i;

const lpaFrom = (s) => {
  s = String(s || '');
  let m = s.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(lacs|lakhs?|lpa|l\b)/i);
  if (m) return parseFloat(m[2]);
  m = s.match(/(?:usd|\$)\s*([\d,]+)\s*(?:-|to)\s*\$?([\d,]+)/i);
  if (m) { const v = parseFloat(m[2].replace(/,/g, '')); if (v > 10000) return v * 88 / 1e5; }
  return null; // unknown
};

const now = Date.now();
const kept = [];
const dropped = {};
const drop = (why) => { dropped[why] = (dropped[why] || 0) + 1; };
for (const { json: j } of $input.all()) {
  const title = j.role || '';
  if (!ROLE.test(title)) { drop('role'); continue; }
  if (EXCLUDE.test(j.fromEmail ? title.split('|')[0] : title)) { drop('excluded title'); continue; }
  if (j.posted && !j.fromEmail) {
    const t = Date.parse(j.posted);
    const maxAge = String(j.source).startsWith('Careers') ? 60 : RULES.maxPostAgeDays;
    if (t && now - t > maxAge * 864e5) { drop('old'); continue; }
  }
  const expMin = (j.experience || '').match(/^(\d+)/);
  if (expMin && +expMin[1] >= 7) { drop('experience 7+'); continue; }

  const loc = (j.location || '').trim();
  const text = loc + ' ' + j.description;
  const chennai = /chennai/i.test(loc + ' ' + (j.fromEmail ? title : ''));
  const india = j.fromEmail || INDIA.test(loc);
  let zone;
  if (chennai) zone = 'Chennai';
  else if (india) zone = 'India (outside Chennai)';
  else if ((j.workMode || '').toLowerCase().includes('remote') && OPEN_REMOTE.test(loc.replace(/remote[,\s-]*/i, '').trim())) zone = 'Remote (open to India)';
  else {
    zone = 'Overseas';
    if (!VISA_YES.test(text) || VISA_NO.test(text)) { drop('overseas without visa sponsorship'); continue; }
  }
  const lpa = lpaFrom(j.salary + ' ' + (j.fromEmail ? j.description : ''));
  const min = zone === 'Chennai' ? RULES.chennaiProductMinLPA : RULES.outsideChennaiMinLPA;
  if (lpa !== null && lpa < min) { drop('salary below minimum'); continue; }

  let priority = 0;
  if (TARGETS.test(j.company + ' ' + title)) priority += 3;
  if (zone === 'Chennai') priority += 2;
  if (j.fromEmail) priority += 1;
  if (/react|full[\s-]?stack|ai engineer|ai developer|llm|gen ?ai/i.test(title)) priority += 1;
  kept.push({ ...j, zone, salaryLPA: lpa, priority });
}
kept.sort((a, b) => b.priority - a.priority);
const jobs = kept.slice(0, RULES.maxJobsToScore);
if (!jobs.length) return [];

const profile = `CANDIDATE: <Your name>, <City>, <Country>. <Current title>, <N> years experience.
Skills: <your main skills>.
AI: <AI tools and frameworks you use>.
Work: <one line per recent project or role>.
Education: <degree>.
TARGET ROLES: Frontend Developer; Full Stack (React + Node, Java OK); AI Developer / AI Engineer.
SALARY RULES: home-city product company >= ${RULES.chennaiProductMinLPA} LPA; home-city service company >= ${RULES.chennaiServiceMinLPA} LPA; anywhere else >= ${RULES.outsideChennaiMinLPA} LPA (or equivalent).
OVERSEAS: must offer visa sponsorship; preferred countries: ${RULES.preferredCountries.join(', ')}.
PREFERENCES: product companies preferred over IT services/consulting.`;

const list = jobs.map((j, i) => `### JOB ${i + 1}\nid: ${j.jobId}\nsource: ${j.source}\ntitle: ${j.role}\ncompany: ${j.company || '(see text)'}\nlocation: ${j.location || '(see text)'} | zone: ${j.zone} | mode: ${j.workMode || '?'}\nsalary: ${j.salary || 'not stated'}\ntext: ${j.description.slice(0, 900)}`).join('\n\n');

const prompt = `You are a strict career assistant screening jobs for one candidate.\n\n${profile}\n\nScore each job 0-100 for how good an application would be: role match to target roles and skills (50%), seniority fit for 4-5 years experience (15%), company quality and product-company preference (15%), likelihood the pay meets the salary rules (20%). Give a score below 60 if the job clearly breaks a rule (wrong role family, needs 7+ years, IT-services company in Chennai unlikely to pay 15 LPA, outside Chennai and unlikely to pay 24 LPA, overseas without sponsorship). Some jobs come from email alerts where title, company and location are mixed into one text line - work out the real values.\n\nReturn ONLY a JSON array, no markdown, one object per job, in this exact shape:\n[{"id":"...","score":0,"role":"clean job title","company":"company name","location":"city, country","workMode":"Onsite|Hybrid|Remote","companyType":"Product|Service|Unknown","salary":"stated or estimated range in LPA or currency","why":"max 25 words why it fits","gaps":"max 15 words main gap or risk"}]\n\nJOBS:\n\n${list}`;

return [{ json: { prompt, jobs, keptCount: kept.length, dropped, stats: ($input.first().json._stats) || {} } }];
