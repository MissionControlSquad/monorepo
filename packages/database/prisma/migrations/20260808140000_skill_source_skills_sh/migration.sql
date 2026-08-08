-- Deepen skills import: add the skills.sh registry as a first-class skill source type. Additive
-- enum value only; existing rows are unaffected (their sourceType stays whatever it was). New
-- imports resolved from a skills.sh registry ref (skillsh:<name> or a skills.sh URL) stamp this.
ALTER TYPE "SkillSourceType" ADD VALUE 'skills_sh';
