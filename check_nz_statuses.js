const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(envFile.split('\n').map(line => line.split('=')));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: tasks } = await supabase.from('tasks').select('status').eq('country', 'New Zealand');
  const { data: statuses } = await supabase.from('statuses').select('name').eq('country', 'New Zealand');
  
  const taskStatuses = new Set(tasks.map(t => t.status).filter(Boolean));
  const tableStatuses = new Set(statuses.map(s => s.name).filter(Boolean));
  
  console.log('Task Statuses:', Array.from(taskStatuses));
  console.log('Table Statuses:', Array.from(tableStatuses));
}
run();
