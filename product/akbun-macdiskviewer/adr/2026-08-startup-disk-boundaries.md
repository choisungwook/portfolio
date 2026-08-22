# Startup-disk boundaries

## Decision

Scan `/`, do not follow symbolic links, and exclude external volumes, device files, APFS duplicate data views, update volumes, and VM data by path.

## Reason

Restricting traversal to the root device number would drop `/Users` and `/Applications` on modern macOS because APFS firmlinks cross device boundaries. Traversing every mount would count the Data volume twice and include external drives. Explicit macOS boundaries preserve the visible startup-disk tree without those duplicates or unbounded mounts.
