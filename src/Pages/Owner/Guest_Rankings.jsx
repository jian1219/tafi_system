import { lazy, Suspense } from 'react'

const TafiRankings = lazy(() => import('../TAFI_Admin/TAFI_Rankings'))

export default function GuestRankings({ sessionToken }) {
	return (
		<Suspense fallback={<p className="ranking-loading" role="status">Loading employee rankings…</p>}>
			<TafiRankings sessionToken={sessionToken} readOnly />
		</Suspense>
	)
}