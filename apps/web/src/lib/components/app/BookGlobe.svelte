<script lang="ts">
	import { onMount } from 'svelte';
	import createGlobe from 'cobe';
	import type { RiskStatus } from '@kyc/core';
	import type { BookEntity } from '$lib/view';
	import { HQ, FLAG } from '$lib/view';

	let { book, onselect }: { book: BookEntity[]; onselect: (id: string) => void } = $props();

	// ── cobe model constants (mirrored from cobe's internal projection) ────
	// cobe places a marker at radius `ee + markerElevation` and projects with
	// scale `B`. We replicate `U()`/`O()` so HTML callouts sit exactly on the
	// rendered dots — works in every browser (unlike cobe v2 CSS anchors).
	const EE = 0.8;
	const MARKER_ELEVATION = 0;
	const SCALE = 1.05;
	const RADIUS = EE + MARKER_ELEVATION;

	// RiskStatus → marker rgb (0–1), echoing the --stable/--watch/--alert tokens.
	const STATUS_RGB: Record<RiskStatus, [number, number, number]> = {
		stable: [0.42, 0.45, 0.5],
		watch: [0.96, 0.62, 0.04],
		alert: [0.98, 0.27, 0.09]
	};
	const STATUS_LABEL: Record<RiskStatus, string> = {
		stable: 'STABLE',
		watch: 'WATCH',
		alert: 'ALERT'
	};

	// Only book entries with a known HQ get a marker.
	const located = $derived(
		book
			.map((e) => ({ entity: e, hq: HQ[e.baseline.entityId] }))
			.filter((m): m is { entity: BookEntity; hq: (typeof HQ)[string] } => Boolean(m.hq))
	);

	type Screen = { x: number; y: number; depth: number };
	// Per-marker projected screen position (normalised 0–1 over the canvas box),
	// recomputed every frame from the current rotation. Keyed by entityId.
	let screens = $state<Record<string, Screen>>({});
	let hoveredId = $state<string | null>(null);

	let canvas: HTMLCanvasElement;
	let wrap: HTMLDivElement;

	// Rotation state, driven by autorotation + pointer drag. The screen-centre
	// longitude is (270° − phi); -1.0 rad starts the view over the mid-Atlantic
	// (≈ 33°W) rather than North America.
	let phi = -1.0;
	let theta = 0.25;
	let size = $state(0);
	let pointerDown = false;
	let lastX = 0;
	let lastY = 0;

	/** Replicate cobe's lat/lng → normalised screen projection for the overlay. */
	function project(lat: number, lng: number): Screen {
		const latR = (lat * Math.PI) / 180;
		const a = (lng * Math.PI) / 180 - Math.PI;
		const cl = Math.cos(latR);
		// U(): unit position on the sphere.
		const px = -cl * Math.cos(a) * RADIUS;
		const py = Math.sin(latR) * RADIUS;
		const pz = cl * Math.sin(a) * RADIUS;
		// O(): rotate by (phi, theta) and orthographically project.
		const ct = Math.cos(theta);
		const cp = Math.cos(phi);
		const st = Math.sin(theta);
		const sp = Math.sin(phi);
		const c = cp * px + sp * pz;
		const s = sp * st * px + ct * py - cp * st * pz;
		const depth = -sp * ct * px + st * py + cp * ct * pz; // ≥ 0 ⇒ front-facing
		return { x: (c * SCALE + 1) / 2, y: (-s * SCALE + 1) / 2, depth };
	}

	onMount(() => {
		const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
		let globe: ReturnType<typeof createGlobe> | null = null;
		let raf = 0;

		// cobe v2 has no internal render loop — we drive it via rAF + update().
		function build() {
			const rect = wrap.getBoundingClientRect();
			size = Math.max(1, Math.min(rect.width, rect.height));
			canvas.style.width = `${size}px`;
			canvas.style.height = `${size}px`;
			globe?.destroy();
			globe = createGlobe(canvas, {
				devicePixelRatio: dpr,
				width: size * dpr,
				height: size * dpr,
				phi,
				theta,
				dark: 0,
				diffuse: 1.1,
				scale: SCALE,
				mapSamples: 16000,
				mapBrightness: 1.25,
				mapBaseBrightness: 0.05,
				baseColor: [1, 1, 1],
				markerColor: [0.98, 0.27, 0.09],
				glowColor: [1, 1, 1],
				markerElevation: MARKER_ELEVATION,
				markers: located.map((m) => ({
					location: [m.hq.lat, m.hq.lng] as [number, number],
					size: m.entity.drift.status === 'stable' ? 0.045 : 0.07,
					color: STATUS_RGB[m.entity.drift.status]
				}))
			});
		}

		function frame() {
			if (!pointerDown) phi += 0.0008;
			globe?.update({ phi, theta });
			const next: Record<string, Screen> = {};
			for (const m of located) next[m.entity.baseline.entityId] = project(m.hq.lat, m.hq.lng);
			screens = next;
			raf = requestAnimationFrame(frame);
		}

		build();
		raf = requestAnimationFrame(frame);
		const ro = new ResizeObserver(() => {
			const rect = wrap.getBoundingClientRect();
			const s = Math.max(1, Math.min(rect.width, rect.height));
			if (Math.abs(s - size) > 1) build();
		});
		ro.observe(wrap);
		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			globe?.destroy();
		};
	});

	// ── Pointer drag to rotate ─────────────────────────────────────────────
	function onPointerDown(e: PointerEvent) {
		pointerDown = true;
		lastX = e.clientX;
		lastY = e.clientY;
		canvas.setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!pointerDown) return;
		const dx = e.clientX - lastX;
		const dy = e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		phi += dx * 0.005;
		theta = Math.max(-0.6, Math.min(0.6, theta + dy * 0.005));
	}
	function onPointerUp(e: PointerEvent) {
		pointerDown = false;
		canvas.releasePointerCapture?.(e.pointerId);
	}

	// A callout shows for drifting clients always, and for any marker on hover.
	function showBadge(e: BookEntity): boolean {
		return e.drift.status !== 'stable' || hoveredId === e.baseline.entityId;
	}
	// Fade the overlay as a marker rotates toward the far side of the globe.
	function depthOpacity(depth: number): number {
		if (depth <= 0) return 0;
		return Math.min(1, depth / 0.25);
	}
</script>

<div class="flex h-full min-h-0 min-w-0 flex-col">
	<div bind:this={wrap} class="relative min-h-0 flex-1 select-none">
		<!-- centred square globe -->
		<canvas
			bind:this={canvas}
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointerleave={onPointerUp}
		></canvas>

		<!-- HTML overlay: hotspots + risk callouts, sized to the square canvas -->
		<div
			class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
			style="width:{size}px;height:{size}px"
		>
			{#each located as m (m.entity.baseline.entityId)}
				{@const id = m.entity.baseline.entityId}
				{@const sc = screens[id]}
				{#if sc && sc.depth > 0}
					{@const e = m.entity}
					{@const op = depthOpacity(sc.depth)}
					{@const rgb = STATUS_RGB[e.drift.status]}
					{@const dot = `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`}
					<!-- clickable hotspot exactly on the rendered dot -->
					<button
						type="button"
						class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full"
						style="left:{sc.x * 100}%;top:{sc.y * 100}%;width:16px;height:16px;opacity:{op}"
						aria-label={e.baseline.name}
						onpointerenter={() => (hoveredId = id)}
						onpointerleave={() => (hoveredId = hoveredId === id ? null : hoveredId)}
						onclick={() => onselect(id)}
					></button>

					{#if showBadge(e)}
						<!-- risk callout, offset up-right from the marker -->
						<button
							type="button"
							class="pointer-events-auto absolute z-10 flex translate-x-3 -translate-y-[calc(100%+10px)] cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-[#161a1d] px-2.5 py-1.5 text-left whitespace-nowrap shadow-lg ring-1 ring-black/20 transition-transform hover:scale-[1.03]"
							style="left:{sc.x * 100}%;top:{sc.y * 100}%;opacity:{op}"
							onpointerenter={() => (hoveredId = id)}
							onpointerleave={() => (hoveredId = hoveredId === id ? null : hoveredId)}
							onclick={() => onselect(id)}
						>
							<span
								class="inline-block h-2 w-2 shrink-0 rounded-full"
								class:animate-pulse={e.drift.status === 'alert'}
								style="background:{dot}"
							></span>
							<span class="flex items-center gap-2 text-xs leading-none">
								<span class="font-semibold text-white">
									{FLAG[e.baseline.jurisdiction] ?? ''}
									{e.baseline.name}
								</span>
								<span class="text-white/25">|</span>
								<span class="font-mono tracking-wide tabular-nums" style="color:{dot}">
									{STATUS_LABEL[e.drift.status]}
									{(e.drift.composite * 100).toFixed(0)}%
								</span>
							</span>
						</button>
					{/if}
				{/if}
			{/each}
		</div>
	</div>
</div>
