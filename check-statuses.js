const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data: tasks } = await supabase.from('tasks').select('id, status');
  const counts = {};
  for (const t of tasks) {
    if (!t.status) continue;
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  console.log("Task status counts:", counts);
}
run();
