#define _GNU_SOURCE
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
int main(int argc,char **argv){
 if(argc>1 && !strcmp(argv[1],"x32")){syscall(0x40000027);return 1;}
 if(argc>1 && !strcmp(argv[1],"compat")){
#ifdef __x86_64__
  __asm__ volatile("int $0x80" : : "a"(20));
#endif
  return 1;
 }
 int fd=socket(AF_UNIX,SOCK_DGRAM,0);int se=errno;
 int pair[2];int ps=socketpair(AF_UNIX,SOCK_DGRAM,0,pair);int pe=errno;
 int fd2=socket(AF_INET,SOCK_STREAM,0);int ie=errno;
 long ring=syscall(SYS_io_uring_setup,1,0);int re=errno;
 printf("{\"unix_socket\":%d,\"unix_errno\":%d,\"unix_pair\":%d,\"pair_errno\":%d,\"inet_socket\":%d,\"inet_errno\":%d,\"ring\":%ld,\"ring_errno\":%d}\n",fd,se,ps,pe,fd2,ie,ring,re);
 return 0;
}
