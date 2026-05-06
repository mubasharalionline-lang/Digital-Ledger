const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data: tts } = await supabase.from('task_types').select('id, name, status_options');
  console.log("Task Types status_options:");
  console.table(tts);
}
run();
