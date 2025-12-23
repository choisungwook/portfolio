# 개요

* bpftool CLI로 bpf 디버깅 방법을 정리합니다.

## 커널에 올라와 있는 모든 eBPF 프로그램 목록 조회

```sh
$ sudo bpftool prog list
27: lsm  name restrict_filesystems  tag aae89fa01fe7ee91  gpl
	loaded_at 2025-12-23T01:37:43+0000  uid 0
	xlated 560B  jited 300B  memlock 4096B  map_ids 11
	btf_id 17
57: cgroup_device  name sd_devices  tag 47dd357395126b0c  gpl
	loaded_at 2025-12-23T01:38:59+0000  uid 0
	xlated 504B  jited 313B  memlock 4096B
58: cgroup_skb  name sd_fw_egress  tag 6deef7357e7b4530  gpl
	loaded_at 2025-12-23T01:38:59+0000  uid 0
	xlated 64B  jited 58B  memlock 4096B
...
```

## 커널에 올라와 있는 특정 eBPF 프로그램 목록 조회

```sh
# handle_execve_tp ebpf를 조회
sudo bpftool prog show name handle_execve_tp
```

## BPF Map 데이터 조회

```sh
$ sudo bpftool map list
11: hash_of_maps  name cgroup_hash  flags 0x0
	key 8B  value 4B  max_entries 2048  memlock 32768B
```

## BPF 커널 트레이스 버퍼 조회

1. 옵션1

```sh
sudo bpftool prog trace
```

2. 옵션2

```sh
sudo cat /sys/kernel/debug/tracing/trace_pipe
```

## 바이트코드 확인 (Verifier 통과 후 상태)

```sh
# <ID>는 bpftool prog list로 확인한 번호
sudo bpftool prog dump xlated id <ID>
; bpf_printk("Hello world");
   0: (18) r1 = map[id:447][0]+0
   2: (b7) r2 = 12
   3: (85) call bpf_trace_printk#-61296
; return 0;
   4: (b7) r0 = 0
   5: (95) exit
```

## 기계어 확인 (Verifier 통과 후 상태)

```sh
# <ID>는 bpftool prog list로 확인한 번호
sudo bpftool prog dump jid id <ID>
bpf_prog_bf163b23cd3b174d_handle_execve_tp:
; bpf_printk("Hello world");
   0:   nopl   0x0(%rax,%rax,1)
   5:   xchg   %ax,%ax
   7:   push   %rbp
   8:   mov    %rsp,%rbp
   b:   movabs $0xffffbd6b80f7e000,%rdi
  15:   mov    $0xc,%esi
  1a:   call   0xffffffffd8fcbc84
; return 0;
  1f:   xor    %eax,%eax
  21:   leave
  22:   jmp    0xffffffffd9ba73d4
```
