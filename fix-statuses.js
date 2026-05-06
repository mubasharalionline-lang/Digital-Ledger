const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  console.log("Fetching all task types...");
  const { data: tts } = await supabase.from('task_types').select('*');
  
  const allStatuses = new Set([
    'Not Started', 'In progress', 'Under Review', 'Query Raised', 'Ready to File', 'Filed', 'Closed'
  ]);
  
  for (const tt of tts) {
    if (tt.status_options) {
      let updated = false;
      let opts = tt.status_options.split(',').map(s => s.trim()).filter(Boolean);
      
      // Merge "In Progress" to "In progress"
      const idx = opts.indexOf('In Progress');
      if (idx !== -1) {
        opts[idx] = 'In progress';
        updated = true;
      }
      
      opts.forEach(s => allStatuses.add(s));
      
      if (updated) {
        await supabase.from('task_types').update({ status_options: opts.join(', ') }).eq('id', tt.id);
        console.log(`Updated task type ${tt.name} status options.`);
      }
    }
  }

  console.log("Fetching all tasks...");
  const { data: tasks } = await supabase.from('tasks').select('id, status');
  for (const t of tasks) {
    if (t.status === 'In Progress') {
      await supabase.from('tasks').update({ status: 'In progress' }).eq('id', t.id);
      console.log(`Updated task ${t.id} from In Progress to In progress.`);
    }
    if (t.status) allStatuses.add(t.status);
  }

  console.log("Deleting old statuses table content...");
  await supabase.from('statuses').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  console.log("Inserting aggregated statuses...");
  const toInsert = Array.from(allStatuses).filter(s => s !== 'In Progress').map(name => ({
    name,
    country: 'Bahrain'
  }));
  
  const { error } = await supabase.from('statuses').insert(toInsert);
  if (error) console.error("Error inserting:", error);
  else console.log(`Inserted ${toInsert.length} statuses.`);
}
run();
