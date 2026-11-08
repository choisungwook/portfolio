//! Starting, retargeting and retiring the per-clip decoder threads.

use super::*;

impl FrameSource {
    pub(super) fn has_decoder_pipeline(&self) -> bool {
        (0..self.streams.len()).any(|index| self.stream_has_pipeline(index))
            || self.retiring.iter().any(|decoder| !decoder.is_finished())
    }

    pub(super) fn stream_has_pipeline(&self, index: usize) -> bool {
        let stream = &self.streams[index];
        stream.decoder.is_some()
            || stream.receiver.is_some()
            || !stream.ready.is_empty()
            || stream.pending.is_some()
    }

    pub(super) fn release_seek_neighbor(&mut self) {
        self.seek_neighbor = None;
    }

    /// Poll until the frame is there or `deadline` passes. `Starved` coming
    /// back means it did not arrive in time, and the caller decides what that
    /// is worth: the meter counts it, the render waits again.
    pub fn take_by(&mut self, deadline: Instant) -> Supply {
        loop {
            match self.take() {
                Supply::Starved => {
                    if Instant::now() >= deadline {
                        return Supply::Starved;
                    }
                    std::thread::sleep(POLL);
                }
                supply => return supply,
            }
        }
    }

    /// Start the decoders that are about to be needed and stop the ones that
    /// are done.
    pub(super) fn tend_at(&mut self, position: i64) {
        let lead = self.buffering.lead;
        for index in 0..self.streams.len() {
            let stream = &self.streams[index];
            let over = position >= stream.placement.end_frame();
            if over {
                if stream.decoder.is_some()
                    || stream.receiver.is_some()
                    || !stream.ready.is_empty()
                    || stream.pending.is_some()
                {
                    self.retire(index);
                }
                continue;
            }
            if stream.receiver.is_none()
                && !stream.dead
                && position + lead >= stream.placement.start_frame
            {
                self.start(index, position);
            }
        }
    }

    pub(super) fn start(&mut self, index: usize, position: i64) {
        let (rate, frames, generation) = (self.rate, self.frames, self.generation);
        let readers = Arc::clone(&self.readers);
        let depth = self.buffering.depth;
        let stream = &mut self.streams[index];
        let placement = &stream.placement;
        // A decoder started before its clip begins reads from the clip's own
        // first frame; one started mid-clip reads from where the playhead is.
        let first = position.max(placement.start_frame);
        let wanted = placement.end_frame().min(frames) - first;
        if wanted <= 0 {
            stream.dead = true;
            return;
        }
        let request = Open {
            path: placement.path.clone(),
            kind: placement.kind,
            in_frame: placement.source_frame_at(first),
            frames: wanted,
            width: placement.dst.w,
            height: placement.dst.h,
            rate,
            speed: placement.speed,
            crop: placement.crop,
            head_pad_frames: (placement.head_pad_frames - (first - placement.start_frame)).max(0),
        };

        let frame_bytes = stream.frame_bytes;
        let (sender, receiver) = sync_channel::<DecodedFrame>(depth);
        let buffer_limit = depth + 1;
        let buffered = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&buffered);
        let cancellation = Arc::new(DecoderCancellation::default());
        let decoder_cancellation = Arc::clone(&cancellation);
        let control = Arc::new(DecoderControl::new(generation, first));
        let decoder_control = Arc::clone(&control);
        let decoder = std::thread::spawn(move || {
            let Some(mut reader) = readers.open(&request) else {
                // Dropping the sender closes the queue, which is how the
                // consumer hears that this clip has nothing to give.
                return;
            };
            if decoder_cancellation.attach(reader.cancellation()) {
                return;
            }
            let mut frame = first;
            loop {
                let mut buffer = vec![0u8; frame_bytes];
                if !reader.read(&mut buffer) {
                    break;
                }
                let mut pixels = Some(buffer);
                loop {
                    if decoder_cancellation.is_cancelled() {
                        return;
                    }
                    let demand = decoder_control.demand.lock().unwrap();
                    if frame < demand.first_frame {
                        break;
                    }
                    if counter.load(Ordering::SeqCst) >= buffer_limit {
                        drop(decoder_control.wake.wait(demand).unwrap());
                        continue;
                    }
                    let decoded = DecodedFrame {
                        generation: demand.generation,
                        frame,
                        pixels: pixels.take().unwrap(),
                    };
                    counter.fetch_add(1, Ordering::SeqCst);
                    match sender.try_send(decoded) {
                        Ok(()) => break,
                        Err(TrySendError::Full(decoded)) => {
                            counter.fetch_sub(1, Ordering::SeqCst);
                            pixels = Some(decoded.pixels);
                            drop(decoder_control.wake.wait(demand).unwrap());
                        }
                        Err(TrySendError::Disconnected(_)) => {
                            counter.fetch_sub(1, Ordering::SeqCst);
                            return;
                        }
                    }
                }
                frame += 1;
            }
        });
        stream.receiver = Some(receiver);
        stream.ready.clear();
        stream.pending = None;
        stream.buffered = buffered;
        stream.decoder = Some(decoder);
        stream.cancellation = cancellation;
        stream.control = control;
    }

    pub(super) fn retarget(&mut self, index: usize, first_frame: i64) {
        let generation = self.generation;
        let stream = &mut self.streams[index];
        stream.control.retarget(generation, first_frame);

        let mut decoded = Vec::new();
        decoded.extend(stream.pending.take());
        decoded.extend(stream.ready.drain(..));
        let mut disconnected = false;
        if let Some(receiver) = stream.receiver.as_ref() {
            loop {
                match receiver.try_recv() {
                    Ok(frame) => decoded.push(frame),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => {
                        disconnected = true;
                        break;
                    }
                }
            }
        }
        stream.control.notify();

        decoded.sort_by_key(|frame| frame.frame);
        for mut frame in decoded {
            if frame.frame < first_frame {
                stream.buffered.fetch_sub(1, Ordering::SeqCst);
                stream.control.notify();
                continue;
            }
            frame.generation = generation;
            stream.ready.push_back(frame);
        }
        if disconnected {
            if let Some(handle) = stream.decoder.take() {
                self.retiring.push(handle);
            }
        }
    }

    /// Drop a clip's queue and interrupt a decoder blocked in a read. Nothing is
    /// joined here because a seek must not wait for a decoder mid-frame.
    pub(super) fn retire(&mut self, index: usize) {
        let stream = &mut self.streams[index];
        stream.cancellation.cancel();
        stream.control.notify();
        stream.receiver = None;
        stream.ready.clear();
        stream.pending = None;
        stream.buffered = Arc::new(AtomicUsize::new(0));
        stream.control = Arc::new(DecoderControl::new(self.generation, self.position));
        let decoder = stream.decoder.take();
        if let Some(handle) = decoder {
            self.retiring.push(handle);
        }
    }

    /// Join the retired threads that have already ended, so a long soak with
    /// many seeks does not accumulate them.
    pub(super) fn reap(&mut self) {
        let mut index = 0;
        while index < self.retiring.len() {
            if self.retiring[index].is_finished() {
                let _ = self.retiring.swap_remove(index).join();
            } else {
                index += 1;
            }
        }
    }
}
