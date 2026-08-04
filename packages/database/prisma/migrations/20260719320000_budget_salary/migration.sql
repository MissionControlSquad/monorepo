-- Domain 14 #18: token "salary" budgeting — mark an agent-scoped monthly budget as the salary.
ALTER TABLE "budget_policies" ADD COLUMN "isSalary" BOOLEAN NOT NULL DEFAULT false;
