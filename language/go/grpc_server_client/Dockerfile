FROM golang:1.24-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /out/server ./cmd/server && go build -o /out/client ./cmd/client

FROM alpine:3.22 AS server

COPY --from=build /out/server /usr/local/bin/server

EXPOSE 50051

ENTRYPOINT ["server"]

FROM alpine:3.22 AS client

COPY --from=build /out/client /usr/local/bin/client

ENTRYPOINT ["client"]
