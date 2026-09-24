"""veritysetup format이 만든 root hash를 hashlib만으로 다시 계산한다.

dm-verity format 1 기준: hash = sha256(salt + block), 블록 크기 4096, 해시 블록 하나에 해시 128개.
"""
import argparse
import hashlib

BLOCK_SIZE = 4096
DIGEST_SIZE = 32
HASHES_PER_BLOCK = BLOCK_SIZE // DIGEST_SIZE


def salted_hash(salt, block):
  return hashlib.sha256(salt + block).digest()


def pack_into_blocks(digests):
  blocks = []
  for start in range(0, len(digests), HASHES_PER_BLOCK):
    chunk = b"".join(digests[start:start + HASHES_PER_BLOCK])
    blocks.append(chunk.ljust(BLOCK_SIZE, b"\0"))
  return blocks


def build_tree(data, salt):
  data_blocks = [data[i:i + BLOCK_SIZE] for i in range(0, len(data), BLOCK_SIZE)]
  level_blocks = pack_into_blocks([salted_hash(salt, b) for b in data_blocks])
  levels = [level_blocks]

  while len(level_blocks) > 1:
    level_blocks = pack_into_blocks([salted_hash(salt, b) for b in level_blocks])
    levels.append(level_blocks)

  root_hash = salted_hash(salt, level_blocks[0])
  return levels, root_hash


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("data_file")
  parser.add_argument("--salt", required=True, help="veritysetup format 출력의 Salt 값(hex)")
  args = parser.parse_args()

  with open(args.data_file, "rb") as f:
    data = f.read()

  levels, root_hash = build_tree(data, bytes.fromhex(args.salt))

  print(f"data blocks : {len(data) // BLOCK_SIZE}")
  for depth, blocks in enumerate(levels):
    print(f"level {depth} hash blocks : {len(blocks)}")
  print(f"hash blocks total : {sum(len(b) for b in levels)}")
  print(f"root hash : {root_hash.hex()}")


if __name__ == "__main__":
  main()
