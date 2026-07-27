/*
 * Sends one file to every TCP client, using one of three transfer paths.
 *
 *   readwrite : read(2) into a user buffer, then write(2)  -> 2 CPU copies
 *   mmap      : mmap(2) the file, then write(2)            -> 1 CPU copy
 *   sendfile  : sendfile(2), file page cache -> socket     -> 0 CPU copies
 *
 * After each transfer it prints bytes, wall time and CPU time so the
 * kernel-side cost of copying can be compared between the paths.
 */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/sendfile.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#define BUFFER_SIZE (64 * 1024)

/* How many data-moving syscalls the transfer needed. Each one is a round trip
 * between user mode and kernel mode. */
static long syscall_count;

static void die(const char *what) {
  perror(what);
  exit(1);
}

static long long millis_of_timeval(struct timeval tv) {
  return (long long)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

static long long millis_now(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static int listen_on(int port) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) die("socket");

  int on = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof(on));

  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons(port);

  if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) die("bind");
  if (listen(fd, 8) < 0) die("listen");
  return fd;
}

/* write() until the whole buffer left the user space. */
static int write_all(int out, const char *data, size_t len) {
  while (len > 0) {
    ssize_t sent = write(out, data, len);
    syscall_count++;
    if (sent < 0) return -1;
    data += sent;
    len -= (size_t)sent;
  }
  return 0;
}

/* Two CPU copies: disk -> kernel -> user buffer -> socket buffer. */
static int send_readwrite(int out, int file_fd) {
  char buffer[BUFFER_SIZE];
  ssize_t got;

  while ((got = read(file_fd, buffer, sizeof(buffer))) > 0) {
    syscall_count++;
    if (write_all(out, buffer, (size_t)got) < 0) return -1;
  }
  return got < 0 ? -1 : 0;
}

/* One CPU copy: the file pages are mapped, so only page cache -> socket. */
static int send_mmap(int out, int file_fd, off_t size) {
  char *mapped = mmap(NULL, (size_t)size, PROT_READ, MAP_SHARED, file_fd, 0);
  if (mapped == MAP_FAILED) return -1;

  int result = write_all(out, mapped, (size_t)size);
  munmap(mapped, (size_t)size);
  return result;
}

/* No CPU copy: the kernel moves page cache pages to the socket itself. */
static int send_sendfile(int out, int file_fd, off_t size) {
  off_t offset = 0;

  while (offset < size) {
    ssize_t sent = sendfile(out, file_fd, &offset, (size_t)(size - offset));
    syscall_count++;
    if (sent < 0) return -1;
  }
  return 0;
}

static int send_file(const char *mode, int out, int file_fd, off_t size) {
  if (strcmp(mode, "readwrite") == 0) return send_readwrite(out, file_fd);
  if (strcmp(mode, "mmap") == 0) return send_mmap(out, file_fd, size);
  if (strcmp(mode, "sendfile") == 0) return send_sendfile(out, file_fd, size);

  fprintf(stderr, "unknown mode: %s\n", mode);
  exit(2);
}

/* Prints what the transfer cost, CPU time included. */
static void report(const char *mode, off_t size, long long wall_ms,
                   struct rusage before, struct rusage after) {
  long long user_ms = millis_of_timeval(after.ru_utime) - millis_of_timeval(before.ru_utime);
  long long sys_ms = millis_of_timeval(after.ru_stime) - millis_of_timeval(before.ru_stime);
  double mb = (double)size / (1024 * 1024);

  printf("mode=%-9s bytes=%.1fMB wall=%lldms user_cpu=%lldms sys_cpu=%lldms syscalls=%ld\n",
         mode, mb, wall_ms, user_ms, sys_ms, syscall_count);
  fflush(stdout);
}

static void serve_once(const char *mode, int listen_fd, const char *path) {
  int client_fd = accept(listen_fd, NULL, NULL);
  if (client_fd < 0) die("accept");

  int file_fd = open(path, O_RDONLY);
  if (file_fd < 0) die("open");

  struct stat st;
  if (fstat(file_fd, &st) < 0) die("fstat");

  struct rusage before, after;
  getrusage(RUSAGE_SELF, &before);
  long long started = millis_now();

  if (send_file(mode, client_fd, file_fd, st.st_size) < 0) die("send");

  long long wall_ms = millis_now() - started;
  getrusage(RUSAGE_SELF, &after);
  report(mode, st.st_size, wall_ms, before, after);

  close(file_fd);
  close(client_fd);
}

int main(int argc, char **argv) {
  if (argc != 4) {
    fprintf(stderr, "usage: %s <readwrite|mmap|sendfile> <port> <file>\n", argv[0]);
    return 2;
  }

  signal(SIGPIPE, SIG_IGN);

  const char *mode = argv[1];
  int listen_fd = listen_on(atoi(argv[2]));
  fprintf(stderr, "serving %s on port %s in %s mode\n", argv[3], argv[2], mode);

  serve_once(mode, listen_fd, argv[3]);
  close(listen_fd);
  return 0;
}
