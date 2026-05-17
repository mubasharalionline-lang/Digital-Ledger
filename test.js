import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from('status_log')
    .select('*, task:tasks(title, description, status, company:companies(company_name)), user:users!updated_by(username)')
    .limit(1);
  console.log(JSON.stringify(data, null, 2), error);
}
test();
