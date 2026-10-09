#!/bin/sh
# nyxa_run_test / nyxa_apply_patch (post-patch test) execution boundary.
#
# Full threat model, boundary-by-boundary evidence and known non-goals:
# docs/RUN_TEST_SANDBOX.md. This header covers only the mechanism.
#
# Reused, already-available kernel/OS primitives only -- no new dependency, no
# Docker, no elevated privilege for the service account:
#   - unprivileged user namespace (--user --map-root-user): "root" only inside
#     this namespace; maps to nothing on the real host. Needed only so this
#     process is permitted to mount/remount at all. Nested-namespace/mount-
#     escape analysis: docs/RUN_TEST_SANDBOX.md "Nested Namespace / Privilege".
#   - mount namespace (--mount): every top-level directory relevant to the
#     threat model (see MANDATORY_RO below) is bind-mounted onto itself with
#     --rbind (recursive, so any pre-existing nested mount is captured as its
#     own vfsmount) and then remounted read-only, nosuid, nodev. A failure on
#     any of these is FATAL (exit 92) -- there is no silent best-effort for a
#     threat-model-relevant path. A residual, explicitly non-threat-modeled
#     catch-all loop covers whatever top-level directories remain (see
#     "Known Non-Goals" in the design doc); a failure there is logged, not
#     fatal, because nothing security-relevant remains in that bucket.
#   - fresh /proc and /sys: mounted fresh inside the new pid+mount+user+net
#     namespace rather than left as inherited bind-throughs, so they reflect
#     THIS namespace, not the host's. Both are on the fail-closed list.
#   - masked /dev: a fresh, minimal tmpfs, populated only with bind-mounts of
#     the specific host device nodes actually needed (null, zero, full,
#     random, urandom, tty) -- the full host /dev listing (other ttys, block
#     devices, hardware nodes) is simply absent, not merely read-only.
#   - scratch area: a tmpfs of the caller-chosen size, nosuid+nodev+mode=0700,
#     mounted directly onto the caller-supplied, already-existing scratch
#     directory BEFORE the ro remounts above run. Because that mount is
#     created first, the later rbind+remount-ro of an ancestor (e.g. /opt, if
#     the scratch dir happens to live under it) does not reach back into it
#     and flip it read-only -- verified empirically. The tmpfs size= option is
#     a real, kernel-enforced ceiling, and its content is gone the instant the
#     mount namespace is torn down.
#   - Unix-socket masking: after each mandatory read-only path is mounted, any
#     socket special file discovered under it is individually bind-masked
#     with an inert empty regular file. A read-only bind mount does NOT by
#     itself prevent connect(2) to a pre-existing listening socket at a
#     visible path (connect is not a filesystem write) -- this is the
#     specific, separate mechanism that closes that gap. See "Network" in the
#     design doc for why this matters for this exact codebase.
#   - pid namespace + --fork + --kill-child=SIGKILL: the process this script
#     execs becomes PID 1 of a fresh PID namespace. --kill-child makes unshare
#     itself send SIGKILL into that namespace the moment ITS OWN process dies
#     -- verified necessary: without it, killing only the outer unshare PID
#     left the inner tree (including any detached/double-forked descendant)
#     running, reparented to host PID 1, instead of tearing it down.
#   - net namespace (--net, default on): only a DOWN loopback interface
#     exists (never brought up by this script) -- no IPv4 or IPv6 route to
#     loopback-other-than-self, LAN, Tailscale or Internet is reachable; this
#     covers both address families identically since neither is configured.
#     Pass net-mode "net" to omit network-namespace isolation for a target
#     explicitly, per-target configured to need it -- an operator/config-time
#     decision, never something a remote proposer can request. Net namespace
#     isolation does NOT cover Unix domain sockets -- see socket masking
#     above for that separate mechanism.
#   - ulimit -v / -u / -t: real kernel-enforced ceilings on virtual address
#     space, process count, and CPU TIME (not just wall-clock -- the caller's
#     own wall-clock timeout is enforced in Node and is a separate, higher-
#     layer control; RLIMIT_CPU is a kernel-level backstop independent of it).
#     Calibration note (measured on this host): a plain `node -e ...` needs on
#     the order of ~1GB of virtual address space just to start (V8's CodeRange
#     reservation) even though actual resident memory used is far smaller --
#     so the memory ceiling is a coarse guard against runaway/pathological
#     allocation, not a tight bound on real working-set size. Real RSS-based
#     limiting (cgroups v2 memory.max) was investigated and is NOT available
#     here without an infrastructure change (the service account's cgroup is
#     root-owned with no delegation and no linger enabled) -- documented as an
#     open, undocumented-elsewhere gap, not silently worked around.
#   - no_new_privs (via setpriv, when available on the host): blocks any
#     exec'd binary from gaining privileges via its own setuid/setgid or file
#     capability bits, in addition to (not instead of) the nosuid mount flag
#     applied everywhere above -- defense in depth, not the sole control.
#
# Usage:
#   nyxa-run-test-sandbox.sh <scratch-dir> <scratch-size-kb> <mem-limit-kb> \
#     <nproc-limit> <cpu-limit-seconds> <net-mode: net|nonet> \
#     <extra-ro-path-or--> -- <executable> <args...>
#
#   <scratch-dir> MUST already exist (caller creates it per-run under a
#   directory it owns) -- this script never creates a new top-level path, so
#   it never depends on write permission on real root ("/"), which does not
#   exist for an unprivileged, user-namespace-mapped "root".
#
# Fail-closed exit codes (the target NEVER starts if any of these fire):
#   90 bad invocation, 91 unshare unavailable,
#   95 unshare available but namespace creation itself failed (probed before
#      the real invocation, so this is never confused with a target's own
#      exit code -- see docs/RUN_TEST_SANDBOX.md "Failure Classification"),
#   92 required read-only mount / fresh proc|sys|dev setup failed,
#   93 scratch setup failed, 94 ulimit rejected.
set -eu

if [ "$#" -lt 9 ]; then echo "sandbox_invocation_invalid" >&2; exit 90; fi
SCRATCH_DIR="$1"; SCRATCH_KB="$2"; MEM_KB="$3"; NPROC="$4"; CPU_SEC="$5"; NET_MODE="$6"; EXTRA_RO="$7"; shift 7
if [ "$1" != "--" ]; then echo "sandbox_invocation_invalid" >&2; exit 90; fi
shift

if ! command -v unshare >/dev/null 2>&1; then echo "sandbox_unshare_unavailable" >&2; exit 91; fi
# capsh is required, not best-effort: it is what closes a confirmed, proven
# escape (a nested `unshare --mount` + remount,rw can otherwise unlock a
# read-only bind mount and write through to the real host filesystem --
# empirically demonstrated during hardening, see docs/RUN_TEST_SANDBOX.md
# "Nested Namespace / Privilege"). A host missing capsh must refuse to run
# sandboxed targets at all, not silently fall back to the exploitable state.
if ! command -v capsh >/dev/null 2>&1; then echo "sandbox_capsh_unavailable" >&2; exit 96; fi
# rsync is required to build the dev-root snapshot copy (see EXTRA_RO handling
# below) -- a host missing it must refuse to run sandboxed targets that declare
# an EXTRA_RO, rather than silently falling back to a live (racy) bind mount.
if ! command -v rsync >/dev/null 2>&1; then echo "sandbox_rsync_unavailable" >&2; exit 96; fi
[ -d "$SCRATCH_DIR" ] || { echo "sandbox_scratch_setup_failed:missing_dir:$SCRATCH_DIR" >&2; exit 93; }

NET_FLAG="--net"
[ "$NET_MODE" = "net" ] && NET_FLAG=""

# Probe namespace creation itself, BEFORE the real invocation, so a kernel/
# policy-level failure here (e.g. unprivileged user namespaces disabled via
# kernel.unprivileged_userns_clone, or /proc/sys/user/max_user_namespaces
# exhausted) is classified as a sandbox setup failure (exit 95), never as
# "the target exited with some code" -- `unshare`'s own raw exit code for
# this class of failure is NOT in {90-95} and would otherwise pass straight
# through as if it were the target's exit status.
if ! unshare --user --map-root-user --mount --pid --fork --kill-child=SIGKILL $NET_FLAG -- /bin/true >/dev/null 2>&1; then
  echo "sandbox_namespace_probe_failed" >&2
  exit 95
fi

FILTER_EXE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/../dist/nyxa-sandbox-filter"
[ -x "$FILTER_EXE" ] || { echo "sandbox_filter_unavailable" >&2; exit 96; }

NNP=""
command -v setpriv >/dev/null 2>&1 && NNP="setpriv --no-new-privs --"

exec unshare --user --map-root-user --mount --pid --fork --kill-child=SIGKILL $NET_FLAG -- /bin/bash -c '
  set -eu
  SCRATCH_DIR="$1"; SCRATCH_KB="$2"; MEM_KB="$3"; NPROC="$4"; CPU_SEC="$5"; EXTRA_RO="$6"; NNP="$7"; FILTER_EXE="$8"; FILTER_MODE="$9"; shift 9

  mount --make-rprivate / 2>/dev/null || { echo "sandbox_mount_setup_failed:rprivate" >&2; exit 92; }

  # EXTRA_RO (the target own cwd/dev-root) is the one mandatory path whose
  # entire legitimate content is fully known and finished BEFORE this script
  # ever starts -- the caller populates it, then invokes this script; nothing
  # else is meant to write into it while a target is running. Unlike the
  # other 8 mandatory paths (real, host-wide, live directories where a true
  # point-in-time snapshot is impractical at /usr//var scale), this one is
  # normally small (a test fixture / repo checkout), so an actual snapshot IS
  # practical here. A live bind of the real path, even remounted read-only,
  # remains a LIVE VIEW of the same underlying directory: a Unix socket
  # created on the real host path after this point is still the exact same
  # inode reachable through the read-only mount, which is why the previous
  # design needed a continuously-racing re-scan/re-mask poller for it and
  # could still lose that race in a narrow window (proven: a socket created
  # ~1.5s after startup was reachable for ~400ms before the next poll tick).
  # Copying the directory instead of bind-mounting it structurally removes
  # the race: the target only ever sees this frozen copy, a wholly separate
  # inode tree, so anything created on the real host path afterward --
  # including a new socket -- is never visible inside the sandbox at all,
  # regardless of timing. This is done here, as the very first filesystem
  # operation after make-rprivate and BEFORE the scratch tmpfs below is
  # mounted, specifically because the caller commonly nests the scratch
  # directory inside this same dev-root -- copying now, while scratch is
  # still just the plain (empty) directory the caller pre-created, means
  # scratch own tmpfs mount (below) lands fresh on top of the already-final
  # snapshot afterward, with no shadowing or reachability problem at all. A
  # copy taken AFTER scratch already has its own live tmpfs mounted nested
  # inside this path was tried and rejected: a plain recursive copy cannot
  # faithfully reproduce scratch own bind-mounted device-node stash, and
  # replacing this path content afterward would shadow scratch own nested
  # mount, making it permanently unreachable by its own path (confirmed
  # empirically both ways during hardening). (Also empirically verified: an
  # actual copy of a live, listening Unix socket -- via rsync -a -- produces
  # an inert, unconnectable copy, ECONNREFUSED on connect -- so a socket that
  # already exists at copy time poses no risk in the copy either; the
  # existing socket-masking pass later in this script still runs over it
  # regardless, as defense in depth.) Once bound here, this path is treated
  # by the rest of this script exactly like any other mandatory path -- the
  # recursive-submount remount loop below runs over it identically, applying
  # the same read-only guarantee to this snapshot copy as it does everywhere
  # else.
  case "$EXTRA_RO" in
    -) : ;;
    *)
      mkdir -m 0755 -p "$SCRATCH_DIR" 2>/dev/null || true
      mkdir -m 0755 -p "$SCRATCH_DIR/.devroot-snapshot"         || { echo "sandbox_mount_setup_failed:$EXTRA_RO:snapshot_mkdir_failed" >&2; exit 92; }
      # -rlptD (NOT -a/-og): recurse, preserve symlinks/perms/times/devices, but
      # deliberately do NOT try to preserve owner/group. The source dev-root is
      # not always owned by this sandbox own account (a real caller-configured
      # test target can point at a real, pre-existing project directory owned
      # by a different real user) -- attempting chown to an arbitrary real uid
      # from inside this restricted, single-uid-mapped user namespace fails
      # with EINVAL, since that uid has no meaning in this namespace own
      # mapping (confirmed empirically: reproducible against a real cross-
      # owner directory). Ownership of the snapshot copy does not need to
      # match the original: only readability matters here, which the mapped
      # uid already has (it is how the copy was read to begin with), and the
      # copy is remounted read-only for everyone regardless of what it claims
      # to be owned by.
      rsync -rlptD "$EXTRA_RO/" "$SCRATCH_DIR/.devroot-snapshot/" 2>/dev/null         || { echo "sandbox_mount_setup_failed:$EXTRA_RO:snapshot_copy_failed" >&2; exit 92; }
      mount --bind "$SCRATCH_DIR/.devroot-snapshot" "$EXTRA_RO" 2>/dev/null         || { echo "sandbox_mount_setup_failed:$EXTRA_RO:snapshot_bind_failed" >&2; exit 92; }
      ;;
  esac

  mount -t proc -o ro,nosuid,nodev,noexec proc /proc 2>/dev/null || { echo "sandbox_mount_setup_failed:proc" >&2; exit 92; }
  mount -t sysfs -o ro,nosuid,nodev,noexec sysfs /sys 2>/dev/null || { echo "sandbox_mount_setup_failed:sysfs" >&2; exit 92; }

  # Scratch is mounted BEFORE /dev is masked, specifically so it can hold a
  # stash of bind-mounted references to the real host device nodes. Once /dev
  # itself is overmounted with a fresh tmpfs below, the path "/dev/tty" (etc.)
  # would otherwise be unrecoverable -- you cannot rename or re-derive a
  # mountpoint that is now hidden behind a different mount at the same path.
  # Stashing the bind FIRST, at a path scratch owns (a separate mountpoint,
  # unaffected by the later overmount of /dev), avoids that entirely.
  mount -t tmpfs -o "size=${SCRATCH_KB}k,mode=0700,nosuid,nodev" tmpfs "$SCRATCH_DIR" \
    || { echo "sandbox_scratch_setup_failed:tmpfs" >&2; exit 93; }
  export NYXA_SANDBOX_SCRATCH="$SCRATCH_DIR"

  mkdir -m 0700 "$SCRATCH_DIR/.devstash"
  for dev in null zero random urandom; do
    : > "$SCRATCH_DIR/.devstash/$dev"
    mount --bind "/dev/$dev" "$SCRATCH_DIR/.devstash/$dev" 2>/dev/null \
      || { echo "sandbox_mount_setup_failed:dev_$dev" >&2; exit 92; }
  done
  # full/tty are best-effort: neither is load-bearing for typical Node/git
  # test targets the way null/zero/random/urandom are, and their absence is
  # not a containment gap (unlike the mandatory four, nothing security-
  # relevant depends on them being present).
  for dev in full tty; do
    if [ -e "/dev/$dev" ]; then
      : > "$SCRATCH_DIR/.devstash/$dev"
      mount --bind "/dev/$dev" "$SCRATCH_DIR/.devstash/$dev" 2>/dev/null \
        || echo "sandbox_best_effort_dev_skipped:$dev" >&2
    fi
  done

  mount -t tmpfs -o "size=1024k,mode=0755,nosuid,nodev" tmpfs /dev \
    || { echo "sandbox_mount_setup_failed:dev_tmpfs" >&2; exit 92; }
  for dev in null zero random urandom; do
    : > "/dev/$dev"
    mount --bind "$SCRATCH_DIR/.devstash/$dev" "/dev/$dev" 2>/dev/null \
      || { echo "sandbox_mount_setup_failed:dev_$dev" >&2; exit 92; }
  done
  for dev in full tty; do
    if [ -e "$SCRATCH_DIR/.devstash/$dev" ]; then
      : > "/dev/$dev"
      mount --bind "$SCRATCH_DIR/.devstash/$dev" "/dev/$dev" 2>/dev/null \
        || echo "sandbox_best_effort_dev_skipped:$dev" >&2
    fi
  done

  # MANDATORY_RO: every top-level directory this threat model has evaluated as
  # security-relevant. A failure on ANY of these is fatal -- no silent
  # best-effort here. nosuid+nodev close a real, separate gap (a real host
  # setuid binary such as /usr/bin/sudo remaining setuid-effective merely
  # because the mount was read-only, since MS_RDONLY alone does not imply
  # MS_NOSUID/MS_NODEV).
  : > "$SCRATCH_DIR/.sockmask"
  mask_sockets_under() {
    d="$1"
    fail_closed="$2"
    # Per-call unique scratch file, keyed on the PID of this subshell via
    # $BASHPID -- NOT $$, which bash defines as the PID of the invoking shell
    # even inside a backgrounded subshell, so every concurrent call below would
    # otherwise collide on the exact same filename and corrupt the socket list
    # built by a different call. The mandatory paths are masked via independent
    # backgrounded invocations of this function (see the main loop below) purely
    # to overlap their independent find scans in wall-clock time; nothing about
    # what is scanned, matched, or masked changes.
    found="$SCRATCH_DIR/.found-sockets.$BASHPID"
    # `|| true`: find exits non-zero on any subdirectory it cannot traverse (e.g. a
    # leftover, differently-owned 0700 directory) -- under `set -e` that would otherwise
    # abort the whole script. This is not a masking gap: a directory this process cannot
    # enter is equally unreachable to the target sharing the same real uid, so no socket
    # inside it is reachable either way.
    find "$d" -xdev -type s > "$found" 2>/dev/null || true
    while IFS= read -r sock; do
      mountpoint -q "$sock" 2>/dev/null && continue
      if ! mount --bind "$SCRATCH_DIR/.sockmask" "$sock" 2>/dev/null; then
        # A masking attempt can fail because the socket itself has already
        # disappeared between the find snapshot above and this exact line --
        # proven in practice under real concurrent load: a real, unrelated,
        # legitimate short-lived Unix socket (this codebase own WriterLock
        # uses one as a locking primitive) can be created and released by
        # another concurrently-running process entirely between those two
        # points. A path that no longer exists cannot be connect()-ed to by
        # anyone, including the sandboxed target -- there is nothing left to
        # protect against, so this is not a masking gap, merely a benign race
        # with activity this sandbox was never trying to guard against in the
        # first place. Re-checked immediately, not assumed: only an ACTUAL
        # confirmed absence is treated this way -- any other failure reason
        # (the path still exists: permission, a genuine mount conflict, or
        # anything else) falls through to the unchanged fail-closed check
        # below exactly as before.
        if [ ! -e "$sock" ]; then
          echo "sandbox_socket_disappeared_before_mask:$sock" >&2
        elif [ "$fail_closed" = "1" ]; then
          echo "sandbox_socket_mask_failed:$sock" >&2
          rm -f "$found"
          exit 92
        fi
      fi
    done < "$found"
    rm -f "$found"
  }

  mask_pids=""
  for d in /tmp /opt /etc /home /var /usr /root /run "$EXTRA_RO"; do
    [ "$d" = "-" ] && continue
    [ -d "$d" ] || continue
    mount --rbind "$d" "$d" 2>/dev/null || { echo "sandbox_mount_setup_failed:$d" >&2; exit 92; }
    # --rbind recursively captures every pre-existing submount under $d as its
    # own independent vfsmount. A single top-level `remount,bind,ro` only
    # affects that ONE vfsmount, never its recursively-bound children -- a
    # nested submount (e.g. a tmpfs already mounted somewhere under /tmp)
    # otherwise keeps its own prior rw/suid/dev flags. Confirmed empirically
    # during hardening: an untouched nested tmpfs under /tmp stayed writable
    # and a write through it landed on the real host filesystem. Every
    # mountpoint findmnt finds at or under $d (including $d itself) is
    # remounted individually; a failure on ANY of them is fatal, matching the
    # rest of this mandatory list.
    #
    # `mount --rbind "$d" "$d"` (a self-rebind) stacks a fresh copy of every
    # pre-existing submount on top of itself, so findmnt legitimately lists each
    # target path twice afterward (once per stack layer). Only the TOPMOST layer
    # is ever reachable by path -- a remount-by-path always hits the top of the
    # stack -- so acting on the same target twice is pure repeated work with zero
    # additional security coverage. The read loop below stores each line in an
    # associative array keyed by target path; when the same target appears twice,
    # the second (later) line simply overwrites the first in that array, so what
    # remains is exactly one entry per target: the last (topmost) layer findmnt
    # printed for it.
    findmnt -R -r -n -o TARGET,OPTIONS "$d" > "$SCRATCH_DIR/.found-mounts-raw" 2>/dev/null || true
    unset mount_line
    declare -A mount_line
    while IFS= read -r line; do
      key="${line% *}"
      mount_line["$key"]="$line"
    done < "$SCRATCH_DIR/.found-mounts-raw"
    # Bounded, aggregate diagnostics for the two EXPECTED/successful outcomes below
    # (already read-only, or remount refused but confirmed not writable) -- on a host
    # with many nested mounts (e.g. many Docker containers under /var), one stderr
    # line per submount for these two routine, non-fatal outcomes can itself grow
    # large enough to trip a callers own output-size ceiling and be killed for
    # producing too much of its OWN diagnostic noise, which is never the intent of
    # this logging. A real problem always still exits fail-closed with a specific,
    # detailed message (see the exit 92 branches below) -- only the ROUTINE per-item
    # detail is aggregated here, never the failure detail.
    already_ro_count=0
    confirmed_not_writable_count=0
    for mp in "${!mount_line[@]}"; do
      line="${mount_line[$mp]}"
      opts="${line##* }"
      # Scratch (and its /dev device-node stash) is deliberately mounted BEFORE this loop
      # so it stays writable -- it legitimately lives under a mandatory path (e.g. /tmp) and
      # would otherwise be caught and re-locked read-only by this same recursive-submount
      # remount, exactly the class of bug this loop exists to close for everything else.
      case "$mp" in
        "$SCRATCH_DIR" | "$SCRATCH_DIR"/*) continue ;;
      esac
      # If the superblock of this vfsmount already carries ro+nosuid+nodev (all
      # three -- not ro alone, since a read-only-but-still-suid/dev mount would
      # still leave the separate setuid/device-node gap open), no remount or
      # write check can add anything: EROFS is enforced unconditionally at the
      # VFS layer regardless of DAC or in-namespace capabilities. This is the
      # kernel own /proc/self/mountinfo state (via findmnt), not something a
      # target process can forge -- only an actual privileged remount syscall
      # changes it.
      already_safe=1
      for req in ro nosuid nodev; do
        case ",$opts," in *",$req,"*) ;; *) already_safe=0 ;; esac
      done
      if [ "$already_safe" = 1 ]; then
        already_ro_count=$((already_ro_count + 1))
        continue
      fi
      if mount -o remount,bind,ro,nosuid,nodev "$mp" 2>/dev/null; then continue; fi
      if [ "$mp" = "$d" ]; then
        # The mandatory path itself MUST become read-only -- no fallback here.
        echo "sandbox_mount_setup_failed:$mp" >&2
        exit 92
      fi
      # A nested submount that refuses this remount (observed in practice: a live
      # Docker overlayfs rootfs under /var/lib/docker does not accept it) is not
      # automatically a containment gap -- it is one only if this process can actually
      # write through it. Real DAC still applies to the mapped uid regardless of that
      # mounts own ro/rw flag (a bind mount does not change file ownership/permission
      # bits), so a live write check is the ground truth here, not whether the remount
      # call itself succeeded. `[ -w "$mp" ]` is a shell builtin (no fork): it calls
      # access(2) with the real uid, exactly the same DAC evaluation an actual
      # open(O_CREAT) would hit. The well-known caveat that access(2) does not account
      # for a read-only filesystem is not in play here -- that case is already handled
      # above via kernel-reported mount metadata before this branch is ever reached; the
      # only remaining unknown here is DAC, which access(2) evaluates correctly. If
      # genuinely writable, this fails closed; if not, logged and skipped -- not
      # silently, and not without proof.
      if [ -w "$mp" ]; then
        echo "sandbox_mount_setup_failed:$mp:remount_failed_and_writable" >&2
        exit 92
      fi
      confirmed_not_writable_count=$((confirmed_not_writable_count + 1))
    done
    if [ "$already_ro_count" -gt 0 ] || [ "$confirmed_not_writable_count" -gt 0 ]; then
      echo "sandbox_nested_mounts_summary:$d:already_ro=$already_ro_count:confirmed_not_writable=$confirmed_not_writable_count" >&2
    fi
    # Unix-socket masking: connect(2) to a pre-existing socket is not blocked
    # by a read-only mount (it is not a filesystem write). Every socket
    # special file discovered under this now-read-only tree is individually
    # bind-masked with an inert empty regular file. A masking failure here is
    # FATAL, not best-effort -- an unmasked reachable socket is exactly the
    # gap this exists to close. See docs/RUN_TEST_SANDBOX.md "Network" for the
    # separate, best-effort mitigation against a socket created by other host
    # activity AFTER this point, and its honestly-documented residual window.
    #
    # Backgrounded: the dominant cost of this whole mandatory-path loop is this
    # find -xdev -type s full-tree walk, and the 9 mandatory paths are fully
    # independent of each other (separate trees, separate scratch files per the
    # BASHPID fix above). Remounting for path "$d" has already fully completed
    # above before this path mask job is launched -- only the (slow, I/O-bound)
    # masking scans of DIFFERENT paths are allowed to overlap in wall-clock time.
    # set -e note: a function backgrounded with an ampersand runs in its own
    # subshell, so exit 92 inside it (via the fail_closed branch of
    # mask_sockets_under) only terminates that subshell/job -- it does not
    # propagate to this script by itself. The explicit wait-and-exit-status loop
    # after this outer for-loop is what restores fail-closed semantics: this
    # script does not proceed to exec the target until every masking job has
    # been waited on and confirmed successful.
    mask_sockets_under "$d" 1 &
    mask_pids="$mask_pids $!"
  done
  mask_failed=0
  for pid in $mask_pids; do
    if ! wait "$pid"; then mask_failed=1; fi
  done
  if [ "$mask_failed" = 1 ]; then
    echo "sandbox_socket_mask_failed_background" >&2
    exit 92
  fi

  # Everything else: explicitly a documented non-goal, not a silent skip --
  # nothing the threat model flagged as relevant remains in this bucket
  # (/proc /sys /dev /tmp /opt /etc /home /var /usr /root /run and the extra
  # dev-root path are all handled above, fail-closed). A failure here is
  # logged for diagnosability and does not abort the sandbox.
  for d in /*/; do
    d="${d%/}"
    [ -d "$d" ] || continue
    case "$d" in
      /proc|/sys|/dev|/tmp|/opt|/etc|/home|/var|/usr|/root|/run) continue ;;
    esac
    mount --rbind "$d" "$d" 2>/dev/null && mount -o remount,bind,ro,nosuid,nodev "$d" 2>/dev/null \
      || echo "sandbox_best_effort_ro_skipped:$d" >&2
  done

  ulimit -v "$MEM_KB" || { echo "sandbox_ulimit_rejected:mem" >&2; exit 94; }
  ulimit -u "$NPROC" || { echo "sandbox_ulimit_rejected:nproc" >&2; exit 94; }
  ulimit -t "$CPU_SEC" || { echo "sandbox_ulimit_rejected:cpu" >&2; exit 94; }

  # Kernel filter replaces the racy, killable masking watcher. The filter
  # is inherited by every descendant and cannot be removed after exec.
  # nonet forbids outbound connect/sendto/sendmsg/sendmmsg; net forbids
  # AF_UNIX socket creation. Both block io_uring and alternative syscall ABIs.
  # Local socketpair IPC and ordinary pipe-based child processes still work.

  # Drop EVERY capability -- bounding, effective, permitted, inheritable and
  # ambient -- from the target process, not a curated subset. A regular git
  # or node test target needs none of them: on the real host filesystem
  # (reached only through bind mounts of already-DAC-governed paths) the
  # mapped uid, not any in-namespace capability, is what determines real
  # access; capabilities inside this user namespace have no effect at all on
  # resources belonging to the parent (real) user namespace. Verified during
  # hardening: git and node both function normally with /proc/self/status
  # showing all five capability sets as fully zero.
  ALL_CAPS="cap_chown,cap_dac_override,cap_dac_read_search,cap_fowner,cap_fsetid,cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_linux_immutable,cap_net_bind_service,cap_net_broadcast,cap_net_admin,cap_net_raw,cap_ipc_lock,cap_ipc_owner,cap_sys_module,cap_sys_rawio,cap_sys_chroot,cap_sys_ptrace,cap_sys_pacct,cap_sys_admin,cap_sys_boot,cap_sys_nice,cap_sys_resource,cap_sys_time,cap_sys_tty_config,cap_mknod,cap_lease,cap_audit_write,cap_audit_control,cap_setfcap,cap_mac_override,cap_mac_admin,cap_syslog,cap_wake_alarm,cap_block_suspend,cap_audit_read,cap_perfmon,cap_bpf,cap_checkpoint_restore"
  # A process own current-working-directory is a fixed reference to a specific
  # (directory entry, mount instance) pair, established once when this process
  # chain was first created (long before any of the mount surgery above ran)
  # and NOT automatically re-pointed at whatever is now stacked on top of that
  # same path. If EXTRA_RO (the only mandatory path that can equal the target
  # own cwd, per the current caller contract) was just remounted read-only,
  # the inherited cwd reference still resolves through the OLD, pre-remount
  # mount instance -- an ordinary relative-path write from the target would
  # silently bypass the new read-only mount entirely, even though an absolute-
  # path write to the exact same file is correctly denied (confirmed
  # empirically: only the bare-relative-path form was ever affected). A fresh
  # cd here, executed by this same process AFTER all mount setup has
  # completed, re-resolves the reference through the CURRENT (topmost,
  # correctly read-only) mount stack; capsh execs the target directly from
  # this process without an intervening fork, so the corrected cwd is what
  # the target actually inherits. Reads are unaffected -- a read-only mount
  # still permits reads regardless of which mount instance is referenced.
  case "$EXTRA_RO" in
    -) : ;;
    *) cd "$EXTRA_RO" 2>/dev/null || { echo "sandbox_cwd_refresh_failed:$EXTRA_RO" >&2; exit 92; } ;;
  esac
  if [ -n "$NNP" ]; then
    capsh --drop="$ALL_CAPS" -- -c "exec $NNP \"$FILTER_EXE\" \"$FILTER_MODE\" -- \"\$@\"" sandbox-exec "$@"
  else
    capsh --drop="$ALL_CAPS" -- -c "exec \"$FILTER_EXE\" \"$FILTER_MODE\" -- \"\$@\"" sandbox-exec "$@"
  fi
  TARGET_EXIT=$?
  exit "$TARGET_EXIT"
' sandbox-inner "$SCRATCH_DIR" "$SCRATCH_KB" "$MEM_KB" "$NPROC" "$CPU_SEC" "$EXTRA_RO" "$NNP" "$FILTER_EXE" "$NET_MODE" "$@"
