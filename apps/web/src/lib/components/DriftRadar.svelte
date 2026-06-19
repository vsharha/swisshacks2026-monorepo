<script lang="ts">
	import { AXES, type AxisDrift, type DriftAxis, type RiskStatus } from '@kyc/core';

	let {
		axes,
		status,
		size = 280
	}: {
		axes: Record<DriftAxis, AxisDrift>;
		status: RiskStatus;
		size?: number;
	} = $props();

	const AXIS_LABEL: Record<DriftAxis, string> = {
		business_model: 'BUSINESS',
		ownership: 'OWNERSHIP',
		jurisdiction: 'GEOGRAPHY',
		scale: 'SCALE',
		reputation: 'REPUTATION'
	};

	const cx = $derived(size / 2);
	const cy = $derived(size / 2);
	const R = $derived(size / 2 - 46);

	// Pentagon vertex angle for axis i (start at top, clockwise).
	function angle(i: number): number {
		return -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
	}
	function point(i: number, radius: number): [number, number] {
		return [cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i))];
	}

	const statusColor: Record<RiskStatus, string> = {
		stable: 'var(--stable)',
		watch: 'var(--watch)',
		alert: 'var(--alert)'
	};

	const rings = [0.25, 0.5, 0.75, 1];
	function ringPoints(scale: number): string {
		return AXES.map((_, i) => point(i, R * scale).join(',')).join(' ');
	}

	const shape = $derived(
		AXES.map((axis, i) => point(i, R * Math.max(axes[axis].score, 0.02)).join(',')).join(' ')
	);
	const color = $derived(statusColor[status]);
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" class="block">
	<!-- grid rings -->
	{#each rings as r (r)}
		<polygon
			points={ringPoints(r)}
			fill="none"
			stroke="var(--line)"
			stroke-width="1"
			opacity={r === 1 ? 0.9 : 0.5}
		/>
	{/each}
	<!-- spokes + labels -->
	{#each AXES as axis, i (axis)}
		{@const [sx, sy] = point(i, R)}
		{@const [lx, ly] = point(i, R + 22)}
		<line x1={cx} y1={cy} x2={sx} y2={sy} stroke="var(--line)" stroke-width="1" opacity="0.6" />
		<text
			x={lx}
			y={ly}
			fill={axes[axis].status === 'stable' ? 'var(--muted)' : statusColor[axes[axis].status]}
			font-size="8.5"
			font-family="var(--font-mono)"
			text-anchor="middle"
			dominant-baseline="middle"
			letter-spacing="0.06em">{AXIS_LABEL[axis]}</text
		>
		<text
			x={lx}
			y={ly + 11}
			fill="var(--muted)"
			font-size="8"
			font-family="var(--font-mono)"
			text-anchor="middle"
			dominant-baseline="middle">{axes[axis].score.toFixed(2)}</text
		>
	{/each}
	<!-- drift shape -->
	<polygon
		points={shape}
		fill={color}
		fill-opacity="0.14"
		stroke={color}
		stroke-width="1.5"
		style="transition: all 220ms cubic-bezier(0.2,0,0,1)"
	/>
	{#each AXES as axis, i (axis)}
		{@const [px, py] = point(i, R * Math.max(axes[axis].score, 0.02))}
		<circle
			r="2.5"
			cx={px}
			cy={py}
			fill={statusColor[axes[axis].status]}
			style="transition: cx 220ms cubic-bezier(0.2,0,0,1), cy 220ms cubic-bezier(0.2,0,0,1)"
		/>
	{/each}
</svg>
