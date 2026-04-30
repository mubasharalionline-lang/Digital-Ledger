require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('users').insert({
    username: 'test_user_3',
    password: 'password123',
    role: 'Accountant',
    country: 'Global'
  });
  console.log("Insert result:", { data, error });
}

test();
