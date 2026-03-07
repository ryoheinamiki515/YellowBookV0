UPDATE "Person" AS p
SET "displayName" = u."displayName"
FROM "User" AS u
WHERE p."linkedUserId" = u."id"
  AND p."displayName" = 'Friend'
  AND u."displayName" IS NOT NULL
  AND btrim(u."displayName") <> '';
