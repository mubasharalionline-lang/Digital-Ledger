require('fs');
const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const r1 = await supabase.from('status_log').select('id').limit(1);
  console.log('status_log:', r1.error ? r1.error.message : 'OK');
  const r2 = await supabase.from('status_logs').select('id').limit(1);
  console.log('status_logs:', r2.error ? r2.error.message : 'OK');
}
run();
