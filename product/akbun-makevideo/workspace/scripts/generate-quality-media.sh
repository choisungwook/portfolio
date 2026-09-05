#!/usr/bin/env bash
set -euo pipefail

duration="${DURATION_SECONDS:-600}"
output_dir="${QUALITY_OUTPUT_DIR:-/tmp/akbun-makevideo-quality}"
video="$output_dir/timecode-pattern-1080p30.mp4"
project="$output_dir/project.akbunvideo"

mkdir -p "$output_dir"

ffmpeg -hide_banner -loglevel warning -y \
  -f lavfi -i "testsrc=size=1920x1080:rate=30:duration=$duration:decimals=3" \
  -f lavfi -i "sine=frequency=1000:sample_rate=48000:duration=$duration" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 30 \
  -c:a aac -b:a 192k -shortest "$video"

duration_ms=$((duration * 1000))
# The project counts frames on its own rate, which is 30 here to match the
# pattern above. The asset keeps a duration in milliseconds because that is a
# fact about the file rather than about the timeline.
duration_frames=$((duration * 30))
cut_frame=$((duration_frames / 2))
tracks=""
for index in 1 2 3 4; do
  comma=""
  if [[ -n "$tracks" ]]; then comma=","; fi
  video_clips="[{\"id\":\"quality-vc$index\",\"assetId\":\"quality-source\",\"start\":0,\"in\":0,\"out\":$duration_frames,\"volume\":1,\"opacity\":1}]"
  if [[ $index -eq 1 ]]; then
    video_clips="[{\"id\":\"quality-vc1a\",\"assetId\":\"quality-source\",\"start\":0,\"in\":0,\"out\":$cut_frame,\"volume\":1,\"opacity\":1},{\"id\":\"quality-vc1b\",\"assetId\":\"quality-source\",\"start\":$cut_frame,\"in\":$cut_frame,\"out\":$duration_frames,\"volume\":1,\"opacity\":1}]"
  fi
  tracks+="$comma
    {\"id\":\"quality-v$index\",\"kind\":\"video\",\"name\":\"V$index\",\"muted\":false,\"hidden\":$([[ $index -eq 1 ]] && echo false || echo true),\"clips\":$video_clips},
    {\"id\":\"quality-a$index\",\"kind\":\"audio\",\"name\":\"A$index\",\"muted\":$([[ $index -eq 1 ]] && echo false || echo true),\"hidden\":false,\"clips\":[{\"id\":\"quality-ac$index\",\"assetId\":\"quality-source\",\"start\":0,\"in\":0,\"out\":$duration_frames,\"volume\":1,\"opacity\":1}]}"
done

printf '%s\n' "{
  \"version\": 5,
  \"settings\": {\"width\": 1920, \"height\": 1080, \"rate\": {\"num\": 30, \"den\": 1}},
  \"assets\": [{
    \"id\": \"quality-source\",
    \"path\": \"$video\",
    \"name\": \"timecode-pattern-1080p30.mp4\",
    \"kind\": \"video\",
    \"durationMs\": $duration_ms,
    \"width\": 1920,
    \"height\": 1080,
    \"hasAudio\": true
  }],
  \"tracks\": [$tracks
  ],
  \"transitions\": [{\"id\":\"quality-x1\",\"trackId\":\"quality-v1\",\"fromClipId\":\"quality-vc1a\",\"toClipId\":\"quality-vc1b\",\"duration\":15,\"kind\":\"dissolve\"}]
}" > "$project"

echo "$project"
