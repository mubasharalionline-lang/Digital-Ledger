CREATE TABLE IF NOT EXISTS public.statuses (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  country text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  country text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Add open policies
CREATE POLICY "Enable all access for all users" ON public.statuses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for all users" ON public.roles FOR ALL USING (true) WITH CHECK (true);

-- Insert default statuses (if the table is newly created)
INSERT INTO public.statuses (name, country) VALUES
('Not Started', 'Bahrain'),
('In Progress', 'Bahrain'),
('Under Review', 'Bahrain'),
('Query Raised', 'Bahrain'),
('Ready to File', 'Bahrain'),
('Filed', 'Bahrain'),
('Closed', 'Bahrain');

-- Insert default roles
INSERT INTO public.roles (name, country) VALUES
('Accountant', 'Bahrain'),
('Secretary', 'Bahrain'),
('Admin', 'Bahrain'),
('CA', 'Bahrain'),
('Accountant', 'New Zealand'),
('Secretary', 'New Zealand'),
('Admin', 'New Zealand'),
('CA', 'New Zealand');
