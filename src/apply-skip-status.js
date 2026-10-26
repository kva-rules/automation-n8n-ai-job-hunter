// ===== Apply / Skip link clicked from Telegram =====
const q = $input.first().json.query || {};
const apply = q.d === 'apply';
const today = $now.setZone('Asia/Kolkata');
return [{ json: {
  jobId: q.id || '',
  status: apply ? 'Applied' : 'Skipped',
  appliedOn: apply ? today.toFormat('yyyy-MM-dd') : '',
  followUpOn: apply ? today.plus({ days: 7 }).toFormat('yyyy-MM-dd') : '',
  link: q.u || '',
  apply,
} }];
