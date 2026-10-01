# Astra 10a — backup/restore evidence

## What is verified locally
The existing `083_shop_backup_restore.sql` and platform backup/restore implementation were inspected by the 10a audit. The static contract verifies:

- provider/bot secret tables are excluded from exported business data;
- restore writes an explicit `RESTORE_BACKUP` platform audit event;
- restored shop is forced to `PROVISIONING` and provider-access flags are disabled;
- archive format is versioned (`USTORE_SHOP_BACKUP`, version 1);
- ZIP path traversal and archive-size/file-count guards exist;
- storage upload/restore uses the private `shop-backups` flow.

The legacy regression suite also contains backup/restore contract assertions.

## What is **not** evidence yet
This environment has no `psql`, PostgreSQL server, Supabase CLI, remote database credentials, staging Storage bucket, or staging URL. Therefore 10a does **not** claim that a real backup ZIP was created and restored successfully.

Required live evidence before release:
1. create a backup from a disposable staging shop containing products/orders/customers/media;
2. record manifest, row count, file count and SHA-256 of downloaded ZIP;
3. restore to a clean staging DB/project or isolated disposable shop context;
4. verify source/restored sample row counts and media files;
5. verify no bot/provider secrets were restored and integrations require reconnect;
6. verify `RESTORE_BACKUP` audit row;
7. remove the disposable restored shop according to the normal lifecycle procedure.
