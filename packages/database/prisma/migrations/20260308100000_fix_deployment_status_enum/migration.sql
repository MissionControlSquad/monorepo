-- Add missing DeploymentStatus enum values
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'waiting_for_ssh';
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'installing_deps';
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'installing_openclaw';
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'configuring';
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'starting_service';
