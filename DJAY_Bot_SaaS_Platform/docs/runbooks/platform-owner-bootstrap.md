# Platform Owner Bootstrap

This procedure creates the first internal DJAY Platform Owner. It is not a
tenant signup path and cannot create a merchant Tenant Master Admin.

1. Apply all migrations using `DATABASE_MIGRATION_URL`.
2. Generate a unique password and write it to a root/operator-readable file
   with mode `0600`. Do not place it in shell history or an environment value.
3. Set `PLATFORM_BOOTSTRAP_EMAIL`, `PLATFORM_BOOTSTRAP_DISPLAY_NAME`,
   `PLATFORM_BOOTSTRAP_PASSWORD_FILE`, `PLATFORM_DATABASE_URL`,
   `PLATFORM_MFA_ENCRYPTION_KEY`, and `PLATFORM_RECOVERY_HASH_KEY`.
4. Run:

```bash
scripts/use-node24.sh pnpm --filter @djay/workers bootstrap:platform-owner
```

5. Enroll the displayed `otpauthUrl` in the operator's authenticator. Store the
   one-time recovery codes in the approved secrets vault.
6. Delete the plaintext password file, then verify password plus TOTP login in
   the Platform Master application.
7. Re-running the command must report that bootstrap was already completed and
   exit non-zero. Investigate any different result before serving traffic.

The command validates file permissions, stores only password/recovery digests,
encrypts the TOTP secret, writes an immutable audit event, and atomically closes
the one-time bootstrap state.
