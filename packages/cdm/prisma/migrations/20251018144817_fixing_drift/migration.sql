DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'JiraAssignableUser'
  ) THEN
    EXECUTE 'ALTER TABLE "JiraAssignableUser" DROP CONSTRAINT IF EXISTS "JiraAssignableUser_siteId_fkey"';
    EXECUTE 'ALTER TABLE "JiraAssignableUser" ADD CONSTRAINT "JiraAssignableUser_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "JiraSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;
END
$$;
