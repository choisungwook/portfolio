# 개요
* raft 로그

# vault operator init 직후 로그

```sh
vault1 shell# vault operator init
vault1 shell# vault operator unsel
```

* vault1 인스턴스에서 처음 vault를 초기화 하면 follower state가 됨

```log
[INFO]  storage.raft: creating Raft: config="&raft.Config{ProtocolVersion:3, HeartbeatTimeout:5000000000, ElectionTimeout:5000000000, CommitTimeout:50000000, MaxAppendEntries:64, BatchApplyCh:true, ShutdownOnRemove:true, TrailingLogs:0x2800, SnapshotInterval:120000000000, SnapshotThreshold:0x2000, LeaderLeaseTimeout:2500000000, LocalID:\"vault1\", NotifyCh:(chan<- bool)(0x40000ba150), LogOutput:io.Writer(nil), LogLevel:\"DEBUG\", Logger:(*hclog.interceptLogger)(0x40008560c0), NoSnapshotRestoreOnStart:true, skipStartup:false}"
[INFO]  storage.raft: initial configuration: index=1 servers="[{Suffrage:Voter ID:vault1 Address:vault1:8201}]"
[INFO]  storage.raft: entering follower state: follower="Node at vault1 [Follower]" leader-address= leader-id=
```

* 얼마 지나고 선거를 시작하여 vault1이 leader로 선출
* 검색 키워드: starting election, election won

```log
[WARN]  storage.raft: heartbeat timeout reached, starting election: last-leader-addr= last-leader-id=
[INFO]  storage.raft: entering candidate state: node="Node at vault1 [Candidate]" term=2
[INFO]  storage.raft: election won: term=2 tally=1
[INFO]  storage.raft: entering leader state: leader="Node at vault1 [Leader]"
```


# vault raft join 로그

* 실행한 명령어

```sh
vault3 shell# vault operator raft join http://vault1:8200
vault3 shell# vault operator unsel
```

* vault1, vault3 instance log

```log
vault3  | 2024-10-20T09:33:46.084Z [INFO]  core: attempting to join possible raft leader node: leader_addr=http://vault2:8200
vault1  | 2024-10-20T09:33:46.090Z [INFO]  storage.raft: updating configuration: command=AddNonvoter server-id=vault3 server-addr=vault3:8201 servers="[{Suffrage:Voter ID:vault1 Address:vault1:8201} {Suffrage:Voter ID:vault2 Address:vault2:8201} {Suffrage:Nonvoter ID:vault3 Address:vault3:8201}]"
vault1  | 2024-10-20T09:33:46.092Z [INFO]  storage.raft: added peer, starting replication: peer=vault3
vault1  | 2024-10-20T09:33:46.094Z [ERROR] storage.raft: failed to appendEntries to: peer="{Nonvoter vault3 vault3:8201}" error="dial tcp 172.19.0.3:8201: connect: connection refused"
vault1  | 2024-10-20T09:33:46.096Z [INFO]  system: follower node answered the raft bootstrap challenge: follower_server_id=vault3
vault3  | 2024-10-20T09:33:46.098Z [INFO]  core.cluster-listener.tcp: starting listener: listener_address=0.0.0.0:8201
vault3  | 2024-10-20T09:33:46.098Z [INFO]  core.cluster-listener: serving cluster requests: cluster_listen_address=[::]:8201
vault3  | 2024-10-20T09:33:46.101Z [INFO]  storage.raft: creating Raft: config="&raft.Config{ProtocolVersion:3, HeartbeatTimeout:15000000000, ElectionTimeout:15000000000, CommitTimeout:50000000, MaxAppendEntries:64, BatchApplyCh:true, ShutdownOnRemove:true, TrailingLogs:0x2800, SnapshotInterval:120000000000, SnapshotThreshold:0x2000, LeaderLeaseTimeout:2500000000, LocalID:\"vault3\", NotifyCh:(chan<- bool)(0x4000f8eee0), LogOutput:io.Writer(nil), LogLevel:\"DEBUG\", Logger:(*hclog.interceptLogger)(0x4000d380c0), NoSnapshotRestoreOnStart:true, skipStartup:false}"
vault3  | 2024-10-20T09:33:46.102Z [INFO]  storage.raft: initial configuration: index=1 servers="[{Suffrage:Voter ID:vault1 Address:vault1:8201} {Suffrage:Voter ID:vault2 Address:vault2:8201} {Suffrage:Nonvoter ID:vault3 Address:vault3:8201}]"
vault3  | 2024-10-20T09:33:46.102Z [INFO]  core: successfully joined the raft cluster: leader_addr=http://vault1:8200
vault3  | 2024-10-20T09:33:46.102Z [INFO]  storage.raft: entering follower state: follower="Node at vault3:8201 [Follower]" leader-address= leader-id=
vault3  | 2024-10-20T09:33:46.102Z [INFO]  core: security barrier not initialized
vault3  | 2024-10-20T09:33:46.222Z [WARN]  storage.raft: failed to get previous log: previous-index=41 last-index=1 error="log not found"
vault1  | 2024-10-20T09:33:46.222Z [WARN]  storage.raft: appendEntries rejected, sending older logs: peer="{Nonvoter vault3 vault3:8201}" next=2
vault1  | 2024-10-20T09:33:46.225Z [INFO]  storage.raft: pipelining replication: peer="{Nonvoter vault3 vault3:8201}"
vault3  | 2024-10-20T09:33:47.104Z [WARN]  core: cluster listener is already started
vault3  | 2024-10-20T09:33:47.104Z [INFO]  core: entering standby mode
vault3  | 2024-10-20T09:33:47.104Z [INFO]  core: vault is unsealed
vault1  | 2024-10-20T09:34:01.312Z [INFO]  storage.raft.autopilot: Promoting server: id=vault3 address=vault3:8201 name=vault3
vault1  | 2024-10-20T09:34:01.312Z [INFO]  storage.raft: updating configuration: command=AddVoter server-id=vault3 server-addr=vault3:8201 servers="[{Suffrage:Voter ID:vault1 Address:vault1:8201} {Suffrage:Voter ID:vault2 Address:vault2:8201} {Suffrage:Voter ID:vault3 Address:vault3:8201}]"
```
