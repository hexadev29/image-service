# Rank Profile Image Service

A high-throughput, low-latency profile card image rendering service for Node.js, powered by `@resvg/resvg-js`, `sharp`, and a hybrid SVG pipeline with baked drop-shadow layers and pre-sized PNG rank emblems.

---

## Performance Highlights

- **Sub-21 ms Render Latency**: ~20.6 ms per card on Scale 1 (1200 × 835).
- **High Throughput**: **48+ images/sec** on a single thread.
- **Ultra-Low Memory Footprint**: Peak resident memory (maxRSS) reduced from 136.5 MB to **~62 MB** (V8 Heap: ~5 MB).
- **Dynamic Avatar Ingestion**: Fetches and clips remote avatars into circular vector paths at their exact final display dimensions (`167 × 167 px`) with an enforced 25 MB LRU cache byte limit.
- **Zero-Distortion Baked Shadows**: Bit-for-bit visual fidelity with 76.7% CPU savings over dynamic SVG Gaussian filters.

---

## Documentation

- 📘 [**RAM Optimization & VPS Testing Guide**](docs/RAM_OPTIMIZATION_AND_VPS_GUIDE.md): Deep-dive into memory profiling, `tsx` elimination, libvips concurrency tuning, font pruning, avatar payload compression, and running on Linux VPS instances.
- 📙 [**High-Throughput SVG-to-PNG Rasterization Architecture**](docs/SVG_TO_PNG_HIGH_PERFORMANCE_RENDERING.md): Comprehensive architectural paper on Resvg native rendering, baked shadow layers, and mathematical verification.

---

## Quickstart

### 1. Installation & Build

```bash
# Install dependencies
npm install

# Compile TypeScript and copy assets to dist/
npm run build
```

### 2. Rendering Single Cards

```bash
# Render baked shadow card (default vector avatar) - Peak RAM ~62 MB
npm run render:svg:prod

# Render card with custom avatar URL (auto-resized to 167px & cached)
npm run render:svg:prod -- --avatar "https://example.com/avatar.png"
```

The output image is generated at `artifacts/profile-from-svg.png`.

### 3. Benchmarks (100 Images)

```bash
# 100-image workload without avatar
npm run benchmark:svg:prod:100

# 100-image workload with custom avatar
npm run benchmark:svg:prod:100 -- --avatar "https://example.com/avatar.png"
```

### 4. Running the HTTP Server

```bash
# Start the Fastify server
npm start
```

---

## Running on a Linux VPS

On Linux x64 hosts, prepend `MALLOC_ARENA_MAX=2` to limit glibc memory arenas and keep resident memory at its absolute minimum:

```bash
MALLOC_ARENA_MAX=2 npm run render:svg:prod
```

For complete instructions on running, benchmarking, and copying artifacts from a VPS, see the [VPS Testing Guide](docs/RAM_OPTIMIZATION_AND_VPS_GUIDE.md).

---

## Testing

```bash
npm test
```
All unit tests run via `vitest`.
