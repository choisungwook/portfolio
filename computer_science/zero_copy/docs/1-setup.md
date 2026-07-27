# Setup

Every document here assumes the `zero-copy-lab` container is running. The lab
needs Linux syscalls (`sendfile`, `strace`), so it runs in Docker even on macOS.

## Up

Build the image and start the container.

```bash
docker compose up -d --build
```

Create the file that every transfer path will send. The argument is the size in
MB, 512 by default. The script also reads the file once so the page cache is
warm, otherwise the measurement is about the disk instead of the copies.

```bash
docker compose exec lab /lab/scripts/make-testfile.sh 512
```

Check that the server binary is in place.

```bash
docker compose exec lab fileserver
```

It prints the usage line and exits with code 2. That is the expected output.

## Down

Remove the container and the volume holding the test file.

```bash
docker compose down -v
```

## Next

- [2. Why copying is the cost](./2-why-copy-costs.md)
- [3. Measuring the three transfer paths](./3-measure-transfer-paths.md)
- [4. What zero copy does not solve](./4-limits.md)
