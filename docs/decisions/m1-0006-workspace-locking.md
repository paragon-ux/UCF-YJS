# M1.6 Windows and POSIX Locking

Status: accepted

UCF-Yjs uses one OS-enforced writer lock per named workspace. The Node runtime
starts a small Python helper that holds the lock for the lifetime of the
JavaScript `WorkspaceLock`.

On POSIX the helper uses `fcntl.flock` with an open descriptor. On Windows it
uses `msvcrt.locking` over the first byte of the lock file. Immediate-fail and
bounded-wait modes both use nonblocking attempts with a short retry loop. The
lock file path and helper PID are diagnostic metadata only and are not
authority.

The runtime never deletes a lock because of timestamps. A crashed process
closes the helper stdin pipe, the helper exits, and the OS releases the file
lock. Safe committed-generation reads are allowed while a writer lock is held;
mutation, recovery, and migration callers must acquire the exclusive writer
lock before changing workspace authority.
