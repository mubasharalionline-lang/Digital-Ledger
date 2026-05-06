const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data: tables, error } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public');
  console.log(error ? error.message : tables);
}
run();
