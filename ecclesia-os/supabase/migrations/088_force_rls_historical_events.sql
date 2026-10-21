-- Keep historical timelines protected even for table owners and privileged sessions.
ALTER TABLE public.historical_events FORCE ROW LEVEL SECURITY;
