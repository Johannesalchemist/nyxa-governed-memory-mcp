// Linux seccomp backstop for the namespace sandbox. No elevated privilege.
// nonet: deny outgoing connection/message syscalls, including Unix sockets.
// net: allow TCP/UDP, but deny AF_UNIX socket/socketpair creation.
// nonet keeps socketpair IPC; connect/message sending cannot reach host endpoints.
// io_uring is denied because asynchronous operations bypass syscall filters.
#define _GNU_SOURCE
#include <errno.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#if defined(__x86_64__)
#define NATIVE_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define NATIVE_ARCH AUDIT_ARCH_AARCH64
#else
#error Unsupported architecture: explicit syscall ABI review required
#endif
#define DENY (SECCOMP_RET_ERRNO | EPERM)
#define BLOCK(nr) BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K, (nr), 0, 1), BPF_STMT(BPF_RET|BPF_K, DENY)
static int fail(const char *stage) {
 fprintf(stderr,"sandbox_filter_setup_failed:%s:%s\n",stage,strerror(errno)); return 96;
}
int main(int argc,char **argv) {
 if(argc<4 || (strcmp(argv[1],"net") && strcmp(argv[1],"nonet")) || strcmp(argv[2],"--")) {
  errno=EINVAL;return fail("invocation");
 }
 int nonet=!strcmp(argv[1],"nonet");
 // No inherited ring/socket/control descriptors beyond the reviewed stdio pipes.
 if(syscall(SYS_close_range,3u,~0u,0u)<0)return fail("close_range");
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)<0)return fail("no_new_privs");
 struct sock_filter base[]={
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,NATIVE_ARCH,1,0),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
#ifdef __x86_64__
  // x32 shares AUDIT_ARCH_X86_64 but has a different syscall-number space.
  BPF_JUMP(BPF_JMP|BPF_JGE|BPF_K,0x40000000u,0,1),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
#endif
  BLOCK(SYS_io_uring_setup),BLOCK(SYS_io_uring_enter),BLOCK(SYS_io_uring_register),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)
 };
 struct sock_fprog program={.len=sizeof(base)/sizeof(base[0]),.filter=base};
 if(prctl(PR_SET_SECCOMP,SECCOMP_MODE_FILTER,&program)<0)return fail("base");
 struct sock_filter offline[]={
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
  BLOCK(SYS_connect),BLOCK(SYS_sendto),BLOCK(SYS_sendmsg),BLOCK(SYS_sendmmsg),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)
 };
 struct sock_filter online[]={
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,SYS_socket,1,0),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,SYS_socketpair,0,3),
  BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[0])),
  BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,AF_UNIX,0,1),
  BPF_STMT(BPF_RET|BPF_K,DENY),
  BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)
 };
 program.filter=nonet?offline:online;
 program.len=nonet?sizeof(offline)/sizeof(offline[0]):sizeof(online)/sizeof(online[0]);
 if(prctl(PR_SET_SECCOMP,SECCOMP_MODE_FILTER,&program)<0)return fail("policy");
 execvp(argv[3],argv+3);return fail("exec");
}
