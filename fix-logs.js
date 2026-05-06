const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const adminId = 'e1129779-c72c-49c5-a58b-14a32bc0ba06';
  
  // Get all tasks assigned to companies in Bahrain
  const { data: companies } = await supabase.from('companies').select('id, country').eq('country', 'Bahrain');
  if (!companies) return;
  const companyIds = companies.map(c => c.id);
  
  const { data: tasks } = await supabase.from('tasks').select('id, assigned_to').in('company_id', companyIds);
  if (!tasks) return;
  
  for (const task of tasks) {
    if (!task.assigned_to) continue;
    
    // update status_log for this task where updated_by is admin
    const { data: logs } = await supabase.from('status_log').update({
      updated_by: task.assigned_to
    }).eq('task_id', task.id).eq('updated_by', adminId);
  }
  console.log("Fixed old logs!");
}
run();
