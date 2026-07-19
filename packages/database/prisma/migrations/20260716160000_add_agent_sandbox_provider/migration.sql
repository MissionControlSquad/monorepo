-- Tier D: per-agent sandbox provider selection. Null = run locally on the runner (default);
-- a provider key ("local"/"e2b"/…) runs the agent's tasks inside a provisioned sandbox.
ALTER TABLE "agents" ADD COLUMN "sandboxProvider" TEXT;
