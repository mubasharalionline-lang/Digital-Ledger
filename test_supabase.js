const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('task_messages')
    .select('id, task_id, message, created_at, sender_id, tasks!inner(country)')
    .eq('tasks.country', 'Bahrain')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('task_messages data:', data);
  console.log('error:', error);

  const { data: logs, error: err } = await supabase
    .from('status_log')
    .select('id, task_id, remarks, created_at, updated_by, tasks!inner(country)')
    .ilike('remarks', 'Description updated to:%')
    .eq('tasks.country', 'Bahrain')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('status_log data:', logs);
  console.log('error:', err);
}

test();
