const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
  const { data: statuses } = await supabase.from('statuses').select('*');
  console.log("Statuses in DB:");
  console.table(statuses.map(s => ({ name: s.name, country: s.country })));
}
run();
