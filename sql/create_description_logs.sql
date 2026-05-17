CREATE TABLE IF NOT EXISTS public.task_description_logs (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES public.users(id),
    old_description TEXT,
    new_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW())
);
ALTER TABLE public.task_description_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all authenticated users on task_description_logs" ON public.task_description_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users on task_description_logs" ON public.task_description_logs FOR INSERT TO authenticated WITH CHECK (true);
