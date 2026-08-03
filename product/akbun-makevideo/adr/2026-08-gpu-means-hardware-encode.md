# GPU rendering means hardware encode, detected by trying it

## Decision

The Settings sheet has "Render acceleration: Auto / CPU only", defaulting to Auto. Auto swaps `libx264` for a hardware encoder — `h264_videotoolbox` on a Mac, `h264_nvenc` on an NVIDIA machine — and adds `-hwaccel` on video inputs so the decode runs on the same engine.

The filter graph does not move to the GPU. Availability is decided by encoding one frame with the candidate, not by reading `ffmpeg -encoders`. A hardware render that fails is retried once on the CPU rather than reported as a failure.

## Reason

Encoding is where a render spends its time, so moving it to the GPU's media engine is most of the available win and it costs one argument. Scale, pad and overlay stay on the CPU.

Moving the filters too would mean keeping frames in device memory end to end — `scale_vt` and `overlay_videotoolbox` on macOS, `scale_cuda` and `overlay_cuda` on NVIDIA — with `hwupload`/`hwdownload` around anything that has no hardware equivalent. That is a second filter graph per vendor, gated on which filters a given ffmpeg build has, and the transparent-pad trick that makes off-aspect clips composite correctly would have to be rebuilt in each. It is the right next step and it is not a one argument change, which is why it is not this one. qsv and vaapi are left out for the same reason: unlike videotoolbox and nvenc they will not take frames from system memory, so they cannot be reached by swapping the encoder alone.

### The listing does not know what the machine has

`ffmpeg -encoders` reports what ffmpeg was **compiled** with. The container this was developed in lists `h264_nvenc` and has no NVIDIA card; asking it to encode gives `Cannot load libcuda.so.1`. Trusting the listing would mean discovering that at the end of a long render.

So the listing narrows the candidates and a one frame encode to `-f null -` decides. It costs about 50 ms per candidate, runs once per app launch, and turns a guess into a fact.

### A hardware encoder cannot be given a quality target

`-crf` and `-preset` are libx264 options. A hardware encoder ignores them with a warning and encodes at whatever its default is, so the output quality would be nobody's decision. There is no `-crf` equivalent available across encoders and macOS versions, so the hardware path asks for a bitrate instead: about 0.12 bits per pixel per frame, which is deliberately generous because a media engine spends more bits than x264 for the same picture.

That is the real trade. Hardware encoding is faster and, at a given file size, looks worse. Auto is still the default because the speed is what a preview render is for, and CPU only is one click away when the output is the deliverable.

### The fallback exists because this could not be tested where it was written

VideoToolbox exists on macOS. This product is built and tested on Linux — the container it was written in and the pull request runner both — so the code path that matters most to the machine it ships to is the one that could never be exercised before shipping.

Given that, the failure has to be survivable rather than merely reported: the hardware attempt failing means the CPU runs the same graph again. The graph is byte for byte identical on both paths, which is what makes the retry a re-run rather than a rebuild, and there is a test asserting exactly that. The user sees the render take longer and get made, instead of an error about an encoder they did not choose.
